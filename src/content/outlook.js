// @ts-nocheck
// Outlook Content Script for Bid Extractor
// TODO: Enable type checking after incremental migration

// Config storage (loaded on init)
let SELECTORS = null;
let PLATFORMS = null;

// Load configs on script init
(async function initConfigs() {
  try {
    const [selectorsConfig, platformsConfig] = await Promise.all([
      fetch(chrome.runtime.getURL('src/config/selectors.json')).then(r => r.json()),
      fetch(chrome.runtime.getURL('src/config/platforms.json')).then(r => r.json())
    ]);
    SELECTORS = selectorsConfig.outlook;
    PLATFORMS = {
      ...platformsConfig.bidPlatforms,
      ...platformsConfig.fileSharingServices,
      ...platformsConfig.drawingServices,
      ...platformsConfig.cloudStorage
    };
    console.log('Bid Extractor: Outlook configs loaded');
  } catch (error) {
    console.warn('Bid Extractor: Failed to load configs, using defaults:', error);
  }
})();

// Listen for messages from popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'extract') {
    extractBidInfo()
      .then(data => sendResponse({ success: true, data }))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true;
  }
});

// Main extraction function for Outlook
async function extractBidInfo() {
  console.log('Bid Extractor: Starting Outlook extraction...');

  // Get selectors from config or use defaults
  const containerSelectors = SELECTORS?.container || [
    '[role="main"]', '.ReadingPaneContents', '[data-app-section="ReadingPane"]',
    '.customScrollBar', '[class*="ReadingPane"]', '[class*="readingPane"]',
    '#ReadingPaneContainerId', '[data-testid="reading-pane"]'
  ];
  const bodySelectors = SELECTORS?.body || [
    '[aria-label*="Message body"]', '[aria-label*="message body"]',
    '[id*="UniqueMessageBody"]', '.allowTextSelection', '[class*="messageBody"]',
    '[class*="MessageBody"]', '[data-testid="message-body"]',
    'div[dir="ltr"][class*="body"]', '.rps_8d7c', 'div[style*="font-family"]', '[role="document"]'
  ];
  const subjectSelectors = SELECTORS?.subject || [
    '[aria-label*="Subject"]', '.rps_8d7f', 'span[title][role="heading"]'
  ];
  const senderSelectors = SELECTORS?.sender || [
    '[aria-label*="From"]', '.rps_8d70', '[autoid*="PersonaCard"]'
  ];

  // Multiple strategies to find email container
  let emailContainer = null;
  let emailBody = null;

  // Use SafeQuery if available
  if (window.SafeQuery) {
    emailContainer = SafeQuery.query(containerSelectors, document, {
      name: 'outlook-container',
      silent: true
    });
  } else {
    for (const selector of containerSelectors) {
      emailContainer = document.querySelector(selector);
      if (emailContainer) {
        console.log('Found container with:', selector);
        break;
      }
    }
  }

  if (!emailContainer) {
    emailContainer = document.body;
    console.log('Using body as container');
  }

  // Find email body
  if (window.SafeQuery) {
    emailBody = SafeQuery.query(bodySelectors, emailContainer, {
      name: 'outlook-email-body',
      minTextLength: 20,
      silent: true
    });
  } else {
    for (const selector of bodySelectors) {
      emailBody = emailContainer.querySelector(selector);
      if (emailBody && emailBody.innerText?.trim().length > 20) {
        console.log('Found body with:', selector);
        break;
      }
    }
  }

  // Strategy 2: Find any div with substantial email content
  if (!emailBody) {
    const allDivs = emailContainer.querySelectorAll('div');
    for (const div of allDivs) {
      const text = div.innerText?.trim() || '';
      if (text.length > 100 && (text.includes('@') || text.includes('Dear') || text.includes('Hi ') || text.includes('Hello'))) {
        emailBody = div;
        console.log('Found body via content heuristics');
        break;
      }
    }
  }

  if (!emailBody) {
    // Report failure with SafeQuery if available
    if (window.SafeQuery) {
      SafeQuery.reportFailure('outlook-email-body-all-strategies', bodySelectors, emailContainer);
    }
    throw new Error('Could not find email content - try clicking on the email');
  }

  console.log('Email body found, length:', emailBody.innerText?.length);

  const emailText = emailBody.innerText || '';

  // Get subject using SafeQuery or fallback
  let subjectEl = window.SafeQuery
    ? SafeQuery.query(subjectSelectors, document, { name: 'outlook-subject', silent: true })
    : null;
  if (!subjectEl) {
    for (const sel of subjectSelectors) {
      subjectEl = document.querySelector(sel);
      if (subjectEl) break;
    }
  }
  const subject = subjectEl?.innerText || subjectEl?.getAttribute('title') || '';

  // Get sender using SafeQuery or fallback
  let senderEl = window.SafeQuery
    ? SafeQuery.query(senderSelectors, document, { name: 'outlook-sender', silent: true })
    : null;
  if (!senderEl) {
    for (const sel of senderSelectors) {
      senderEl = document.querySelector(sel);
      if (senderEl) break;
    }
  }
  const senderName = senderEl?.innerText?.split('\n')[0] || '';
  const senderEmail = extractEmailFromText(senderEl?.innerText || '') || '';

  // Extract bid information
  const bidInfo = {
    project: extractProjectName(subject, emailText),
    gc: extractGCName(senderName, emailText),
    bidDate: extractBidDate(emailText),
    location: extractLocation(emailText),
    scope: extractScope(emailText),
    contact: senderName,
    email: senderEmail,
    phone: extractPhone(emailText),
    attachments: await extractAttachments(),
    downloadLinks: extractDownloadLinks(emailBody),
    notes: '',
    rawSubject: subject,
    rawText: emailText.substring(0, 2000)
  };

  return bidInfo;
}

