// @ts-nocheck
// PlanHub Content Script - Document Extractor
// Uses PlatformHelpers (loaded before this script via manifest)

(function() {
  'use strict';

  console.log('🏗️ Bid Extractor: PlanHub script loaded');

  const PH = window.PlatformHelpers;

  // State
  let extractedDocuments = [];

  // Set up standard message listener
  PH.createMessageListener({
    platformName: 'PlanHub',
    extractDocuments: extractDocuments,
    extractProjectInfo: extractProjectInfo,
    downloadAllDocuments: doDownloadAll,
    getProjectName: getProjectName,
    getDocumentCount: function() { return extractedDocuments.length; }
  });

  // Get project name
  function getProjectName() {
    const selectors = [
      'h1', '.project-title', '.project-name',
      '[data-testid="project-name"]', '.header-title'
    ];
    for (const selector of selectors) {
      const el = document.querySelector(selector);
      if (el?.textContent?.trim()) return el.textContent.trim();
    }
    return document.title.split('|')[0].trim() || 'Unknown Project';
  }

  // Extract project info
  function extractProjectInfo() {
    return PH.extractProjectInfoFromPage({
      source: 'PlanHub',
      getProjectName: getProjectName
    });
  }

  // Extract all documents
  async function extractDocuments() {
    console.log('🔍 Extracting documents from PlanHub...');
    extractedDocuments = [];

    await PH.waitForContent({
      selector: '.document, .file, table, .file-list'
    });

    // Strategy 1: Find document/file list items
    document.querySelectorAll(
      '.document-item, .file-item, .file-row, [class*="document"], [class*="file-list"] li, tr[class*="file"]'
    ).forEach(item => {
      const doc = extractDocFromElement(item);
      if (doc) extractedDocuments.push(doc);
    });

    // Strategy 2: Find all download links
    document.querySelectorAll(
      'a[href*="download"], a[href*=".pdf"], a[href*=".dwg"], a[href*=".zip"], a[download], button[data-download]'
    ).forEach(link => {
      const doc = {
        name: link.textContent?.trim() || PH.extractFilenameFromUrl(link.href),
        url: link.href || link.dataset?.download || '',
        type: PH.getFileType(link.href),
        source: 'PlanHub'
      };
      if (doc.url && !extractedDocuments.find(d => d.url === doc.url)) {
        extractedDocuments.push(doc);
      }
    });

    // Strategy 3: Look for Plans & Specs section
    const specsSection = document.querySelector('[class*="plans"], [class*="specs"], [class*="documents"]');
    if (specsSection) {
      specsSection.querySelectorAll('a[href]').forEach(link => {
        if (PH.isRelevantFile(link.href) || PH.isRelevantFile(link.textContent)) {
          const doc = {
            name: link.textContent?.trim() || PH.extractFilenameFromUrl(link.href),
            url: link.href,
            type: PH.getFileType(link.href),
            source: 'PlanHub'
          };
          if (!extractedDocuments.find(d => d.url === doc.url)) {
            extractedDocuments.push(doc);
          }
        }
      });
    }

    console.log('📄 Found ' + extractedDocuments.length + ' documents');
    return extractedDocuments;
  }

  // Extract doc from element
  function extractDocFromElement(element) {
    const link = element.querySelector('a[href]');
    const nameEl = element.querySelector('.name, .title, .file-name, span, a');
    const name = nameEl?.textContent?.trim() || '';
    const url = link?.href || '';

    if (PH.isRelevantFile(name) || PH.isRelevantFile(url)) {
      return {
        name: name || PH.extractFilenameFromUrl(url),
        url: url,
        type: PH.getFileType(name || url),
        source: 'PlanHub'
      };
    }
    return null;
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
      id: 'bid-extractor-ph-btn',
      prefix: 'ph',
      onScan: extractDocuments,
      onDownload: doDownloadAll,
      getDocumentCount: function() { return extractedDocuments.length; }
    });
  }

  // Initialize
  PH.initPlatform({
    urlPatterns: ['/project/', '/bid/'],
    injectButton: doInjectButton
  });

})();
