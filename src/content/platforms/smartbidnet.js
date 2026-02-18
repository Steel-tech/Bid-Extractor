// @ts-nocheck
// SmartBidNet Content Script - Document Extractor
// Extracts and downloads bid documents from SmartBidNet project pages
// SmartBidNet uses ASP.NET WebForms with DataTables.js for grid rendering

(function() {
  'use strict';

  console.log('Bid Extractor: SmartBidNet script loaded');

  // State
  let extractedDocuments = [];
  let isExtracting = false;

  // Relevant file extensions for construction bid documents
  const FILE_EXTENSIONS = ['.pdf', '.dwg', '.dxf', '.xlsx', '.xls', '.doc', '.docx', '.zip', '.rar'];

  // Listen for messages from popup/background
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    console.log('SBN received message:', request.action);

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
          platform: 'SmartBid',
          url: window.location.href,
          projectName: getProjectName(),
          documentCount: extractedDocuments.length
        });
        return true;

      default:
        return false;
    }
  });

  // Extract project name from SmartBidNet page
  function getProjectName() {
    // SmartBidNet project name selectors (ASP.NET WebForms controls)
    const selectors = [
      '[id*="ContentPlaceHolder"] h1',
      '[id*="ContentPlaceHolder"] h2',
      '[id*="lblProjectName"]',
      '[id*="txtProjectName"]',
      '[id*="ProjectName"]',
      '#divBodyContent h1',
      '#divBodyContent h2',
      '.project-header h1',
      'span[id*="lblName"]',
      'span[id*="ProjectTitle"]'
    ];

    for (const selector of selectors) {
      const el = document.querySelector(selector);
      if (el?.textContent?.trim()) {
        return el.textContent.trim();
      }
    }

    // Fallback: page title minus boilerplate
    const title = document.title;
    if (title && !title.toLowerCase().includes('smartbid')) {
      return title.split('|')[0].split('-')[0].trim();
    }

    return 'Unknown Project';
  }

  // Extract all documents from the page
  async function extractDocuments() {
    console.log('Extracting documents from SmartBidNet...');

    if (isExtracting) {
      return extractedDocuments;
    }

    isExtracting = true;
    extractedDocuments = [];

    try {
      // Wait for ASP.NET content and DataTables to initialize
      await waitForContent();

      // Strategy 1: Scan DataTables rows for file links
      extractFromDataTableRows();

      // Strategy 2: Scan all anchors in ContentPlaceHolder for file extensions
      extractFromContentPlaceHolder();

      // Strategy 3: Find download buttons/links anywhere on the page
      extractDownloadButtons();

      // Strategy 4: Click Documents/Files tab if not active, wait, re-scan
      await extractFromDocumentsTab();

      console.log('Found ' + extractedDocuments.length + ' documents');
    } finally {
      isExtracting = false;
    }

    return extractedDocuments;
  }

  // Strategy 1: Extract from DataTables grid rows
  function extractFromDataTableRows() {
    const rows = document.querySelectorAll(
      'table.dataTable tr.odd, table.dataTable tr.even'
    );

    rows.forEach(row => {
      const doc = extractDocumentFromRow(row);
      if (doc) {
        addUniqueDocument(doc);
      }
    });

    // Also check GridButtons rows for download actions
    const gridButtonRows = document.querySelectorAll('.GridButtons_Row');
    gridButtonRows.forEach(row => {
      const closestRow = row.closest('tr');
      if (closestRow) {
        const doc = extractDocumentFromRow(closestRow);
        if (doc) {
          addUniqueDocument(doc);
        }
      }
    });
  }

  // Strategy 2: Extract from ContentPlaceHolder anchors
  function extractFromContentPlaceHolder() {
    const container = document.querySelector('[id*="ContentPlaceHolder"]')
                   || document.getElementById('divBodyContent');

    if (!container) return;

    const anchors = container.querySelectorAll('a[href]');

    anchors.forEach(anchor => {
      const href = anchor.href || '';
      const text = anchor.textContent?.trim() || '';

      if (isRelevantFile(text) || isRelevantUrl(href)) {
        const name = text || extractFilename(href);
        addUniqueDocument({
          name: name,
          url: href,
          type: getFileType(name || href),
          source: 'SmartBid'
        });
      }
    });
  }

  // Strategy 3: Find download buttons and links across the page
  function extractDownloadButtons() {
    const downloadElements = document.querySelectorAll([
      'a[href*="Download"]',
      'a[href*="download"]',
      'a[href*="GetFile"]',
      'a[href*="ViewFile"]',
      'a[href*="Attachment"]',
      'input[id*="btnDownload"]',
      'input[id*="btnExport"]',
      'a[onclick*="Download"]',
      'a[onclick*="download"]'
    ].join(', '));

    downloadElements.forEach(el => {
      const url = extractUrlFromElement(el);
      const name = extractNameFromElement(el);

      if (url) {
        addUniqueDocument({
          name: name || extractFilename(url),
          url: url,
          type: getFileType(name || url),
          source: 'SmartBid'
        });
      }
    });
  }

  // Strategy 4: Click Documents/Files tab and re-scan
  async function extractFromDocumentsTab() {
    // SmartBidNet uses custom tab skins
    const tabs = document.querySelectorAll(
      '.InternalTabSkin, .InternalTabActiveSkin, [class*="Tab"]'
    );

    for (const tab of tabs) {
      const tabText = tab.textContent?.toLowerCase() || '';

      if (tabText.includes('document') || tabText.includes('file') || tabText.includes('addend')) {
        // Skip if already the active tab
        if (tab.classList.contains('InternalTabActiveSkin') ||
            tab.classList.contains('active')) {
          continue;
        }

        tab.click();
        await sleep(1500);

        // Re-scan after tab switch
        extractFromDataTableRows();
        extractFromContentPlaceHolder();
        extractDownloadButtons();
        break;
      }
    }
  }

  // Extract document info from a DataTable or grid row
  function extractDocumentFromRow(row) {
    // Look for links within the row
    const linkEl = row.querySelector(
      'a[href*="Download"], a[href*="download"], a[href*="GetFile"], ' +
      'a[href*="ViewFile"], a[href*="Attachment"], a[href]'
    );

    // Get display name from first meaningful cell or link text
    const nameEl = row.querySelector(
      'td a, td span[id*="lbl"], td:first-child'
    );

    const name = nameEl?.textContent?.trim() || '';
    const url = linkEl?.href || '';

    if (!name && !url) return null;

    // Check relevance by name or URL
    if (isRelevantFile(name) || isRelevantUrl(url)) {
      return {
        name: name || extractFilename(url),
        url: url,
        type: getFileType(name || url),
        size: extractFileSize(row),
        source: 'SmartBid'
      };
    }

    return null;
  }

  // Extract URL from various element types (anchors, inputs with onclick, etc.)
  function extractUrlFromElement(el) {
    // Standard anchor href
    if (el.href) return el.href;

    // ASP.NET postback or onclick handlers often embed URLs
    const onclick = el.getAttribute('onclick') || '';
    const urlMatch = onclick.match(/['"]((https?:\/\/|\/)[^'"]+)['"]/);
    if (urlMatch) return urlMatch[1];

    // Input buttons may have a data attribute or adjacent link
    const dataUrl = el.dataset?.url || el.dataset?.href || '';
    if (dataUrl) return dataUrl;

    // Check parent for a wrapping anchor
    const parentLink = el.closest('a[href]');
    if (parentLink) return parentLink.href;

    return '';
  }

  // Extract display name from various element types
  function extractNameFromElement(el) {
    // Direct text
    const text = el.textContent?.trim() || '';
    if (text && text.length > 2 && text.length < 200) return text;

    // Value attribute (for input buttons)
    const value = el.getAttribute('value') || '';
    if (value) return value;

    // Title or alt attribute
    return el.getAttribute('title') || el.getAttribute('alt') || '';
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

    const projectName = sanitize(getProjectName());
    const results = {
      total: extractedDocuments.length,
      downloaded: 0,
      failed: 0,
      documents: []
    };

    for (const doc of extractedDocuments) {
      try {
        if (doc.url) {
          const docName = sanitize(doc.name || extractFilename(doc.url));

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

      // Small delay between downloads to avoid overwhelming the server
      await sleep(300);
    }

    console.log('Downloaded ' + results.downloaded + '/' + results.total + ' documents');
    return results;
  }

  // Add a document only if not already present (deduplicate by URL then name)
  function addUniqueDocument(doc) {
    if (!doc || (!doc.url && !doc.name)) return;

    const isDuplicate = extractedDocuments.some(existing =>
      (doc.url && existing.url === doc.url) ||
      (doc.name && existing.name === doc.name && !doc.url)
    );

    if (!isDuplicate) {
      extractedDocuments.push(doc);
    }
  }

  // Helper: Check if filename contains a relevant document extension
  function isRelevantFile(filename) {
    if (!filename) return false;
    const lower = filename.toLowerCase();
    return FILE_EXTENSIONS.some(ext => lower.includes(ext));
  }

  // Helper: Check if URL points to a relevant file or download endpoint
  function isRelevantUrl(url) {
    if (!url) return false;
    const lower = url.toLowerCase();
    return FILE_EXTENSIONS.some(ext => lower.includes(ext)) ||
           lower.includes('download') ||
           lower.includes('getfile') ||
           lower.includes('viewfile') ||
           lower.includes('attachment') ||
           lower.includes('/files/') ||
           lower.includes('/documents/');
  }

  // Helper: Determine file type from name or URL
  function getFileType(filename) {
    if (!filename) return 'Document';
    const match = filename.match(/\.(pdf|dwg|dxf|xlsx?|docx?|zip|rar)(\b|$)/i);
    if (!match) return 'Document';

    const ext = match[1].toLowerCase();
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

  // Helper: Extract filename from a URL path
  function extractFilename(url) {
    if (!url) return 'document';
    try {
      const path = new URL(url, window.location.origin).pathname;
      const segment = path.split('/').pop();
      const decoded = decodeURIComponent(segment.split('?')[0]);
      return decoded || 'document';
    } catch {
      // Fallback for malformed URLs
      const parts = url.split('/');
      const last = parts[parts.length - 1];
      return decodeURIComponent(last.split('?')[0]) || 'document';
    }
  }

  // Helper: Extract file size text from an element
  function extractFileSize(element) {
    const text = element.textContent || '';
    const sizeMatch = text.match(/(\d+(?:\.\d+)?)\s*(KB|MB|GB)/i);
    return sizeMatch ? sizeMatch[1] + ' ' + sizeMatch[2] : '';
  }

  // Helper: Sanitize a string for use as a filename
  function sanitize(name) {
    if (!name) return 'unknown';
    return name
      .replace(/[<>:"/\\|?*]/g, '')
      .replace(/\s+/g, '_')
      .substring(0, 100);
  }

  // Helper: Wait for SmartBidNet dynamic content to load
  async function waitForContent(timeout = 5000) {
    return new Promise(resolve => {
      let elapsed = 0;
      const interval = setInterval(() => {
        elapsed += 200;

        // SmartBidNet-specific content indicators
        const hasContent = document.querySelector(
          '#divBodyContent, ' +
          '[id*="ContentPlaceHolder"], ' +
          'table.dataTable, ' +
          '.GridButtons_Row, ' +
          '.InternalTabSkin, ' +
          '.InternalTabActiveSkin'
        );

        if (hasContent || elapsed >= timeout) {
          clearInterval(interval);
          resolve();
        }
      }, 200);
    });
  }

  // Helper: Sleep for a given duration in milliseconds
  function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // Inject floating download button on SmartBidNet pages
  function injectDownloadButton() {
    if (document.getElementById('bid-extractor-sbn-btn')) return;

    const button = document.createElement('div');
    button.id = 'bid-extractor-sbn-btn';
    button.innerHTML = `
      <style>
        #bid-extractor-sbn-btn {
          position: fixed;
          bottom: 20px;
          right: 20px;
          z-index: 999999;
          display: flex;
          flex-direction: column;
          gap: 8px;
        }
        .sbn-extract-btn {
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
        .sbn-extract-btn:hover {
          transform: translateY(-2px);
          box-shadow: 0 6px 16px rgba(0,0,0,0.4);
        }
        .sbn-extract-btn.loading {
          opacity: 0.7;
          pointer-events: none;
        }
        .sbn-doc-count {
          background: #10b981;
          color: white;
          font-size: 12px;
          padding: 4px 10px;
          border-radius: 12px;
          text-align: center;
        }
      </style>
      <div class="sbn-doc-count" id="sbn-doc-count" style="display:none;">0 documents found</div>
      <button class="sbn-extract-btn" id="sbn-scan-btn">
        Scan Documents
      </button>
      <button class="sbn-extract-btn" id="sbn-download-btn" style="display:none;">
        Download All
      </button>
    `;

    document.body.appendChild(button);

    // Scan button handler
    document.getElementById('sbn-scan-btn').addEventListener('click', async () => {
      const btn = document.getElementById('sbn-scan-btn');
      const countEl = document.getElementById('sbn-doc-count');
      const downloadBtn = document.getElementById('sbn-download-btn');

      btn.classList.add('loading');
      btn.textContent = 'Scanning...';

      try {
        const docs = await extractDocuments();
        countEl.textContent = docs.length + ' document' + (docs.length !== 1 ? 's' : '') + ' found';
        countEl.style.display = 'block';

        if (docs.length > 0) {
          downloadBtn.style.display = 'flex';
          downloadBtn.textContent = 'Download All (' + docs.length + ')';
        }

        btn.textContent = 'Scan Again';
      } catch (error) {
        countEl.textContent = 'Error scanning';
        countEl.style.background = '#ef4444';
        countEl.style.display = 'block';
        btn.textContent = 'Try Again';
      }

      btn.classList.remove('loading');
    });

    // Download button handler
    document.getElementById('sbn-download-btn').addEventListener('click', async () => {
      const btn = document.getElementById('sbn-download-btn');
      btn.classList.add('loading');
      btn.textContent = 'Downloading...';

      try {
        const results = await downloadAllDocuments();
        btn.textContent = 'Done! (' + results.downloaded + '/' + results.total + ')';

        setTimeout(() => {
          btn.textContent = 'Download All (' + extractedDocuments.length + ')';
        }, 3000);
      } catch (error) {
        btn.textContent = 'Error';
        setTimeout(() => {
          btn.textContent = 'Download All (' + extractedDocuments.length + ')';
        }, 3000);
      }

      btn.classList.remove('loading');
    });
  }

  // Initialize on relevant SmartBidNet pages
  function init() {
    const url = window.location.href.toLowerCase();
    // SmartBidNet pages live under /Main/ and various subpaths
    if (url.includes('/main/') ||
        url.includes('/project') ||
        url.includes('/bid') ||
        url.includes('/document') ||
        url.includes('/addend') ||
        url.includes('/planroom')) {
      setTimeout(injectDownloadButton, 2000);
    }
  }

  // Run initialization
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  // SmartBidNet is not a SPA, but some pages use partial postbacks.
  // Watch for content changes from ASP.NET UpdatePanel async postbacks.
  const bodyContent = document.getElementById('divBodyContent');
  if (bodyContent) {
    new MutationObserver(() => {
      // Content refreshed via UpdatePanel; re-initialize if needed
      if (!document.getElementById('bid-extractor-sbn-btn')) {
        init();
      }
    }).observe(bodyContent, { subtree: true, childList: true });
  }

})();
