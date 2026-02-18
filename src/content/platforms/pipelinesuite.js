// @ts-nocheck
// PipelineSuite Content Script - Document Extractor
// Extracts and downloads bid documents from PipelineSuite project pages
// Server-rendered HTML platform with stable DOM IDs

(function() {
  'use strict';

  console.log('Bid Extractor: PipelineSuite script loaded');

  // State
  let extractedDocuments = [];
  let isExtracting = false;

  // Listen for messages from popup/background
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    console.log('PS received message:', request.action);

    switch (request.action) {
      case 'extractDocuments':
        extractDocuments().then(docs => {
          const info = extractProjectInfo();
          sendResponse({ success: true, documents: docs, projectInfo: info });
        }).catch(err => {
          sendResponse({ success: false, error: err.message });
        });
        return true;

      case 'downloadAllDocuments':
        downloadAllDocuments().then(result => {
          sendResponse({ success: true, ...result });
        }).catch(err => {
          sendResponse({ success: false, error: err.message });
        });
        return true;

      case 'getPageInfo':
        sendResponse({
          success: true,
          platform: 'PipelineSuite',
          url: window.location.href,
          projectName: getProjectName(),
          documentCount: extractedDocuments.length
        });
        return true;

      default:
        return false;
    }
  });

  // Extract project ID from URL path
  function getProjectId() {
    const match = window.location.pathname.match(/projectID\/(\d+)/i);
    return match ? match[1] : null;
  }

  // Extract project name from page
  function getProjectName() {
    // Strategy 1: Check #projectInfo table for "Project Name" row
    const projectInfoTable = document.querySelector('#projectInfo');
    if (projectInfoTable) {
      const rows = projectInfoTable.querySelectorAll('tr');
      for (const row of rows) {
        const cells = row.querySelectorAll('td, th');
        for (let i = 0; i < cells.length; i++) {
          const cellText = cells[i].textContent.trim().toLowerCase();
          if (cellText === 'project name' || cellText === 'project name:') {
            const valueCell = cells[i + 1];
            if (valueCell && valueCell.textContent.trim()) {
              return valueCell.textContent.trim();
            }
          }
        }
      }
    }

    // Strategy 2: Fall back to h1/h2
    const headings = ['h1', 'h2'];
    for (const tag of headings) {
      const el = document.querySelector(tag);
      if (el && el.textContent.trim()) {
        return el.textContent.trim();
      }
    }

    // Strategy 3: Page title
    const title = document.title;
    if (title && !title.toLowerCase().includes('pipelinesuite')) {
      return title.split('|')[0].split('-')[0].trim();
    }

    return 'Unknown Project';
  }

  // Extract bid/project info from PipelineSuite page
  function extractProjectInfo() {
    const info = {
      projectName: getProjectName(),
      gc: '',
      bidDate: '',
      bidTime: '',
      location: '',
      scope: '',
      notes: '',
      source: 'PipelineSuite',
      url: window.location.href
    };

    // PipelineSuite has #projectInfo table with labeled rows
    const tables = document.querySelectorAll('#projectInfo table, #projectInfo, table');
    const labelMap = {};
    tables.forEach(table => {
      table.querySelectorAll('tr').forEach(row => {
        const cells = row.querySelectorAll('td, th');
        for (let i = 0; i < cells.length - 1; i++) {
          const label = cells[i].textContent.trim().toLowerCase().replace(/:$/, '');
          const value = cells[i + 1].textContent.trim();
          if (value) labelMap[label] = value;
        }
      });
    });

    // Map labels to fields
    const gcKeys = ['general contractor', 'gc', 'company', 'owner', 'invited by', 'contractor'];
    const dateKeys = ['bid date', 'due date', 'deadline', 'bid due', 'response date'];
    const timeKeys = ['bid time', 'due time', 'time'];
    const locKeys = ['location', 'address', 'city', 'project location', 'site address', 'project city'];
    const scopeKeys = ['scope', 'trade', 'division', 'bid package', 'work type', 'csi'];

    for (const [label, value] of Object.entries(labelMap)) {
      if (!info.gc && gcKeys.some(k => label.includes(k))) info.gc = value;
      if (!info.bidDate && dateKeys.some(k => label.includes(k))) info.bidDate = value;
      if (!info.bidTime && timeKeys.some(k => label.includes(k))) info.bidTime = value;
      if (!info.location && locKeys.some(k => label.includes(k))) info.location = value;
      if (!info.scope && scopeKeys.some(k => label.includes(k))) info.scope = value;
    }

    // Notes - check #projectContacts, description areas, or fall back to text patterns
    const noteEls = document.querySelectorAll('#projectContacts, [id*="description"], [id*="notes"], [id*="message"]');
    const noteTexts = [];
    noteEls.forEach(el => {
      const t = el.innerText?.trim();
      if (t && t.length > 10 && t.length < 2000) noteTexts.push(t);
    });
    if (noteTexts.length === 0) {
      const text = document.body?.innerText || '';
      const descMatch = text.match(/(?:description|notes|message|instructions)[:\s]+([^\n].{10,1500})/im);
      if (descMatch) noteTexts.push(descMatch[1].trim());
    }
    info.notes = noteTexts.slice(0, 5).join('\n---\n');

    return info;
  }

  // Build the native "Download All Files" ZIP URL
  function getDownloadAllZipUrl() {
    const projectId = getProjectId();
    if (!projectId) return null;

    const origin = window.location.origin;
    return origin + '/ehPipelineSubs/dspProject/projectID/' + projectId + '/allFiles/1';
  }

  // Extract all documents from the page
  async function extractDocuments() {
    console.log('Extracting documents from PipelineSuite...');
    extractedDocuments = [];
    isExtracting = true;

    try {
      // Strategy 1: Scan #viewRespond for file links
      extractFromContainer('#viewRespond');

      // Strategy 2: Scan #addenda for addendum file links
      extractFromContainer('#addenda');

      // Strategy 3: Fallback - scan entire page for file links
      if (extractedDocuments.length === 0) {
        extractFromContainer('body');
      }

      // Strategy 4: Add native "Download All Files (ZIP)" entry
      const zipUrl = getDownloadAllZipUrl();
      if (zipUrl) {
        const zipEntry = {
          name: 'Download All Files (ZIP)',
          url: zipUrl,
          type: 'Archive',
          size: '',
          source: 'PipelineSuite',
          isZipBundle: true
        };

        if (!extractedDocuments.find(d => d.url === zipEntry.url)) {
          extractedDocuments.push(zipEntry);
        }
      }

      // Deduplicate by URL
      const seen = new Set();
      extractedDocuments = extractedDocuments.filter(doc => {
        if (!doc.url || seen.has(doc.url)) return false;
        seen.add(doc.url);
        return true;
      });

      console.log('Found ' + extractedDocuments.length + ' documents');
    } finally {
      isExtracting = false;
    }

    return extractedDocuments;
  }

  // Extract file links from a container element
  function extractFromContainer(selector) {
    const container = document.querySelector(selector);
    if (!container) return;

    const links = container.querySelectorAll('a[href]');

    links.forEach(link => {
      const href = link.href || '';
      const text = link.textContent.trim();
      const name = extractFilename(text, href);

      if (!isRelevantFile(name) && !isRelevantUrl(href)) return;

      // Try to extract file size from surrounding DOM text
      const size = extractFileSize(link);

      const doc = {
        name: name || 'document',
        url: href,
        type: getFileType(name || href),
        size: size,
        source: 'PipelineSuite'
      };

      // Avoid duplicates within this extraction pass
      if (!extractedDocuments.find(d => d.url === doc.url)) {
        extractedDocuments.push(doc);
      }
    });
  }

  // Download all extracted documents
  async function downloadAllDocuments() {
    if (extractedDocuments.length === 0) {
      await extractDocuments();
    }

    if (extractedDocuments.length === 0) {
      throw new Error('No documents found to download');
    }

    console.log('Downloading ' + extractedDocuments.length + ' documents...');

    const projectName = sanitizeFilename(getProjectName());
    const results = {
      total: extractedDocuments.length,
      downloaded: 0,
      failed: 0,
      documents: []
    };

    for (const doc of extractedDocuments) {
      try {
        if (doc.url) {
          const docName = sanitizeFilename(doc.name);
          await chrome.runtime.sendMessage({
            action: 'downloadFile',
            url: doc.url,
            filename: 'Bids/' + projectName + '/' + docName
          });
          results.downloaded++;
          results.documents.push({ ...doc, status: 'downloaded' });
        } else {
          results.failed++;
          results.documents.push({ ...doc, status: 'no_url' });
        }
      } catch (error) {
        console.error('Failed to download ' + doc.name + ':', error);
        results.failed++;
        results.documents.push({ ...doc, status: 'error', error: error.message });
      }

      // Small delay between downloads to avoid overwhelming
      await sleep(300);
    }

    console.log('Downloaded ' + results.downloaded + '/' + results.total + ' documents');
    return results;
  }

  // Helper: Check if filename is a relevant document type
  function isRelevantFile(filename) {
    if (!filename) return false;
    const extensions = [
      '.pdf', '.dwg', '.dxf',
      '.xlsx', '.xls', '.csv',
      '.doc', '.docx',
      '.zip', '.rar', '.7z',
      '.tif', '.tiff', '.png', '.jpg', '.jpeg'
    ];
    const lower = filename.toLowerCase();
    return extensions.some(ext => lower.endsWith(ext) || lower.includes(ext));
  }

  // Helper: Check if URL points to a relevant file
  function isRelevantUrl(url) {
    if (!url) return false;
    const lower = url.toLowerCase();
    return lower.includes('.pdf') ||
           lower.includes('.dwg') ||
           lower.includes('.dxf') ||
           lower.includes('.xlsx') ||
           lower.includes('.xls') ||
           lower.includes('.doc') ||
           lower.includes('.zip') ||
           lower.includes('.csv') ||
           lower.includes('.tif') ||
           lower.includes('download') ||
           lower.includes('/files/') ||
           lower.includes('/documents/') ||
           lower.includes('allFiles');
  }

  // Helper: Get file type from name
  function getFileType(filename) {
    if (!filename) return 'Document';
    const ext = filename.split('.').pop().toLowerCase();
    const types = {
      pdf: 'PDF Document',
      dwg: 'CAD Drawing',
      dxf: 'CAD Drawing',
      xlsx: 'Spreadsheet',
      xls: 'Spreadsheet',
      csv: 'Spreadsheet',
      doc: 'Word Document',
      docx: 'Word Document',
      zip: 'Archive',
      rar: 'Archive',
      '7z': 'Archive',
      tif: 'Image',
      tiff: 'Image',
      png: 'Image',
      jpg: 'Image',
      jpeg: 'Image'
    };
    return types[ext] || 'Document';
  }

  // Helper: Extract a clean filename from link text or URL
  function extractFilename(linkText, url) {
    // Prefer link text if it looks like a filename
    if (linkText && linkText.match(/\.\w{2,5}$/)) {
      return linkText;
    }

    // If link text is meaningful (not just "Download" or whitespace), use it
    if (linkText && linkText.length > 2 && linkText.length < 200) {
      const cleaned = linkText.replace(/\s+/g, ' ').trim();
      if (cleaned.toLowerCase() !== 'download' &&
          cleaned.toLowerCase() !== 'click here' &&
          cleaned.toLowerCase() !== 'link') {
        return cleaned;
      }
    }

    // Fall back to URL filename
    try {
      const path = new URL(url).pathname;
      const segment = path.split('/').pop();
      if (segment) {
        return decodeURIComponent(segment.split('?')[0]);
      }
    } catch {
      // Invalid URL, ignore
    }

    return linkText || 'document';
  }

  // Helper: Extract file size from surrounding DOM text
  function extractFileSize(linkElement) {
    // Check the parent row/container for size info
    const container = linkElement.closest('tr, li, div, td');
    if (!container) return '';

    const text = container.textContent || '';
    // PipelineSuite shows sizes as "123 kb" or "1.5 MB"
    const sizeMatch = text.match(/(\d+(?:\.\d+)?)\s*(kb|mb|gb)/i);
    return sizeMatch ? sizeMatch[1] + ' ' + sizeMatch[2].toUpperCase() : '';
  }

  // Helper: Sanitize filename for downloads
  function sanitizeFilename(name) {
    if (!name) return 'unnamed';
    return name
      .replace(/[<>:"/\\|?*]/g, '')
      .replace(/\s+/g, '_')
      .substring(0, 100);
  }

  // Helper: Sleep
  function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // Inject floating download button on project pages
  function injectDownloadButton() {
    if (document.getElementById('bid-extractor-ps-btn')) return;

    const button = document.createElement('div');
    button.id = 'bid-extractor-ps-btn';
    button.innerHTML = `
      <style>
        #bid-extractor-ps-btn {
          position: fixed;
          bottom: 20px;
          right: 20px;
          z-index: 999999;
          display: flex;
          flex-direction: column;
          gap: 8px;
        }
        .ps-extract-btn {
          background: linear-gradient(135deg, #1e40af 0%, #1e3a5f 100%);
          color: white;
          border: none;
          padding: 12px 20px;
          border-radius: 8px;
          font-size: 14px;
          font-weight: 600;
          cursor: pointer;
          display: flex;
          align-items: center;
          gap: 8px;
          box-shadow: 0 4px 12px rgba(0,0,0,0.3);
          transition: all 0.2s;
        }
        .ps-extract-btn:hover {
          transform: translateY(-2px);
          box-shadow: 0 6px 16px rgba(0,0,0,0.4);
        }
        .ps-extract-btn.loading {
          opacity: 0.7;
          pointer-events: none;
        }
        .ps-extract-btn .icon {
          font-size: 18px;
        }
        .ps-doc-count {
          background: #10b981;
          color: white;
          font-size: 12px;
          padding: 4px 10px;
          border-radius: 12px;
          text-align: center;
        }
      </style>
      <div class="ps-doc-count" id="ps-doc-count" style="display:none;">0 documents found</div>
      <button class="ps-extract-btn" id="ps-scan-btn">
        <span class="icon">&#x1F50D;</span>
        <span>Scan Documents</span>
      </button>
      <button class="ps-extract-btn" id="ps-download-btn" style="display:none;">
        <span class="icon">&#x2B07;</span>
        <span>Download All</span>
      </button>
    `;

    document.body.appendChild(button);

    // Scan button handler
    document.getElementById('ps-scan-btn').addEventListener('click', async () => {
      const btn = document.getElementById('ps-scan-btn');
      const countEl = document.getElementById('ps-doc-count');
      const downloadBtn = document.getElementById('ps-download-btn');

      btn.classList.add('loading');
      btn.querySelector('span:last-child').textContent = 'Scanning...';

      try {
        const docs = await extractDocuments();
        countEl.textContent = docs.length + ' document' + (docs.length !== 1 ? 's' : '') + ' found';
        countEl.style.display = 'block';

        if (docs.length > 0) {
          downloadBtn.style.display = 'flex';
          downloadBtn.querySelector('span:last-child').textContent = 'Download All (' + docs.length + ')';
        }

        btn.querySelector('span:last-child').textContent = 'Scan Again';
      } catch (error) {
        countEl.textContent = 'Error scanning';
        countEl.style.background = '#ef4444';
        countEl.style.display = 'block';
        btn.querySelector('span:last-child').textContent = 'Try Again';
      }

      btn.classList.remove('loading');
    });

    // Download button handler
    document.getElementById('ps-download-btn').addEventListener('click', async () => {
      const btn = document.getElementById('ps-download-btn');
      btn.classList.add('loading');
      btn.querySelector('span:last-child').textContent = 'Downloading...';

      try {
        const results = await downloadAllDocuments();
        btn.querySelector('span:last-child').textContent = 'Done! (' + results.downloaded + '/' + results.total + ')';

        setTimeout(() => {
          btn.querySelector('span:last-child').textContent = 'Download All (' + extractedDocuments.length + ')';
        }, 3000);
      } catch (error) {
        btn.querySelector('span:last-child').textContent = 'Error';
        setTimeout(() => {
          btn.querySelector('span:last-child').textContent = 'Download All (' + extractedDocuments.length + ')';
        }, 3000);
      }

      btn.classList.remove('loading');
    });
  }

  // Initialize on relevant PipelineSuite pages
  function init() {
    const url = window.location.href.toLowerCase();
    // Inject on project pages, plan rooms, and file listing pages
    if (url.includes('projectid') ||
        url.includes('planroom') ||
        url.includes('project') ||
        url.includes('openproject') ||
        url.includes('dspproject')) {
      injectDownloadButton();
    }
  }

  // Server-rendered: DOM is ready, no need to wait for SPA hydration
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
