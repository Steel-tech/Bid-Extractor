// @ts-nocheck
// Background Service Worker for Bid Extractor
// TODO: Enable type checking after incremental migration

// Selector error tracking
const selectorErrors = [];
const MAX_SELECTOR_ERRORS = 100;

// Listen for messages from content scripts and popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  console.log('Background received:', request.action);

  switch (request.action) {
    case 'bidExtracted':
      handleBidExtracted(request.data);
      break;

    case 'downloadFile':
      downloadFile(request.url, request.filename)
        .then(() => sendResponse({ success: true }))
        .catch(err => sendResponse({ success: false, error: err.message }));
      return true;

    case 'getRecentBids':
      getRecentBids().then(sendResponse);
      return true;

    case 'selectorError':
      handleSelectorError(request.error, sender);
      break;

    case 'getSelectorErrors':
      sendResponse({ errors: selectorErrors });
      return true;

    case 'clearSelectorErrors':
      selectorErrors.length = 0;
      sendResponse({ success: true });
      return true;

    case 'enrichFromPlatform':
      enrichFromPlatform(request.url)
        .then(result => sendResponse(result))
        .catch(err => sendResponse({ success: false, error: err.message }));
      return true;

    case 'loadConfig':
      loadConfigForContentScript(request.configName)
        .then(config => sendResponse({ success: true, config }))
        .catch(err => sendResponse({ success: false, error: err.message }));
      return true;

    // Blueprint-related actions
    case 'openBlueprintViewer':
      openBlueprintViewer(request.url, request.filename);
      sendResponse({ success: true });
      return true;

    case 'saveBlueprintAnnotations':
      saveBlueprintAnnotations(request.fileHash, request.annotations)
        .then(() => sendResponse({ success: true }))
        .catch(err => sendResponse({ success: false, error: err.message }));
      return true;

    case 'getBlueprintAnnotations':
      getBlueprintAnnotations(request.fileHash)
        .then(data => sendResponse({ success: true, data }))
        .catch(err => sendResponse({ success: false, error: err.message }));
      return true;

    default:
      break;
  }
});

// ===== BLUEPRINT FUNCTIONS =====

// Open blueprint viewer in a new tab
function openBlueprintViewer(url, filename) {
  const viewerUrl = chrome.runtime.getURL('src/blueprint/viewer.html');
  const params = new URLSearchParams({
    file: encodeURIComponent(url),
    name: encodeURIComponent(filename || 'blueprint.pdf')
  });

  chrome.tabs.create({
    url: `${viewerUrl}?${params.toString()}`
  });
}

// Save blueprint annotations to storage
async function saveBlueprintAnnotations(fileHash, annotations) {
  const key = `blueprint_annotations_${fileHash}`;
  await chrome.storage.local.set({ [key]: annotations });
}

// Get blueprint annotations from storage
async function getBlueprintAnnotations(fileHash) {
  const key = `blueprint_annotations_${fileHash}`;
  const data = await chrome.storage.local.get(key);
  return data[key] || [];
}

// Handle selector error for monitoring
function handleSelectorError(error, sender) {
  // Add tab info
  const enrichedError = {
    ...error,
    tabId: sender.tab?.id,
    tabUrl: sender.tab?.url,
    receivedAt: new Date().toISOString()
  };

  selectorErrors.push(enrichedError);

  // Keep limited history
  if (selectorErrors.length > MAX_SELECTOR_ERRORS) {
    selectorErrors.shift();
  }

  // Log for debugging
  console.warn('Selector failure:', enrichedError.name, enrichedError.selectors);

  // Optionally save to storage for persistence across restarts
  saveSelectorErrors();
}

// Save selector errors to storage (async, fire-and-forget)
async function saveSelectorErrors() {
  try {
    await chrome.storage.local.set({
      selectorErrors: selectorErrors.slice(-50) // Keep last 50 in storage
    });
  } catch (e) {
    // Ignore storage errors
  }
}

// Load selector errors on startup
async function loadSelectorErrors() {
  try {
    const data = await chrome.storage.local.get('selectorErrors');
    if (data.selectorErrors) {
      selectorErrors.push(...data.selectorErrors);
    }
  } catch (e) {
    // Ignore storage errors
  }
}

// Load errors on startup
loadSelectorErrors();

// Handle newly extracted bid
async function handleBidExtracted(bidData) {
  console.log('Handling extracted bid:', bidData.project);

  // Get settings
  const settings = await chrome.storage.local.get(['autoDownload', 'folderPattern', 'createSummary']);

  // Save to recent extractions
  await saveExtraction(bidData);

  // Auto-download if enabled
  if (settings.autoDownload && bidData.attachments?.length) {
    // Default: GC Name + Bid Date + Project (Company first, then date)
    const folderName = createFolderName(settings.folderPattern || 'Bids/{gc}_{date}_{project}', bidData);

    for (const attachment of bidData.attachments) {
      if (attachment.url) {
        await downloadFile(attachment.url, `${folderName}/${attachment.name}`);
      }
    }
  }
}

