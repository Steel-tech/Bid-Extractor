// @ts-nocheck
// Procore Content Script - Document Extractor
// Uses PlatformHelpers (loaded before this script via manifest)

(function() {
  'use strict';

  console.log('🏗️ Bid Extractor: Procore script loaded');

  const PH = window.PlatformHelpers;

  // State
  let extractedDocuments = [];

  // Set up standard message listener
  PH.createMessageListener({
    platformName: 'Procore',
    extractDocuments: extractDocuments,
    extractProjectInfo: extractProjectInfo,
    downloadAllDocuments: doDownloadAll,
    getProjectName: getProjectName,
    getDocumentCount: function() { return extractedDocuments.length; }
  });

  // Get project name
  function getProjectName() {
    const selectors = [
      '[data-qa="project-name"]', '.project-name', 'h1.project-title',
      'h1', '[class*="ProjectName"]', '.header-title'
    ];
    for (const sel of selectors) {
      const el = document.querySelector(sel);
      if (el?.textContent?.trim()) return el.textContent.trim();
    }
    return document.title.split('-')[0].trim() || 'Unknown Project';
  }

  // Extract project info
  function extractProjectInfo() {
    return PH.extractProjectInfoFromPage({
      source: 'Procore',
      getProjectName: getProjectName,
      domSelectors: {
        notes: '[class*="description"], [class*="note"], [class*="message"], [data-qa*="description"]'
      }
    });
  }

  // Extract documents
  async function extractDocuments() {
    console.log('🔍 Extracting documents from Procore...');
    extractedDocuments = [];

    await PH.waitForContent({
      selector: '.document, .file, table, [class*="Document"]'
    });

    // Strategy 1: Documents table/list
    document.querySelectorAll(
      '[data-qa*="document"], [data-testid*="document"], .document-row, .file-row, ' +
      'tr[class*="document"], [class*="DocumentItem"], [class*="FileItem"]'
    ).forEach(row => {
      const link = row.querySelector('a[href]');
      const nameEl = row.querySelector('.name, .title, [class*="name"], a');
      const name = nameEl?.textContent?.trim() || '';
      const url = link?.href || '';

      if (PH.isRelevantFile(name) || PH.isRelevantFile(url)) {
        extractedDocuments.push({
          name: name || PH.extractFilenameFromUrl(url),
          url: url,
          type: PH.getFileType(name || url),
          source: 'Procore'
        });
      }
    });

    // Strategy 2: Download links
    document.querySelectorAll(
      'a[href*="download"], a[href*="/documents/"], a[href*="/files/"], ' +
      'a[href*=".pdf"], a[href*=".dwg"], a[download]'
    ).forEach(link => {
      const url = link.href;
      const name = link.textContent?.trim() || link.getAttribute('download') || PH.extractFilenameFromUrl(url);

      if ((PH.isRelevantFile(name) || PH.isRelevantFile(url)) && !extractedDocuments.find(d => d.url === url)) {
        extractedDocuments.push({
          name: name,
          url: url,
          type: PH.getFileType(name),
          source: 'Procore'
        });
      }
    });

    // Strategy 3: Drawings section
    const drawingsSection = document.querySelector('[class*="drawings"], [class*="Drawings"], [data-qa*="drawing"]');
    if (drawingsSection) {
      drawingsSection.querySelectorAll('a[href]').forEach(link => {
        if (PH.isRelevantFile(link.href) && !extractedDocuments.find(d => d.url === link.href)) {
          extractedDocuments.push({
            name: link.textContent?.trim() || PH.extractFilenameFromUrl(link.href),
            url: link.href,
            type: PH.getFileType(link.href),
            source: 'Procore'
          });
        }
      });
    }

    // Strategy 4: Specifications section
    const specsSection = document.querySelector('[class*="specifications"], [class*="Specs"]');
    if (specsSection) {
      specsSection.querySelectorAll('a[href]').forEach(link => {
        if (PH.isRelevantFile(link.href) && !extractedDocuments.find(d => d.url === link.href)) {
          extractedDocuments.push({
            name: link.textContent?.trim() || PH.extractFilenameFromUrl(link.href),
            url: link.href,
            type: PH.getFileType(link.href),
            source: 'Procore'
          });
        }
      });
    }

    console.log('📄 Found ' + extractedDocuments.length + ' documents');
    return extractedDocuments;
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
      id: 'bid-extractor-pc-btn',
      prefix: 'pc',
      onScan: extractDocuments,
      onDownload: doDownloadAll,
      getDocumentCount: function() { return extractedDocuments.length; }
    });
  }

  // Initialize
  PH.initPlatform({
    urlPatterns: ['/project/', '/documents', '/drawings', '/bidding'],
    injectButton: doInjectButton
  });

})();
