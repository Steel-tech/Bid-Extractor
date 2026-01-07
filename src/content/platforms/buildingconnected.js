// BuildingConnected Content Script - Document Extractor
// Extracts and downloads bid documents from BuildingConnected project pages

(function() {
  'use strict';

  console.log('🏗️ Bid Extractor: BuildingConnected script loaded');

  // State
  let extractedDocuments = [];
  let isExtracting = false;

  // Listen for messages from popup/background
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    console.log('BC received message:', request.action);

    switch (request.action) {
      case 'extractDocuments':
        extractDocuments().then(docs => {
          sendResponse({ success: true, documents: docs });
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
          platform: 'BuildingConnected',
          url: window.location.href,
          projectName: getProjectName(),
          documentCount: extractedDocuments.length
        });
        return true;

      default:
        return false;
    }
  });

  // Extract project name from page
  function getProjectName() {
    // Try various selectors for project name
    const selectors = [
      'h1',
      '[data-testid="project-name"]',
      '.project-name',
      '.opportunity-name',
      '[class*="ProjectName"]',
      '[class*="projectName"]'
    ];

    for (const selector of selectors) {
      const el = document.querySelector(selector);
      if (el?.textContent?.trim()) {
        return el.textContent.trim();
      }
    }

    // Try to get from page title
    const title = document.title;
    if (title && !title.includes('BuildingConnected')) {
      return title.split('|')[0].trim();
    }

    return 'Unknown Project';
  }

  // Extract all documents from the page
  async function extractDocuments() {
    console.log('🔍 Extracting documents from BuildingConnected...');
    extractedDocuments = [];

    // Wait for dynamic content to load
    await waitForContent();

    // Strategy 1: Find document list/table rows
    const documentRows = document.querySelectorAll([
      '[data-testid*="document"]',
      '[data-testid*="file"]',
      '[class*="DocumentRow"]',
      '[class*="FileRow"]',
      '[class*="document-row"]',
      '[class*="file-item"]',
      'tr[class*="document"]',
      'tr[class*="file"]',
      '.file-list-item',
      '.document-list-item'
    ].join(', '));

    documentRows.forEach(row => {
      const doc = extractDocumentFromRow(row);
      if (doc) extractedDocuments.push(doc);
    });

    // Strategy 2: Find all download links/buttons
    const downloadElements = document.querySelectorAll([
      'a[href*="download"]',
      'a[href*=".pdf"]',
      'a[href*=".dwg"]',
      'a[href*=".dxf"]',
      'a[href*=".xlsx"]',
      'a[href*=".xls"]',
      'a[href*=".doc"]',
      'a[href*=".zip"]',
      'button[data-testid*="download"]',
      '[role="button"][class*="download"]',
      'a[download]'
    ].join(', '));

    downloadElements.forEach(el => {
      const doc = extractDocumentFromLink(el);
      if (doc && !extractedDocuments.find(d => d.url === doc.url)) {
        extractedDocuments.push(doc);
      }
    });

    // Strategy 3: Look for file icons with adjacent text
    const fileIcons = document.querySelectorAll([
      '[class*="FileIcon"]',
      '[class*="file-icon"]',
      'svg[class*="document"]',
      'svg[class*="pdf"]',
      'img[src*="pdf"]',
      'img[src*="file"]'
    ].join(', '));

    fileIcons.forEach(icon => {
      const parent = icon.closest('a, button, [role="button"], tr, li, .file-item, .document-item');
      if (parent) {
        const doc = extractDocumentFromContainer(parent);
        if (doc && !extractedDocuments.find(d => d.name === doc.name)) {
          extractedDocuments.push(doc);
        }
      }
    });

    // Strategy 4: Find Documents tab/section and extract from there
    await extractFromDocumentsSection();

    console.log(`📄 Found ${extractedDocuments.length} documents`);
    return extractedDocuments;
  }

  // Extract document info from a table row
  function extractDocumentFromRow(row) {
    const nameEl = row.querySelector([
      '[class*="name"]',
      '[class*="Name"]',
      'td:first-child',
      'span',
      'a'
    ].join(', '));

    const linkEl = row.querySelector('a[href], button[data-url]');
    const name = nameEl?.textContent?.trim();
    const url = linkEl?.href || linkEl?.dataset?.url;

    if (name && isRelevantFile(name)) {
      return {
        name: name,
        url: url || '',
        type: getFileType(name),
        size: extractFileSize(row),
        source: 'BuildingConnected'
      };
    }
    return null;
  }

  // Extract document info from a link element
  function extractDocumentFromLink(el) {
    const url = el.href || el.dataset?.url || '';
    let name = el.textContent?.trim() || el.getAttribute('download') || '';

    // Try to extract filename from URL
    if (!name || name.length < 3) {
      const urlParts = url.split('/');
      name = decodeURIComponent(urlParts[urlParts.length - 1].split('?')[0]);
    }

    if (url && isRelevantFile(name) || isRelevantUrl(url)) {
      return {
        name: name || 'document',
        url: url,
        type: getFileType(name || url),
        source: 'BuildingConnected'
      };
    }
    return null;
  }

  // Extract document from a container element
  function extractDocumentFromContainer(container) {
    const textContent = container.textContent?.trim() || '';
    const linkEl = container.querySelector('a[href]') || container.closest('a[href]');
    const url = linkEl?.href || '';

    // Find filename-like text
    const fileMatch = textContent.match(/[\w\s-]+\.(pdf|dwg|dxf|xlsx?|docx?|zip)/i);
    const name = fileMatch ? fileMatch[0] : textContent.substring(0, 100);

    if (isRelevantFile(name) || isRelevantUrl(url)) {
      return {
        name: name,
        url: url,
        type: getFileType(name),
        source: 'BuildingConnected'
      };
    }
    return null;
  }

  // Look for Documents tab and click it to extract documents
  async function extractFromDocumentsSection() {
    // Find and click Documents tab if not already active
    const docsTabs = document.querySelectorAll([
      '[data-testid*="documents"]',
      '[data-testid*="files"]',
      'button:contains("Documents")',
      'a:contains("Documents")',
      '[role="tab"]'
    ].join(', '));

    for (const tab of docsTabs) {
      if (tab.textContent?.toLowerCase().includes('document') ||
          tab.textContent?.toLowerCase().includes('file')) {
        // Check if already active
        if (!tab.classList.contains('active') && !tab.getAttribute('aria-selected')) {
          tab.click();
          await sleep(1500); // Wait for content to load
          // Re-run extraction on new content
          await extractVisibleDocuments();
        }
        break;
      }
    }
  }

  // Extract documents from currently visible content
  async function extractVisibleDocuments() {
    const allLinks = document.querySelectorAll('a[href]');

    allLinks.forEach(link => {
      const href = link.href || '';
      const text = link.textContent?.trim() || '';

      if (isRelevantFile(text) || isRelevantUrl(href)) {
        const doc = {
          name: text || extractFilenameFromUrl(href),
          url: href,
          type: getFileType(text || href),
          source: 'BuildingConnected'
        };

        if (!extractedDocuments.find(d => d.url === doc.url || d.name === doc.name)) {
          extractedDocuments.push(doc);
        }
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

    console.log(`⬇️ Downloading ${extractedDocuments.length} documents...`);

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
          // Send download request to background script
          await chrome.runtime.sendMessage({
            action: 'downloadFile',
            url: doc.url,
            filename: `Bids/${projectName}/${sanitizeFilename(doc.name)}`
          });
          results.downloaded++;
          results.documents.push({ ...doc, status: 'downloaded' });
        } else {
          results.failed++;
          results.documents.push({ ...doc, status: 'no_url' });
        }
      } catch (error) {
        console.error(`Failed to download ${doc.name}:`, error);
        results.failed++;
        results.documents.push({ ...doc, status: 'error', error: error.message });
      }

      // Small delay between downloads to avoid overwhelming
      await sleep(300);
    }

    console.log(`✅ Downloaded ${results.downloaded}/${results.total} documents`);
    return results;
  }

  // Helper: Check if filename is a relevant document type
  function isRelevantFile(filename) {
    if (!filename) return false;
    const extensions = ['.pdf', '.dwg', '.dxf', '.xlsx', '.xls', '.doc', '.docx', '.zip', '.rar'];
    const lower = filename.toLowerCase();
    return extensions.some(ext => lower.includes(ext));
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
           lower.includes('download') ||
           lower.includes('/files/') ||
           lower.includes('/documents/');
  }

  // Helper: Get file type from name
  function getFileType(filename) {
    const ext = filename?.split('.').pop()?.toLowerCase();
    const types = {
      pdf: 'PDF Document',
      dwg: 'CAD Drawing',
      dxf: 'CAD Drawing',
      xlsx: 'Spreadsheet',
      xls: 'Spreadsheet',
      doc: 'Word Document',
      docx: 'Word Document',
      zip: 'Archive',
      rar: 'Archive'
    };
    return types[ext] || 'Document';
  }

  // Helper: Extract file size from element
  function extractFileSize(element) {
    const text = element.textContent || '';
    const sizeMatch = text.match(/(\d+(?:\.\d+)?)\s*(KB|MB|GB)/i);
    return sizeMatch ? `${sizeMatch[1]} ${sizeMatch[2]}` : '';
  }

  // Helper: Extract filename from URL
  function extractFilenameFromUrl(url) {
    try {
      const path = new URL(url).pathname;
      const filename = path.split('/').pop();
      return decodeURIComponent(filename.split('?')[0]) || 'document';
    } catch {
      return 'document';
    }
  }

  // Helper: Sanitize filename
  function sanitizeFilename(name) {
    return name
      .replace(/[<>:"/\\|?*]/g, '')
      .replace(/\s+/g, '_')
      .substring(0, 100);
  }

  // Helper: Wait for dynamic content
  async function waitForContent(timeout = 3000) {
    return new Promise(resolve => {
      let elapsed = 0;
      const interval = setInterval(() => {
        elapsed += 200;
        // Check if content has loaded
        const hasContent = document.querySelector([
          '[class*="document"]',
          '[class*="file"]',
          '[data-testid*="document"]',
          'table',
          '.file-list'
        ].join(', '));

        if (hasContent || elapsed >= timeout) {
          clearInterval(interval);
          resolve();
        }
      }, 200);
    });
  }

  // Helper: Sleep
  function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // Inject floating download button
  function injectDownloadButton() {
    if (document.getElementById('bid-extractor-bc-btn')) return;

    const button = document.createElement('div');
    button.id = 'bid-extractor-bc-btn';
    button.innerHTML = `
      <style>
        #bid-extractor-bc-btn {
          position: fixed;
          bottom: 20px;
          right: 20px;
          z-index: 999999;
          display: flex;
          flex-direction: column;
          gap: 8px;
        }
        .bc-extract-btn {
          background: linear-gradient(135deg, #374151 0%, #1f2937 100%);
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
        .bc-extract-btn:hover {
          transform: translateY(-2px);
          box-shadow: 0 6px 16px rgba(0,0,0,0.4);
        }
        .bc-extract-btn.loading {
          opacity: 0.7;
          pointer-events: none;
        }
        .bc-extract-btn .icon {
          font-size: 18px;
        }
        .bc-doc-count {
          background: #10b981;
          color: white;
          font-size: 12px;
          padding: 4px 10px;
          border-radius: 12px;
          text-align: center;
        }
      </style>
      <div class="bc-doc-count" id="bc-doc-count" style="display:none;">0 documents found</div>
      <button class="bc-extract-btn" id="bc-scan-btn">
        <span class="icon">🔍</span>
        <span>Scan Documents</span>
      </button>
      <button class="bc-extract-btn" id="bc-download-btn" style="display:none;">
        <span class="icon">⬇️</span>
        <span>Download All</span>
      </button>
    `;

    document.body.appendChild(button);

    // Scan button handler
    document.getElementById('bc-scan-btn').addEventListener('click', async () => {
      const btn = document.getElementById('bc-scan-btn');
      const countEl = document.getElementById('bc-doc-count');
      const downloadBtn = document.getElementById('bc-download-btn');

      btn.classList.add('loading');
      btn.innerHTML = '<span class="icon">⏳</span><span>Scanning...</span>';

      try {
        const docs = await extractDocuments();
        countEl.textContent = `${docs.length} document${docs.length !== 1 ? 's' : ''} found`;
        countEl.style.display = 'block';

        if (docs.length > 0) {
          downloadBtn.style.display = 'flex';
          downloadBtn.innerHTML = `<span class="icon">⬇️</span><span>Download All (${docs.length})</span>`;
        }

        btn.innerHTML = '<span class="icon">🔍</span><span>Scan Again</span>';
      } catch (error) {
        countEl.textContent = 'Error scanning';
        countEl.style.background = '#ef4444';
        countEl.style.display = 'block';
        btn.innerHTML = '<span class="icon">🔍</span><span>Try Again</span>';
      }

      btn.classList.remove('loading');
    });

    // Download button handler
    document.getElementById('bc-download-btn').addEventListener('click', async () => {
      const btn = document.getElementById('bc-download-btn');
      btn.classList.add('loading');
      btn.innerHTML = '<span class="icon">⏳</span><span>Downloading...</span>';

      try {
        const results = await downloadAllDocuments();
        btn.innerHTML = `<span class="icon">✅</span><span>Done! (${results.downloaded}/${results.total})</span>`;

        setTimeout(() => {
          btn.innerHTML = `<span class="icon">⬇️</span><span>Download All (${extractedDocuments.length})</span>`;
        }, 3000);
      } catch (error) {
        btn.innerHTML = '<span class="icon">❌</span><span>Error</span>';
        setTimeout(() => {
          btn.innerHTML = `<span class="icon">⬇️</span><span>Download All (${extractedDocuments.length})</span>`;
        }, 3000);
      }

      btn.classList.remove('loading');
    });
  }

  // Initialize when page is ready
  function init() {
    // Only inject on relevant pages
    const url = window.location.href;
    if (url.includes('/opportunity/') ||
        url.includes('/project/') ||
        url.includes('/bid/') ||
        url.includes('/rfp/')) {
      // Wait for page to settle
      setTimeout(injectDownloadButton, 2000);
    }
  }

  // Run initialization
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  // Also watch for SPA navigation
  let lastUrl = location.href;
  new MutationObserver(() => {
    if (location.href !== lastUrl) {
      lastUrl = location.href;
      setTimeout(init, 1000);
    }
  }).observe(document.body, { subtree: true, childList: true });

})();
