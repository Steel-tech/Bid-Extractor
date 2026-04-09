// @ts-nocheck
// Platform Helpers for Bid Extractor
// Shared utilities used by all platform content scripts (BuildingConnected, PlanHub, etc.)
// Loaded via manifest.json before each platform script

(function() {
  'use strict';

  // Prevent double-initialization
  if (window.PlatformHelpers) return;

  // Default relevant file extensions for construction bid documents
  const DEFAULT_EXTENSIONS = ['.pdf', '.dwg', '.dxf', '.xlsx', '.xls', '.doc', '.docx', '.zip', '.rar'];

  /**
   * Check if a filename contains a relevant document extension
   * @param {string} filename
   * @param {string[]} [extensions] - Custom extensions list
   * @returns {boolean}
   */
  function isRelevantFile(filename, extensions) {
    if (!filename) return false;
    const exts = extensions || DEFAULT_EXTENSIONS;
    const lower = filename.toLowerCase();
    return exts.some(ext => lower.includes(ext));
  }

  /**
   * Check if URL points to a relevant file or download endpoint
   * @param {string} url
   * @returns {boolean}
   */
  function isRelevantUrl(url) {
    if (!url) return false;
    const lower = url.toLowerCase();
    return DEFAULT_EXTENSIONS.some(ext => lower.includes(ext)) ||
           lower.includes('download') ||
           lower.includes('/files/') ||
           lower.includes('/documents/');
  }

  /**
   * Get human-readable file type from filename
   * @param {string} filename
   * @returns {string}
   */
  function getFileType(filename) {
    if (!filename) return 'Document';
    const match = filename.match(/\.(pdf|dwg|dxf|xlsx?|docx?|zip|rar|csv|tiff?|png|jpe?g|7z)(\b|$)/i);
    if (!match) return 'Document';

    const ext = match[1].toLowerCase();
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

  /**
   * Extract filename from URL
   * @param {string} url
   * @returns {string}
   */
  function extractFilenameFromUrl(url) {
    if (!url) return 'document';
    try {
      const path = new URL(url, window.location.origin).pathname;
      const segment = path.split('/').pop();
      const decoded = decodeURIComponent(segment.split('?')[0]);
      return decoded || 'document';
    } catch {
      const parts = url.split('/');
      const last = parts[parts.length - 1];
      return decodeURIComponent(last.split('?')[0]) || 'document';
    }
  }

  /**
   * Sanitize a string for use as a filename
   * @param {string} name
   * @param {number} [maxLength=100]
   * @returns {string}
   */
  function sanitizeFilename(name, maxLength) {
    if (!name) return 'unnamed';
    return name
      .replace(/[<>:"/\\|?*]/g, '')
      .replace(/\s+/g, '_')
      .substring(0, maxLength || 100);
  }

  /**
   * Sleep for a given duration in milliseconds
   * @param {number} ms
   * @returns {Promise<void>}
   */
  function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Wait for page content to render (SPA or server-rendered)
   * @param {Object} [options]
   * @param {number} [options.timeout=3000] - Max wait time in ms
   * @param {string} [options.selector] - CSS selector to wait for
   * @param {number} [options.minLinks=5] - Minimum number of links to consider ready
   * @param {number} [options.minTextLength=500] - Minimum body text length
   * @returns {Promise<void>}
   */
  function waitForContent(options) {
    const opts = options || {};
    const timeout = opts.timeout || 3000;
    const selector = opts.selector || null;
    const minLinks = opts.minLinks || 5;
    const minTextLength = opts.minTextLength || 500;

    return new Promise(resolve => {
      let elapsed = 0;
      const interval = setInterval(() => {
        elapsed += 200;

        if (selector && document.querySelector(selector)) {
          clearInterval(interval);
          resolve();
          return;
        }

        const hasLinks = document.querySelectorAll('a[href]').length >= minLinks;
        const hasText = (document.body?.innerText?.length || 0) >= minTextLength;

        if ((hasLinks || hasText) || elapsed >= timeout) {
          clearInterval(interval);
          resolve();
        }
      }, 200);
    });
  }

  /**
   * Download all documents via background script
   * @param {Array} documents - Array of document objects with name/url
   * @param {string} projectName - Project name for folder
   * @returns {Promise<Object>} Download results
   */
  async function downloadAllDocuments(documents, projectName) {
    if (!documents || documents.length === 0) {
      throw new Error('No documents found to download');
    }

    const safeName = sanitizeFilename(projectName);
    const results = {
      total: documents.length,
      downloaded: 0,
      failed: 0,
      documents: []
    };

    for (const doc of documents) {
      try {
        if (doc.url) {
          const docName = sanitizeFilename(doc.name || extractFilenameFromUrl(doc.url));
          await chrome.runtime.sendMessage({
            action: 'downloadFile',
            url: doc.url,
            filename: 'Bids/' + safeName + '/' + docName
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

    return results;
  }

  /**
   * Extract project info by scanning page text for common patterns
   * @param {Object} options
   * @param {string} options.source - Platform name (e.g. 'BuildingConnected')
   * @param {Function} options.getProjectName - Function returning project name
   * @param {Object} [options.domSelectors] - Platform-specific DOM selectors for fields
   * @returns {Object} Project info object
   */
  function extractProjectInfoFromPage(options) {
    const text = document.body?.innerText || '';
    const info = {
      projectName: options.getProjectName(),
      gc: '',
      bidDate: '',
      bidTime: '',
      location: '',
      scope: '',
      notes: '',
      source: options.source,
      url: window.location.href
    };

    // Try DOM selectors first (if provided)
    const sel = options.domSelectors || {};
    if (sel.gc) {
      const el = document.querySelector(sel.gc);
      if (el?.textContent?.trim()) info.gc = el.textContent.trim();
    }
    if (sel.bidDate) {
      const el = document.querySelector(sel.bidDate);
      if (el?.textContent?.trim()) info.bidDate = el.textContent.trim();
    }
    if (sel.bidTime) {
      const el = document.querySelector(sel.bidTime);
      if (el?.textContent?.trim()) info.bidTime = el.textContent.trim();
    }
    if (sel.location) {
      const el = document.querySelector(sel.location);
      if (el?.textContent?.trim()) info.location = el.textContent.trim();
    }
    if (sel.scope) {
      const el = document.querySelector(sel.scope);
      if (el?.textContent?.trim()) info.scope = el.textContent.trim();
    }

    // Fall back to text pattern matching for empty fields
    if (!info.gc) {
      const gcMatch = text.match(/(?:general contractor|gc|company|owner|posted by|invited by)[:\s]+([A-Z][\w\s&.,'-]{2,60})/im);
      if (gcMatch) info.gc = gcMatch[1].trim();
    }
    if (!info.bidDate) {
      const dateMatch = text.match(/(?:bid date|due date|deadline|bid due|response date)[:\s]+(\d{1,2}[\/-]\d{1,2}[\/-]\d{2,4}|\w+\s+\d{1,2},?\s+\d{4})/im);
      if (dateMatch) info.bidDate = dateMatch[1].trim();
    }
    if (!info.bidTime) {
      const timeMatch = text.match(/(?:bid time|due time|due by|time)[:\s]+(\d{1,2}:\d{2}\s*(?:AM|PM|am|pm)?(?:\s*[A-Z]{2,4})?)/im);
      if (timeMatch) info.bidTime = timeMatch[1].trim();
    }
    if (!info.location) {
      const locMatch = text.match(/(?:location|address|city|project location)[:\s]+([^\n]{5,80})/im);
      if (locMatch) info.location = locMatch[1].trim();
    }
    if (!info.scope) {
      const scopeMatch = text.match(/(?:scope|trade|division|csi|bid package|work type)[:\s]+([^\n]{3,120})/im);
      if (scopeMatch) info.scope = (scopeMatch[1] || scopeMatch[0]).trim();
    }

    // Notes from description blocks
    const noteSelectors = sel.notes || '[class*="description"], [class*="note"], [class*="message"], [class*="Detail"]';
    const noteEls = document.querySelectorAll(noteSelectors);
    const noteTexts = [];
    noteEls.forEach(el => {
      const t = el.innerText?.trim();
      if (t && t.length > 10 && t.length < 2000) noteTexts.push(t);
    });
    if (noteTexts.length === 0) {
      const descMatch = text.match(/(?:description|notes|message|instructions)[:\s]+([^\n].{10,1500})/im);
      if (descMatch) noteTexts.push(descMatch[1].trim());
    }
    info.notes = noteTexts.slice(0, 5).join('\n---\n');

    return info;
  }

  /**
   * Add a document to a list, avoiding duplicates
   * @param {Array} list - Document list
   * @param {Object} doc - Document to add
   * @param {Set} [seenSet] - Set of seen URLs/names for dedup
   */
  function addUniqueDocument(list, doc, seenSet) {
    if (!doc || (!doc.url && !doc.name)) return;

    const seen = seenSet || new Set(list.map(d => d.url || d.name));
    const key = doc.url || doc.name;

    if (key && !seen.has(key)) {
      seen.add(key);
      list.push(doc);
    }
  }

  /**
   * Inject floating download button onto platform pages
   * @param {Object} config
   * @param {string} config.id - Unique button container ID (e.g. 'bid-extractor-bc-btn')
   * @param {string} config.prefix - CSS class prefix (e.g. 'bc')
   * @param {string} [config.gradientStart='#374151'] - Button gradient start color
   * @param {string} [config.gradientEnd='#1f2937'] - Button gradient end color
   * @param {Function} config.onScan - Async function returning documents array
   * @param {Function} config.onDownload - Async function for downloading, receives no args
   * @param {Function} [config.getDocumentCount] - Function returning current doc count
   */
  function injectDownloadButton(config) {
    if (document.getElementById(config.id)) return;

    const prefix = config.prefix;
    const gradStart = config.gradientStart || '#374151';
    const gradEnd = config.gradientEnd || '#1f2937';

    const container = document.createElement('div');
    container.id = config.id;
    container.innerHTML = `
      <style>
        #${config.id} {
          position: fixed;
          bottom: 20px;
          right: 20px;
          z-index: 999999;
          display: flex;
          flex-direction: column;
          gap: 8px;
        }
        .${prefix}-extract-btn {
          background: linear-gradient(135deg, ${gradStart} 0%, ${gradEnd} 100%);
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
        .${prefix}-extract-btn:hover {
          transform: translateY(-2px);
          box-shadow: 0 6px 16px rgba(0,0,0,0.4);
        }
        .${prefix}-extract-btn.loading {
          opacity: 0.7;
          pointer-events: none;
        }
        .${prefix}-doc-count {
          background: #10b981;
          color: white;
          font-size: 12px;
          padding: 4px 10px;
          border-radius: 12px;
          text-align: center;
        }
      </style>
      <div class="${prefix}-doc-count" id="${prefix}-doc-count" style="display:none;">0 documents found</div>
      <button class="${prefix}-extract-btn" id="${prefix}-scan-btn">
        <span class="icon">🔍</span>
        <span>Scan Documents</span>
      </button>
      <button class="${prefix}-extract-btn" id="${prefix}-download-btn" style="display:none;">
        <span class="icon">⬇️</span>
        <span>Download All</span>
      </button>
    `;

    document.body.appendChild(container);

    // Scan button handler
    document.getElementById(prefix + '-scan-btn').addEventListener('click', async () => {
      const btn = document.getElementById(prefix + '-scan-btn');
      const countEl = document.getElementById(prefix + '-doc-count');
      const downloadBtn = document.getElementById(prefix + '-download-btn');

      btn.classList.add('loading');
      btn.querySelector('span:last-child').textContent = 'Scanning...';

      try {
        const docs = await config.onScan();
        const count = docs.length;
        countEl.textContent = count + ' document' + (count !== 1 ? 's' : '') + ' found';
        countEl.style.display = 'block';

        if (count > 0) {
          downloadBtn.style.display = 'flex';
          downloadBtn.querySelector('span:last-child').textContent = 'Download All (' + count + ')';
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
    document.getElementById(prefix + '-download-btn').addEventListener('click', async () => {
      const btn = document.getElementById(prefix + '-download-btn');
      btn.classList.add('loading');
      btn.querySelector('span:last-child').textContent = 'Downloading...';

      try {
        const results = await config.onDownload();
        btn.querySelector('span:last-child').textContent = 'Done! (' + results.downloaded + '/' + results.total + ')';

        const docCount = config.getDocumentCount ? config.getDocumentCount() : 0;
        setTimeout(() => {
          btn.querySelector('span:last-child').textContent = 'Download All' + (docCount ? ' (' + docCount + ')' : '');
        }, 3000);
      } catch (error) {
        btn.querySelector('span:last-child').textContent = 'Error';
        setTimeout(() => {
          const docCount = config.getDocumentCount ? config.getDocumentCount() : 0;
          btn.querySelector('span:last-child').textContent = 'Download All' + (docCount ? ' (' + docCount + ')' : '');
        }, 3000);
      }

      btn.classList.remove('loading');
    });
  }

  /**
   * Set up SPA navigation watcher (URL change detection)
   * @param {Function} callback - Function to call on URL change
   * @param {Object} [options]
   * @param {number} [options.delay=1000] - Delay after URL change before calling callback
   * @param {boolean} [options.hashChange=false] - Also watch hashchange events
   */
  function watchNavigation(callback, options) {
    const opts = options || {};
    const delay = opts.delay || 1000;

    let lastUrl = location.href;
    new MutationObserver(() => {
      if (location.href !== lastUrl) {
        lastUrl = location.href;
        setTimeout(callback, delay);
      }
    }).observe(document.body, { subtree: true, childList: true });

    if (opts.hashChange) {
      window.addEventListener('hashchange', () => {
        setTimeout(callback, delay);
      });
    }
  }

  /**
   * Standard platform initialization pattern
   * @param {Object} config
   * @param {string[]} config.urlPatterns - URL substrings that trigger button injection
   * @param {Function} config.injectButton - Function to inject the download button
   * @param {number} [config.delay=2000] - Delay before injection
   */
  function initPlatform(config) {
    function init() {
      const url = window.location.href.toLowerCase();
      if (config.urlPatterns.some(pattern => url.includes(pattern))) {
        setTimeout(config.injectButton, config.delay || 2000);
      }
    }

    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', init);
    } else {
      init();
    }

    return init;
  }

  /**
   * Create the standard message listener for platform scripts
   * @param {Object} handlers
   * @param {string} handlers.platformName - Platform name
   * @param {Function} handlers.extractDocuments - Async function returning docs array
   * @param {Function} handlers.extractProjectInfo - Function returning project info
   * @param {Function} handlers.downloadAllDocuments - Async function returning download results
   * @param {Function} handlers.getProjectName - Function returning project name
   * @param {Function} handlers.getDocumentCount - Function returning current doc count
   */
  function createMessageListener(handlers) {
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
      switch (request.action) {
        case 'extractDocuments':
          handlers.extractDocuments().then(docs => {
            const info = handlers.extractProjectInfo();
            sendResponse({ success: true, documents: docs, projectInfo: info });
          }).catch(err => {
            sendResponse({ success: false, error: err.message });
          });
          return true;

        case 'downloadAllDocuments':
          handlers.downloadAllDocuments().then(result => {
            sendResponse({ success: true, ...result });
          }).catch(err => {
            sendResponse({ success: false, error: err.message });
          });
          return true;

        case 'getPageInfo':
          sendResponse({
            success: true,
            platform: handlers.platformName,
            url: window.location.href,
            projectName: handlers.getProjectName(),
            documentCount: handlers.getDocumentCount()
          });
          return true;

        default:
          return false;
      }
    });
  }

  // Export to window
  window.PlatformHelpers = {
    isRelevantFile,
    isRelevantUrl,
    getFileType,
    extractFilenameFromUrl,
    sanitizeFilename,
    sleep,
    waitForContent,
    downloadAllDocuments,
    extractProjectInfoFromPage,
    addUniqueDocument,
    injectDownloadButton,
    watchNavigation,
    initPlatform,
    createMessageListener,
    DEFAULT_EXTENSIONS
  };

})();
