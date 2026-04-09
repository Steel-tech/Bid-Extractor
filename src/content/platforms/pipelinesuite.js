// @ts-nocheck
// PipelineSuite Content Script - Document Extractor
// Uses PlatformHelpers (loaded before this script via manifest)
// Server-rendered HTML platform with stable DOM IDs

(function() {
  'use strict';

  console.log('Bid Extractor: PipelineSuite script loaded');

  if (!window.PlatformHelpers) {
    console.error('Bid Extractor: PlatformHelpers module not loaded — PipelineSuite script cannot initialize');
    return;
  }
  const PH = window.PlatformHelpers;

  // State
  let extractedDocuments = [];
  let isExtracting = false;

  // PipelineSuite-specific file extensions (wider set than default)
  const PS_EXTENSIONS = [
    '.pdf', '.dwg', '.dxf', '.xlsx', '.xls', '.csv',
    '.doc', '.docx', '.zip', '.rar', '.7z',
    '.tif', '.tiff', '.png', '.jpg', '.jpeg'
  ];

  // Set up standard message listener
  PH.createMessageListener({
    platformName: 'PipelineSuite',
    extractDocuments: extractDocuments,
    extractProjectInfo: extractProjectInfo,
    downloadAllDocuments: doDownloadAll,
    getProjectName: getProjectName,
    getDocumentCount: function() { return extractedDocuments.length; }
  });

  // Extract project ID from URL
  function getProjectId() {
    const match = window.location.pathname.match(/projectID\/(\d+)/i);
    return match ? match[1] : null;
  }

  // Extract project name from page
  function getProjectName() {
    // Strategy 1: Check #projectInfo table
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
    for (const tag of ['h1', 'h2']) {
      const el = document.querySelector(tag);
      if (el && el.textContent.trim()) return el.textContent.trim();
    }

    // Strategy 3: Page title
    const title = document.title;
    if (title && !title.toLowerCase().includes('pipelinesuite')) {
      return title.split('|')[0].split('-')[0].trim();
    }

    return 'Unknown Project';
  }

  // Extract project info - PipelineSuite specific with table-based layout
  function extractProjectInfo() {
    const info = {
      projectName: getProjectName(),
      gc: '', bidDate: '', bidTime: '', location: '', scope: '', notes: '',
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

    // Notes
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

  // Build native "Download All Files" ZIP URL
  function getDownloadAllZipUrl() {
    const projectId = getProjectId();
    if (!projectId) return null;
    return window.location.origin + '/ehPipelineSubs/dspProject/projectID/' + projectId + '/allFiles/1';
  }

  // Check if filename is relevant (PipelineSuite has wider set of extensions)
  function isPSRelevantFile(filename) {
    return PH.isRelevantFile(filename, PS_EXTENSIONS);
  }

  // Check if URL is relevant (PipelineSuite-specific paths)
  function isPSRelevantUrl(url) {
    if (!url) return false;
    if (PH.isRelevantUrl(url)) return true;
    const lower = url.toLowerCase();
    return lower.includes('.csv') || lower.includes('.tif') || lower.includes('allFiles');
  }

  // Extract all documents
  async function extractDocuments() {
    console.log('Extracting documents from PipelineSuite...');
    extractedDocuments = [];
    isExtracting = true;

    try {
      // Strategy 1: Scan #viewRespond for file links
      extractFromContainer('#viewRespond');

      // Strategy 2: Scan #addenda
      extractFromContainer('#addenda');

      // Strategy 3: Fallback - scan entire page
      if (extractedDocuments.length === 0) {
        extractFromContainer('body');
      }

      // Strategy 4: Add native "Download All Files (ZIP)" entry
      const zipUrl = getDownloadAllZipUrl();
      if (zipUrl && !extractedDocuments.find(d => d.url === zipUrl)) {
        extractedDocuments.push({
          name: 'Download All Files (ZIP)',
          url: zipUrl,
          type: 'Archive',
          size: '',
          source: 'PipelineSuite',
          isZipBundle: true
        });
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

    container.querySelectorAll('a[href]').forEach(link => {
      const href = link.href || '';
      const text = link.textContent.trim();
      const name = extractFilename(text, href);

      if (!isPSRelevantFile(name) && !isPSRelevantUrl(href)) return;

      const size = extractFileSize(link);

      const doc = {
        name: name || 'document',
        url: href,
        type: PH.getFileType(name || href),
        size: size,
        source: 'PipelineSuite'
      };

      if (!extractedDocuments.find(d => d.url === doc.url)) {
        extractedDocuments.push(doc);
      }
    });
  }

  // Extract a clean filename from link text or URL
  function extractFilename(linkText, url) {
    if (linkText && linkText.match(/\.\w{2,5}$/)) {
      return linkText;
    }
    if (linkText && linkText.length > 2 && linkText.length < 200) {
      const cleaned = linkText.replace(/\s+/g, ' ').trim();
      if (cleaned.toLowerCase() !== 'download' &&
          cleaned.toLowerCase() !== 'click here' &&
          cleaned.toLowerCase() !== 'link') {
        return cleaned;
      }
    }
    return PH.extractFilenameFromUrl(url) || linkText || 'document';
  }

  // Extract file size from surrounding DOM text
  function extractFileSize(linkElement) {
    const container = linkElement.closest('tr, li, div, td');
    if (!container) return '';
    const text = container.textContent || '';
    const sizeMatch = text.match(/(\d+(?:\.\d+)?)\s*(kb|mb|gb)/i);
    return sizeMatch ? sizeMatch[1] + ' ' + sizeMatch[2].toUpperCase() : '';
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
      id: 'bid-extractor-ps-btn',
      prefix: 'ps',
      gradientStart: '#1e40af',
      gradientEnd: '#1e3a5f',
      onScan: extractDocuments,
      onDownload: doDownloadAll,
      getDocumentCount: function() { return extractedDocuments.length; }
    });
  }

  // Initialize - server-rendered, no SPA delay needed
  PH.initPlatform({
    urlPatterns: ['projectid', 'planroom', 'project', 'openproject', 'dspproject'],
    injectButton: doInjectButton,
    delay: 0
  });

})();
