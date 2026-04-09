// @ts-nocheck
// BuildingConnected Content Script - Document Extractor
// Uses PlatformHelpers (loaded before this script via manifest)

(function() {
  'use strict';

  console.log('🏗️ Bid Extractor: BuildingConnected script loaded');

  if (!window.PlatformHelpers) {
    console.error('Bid Extractor: PlatformHelpers module not loaded — BuildingConnected script cannot initialize');
    return;
  }
  const PH = window.PlatformHelpers;

  // State
  let extractedDocuments = [];

  // Set up standard message listener
  PH.createMessageListener({
    platformName: 'BuildingConnected',
    extractDocuments: extractDocuments,
    extractProjectInfo: extractProjectInfo,
    downloadAllDocuments: doDownloadAll,
    getProjectName: getProjectName,
    getDocumentCount: function() { return extractedDocuments.length; }
  });

  // Extract project name from page
  function getProjectName() {
    const selectors = [
      'h1', '[data-testid="project-name"]', '.project-name',
      '.opportunity-name', '[class*="ProjectName"]', '[class*="projectName"]'
    ];
    for (const selector of selectors) {
      const el = document.querySelector(selector);
      if (el?.textContent?.trim()) return el.textContent.trim();
    }
    const title = document.title;
    if (title && !title.includes('BuildingConnected')) {
      return title.split('|')[0].trim();
    }
    return 'Unknown Project';
  }

  // Extract project info
  function extractProjectInfo() {
    const info = PH.extractProjectInfoFromPage({
      source: 'BuildingConnected',
      getProjectName: getProjectName
    });

    // BC-specific: also look for "invited by" patterns
    if (!info.gc) {
      const text = document.body?.innerText || '';
      const m = text.match(/(?:invited by|posted by|sent by|created by)[:\s]+([A-Z][\w\s&.,'-]{2,60})/im);
      if (m) info.gc = m[1].trim();
    }

    // BC-specific: check paragraph blocks for notes
    if (!info.notes) {
      const noteTexts = [];
      document.querySelectorAll(
        '[class*="message"], [class*="Message"], [class*="description"], [class*="Description"], ' +
        '[class*="note"], [class*="Note"], [class*="comment"], [class*="Comment"], ' +
        '[data-testid*="message"], [data-testid*="description"]'
      ).forEach(el => {
        const t = el.innerText?.trim();
        if (t && t.length > 10 && t.length < 2000) noteTexts.push(t);
      });
      if (noteTexts.length === 0) {
        document.querySelectorAll('p').forEach(p => {
          const t = p.innerText?.trim();
          if (t && t.length > 30 && t.length < 1500) noteTexts.push(t);
        });
      }
      info.notes = noteTexts.slice(0, 5).join('\n---\n');
    }

    return info;
  }

  // Extract all documents from the page
  async function extractDocuments() {
    console.log('🔍 Extracting documents from BuildingConnected...');
    extractedDocuments = [];
    const seen = new Set();

    function addDoc(doc) {
      PH.addUniqueDocument(extractedDocuments, doc, seen);
    }

    await PH.waitForContent();

    // Strategy 1: Every <a> on the page
    document.querySelectorAll('a[href]').forEach(el => {
      const href = el.href || '';
      const text = (el.textContent || '').trim();
      const download = el.getAttribute('download') || '';
      if (PH.isRelevantFile(text) || PH.isRelevantFile(download) || PH.isRelevantUrl(href)) {
        addDoc({
          name: download || text || PH.extractFilenameFromUrl(href),
          url: href,
          type: PH.getFileType(download || text || href),
          source: 'BuildingConnected'
        });
      }
    });

    // Strategy 2: Buttons with download-related attributes or text
    document.querySelectorAll('button, [role="button"]').forEach(el => {
      const text = (el.textContent || '').trim().toLowerCase();
      const url = el.dataset?.url || el.dataset?.href || '';
      if (text.includes('download') || url) {
        if (PH.isRelevantUrl(url) || PH.isRelevantFile(text)) {
          addDoc({
            name: text || PH.extractFilenameFromUrl(url),
            url: url,
            type: PH.getFileType(text || url),
            source: 'BuildingConnected'
          });
        }
      }
    });

    // Strategy 3: Walk the page text looking for file-name patterns
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) {
      const text = walker.currentNode.textContent.trim();
      const fileMatch = text.match(/[\w\s._-]+\.(pdf|dwg|dxf|xlsx?|docx?|zip|rar)/gi);
      if (fileMatch) {
        fileMatch.forEach(name => {
          const closestLink = walker.currentNode.parentElement?.closest('a[href]');
          addDoc({
            name: name.trim(),
            url: closestLink?.href || '',
            type: PH.getFileType(name),
            source: 'BuildingConnected'
          });
        });
      }
    }

    // Strategy 4: Click Documents/Files tab if not active, re-scan
    await extractFromDocumentsSection();

    console.log('📄 Found ' + extractedDocuments.length + ' documents');
    return extractedDocuments;
  }

  // Look for Documents tab and click it
  async function extractFromDocumentsSection() {
    const docsTabs = document.querySelectorAll(
      '[data-testid*="documents"], [data-testid*="files"], [role="tab"]'
    );

    for (const tab of docsTabs) {
      if (tab.textContent?.toLowerCase().includes('document') ||
          tab.textContent?.toLowerCase().includes('file')) {
        if (!tab.classList.contains('active') && !tab.getAttribute('aria-selected')) {
          tab.click();
          await PH.sleep(1500);
          // Re-scan after tab click
          const seen = new Set(extractedDocuments.map(d => d.url || d.name));
          document.querySelectorAll('a[href]').forEach(link => {
            const href = link.href || '';
            const text = (link.textContent || '').trim();
            const download = link.getAttribute('download') || '';
            if (PH.isRelevantFile(text) || PH.isRelevantFile(download) || PH.isRelevantUrl(href)) {
              PH.addUniqueDocument(extractedDocuments, {
                name: download || text || PH.extractFilenameFromUrl(href),
                url: href,
                type: PH.getFileType(download || text || href),
                source: 'BuildingConnected'
              }, seen);
            }
          });
        }
        break;
      }
    }
  }

  // Download all
  async function doDownloadAll() {
    if (extractedDocuments.length === 0) {
      await extractDocuments();
    }
    return PH.downloadAllDocuments(extractedDocuments, getProjectName());
  }

  // Inject button
  function doInjectButton() {
    PH.injectDownloadButton({
      id: 'bid-extractor-bc-btn',
      prefix: 'bc',
      onScan: extractDocuments,
      onDownload: doDownloadAll,
      getDocumentCount: function() { return extractedDocuments.length; }
    });
  }

  // Initialize
  const init = PH.initPlatform({
    urlPatterns: ['/opportunity/', '/project/', '/bid/', '/rfp/'],
    injectButton: doInjectButton
  });

  // Watch for SPA navigation
  PH.watchNavigation(init);

})();
