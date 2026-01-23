// @ts-nocheck
// PlanHub Content Script - Document Extractor
// Extracts and downloads bid documents from PlanHub project pages

(function() {
  'use strict';

  console.log('🏗️ Bid Extractor: PlanHub script loaded');

  // State
  let extractedDocuments = [];

  // Listen for messages from popup/background
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    console.log('PlanHub received message:', request.action);

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
          platform: 'PlanHub',
          url: window.location.href,
          projectName: getProjectName(),
          documentCount: extractedDocuments.length
        });
        return true;

      default:
        return false;
    }
  });

  // Get project name from page
  function getProjectName() {
    const selectors = [
      'h1',
      '.project-title',
      '.project-name',
      '[data-testid="project-name"]',
      '.header-title'
    ];

    for (const selector of selectors) {
      const el = document.querySelector(selector);
      if (el?.textContent?.trim()) {
        return el.textContent.trim();
      }
    }

    return document.title.split('|')[0].trim() || 'Unknown Project';
  }

  // Extract all documents from the page
  async function extractDocuments() {
    console.log('🔍 Extracting documents from PlanHub...');
    extractedDocuments = [];

    await waitForContent();

    // Strategy 1: Find document/file list items
    const fileItems = document.querySelectorAll([
      '.document-item',
      '.file-item',
      '.file-row',
      '[class*="document"]',
      '[class*="file-list"] li',
      'tr[class*="file"]'
    ].join(', '));

    fileItems.forEach(item => {
      const doc = extractDocFromElement(item);
      if (doc) extractedDocuments.push(doc);
    });

    // Strategy 2: Find all download links
    const downloadLinks = document.querySelectorAll([
      'a[href*="download"]',
      'a[href*=".pdf"]',
      'a[href*=".dwg"]',
      'a[href*=".zip"]',
      'a[download]',
      'button[data-download]'
    ].join(', '));

    downloadLinks.forEach(link => {
      const doc = {
        name: link.textContent?.trim() || extractFilenameFromUrl(link.href),
        url: link.href || link.dataset?.download || '',
        type: getFileType(link.href),
        source: 'PlanHub'
      };

      if (doc.url && !extractedDocuments.find(d => d.url === doc.url)) {
        extractedDocuments.push(doc);
      }
    });

    // Strategy 3: Look for Plans & Specs section
    const specsSection = document.querySelector('[class*="plans"], [class*="specs"], [class*="documents"]');
    if (specsSection) {
      const links = specsSection.querySelectorAll('a[href]');
      links.forEach(link => {
        if (isRelevantFile(link.href) || isRelevantFile(link.textContent)) {
          const doc = {
            name: link.textContent?.trim() || extractFilenameFromUrl(link.href),
            url: link.href,
            type: getFileType(link.href),
            source: 'PlanHub'
          };
          if (!extractedDocuments.find(d => d.url === doc.url)) {
            extractedDocuments.push(doc);
          }
        }
      });
    }

    console.log(`📄 Found ${extractedDocuments.length} documents`);
    return extractedDocuments;
  }

  // Extract document info from an element
  function extractDocFromElement(element) {
    const link = element.querySelector('a[href]');
    const nameEl = element.querySelector('.name, .title, .file-name, span, a');

    const name = nameEl?.textContent?.trim() || '';
    const url = link?.href || '';

    if (isRelevantFile(name) || isRelevantFile(url)) {
      return {
        name: name || extractFilenameFromUrl(url),
        url: url,
        type: getFileType(name || url),
        source: 'PlanHub'
      };
    }
    return null;
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
      await sleep(300);
    }

    console.log(`✅ Downloaded ${results.downloaded}/${results.total} documents`);
    return results;
  }

  // Helpers
  function isRelevantFile(str) {
    if (!str) return false;
    const lower = str.toLowerCase();
    return ['.pdf', '.dwg', '.dxf', '.xlsx', '.xls', '.doc', '.docx', '.zip'].some(ext => lower.includes(ext));
  }

  function getFileType(filename) {
    const ext = filename?.split('.').pop()?.toLowerCase();
    const types = { pdf: 'PDF', dwg: 'CAD', dxf: 'CAD', xlsx: 'Excel', xls: 'Excel', doc: 'Word', docx: 'Word', zip: 'Archive' };
    return types[ext] || 'Document';
  }

  function extractFilenameFromUrl(url) {
    try {
      return decodeURIComponent(new URL(url).pathname.split('/').pop().split('?')[0]) || 'document';
    } catch {
      return 'document';
    }
  }

  function sanitizeFilename(name) {
    return name.replace(/[<>:"/\\|?*]/g, '').replace(/\s+/g, '_').substring(0, 100);
  }

  async function waitForContent(timeout = 3000) {
    return new Promise(resolve => {
      let elapsed = 0;
      const check = setInterval(() => {
        elapsed += 200;
        if (document.querySelector('.document, .file, table, .file-list') || elapsed >= timeout) {
          clearInterval(check);
          resolve();
        }
      }, 200);
    });
  }

  function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // Inject floating button
  function injectDownloadButton() {
    if (document.getElementById('bid-extractor-ph-btn')) return;

    const button = document.createElement('div');
    button.id = 'bid-extractor-ph-btn';
    button.innerHTML = `
      <style>
        #bid-extractor-ph-btn {
          position: fixed;
          bottom: 20px;
          right: 20px;
          z-index: 999999;
          display: flex;
          flex-direction: column;
          gap: 8px;
        }
        .ph-extract-btn {
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
        .ph-extract-btn:hover {
          transform: translateY(-2px);
          box-shadow: 0 6px 16px rgba(0,0,0,0.4);
        }
        .ph-doc-count {
          background: #10b981;
          color: white;
          font-size: 12px;
          padding: 4px 10px;
          border-radius: 12px;
          text-align: center;
        }
      </style>
      <div class="ph-doc-count" id="ph-doc-count" style="display:none;">0 docs</div>
      <button class="ph-extract-btn" id="ph-scan-btn">
        <span>🔍</span> Scan Documents
      </button>
      <button class="ph-extract-btn" id="ph-download-btn" style="display:none;">
        <span>⬇️</span> Download All
      </button>
    `;

    document.body.appendChild(button);

    document.getElementById('ph-scan-btn').addEventListener('click', async () => {
      const btn = document.getElementById('ph-scan-btn');
      btn.innerHTML = '<span>⏳</span> Scanning...';
      const docs = await extractDocuments();
      document.getElementById('ph-doc-count').textContent = `${docs.length} docs`;
      document.getElementById('ph-doc-count').style.display = 'block';
      if (docs.length > 0) {
        document.getElementById('ph-download-btn').style.display = 'flex';
        document.getElementById('ph-download-btn').innerHTML = `<span>⬇️</span> Download All (${docs.length})`;
      }
      btn.innerHTML = '<span>🔍</span> Scan Again';
    });

    document.getElementById('ph-download-btn').addEventListener('click', async () => {
      const btn = document.getElementById('ph-download-btn');
      btn.innerHTML = '<span>⏳</span> Downloading...';
      const results = await downloadAllDocuments();
      btn.innerHTML = `<span>✅</span> Done (${results.downloaded})`;
      setTimeout(() => {
        btn.innerHTML = `<span>⬇️</span> Download All`;
      }, 3000);
    });
  }

  // Initialize
  function init() {
    if (window.location.href.includes('/project/') || window.location.href.includes('/bid/')) {
      setTimeout(injectDownloadButton, 2000);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