// Extract email from text
function extractEmailFromText(text) {
  const match = text.match(/([a-zA-Z0-9._-]+@[a-zA-Z0-9._-]+\.[a-zA-Z0-9_-]+)/);
  return match?.[1] || '';
}

// Extract project name
function extractProjectName(subject, body) {
  const patterns = [
    /(?:RFQ|RFP|ITB|Bid|Quote|Proposal)[:\s-]*(.+?)(?:\s*-|\s*\||$)/i,
    /Project[:\s]+(.+?)(?:\s*-|\s*\||$)/i,
    /(?:RE:|FW:)?\s*(.+?)(?:\s*-\s*(?:RFQ|Bid|Steel))/i,
  ];

  for (const pattern of patterns) {
    const match = subject.match(pattern);
    if (match?.[1]) {
      return cleanText(match[1]);
    }
  }

  const bodyPatterns = [
    /Project(?:\s+Name)?[:\s]+(.+?)(?:\n|$)/i,
    /Job(?:\s+Name)?[:\s]+(.+?)(?:\n|$)/i,
  ];

  for (const pattern of bodyPatterns) {
    const match = body.match(pattern);
    if (match?.[1]) {
      return cleanText(match[1]);
    }
  }

  return cleanText(subject.replace(/^(RE:|FW:|RFQ|RFP|ITB)[:\s]*/gi, ''));
}

// Extract GC name
function extractGCName(senderName, body) {
  const patterns = [
    /(?:General\s+Contractor|GC|Prime)[:\s]+(.+?)(?:\n|$)/i,
    /(?:From|Sent\s+by)[:\s]+(.+?)(?:\n|$)/i,
    /(.+?)\s+(?:Construction|Builders|Contracting|General)/i,
  ];

  for (const pattern of patterns) {
    const match = body.match(pattern);
    if (match?.[1]) {
      const gc = cleanText(match[1]);
      if (gc.length > 3 && gc.length < 100) {
        return gc;
      }
    }
  }

  if (senderName?.match(/(?:Construction|Builders|Contracting|Inc|LLC|Corp)/i)) {
    return cleanText(senderName);
  }

  return senderName || 'Unknown';
}

// Extract bid date
function extractBidDate(body) {
  const patterns = [
    /(?:Bid|Due|Deadline|Submit(?:tal)?)\s*(?:Date|By)?[:\s]+(\w+\s+\d{1,2},?\s+\d{4})/i,
    /(?:Bid|Due|Deadline|Submit(?:tal)?)\s*(?:Date|By)?[:\s]+(\d{1,2}\/\d{1,2}\/\d{2,4})/i,
    /(?:Bid|Due|Deadline)s?\s+(?:due\s+)?(\w+\s+\d{1,2}(?:,?\s+\d{4})?)/i,
    /by\s+\d{1,2}:\d{2}\s*(?:AM|PM)?\s+on\s+(\w+\s+\d{1,2},?\s+\d{4})/i,
    /(?:Bid|Due|Deadline)[:\s]+(\d{1,2}-\d{1,2}-\d{2,4})/i,
  ];

  for (const pattern of patterns) {
    const match = body.match(pattern);
    if (match?.[1]) {
      return formatDate(match[1]);
    }
  }

  return '';
}

