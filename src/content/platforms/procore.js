// @ts-nocheck
// Procore Content Script - Document Extractor
// Extracts and downloads bid documents from Procore project pages

(function() {
  'use strict';

  console.log('🏗️ Bid Extractor: Procore script loaded');

  // State
  let extractedDocuments = [];

  // Listen for messages
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    console.log('Procore received message:', request.action);

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
          platform: 'Procore',
          url: window.location.href,
          projectName: getProjectName(),
          documentCount: extractedDocuments.length
        });
        return true;

      default:
        return false;
    }
  });

  // Get project name
  function getProjectName() {
    const selectors = [
      '[data-qa="project-name"]',
      '.project-name',
      'h1.project-title',
      'h1',
      '[class*="ProjectName"]',
      '.header-title'
    ];

    for (const sel of selectors) {
      const el = document.querySelector(sel);
      if (el?.textContent?.trim()) {
        return el.textContent.trim();
      }
    }

    return document.title.split('-')[0].trim() || 'Unknown Project';
  }

  // Extract bid/project info by scanning page text
  function extractProjectInfo() {
    const text = document.body?.innerText || '';
    const info = {
      projectName: getProjectName(),
      gc: '', bidDate: '', bidTime: '', location: '', scope: '', notes: '',
      source: 'Procore', url: window.location.href
    };

    const gcMatch = text.match(/(?:general contractor|gc|company|owner|posted by|invited by)[:\s]+([A-Z][\w\s&.,'-]{2,60})/im);
    if (gcMatch) info.gc = gcMatch[1].trim();

    const dateMatch = text.match(/(?:bid date|due date|deadline|bid due|response date)[:\s]+(\d{1,2}[\/-]\d{1,2}[\/-]\d{2,4}|\w+\s+\d{1,2},?\s+\d{4})/im);
    if (dateMatch) info.bidDate = dateMatch[1].trim();

    const timeMatch = text.match(/(?:bid time|due time|due by|time)[:\s]+(\d{1,2}:\d{2}\s*(?:AM|PM|am|pm)?(?:\s*[A-Z]{2,4})?)/im);
    if (timeMatch) info.bidTime = timeMatch[1].trim();

    const locMatch = text.match(/(?:location|address|city|project location)[:\s]+([^\n]{5,80})/im);
    if (locMatch) info.location = locMatch[1].trim();

    const scopeMatch = text.match(/(?:scope|trade|division|csi|bid package|work type)[:\s]+([^\n]{3,120})/im);
    if (scopeMatch) info.scope = scopeMatch[1].trim();

    const noteEls = document.querySelectorAll('[class*="description"], [class*="note"], [class*="message"], [data-qa*="description"]');
    const noteTexts = [];
    noteEls.forEach(el => { const t = el.innerText?.trim(); if (t && t.length > 10 && t.length < 2000) noteTexts.push(t); });
    if (noteTexts.length === 0) {
      const descMatch = text.match(/(?:description|notes|message|instructions)[:\s]+([^\n].{10,1500})/im);
      if (descMatch) noteTexts.push(descMatch[1].trim());
    }
    info.notes = noteTexts.slice(0, 5).join('\n---\n');

    return info;
  }

  // Extract documents
  async function extractDocuments() {
    console.log('🔍 Extracting documents from Procore...');
    extractedDocuments = [];

    await waitForContent();

    // Strategy 1: Documents table/list
    const docRows = document.querySelectorAll([
      '[data-qa*="document"]',
      '[data-testid*="document"]',
      '.document-row',
      '.file-row',
      'tr[class*="document"]',
      '[class*="DocumentItem"]',
      '[class*="FileItem"]'
    ].join(', '));

    docRows.forEach(row => {
      const link = row.querySelector('a[href]');
      const nameEl = row.querySelector('.name, .title, [class*="name"], a');

      const name = nameEl?.textContent?.trim() || '';
      const url = link?.href || '';

      if (isRelevantFile(name) || isRelevantFile(url)) {
        extractedDocuments.push({
          name: name || extractFilenameFromUrl(url),
          url: url,
          type: getFileType(name || url),
          source: 'Procore'
        });
      }
    });

    // Strategy 2: Download links
    const downloadLinks = document.querySelectorAll([
      'a[href*="download"]',
      'a[href*="/documents/"]',
      'a[href*="/files/"]',
      'a[href*=".pdf"]',
      'a[href*=".dwg"]',
      'a[download]'
    ].join(', '));

    downloadLinks.forEach(link => {
      const url = link.href;
      const name = link.textContent?.trim() || link.getAttribute('download') || extractFilenameFromUrl(url);

      if ((isRelevantFile(name) || isRelevantFile(url)) && !extractedDocuments.find(d => d.url === url)) {
        extractedDocuments.push({
          name: name,
          url: url,
          type: getFileType(name),
          source: 'Procore'
        });
      }
    });

    // Strategy 3: Drawings section
    const drawingsSection = document.querySelector('[class*="drawings"], [class*="Drawings"], [data-qa*="drawing"]');
    if (drawingsSection) {
      drawingsSection.querySelectorAll('a[href]').forEach(link => {
        if (isRelevantFile(link.href) && !extractedDocuments.find(d => d.url === link.href)) {
          extractedDocuments.push({
            name: link.textContent?.trim() || extractFilenameFromUrl(link.href),
            url: link.href,
            type: getFileType(link.href),
            source: 'Procore'
          });
        }
      });
    }

    // Strategy 4: Specifications section
    const specsSection = document.querySelector('[class*="specifications"], [class*="Specs"]');
    if (specsSection) {
      specsSection.querySelectorAll('a[href]').forEach(link => {
        if (isRelevantFile(link.href) && !extractedDocuments.find(d => d.url === link.href)) {
          extractedDocuments.push({
            name: link.textContent?.trim() || extractFilenameFromUrl(link.href),
            url: link.href,
            type: getFileType(link.href),
            source: 'Procore'
          });
        }
      });
    }

    console.log(`📄 Found ${extractedDocuments.length} documents`);
    return extractedDocuments;
  }

  // Download all documents
  async function downloadAllDocuments() {
    if (extractedDocuments.length === 0) {
      await extractDocuments();
    }

    if (extractedDocuments.length === 0) {
      throw new Error('No documents found');
    }

    const projectName = sanitizeFilename(getProjectName());
    const results = { total: extractedDocuments.length, downloaded: 0, failed: 0, documents: [] };

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
      } catch (err) {
        results.failed++;
        results.documents.push({ ...doc, status: 'error', error: err.message });
      }
      await sleep(300);
    }

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
    return { pdf: 'PDF', dwg: 'CAD', dxf: 'CAD', xlsx: 'Excel', xls: 'Excel', doc: 'Word', docx: 'Word', zip: 'Archive' }[ext] || 'Document';
  }

  function extractFilenameFromUrl(url) {
    try {
      return decodeURIComponent(new URL(url).pathname.split('/').pop().split('?')[0]) || 'document';
    } catch { return 'document'; }
  }

  function sanitizeFilename(name) {
    return name.replace(/[<>:"/\\|?*]/g, '').replace(/\s+/g, '_').substring(0, 100);
  }

  async function waitForContent(timeout = 3000) {
    return new Promise(resolve => {
      let elapsed = 0;
      const check = setInterval(() => {
        elapsed += 200;
        if (document.querySelector('.document, .file, table, [class*="Document"]') || elapsed >= timeout) {
          clearInterval(check);
          resolve();
        }
      }, 200);
    });
  }

  function sleep(ms) {
    return new Promise(r => setTimeout(r, ms));
  }

  // Inject button
  function injectDownloadButton() {
    if (document.getElementById('bid-extractor-pc-btn')) return;

    const container = document.createElement('div');
    container.id = 'bid-extractor-pc-btn';
    container.innerHTML = `
      <style>
        #bid-extractor-pc-btn {
          position: fixed;
          bottom: 20px;
          right: 20px;
          z-index: 999999;
          display: flex;
          flex-direction: column;
          gap: 8px;
        }
        .pc-btn {
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
        }
        .pc-btn:hover { transform: translateY(-2px); }
        .pc-count {
          background: #10b981;
          color: white;
          font-size: 12px;
          padding: 4px 10px;
          border-radius: 12px;
          text-align: center;
        }
      </style>
      <div class="pc-count" id="pc-count" style="display:none;">0 docs</div>
      <button class="pc-btn" id="pc-scan">🔍 Scan Documents</button>
      <button class="pc-btn" id="pc-download" style="display:none;">⬇️ Download All</button>
    `;

    document.body.appendChild(container);

    document.getElementById('pc-scan').addEventListener('click', async () => {
      const btn = document.getElementById('pc-scan');
      btn.innerHTML = '⏳ Scanning...';
      const docs = await extractDocuments();
      document.getElementById('pc-count').textContent = `${docs.length} docs`;
      document.getElementById('pc-count').style.display = 'block';
      if (docs.length > 0) {
        document.getElementById('pc-download').style.display = 'flex';
        document.getElementById('pc-download').innerHTML = `⬇️ Download All (${docs.length})`;
      }
      btn.innerHTML = '🔍 Scan Again';
    });

    document.getElementById('pc-download').addEventListener('click', async () => {
      const btn = document.getElementById('pc-download');
      btn.innerHTML = '⏳ Downloading...';
      const results = await downloadAllDocuments();
      btn.innerHTML = `✅ Done (${results.downloaded})`;
      setTimeout(() => btn.innerHTML = '⬇️ Download All', 3000);
    });
  }

  // Initialize
  function init() {
    const url = window.location.href;
    if (url.includes('/project/') || url.includes('/documents') || url.includes('/drawings') || url.includes('/bidding')) {
      setTimeout(injectDownloadButton, 2000);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
