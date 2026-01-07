// Background Service Worker for Bid Extractor

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

    default:
      break;
  }
});

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

// ===== PLATFORM SUPPORT =====
// Platforms will send 'downloadFile' messages which are handled above