// Extract location
function extractLocation(body) {
  const patterns = [
    /(?:Location|Site|Address|City)[:\s]+(.+?)(?:\n|$)/i,
    /in\s+([A-Z][a-z]+(?:,?\s+[A-Z]{2})?)\s+(?:area|region|metro)/i,
  ];

  for (const pattern of patterns) {
    const match = body.match(pattern);
    if (match?.[1]) {
      const location = cleanText(match[1]);
      if (location.length > 3 && location.length < 100) {
        return location;
      }
    }
  }

  const cityStateMatch = body.match(/([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?),\s*([A-Z]{2})\s+\d{5}/);
  if (cityStateMatch) {
    return `${cityStateMatch[1]}, ${cityStateMatch[2]}`;
  }

  return '';
}

// Extract scope
function extractScope(body) {
  const patterns = [
    /(?:Scope|Work|Package)[:\s]+(.+?)(?:\n\n|\n[A-Z]|$)/is,
    /(?:Steel|Structural)\s+(?:Package|Scope)[:\s]+(.+?)(?:\n|$)/i,
  ];

  for (const pattern of patterns) {
    const match = body.match(pattern);
    if (match?.[1]) {
      const scope = cleanText(match[1]);
      if (scope.length > 10 && scope.length < 500) {
        return scope.substring(0, 200);
      }
    }
  }

  const steelKeywords = ['structural steel', 'misc steel', 'miscellaneous metals'];
  for (const keyword of steelKeywords) {
    if (body.toLowerCase().includes(keyword)) {
      return 'Structural Steel / Misc Metals';
    }
  }

  return '';
}

// Extract phone
function extractPhone(body) {
  const match = body.match(/(?:Phone|Tel|Cell|Mobile)?[:\s]*(\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4})/i);
  return match?.[1] || '';
}

// Extract attachments from Outlook
async function extractAttachments() {
  const attachments = [];

  // Outlook attachment selectors
  const attachmentContainers = document.querySelectorAll(
    '[aria-label*="Attachment"], [data-testid*="attachment"], .rps_8d7a'
  );

  attachmentContainers.forEach(container => {
    const nameEl = container.querySelector('[title]') || container;
    const name = nameEl.getAttribute('title') || nameEl.innerText?.trim() || 'attachment';

    const downloadLink = container.querySelector('a[href]');
    const url = downloadLink?.href || '';

    const relevantExtensions = ['.pdf', '.dwg', '.dxf', '.xlsx', '.xls', '.doc', '.docx', '.zip'];
    const isRelevant = relevantExtensions.some(ext => name.toLowerCase().includes(ext));

    if (isRelevant || url) {
      attachments.push({
        name: name,
        url: url,
        type: getFileType(name)
      });
    }
  });

  return attachments;
}

