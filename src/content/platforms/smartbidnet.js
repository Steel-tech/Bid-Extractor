// @ts-nocheck
// SmartBidNet Content Script - Document Extractor
// Uses PlatformHelpers (loaded before this script via manifest)
// SmartBidNet uses ASP.NET WebForms with DataTables.js for grid rendering

(function() {
  'use strict';

  console.log('Bid Extractor: SmartBidNet script loaded');

  if (!window.PlatformHelpers) {
    console.error('Bid Extractor: PlatformHelpers module not loaded — SmartBidNet script cannot initialize');
    return;
  }
  const PH = window.PlatformHelpers;

  // State
  let extractedDocuments = [];
  let isExtracting = false;

  // Set up standard message listener
  PH.createMessageListener({
    platformName: 'SmartBid',
    extractDocuments: extractDocuments,
    extractProjectInfo: extractProjectInfo,
    downloadAllDocuments: doDownloadAll,
    getProjectName: getProjectName,
    getDocumentCount: function() { return extractedDocuments.length; }
  });

  // Extract project name from SmartBidNet page
  function getProjectName() {
    const selectors = [
      '[id*="ContentPlaceHolder"] h1', '[id*="ContentPlaceHolder"] h2',
      '[id*="lblProjectName"]', '[id*="txtProjectName"]', '[id*="ProjectName"]',
      '#divBodyContent h1', '#divBodyContent h2', '.project-header h1',
      'span[id*="lblName"]', 'span[id*="ProjectTitle"]'
    ];
    for (const selector of selectors) {
      const el = document.querySelector(selector);
      if (el?.textContent?.trim()) return el.textContent.trim();
    }
    const title = document.title;
    if (title && !title.toLowerCase().includes('smartbid')) {
      return title.split('|')[0].split('-')[0].trim();
    }
    return 'Unknown Project';
  }

  // Extract project info - SmartBidNet specific with ASP.NET controls
  function extractProjectInfo() {
    const info = PH.extractProjectInfoFromPage({
      source: 'SmartBid',
      getProjectName: getProjectName,
      domSelectors: {
        gc: '[id*="lblCompany"], [id*="lblGC"], [id*="lblOwner"], [id*="lblContractor"]',
        bidDate: '[id*="lblBidDate"], [id*="lblDueDate"], [id*="lblDeadline"]',
        bidTime: '[id*="lblBidTime"], [id*="lblDueTime"]',
        location: '[id*="lblLocation"], [id*="lblAddress"], [id*="lblCity"], [id*="lblProjectLocation"]',
        scope: '[id*="lblScope"], [id*="lblTrade"], [id*="lblDivision"], [id*="lblBidPackage"]',
        notes: '[id*="lblNotes"], [id*="lblDescription"], [id*="lblMessage"], [id*="txtNotes"], [id*="divNotes"], [id*="divDescription"]'
      }
    });
    return info;
  }

  // Extract all documents
  async function extractDocuments() {
    console.log('Extracting documents from SmartBidNet...');

    if (isExtracting) return extractedDocuments;

    isExtracting = true;
    extractedDocuments = [];

    try {
      // Wait for ASP.NET content and DataTables to initialize
      await PH.waitForContent({
        timeout: 5000,
        selector: '#divBodyContent, [id*="ContentPlaceHolder"], table.dataTable, .GridButtons_Row, .InternalTabSkin'
      });

      // Strategy 1: Scan DataTables rows for file links
      extractFromDataTableRows();

      // Strategy 2: Scan all anchors in ContentPlaceHolder
      extractFromContentPlaceHolder();

      // Strategy 3: Find download buttons/links
      extractDownloadButtons();

      // Strategy 4: Click Documents/Files tab if not active
      await extractFromDocumentsTab();

      console.log('Found ' + extractedDocuments.length + ' documents');
    } finally {
      isExtracting = false;
    }

    return extractedDocuments;
  }

  // Strategy 1: Extract from DataTables grid rows
  function extractFromDataTableRows() {
    const rows = document.querySelectorAll('table.dataTable tr.odd, table.dataTable tr.even');
    rows.forEach(row => {
      const doc = extractDocumentFromRow(row);
      if (doc) PH.addUniqueDocument(extractedDocuments, doc);
    });

    document.querySelectorAll('.GridButtons_Row').forEach(row => {
      const closestRow = row.closest('tr');
      if (closestRow) {
        const doc = extractDocumentFromRow(closestRow);
        if (doc) PH.addUniqueDocument(extractedDocuments, doc);
      }
    });
  }

  // Strategy 2: Extract from ContentPlaceHolder anchors
  function extractFromContentPlaceHolder() {
    const container = document.querySelector('[id*="ContentPlaceHolder"]')
                   || document.getElementById('divBodyContent');
    if (!container) return;

    container.querySelectorAll('a[href]').forEach(anchor => {
      const href = anchor.href || '';
      const text = anchor.textContent?.trim() || '';

      if (PH.isRelevantFile(text) || isSmartBidRelevantUrl(href)) {
        PH.addUniqueDocument(extractedDocuments, {
          name: text || PH.extractFilenameFromUrl(href),
          url: href,
          type: PH.getFileType(text || href),
          source: 'SmartBid'
        });
      }
    });
  }

  // Strategy 3: Find download buttons and links
  function extractDownloadButtons() {
    document.querySelectorAll(
      'a[href*="Download"], a[href*="download"], a[href*="GetFile"], ' +
      'a[href*="ViewFile"], a[href*="Attachment"], input[id*="btnDownload"], ' +
      'input[id*="btnExport"], a[onclick*="Download"], a[onclick*="download"]'
    ).forEach(el => {
      const url = extractUrlFromElement(el);
      const name = extractNameFromElement(el);

      if (url) {
        PH.addUniqueDocument(extractedDocuments, {
          name: name || PH.extractFilenameFromUrl(url),
          url: url,
          type: PH.getFileType(name || url),
          source: 'SmartBid'
        });
      }
    });
  }

  // Strategy 4: Click Documents/Files tab and re-scan
  async function extractFromDocumentsTab() {
    const tabs = document.querySelectorAll('.InternalTabSkin, .InternalTabActiveSkin, [class*="Tab"]');

    for (const tab of tabs) {
      const tabText = tab.textContent?.toLowerCase() || '';

      if (tabText.includes('document') || tabText.includes('file') || tabText.includes('addend')) {
        if (tab.classList.contains('InternalTabActiveSkin') || tab.classList.contains('active')) {
          continue;
        }

        tab.click();
        await PH.sleep(1500);

        extractFromDataTableRows();
        extractFromContentPlaceHolder();
        extractDownloadButtons();
        break;
      }
    }
  }

  // Extract document info from a DataTable row
  function extractDocumentFromRow(row) {
    const linkEl = row.querySelector(
      'a[href*="Download"], a[href*="download"], a[href*="GetFile"], ' +
      'a[href*="ViewFile"], a[href*="Attachment"], a[href]'
    );
    const nameEl = row.querySelector('td a, td span[id*="lbl"], td:first-child');

    const name = nameEl?.textContent?.trim() || '';
    const url = linkEl?.href || '';

    if (!name && !url) return null;

    if (PH.isRelevantFile(name) || isSmartBidRelevantUrl(url)) {
      return {
        name: name || PH.extractFilenameFromUrl(url),
        url: url,
        type: PH.getFileType(name || url),
        size: extractFileSize(row),
        source: 'SmartBid'
      };
    }
    return null;
  }

  // SmartBidNet-specific URL relevance check (includes ASP.NET endpoints)
  function isSmartBidRelevantUrl(url) {
    if (!url) return false;
    if (PH.isRelevantUrl(url)) return true;
    const lower = url.toLowerCase();
    return lower.includes('getfile') || lower.includes('viewfile') || lower.includes('attachment');
  }

  // Extract URL from various element types
  function extractUrlFromElement(el) {
    if (el.href) return el.href;
    const onclick = el.getAttribute('onclick') || '';
    const urlMatch = onclick.match(/['"]((https?:\/\/|\/)[^'"]+)['"]/);
    if (urlMatch) return urlMatch[1];
    const dataUrl = el.dataset?.url || el.dataset?.href || '';
    if (dataUrl) return dataUrl;
    const parentLink = el.closest('a[href]');
    if (parentLink) return parentLink.href;
    return '';
  }

  // Extract display name from various element types
  function extractNameFromElement(el) {
    const text = el.textContent?.trim() || '';
    if (text && text.length > 2 && text.length < 200) return text;
    const value = el.getAttribute('value') || '';
    if (value) return value;
    return el.getAttribute('title') || el.getAttribute('alt') || '';
  }

  // Extract file size from row
  function extractFileSize(element) {
    const text = element.textContent || '';
    const sizeMatch = text.match(/(\d+(?:\.\d+)?)\s*(KB|MB|GB)/i);
    return sizeMatch ? sizeMatch[1] + ' ' + sizeMatch[2] : '';
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
      id: 'bid-extractor-sbn-btn',
      prefix: 'sbn',
      gradientStart: '#1e40af',
      gradientEnd: '#1e3a5f',
      onScan: extractDocuments,
      onDownload: doDownloadAll,
      getDocumentCount: function() { return extractedDocuments.length; }
    });
  }

  // Initialize
  const init = PH.initPlatform({
    urlPatterns: ['/main/', '/project', '/bid', '/document', '/addend', '/planroom'],
    injectButton: doInjectButton
  });

  // Watch for ASP.NET UpdatePanel changes
  const bodyContent = document.getElementById('divBodyContent');
  if (bodyContent) {
    new MutationObserver(() => {
      if (!document.getElementById('bid-extractor-sbn-btn')) {
        init();
      }
    }).observe(bodyContent, { subtree: true, childList: true });
  }

  // smartbid.co uses hash-based SPA routing
  PH.watchNavigation(init, { delay: 1500, hashChange: true });

})();