// Save extraction to storage
async function saveExtraction(bidData) {
  const { recentExtractions = [] } = await chrome.storage.local.get('recentExtractions');

  recentExtractions.unshift({
    ...bidData,
    extractedAt: new Date().toISOString()
  });

  // Keep only last 50
  if (recentExtractions.length > 50) {
    recentExtractions.splice(50);
  }

  await chrome.storage.local.set({ recentExtractions });
}

// Get recent bids
async function getRecentBids() {
  const { recentExtractions = [] } = await chrome.storage.local.get('recentExtractions');
  return recentExtractions;
}

// Download file
function downloadFile(url, filename) {
  return new Promise((resolve, reject) => {
    chrome.downloads.download({
      url: url,
      filename: filename,
      saveAs: false,
      conflictAction: 'uniquify'
    }, (downloadId) => {
      if (chrome.runtime.lastError) {
        console.error('Download error:', chrome.runtime.lastError);
        reject(chrome.runtime.lastError);
      } else {
        resolve(downloadId);
      }
    });
  });
}

// Create folder name from pattern
function createFolderName(pattern, data) {
  const date = data.bidDate ? data.bidDate.replace(/\//g, '-') : 'unknown-date';
  const project = sanitizeFileName(data.project || 'Unknown_Project');
  const gc = sanitizeFileName(data.gc || 'Unknown_GC');
  const location = sanitizeFileName(data.location || 'Unknown');

  return pattern
    .replace('{project}', project)
    .replace('{date}', date)
    .replace('{gc}', gc)
    .replace('{location}', location);
}

// Sanitize filename
function sanitizeFileName(name) {
  return name
    .replace(/[<>:"/\\|?*]/g, '')
    .replace(/\s+/g, '_')
    .substring(0, 50);
}

// Create summary text
function createSummaryText(data) {
  return `BID INFORMATION
================
Extracted: ${new Date().toLocaleString()}

Project: ${data.project || 'N/A'}
General Contractor: ${data.gc || 'N/A'}
Bid Date: ${data.bidDate || 'N/A'}
Location: ${data.location || 'N/A'}
Scope: ${data.scope || 'N/A'}

Contact: ${data.contact || 'N/A'}
Email: ${data.email || 'N/A'}
Phone: ${data.phone || 'N/A'}

Attachments:
${data.attachments?.map(a => `- ${a.name}`).join('\n') || 'None'}

Original Subject: ${data.rawSubject || 'N/A'}
`;
}

// Enrich extraction by opening a platform page in a background tab
async function enrichFromPlatform(url) {
  const TIMEOUT_MS = 15000;
  const CONTENT_SCRIPT_DELAY_MS = 2000;

  return new Promise((resolve, reject) => {
    let tabId = null;
    let settled = false;

    const cleanup = () => {
      if (tabId !== null) {
        chrome.tabs.remove(tabId).catch(() => {});
      }
    };

    const settle = (value) => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(value);
    };

    const timeout = setTimeout(() => {
      if (!settled) {
        settled = true;
        cleanup();
        resolve({ success: false, error: 'Platform page load timed out' });
      }
    }, TIMEOUT_MS);

    chrome.tabs.create({ url, active: false }, (tab) => {
      if (chrome.runtime.lastError) {
        clearTimeout(timeout);
        return resolve({ success: false, error: chrome.runtime.lastError.message });
      }

      tabId = tab.id;

      const onUpdated = (updatedTabId, changeInfo) => {
        if (updatedTabId !== tabId || changeInfo.status !== 'complete') return;
        chrome.tabs.onUpdated.removeListener(onUpdated);

        // Wait for content script to initialize and dynamic content to load
        setTimeout(() => {
          chrome.tabs.sendMessage(tabId, { action: 'extractDocuments' }, (response) => {
            clearTimeout(timeout);
            if (chrome.runtime.lastError) {
              settle({ success: false, error: chrome.runtime.lastError.message });
              return;
            }
            if (response?.success) {
              settle({
                success: true,
                projectInfo: response.projectInfo || {},
                documents: response.documents || []
              });
            } else {
              settle({ success: false, error: response?.error || 'No data extracted' });
            }
          });
        }, CONTENT_SCRIPT_DELAY_MS);
      };

      chrome.tabs.onUpdated.addListener(onUpdated);
    });
  });
}

// Install handler
chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === 'install') {
    chrome.storage.local.set({
      // Default: GC Name + Bid Date + Project (Company first, then date)
      folderPattern: 'Bids/{gc}_{date}_{project}',
      autoDownload: true,
      createSummary: true,
      recentExtractions: []
    });
    console.log('Bid Extractor installed');
  }
});

console.log('Bid Extractor background service worker started');

// ===== CONFIG LOADING FOR CONTENT SCRIPTS =====
// Content scripts may not be able to fetch() chrome-extension:// URLs due to host page CSP.
// Background service worker can always fetch its own resources.

const bgConfigCache = new Map();

async function loadConfigForContentScript(configName) {
  if (bgConfigCache.has(configName)) {
    return bgConfigCache.get(configName);
  }

  const url = chrome.runtime.getURL(`src/config/${configName}.json`);
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`Failed to load config: ${configName} (${response.status})`);
  }

  const config = await response.json();
  bgConfigCache.set(configName, config);
  return config;
}

// ===== PLATFORM SUPPORT =====
// Platforms will send 'downloadFile' messages which are handled above