// Extract download links from bid portals and file sharing services
function extractDownloadLinks(emailBody) {
  const links = [];
  const allLinks = emailBody.querySelectorAll('a[href]');

  // Use platforms from config or fallback to defaults
  const platforms = PLATFORMS || {
    'buildingconnected.com': { name: 'BuildingConnected', icon: '🏗️' },
    'planhub.com': { name: 'PlanHub', icon: '📐' },
    'isqft.com': { name: 'iSqFt', icon: '📊' },
    'procore.com': { name: 'Procore', icon: '🔷' },
    'smartbidnet.com': { name: 'SmartBid', icon: '💡' },
    'construction.com': { name: 'Dodge/Construction', icon: '🔶' },
    'constructconnect.com': { name: 'ConstructConnect', icon: '🔗' },
    'plangrid.com': { name: 'PlanGrid', icon: '📱' },
    'bluebeam.com': { name: 'Bluebeam', icon: '🔵' },
    'pipelinesuite.com': { name: 'Pipeline Suite', icon: '🔧' },
    'e-builder.net': { name: 'e-Builder', icon: '🏢' },
    'dropbox.com': { name: 'Dropbox', icon: '📦' },
    'box.com': { name: 'Box', icon: '📁' },
    'drive.google.com': { name: 'Google Drive', icon: '🔷' },
    'docs.google.com': { name: 'Google Docs', icon: '📄' },
    'onedrive.live.com': { name: 'OneDrive', icon: '☁️' },
    'sharepoint.com': { name: 'SharePoint', icon: '📂' },
    '1drv.ms': { name: 'OneDrive', icon: '☁️' },
    'sharefile.com': { name: 'ShareFile', icon: '📤' },
    'wetransfer.com': { name: 'WeTransfer', icon: '📨' },
    'we.tl': { name: 'WeTransfer', icon: '📨' },
    'hightail.com': { name: 'Hightail', icon: '✈️' },
    'egnyte.com': { name: 'Egnyte', icon: '📊' },
    'planswift.com': { name: 'PlanSwift', icon: '📏' },
    'onscreentakeoff.com': { name: 'On-Screen Takeoff', icon: '📐' },
    'bluebeamcloud.com': { name: 'Bluebeam Cloud', icon: '🔵' },
    'amazonaws.com': { name: 'AWS Download', icon: '☁️' },
    'blob.core.windows.net': { name: 'Azure Storage', icon: '☁️' },
  };

  const seenUrls = new Set();

  allLinks.forEach(link => {
    const href = link.href?.toLowerCase() || '';
    const text = link.innerText?.trim() || '';

    if (!href || href.startsWith('javascript:') || href.startsWith('mailto:')) return;

    // Check if link matches any platform
    for (const [domain, info] of Object.entries(platforms)) {
      if (href.includes(domain)) {
        if (seenUrls.has(href)) return;
        seenUrls.add(href);

        links.push({
          url: link.href,
          platform: info.name,
          icon: info.icon,
          text: text || info.name,
          type: 'platform'
        });
        return;
      }
    }

    // Check for direct file downloads
    const fileExtensions = ['.pdf', '.dwg', '.dxf', '.zip', '.rar', '.xlsx', '.xls', '.doc', '.docx'];
    for (const ext of fileExtensions) {
      if (href.includes(ext)) {
        if (seenUrls.has(href)) return;
        seenUrls.add(href);

        links.push({
          url: link.href,
          platform: 'Direct Download',
          icon: '📥',
          text: text || `Download ${ext.toUpperCase()}`,
          type: 'file',
          extension: ext
        });
        return;
      }
    }

    // Check for links with download-related text
    const downloadKeywords = ['download', 'view plans', 'view drawings', 'access documents',
                              'bid documents', 'project documents', 'click here to view',
                              'specifications', 'addendum', 'plans and specs'];
    const textLower = text.toLowerCase();

    for (const keyword of downloadKeywords) {
      if (textLower.includes(keyword)) {
        if (seenUrls.has(href)) return;
        seenUrls.add(href);

        links.push({
          url: link.href,
          platform: 'Document Link',
          icon: '📄',
          text: text,
          type: 'document'
        });
        return;
      }
    }
  });

  return links;
}

// Helpers
function cleanText(text) {
  return text.replace(/\s+/g, ' ').replace(/^\s+|\s+$/g, '').replace(/^[:\-\s]+|[:\-\s]+$/g, '');
}

function formatDate(dateStr) {
  try {
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) return dateStr;
    return date.toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' });
  } catch {
    return dateStr;
  }
}

function getFileType(filename) {
  const ext = filename.split('.').pop()?.toLowerCase();
  const types = { pdf: 'document', dwg: 'drawing', dxf: 'drawing', xlsx: 'spreadsheet', xls: 'spreadsheet', doc: 'document', docx: 'document', zip: 'archive' };
  return types[ext] || 'file';
}

// Inject button into Outlook toolbar
function injectExtractButton() {
  if (document.getElementById('bid-extractor-btn')) return;

  // Find Outlook reading pane toolbar
  const toolbar = document.querySelector('[role="toolbar"]') ||
                  document.querySelector('.rps_8d7h');
  if (!toolbar) return;

  const button = document.createElement('button');
  button.id = 'bid-extractor-btn';
  button.className = 'bid-extractor-inline-btn';
  button.innerHTML = `<span>📋 Extract Bid</span>`;
  button.title = 'Extract bid information';

  button.addEventListener('click', async () => {
    try {
      const data = await extractBidInfo();
      chrome.runtime.sendMessage({ action: 'bidExtracted', data });
      button.innerHTML = '✅ Extracted!';
      setTimeout(() => { button.innerHTML = '📋 Extract Bid'; }, 2000);
    } catch (error) {
      button.innerHTML = '❌ Error';
      setTimeout(() => { button.innerHTML = '📋 Extract Bid'; }, 2000);
    }
  });

  toolbar.appendChild(button);
}

// Watch for email opens
const observer = new MutationObserver(() => {
  const emailOpen = document.querySelector('[aria-label*="Message body"]') ||
                    document.querySelector('[id*="UniqueMessageBody"]');
  if (emailOpen) {
    injectExtractButton();
  }
});

observer.observe(document.body, { childList: true, subtree: true });

setTimeout(injectExtractButton, 2000);

console.log('Bid Extractor: Outlook content script loaded');
