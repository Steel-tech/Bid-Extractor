// @ts-nocheck
// Gmail Content Script for Bid Extractor
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
    SELECTORS = selectorsConfig.gmail;
    PLATFORMS = {
      ...platformsConfig.bidPlatforms,
      ...platformsConfig.fileSharingServices,
      ...platformsConfig.drawingServices,
      ...platformsConfig.cloudStorage
    };
    console.log('Bid Extractor: Gmail configs loaded');
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
    return true; // Keep channel open for async response
  }
});

// Main extraction function
async function extractBidInfo() {
  console.log('Bid Extractor: Starting extraction...');

  // Get selectors from config or use defaults
  const containerSelector = SELECTORS?.container?.primary || '[role="main"]';
  const bodySelectors = SELECTORS?.body || [
    '.a3s.aiL', '.a3s', '.ii.gt', '[data-message-id]',
    '.gmail_quote', 'div[dir="ltr"]', '.Am.aiL', '.Am'
  ];
  const fallbackSelectors = SELECTORS?.bodyFallback || [
    '.a3s.aiL', '.a3s', '.gs .ii.gt', '[role="listitem"] .a3s', '.nH .a3s'
  ];

  // Multiple strategies to find email content
  let emailBody = null;
  let emailContainer = null;

  // Strategy 1: Find container and body using SafeQuery
  emailContainer = document.querySelector(containerSelector);

  if (emailContainer && window.SafeQuery) {
    emailBody = SafeQuery.query(bodySelectors, emailContainer, {
      name: 'gmail-email-body',
      minTextLength: 10,
      silent: true // We have fallbacks
    });
  } else if (emailContainer) {
    // Fallback if SafeQuery not loaded
    for (const selector of bodySelectors) {
      emailBody = emailContainer.querySelector(selector);
      if (emailBody && emailBody.innerText?.trim().length > 10) {
        console.log('Found email body with selector:', selector);
        break;
      }
    }
  }

  // Strategy 2: Look for email content anywhere in the page
  if (!emailBody) {
    if (window.SafeQuery) {
      emailBody = SafeQuery.query(fallbackSelectors, document, {
        name: 'gmail-email-body-fallback',
        minTextLength: 10,
        silent: true
      });
    } else {
      for (const selector of fallbackSelectors) {
        emailBody = document.querySelector(selector);
        if (emailBody && emailBody.innerText?.trim().length > 10) {
          console.log('Found email body with fallback selector:', selector);
          break;
        }
      }
    }
  }

  // Strategy 3: Look for any substantial text content in the main area
  if (!emailBody && emailContainer) {
    const allDivs = emailContainer.querySelectorAll('div');
    for (const div of allDivs) {
      const text = div.innerText?.trim() || '';
      if (text.length > 100 && !div.querySelector('div[innerText]')) {
        emailBody = div;
        console.log('Found email body via text content search');
        break;
      }
    }
  }

  if (!emailBody) {
    // Report failure with SafeQuery if available
    if (window.SafeQuery) {
      SafeQuery.reportFailure('gmail-email-body-all-strategies', [...bodySelectors, ...fallbackSelectors], document);
    }
    throw new Error('Could not find email content - try refreshing the page');
  }

  console.log('Email body found, extracting text...');

  const emailText = emailBody.innerText || '';
  const emailHtml = emailBody.innerHTML || '';

  // Read ALL messages in the thread (Gmail puts each in a separate .a3s container)
  const allMessageBodies = document.querySelectorAll('.a3s.aiL, .a3s');
  const threadTexts = [];
  allMessageBodies.forEach(msgBody => {
    const msgText = msgBody.innerText?.trim();
    if (msgText && msgText.length > 10) {
      threadTexts.push(msgText);
    }
  });

  // Get email subject using config selectors
  const subjectSelectors = SELECTORS?.subject || ['h2[data-thread-perm-id]', '[data-thread-perm-id] span', '.hP'];
  let subjectEl = null;
  for (const sel of subjectSelectors) {
    subjectEl = document.querySelector(sel);
    if (subjectEl) break;
  }
  const subject = subjectEl?.innerText || '';

  // Get sender info using config selectors
  const senderSelectors = SELECTORS?.sender || ['.gD', '[email]'];
  let senderEl = null;
  for (const sel of senderSelectors) {
    senderEl = document.querySelector(sel);
    if (senderEl) break;
  }
  const senderEmail = senderEl?.getAttribute('email') || '';
  const senderName = senderEl?.getAttribute('name') || senderEl?.innerText || '';

  // Use EmailParser for deep extraction (loaded before gmail.js via manifest)
  const parsed = (typeof EmailParser !== 'undefined')
    ? EmailParser.parseFullEmail(emailText)
    : { signature: {}, sections: {}, thread: [], metadata: {} };

  const bidInfo = {
    // Core fields — parser results with regex fallbacks
    project: parsed.sections.project || extractProjectName(subject, emailText),
    gc: parsed.signature.company || extractGCName(senderName, emailText),
    bidDate: extractBidDate(emailText),
    location: parsed.sections.location || extractLocation(emailText),
    scope: parsed.sections.scope || extractScope(emailText),
    contact: senderName,
    email: senderEmail,
    phone: parsed.signature.phone || extractPhone(emailText),

    // New fields from parser
    projectManager: parsed.metadata.projectManager || parsed.signature.name || '',
    gcCompany: parsed.signature.company || extractGCName(senderName, emailText),
    gcEmail: parsed.signature.email || senderEmail,
    gcPhone: parsed.signature.phone || extractPhone(emailText),
    bidTime: parsed.metadata.bidTime || '',
    submissionInstructions: parsed.sections.submissionInstructions || '',
    preBidMeeting: parsed.metadata.preBidMeeting || { date: '', location: '', mandatory: false },
    addenda: parsed.metadata.addenda || [],
    bondRequirements: parsed.sections.bondRequirements || parsed.metadata.bondRequirements || '',
    generalNotes: parsed.sections.generalNotes || emailText,
    threadMessages: parsed.thread.length > 1
      ? parsed.thread
      : (threadTexts.length > 1
        ? threadTexts.map(t => ({ sender: '', date: '', body: t }))
        : []),

    // Existing fields
    attachments: await extractAttachments(),
    downloadLinks: extractDownloadLinks(emailBody),
    notes: '',
    rawSubject: subject,
    rawText: emailText,
  };

  return bidInfo;
}

// Extract project name from subject/body
function extractProjectName(subject, body) {
  // Common patterns in RFQ subjects
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

  // Try body
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

  // Fallback: use subject without common prefixes
  return cleanText(subject.replace(/^(RE:|FW:|RFQ|RFP|ITB)[:\s]*/gi, ''));
}

// Extract General Contractor name
function extractGCName(senderName, body) {
  // Try to find GC name in body
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

  // Extract company name from sender
  if (senderName) {
    // Remove personal name parts
    const companyMatch = senderName.match(/(?:at|@|from)\s+(.+)/i);
    if (companyMatch) {
      return cleanText(companyMatch[1]);
    }

    // Check if sender name looks like a company
    if (senderName.match(/(?:Construction|Builders|Contracting|Inc|LLC|Corp)/i)) {
      return cleanText(senderName);
    }
  }

  return senderName || 'Unknown';
}

// Extract bid date
function extractBidDate(body) {
  // Common date patterns
  const patterns = [
    // "Bid Date: January 15, 2025"
    /(?:Bid|Due|Deadline|Submit(?:tal)?)\s*(?:Date|By)?[:\s]+(\w+\s+\d{1,2},?\s+\d{4})/i,
    // "Due: 01/15/2025"
    /(?:Bid|Due|Deadline|Submit(?:tal)?)\s*(?:Date|By)?[:\s]+(\d{1,2}\/\d{1,2}\/\d{2,4})/i,
    // "Bids due January 15"
    /(?:Bid|Due|Deadline)s?\s+(?:due\s+)?(\w+\s+\d{1,2}(?:,?\s+\d{4})?)/i,
    // "by 2:00 PM on January 15, 2025"
    /by\s+\d{1,2}:\d{2}\s*(?:AM|PM)?\s+on\s+(\w+\s+\d{1,2},?\s+\d{4})/i,
    // "01-15-2025"
    /(?:Bid|Due|Deadline)[:\s]+(\d{1,2}-\d{1,2}-\d{2,4})/i,
  ];

  for (const pattern of patterns) {
    const match = body.match(pattern);
    if (match?.[1]) {
      return formatDate(match[1]);
    }
  }

  // Try to find any date-like pattern near "bid" or "due"
  const contextMatch = body.match(/(?:bid|due|deadline).{0,50}(\d{1,2}[\/-]\d{1,2}[\/-]\d{2,4})/i);
  if (contextMatch) {
    return formatDate(contextMatch[1]);
  }

  return '';
}

// Extract location
function extractLocation(body) {
  const patterns = [
    /(?:Location|Site|Address|City)[:\s]+(.+?)(?:\n|$)/i,
    /(?:Project\s+)?(?:Location|Site)[:\s]+(.+?)(?:\n|$)/i,
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

  // Try to find city, state pattern
  const cityStateMatch = body.match(/([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?),\s*([A-Z]{2})\s+\d{5}/);
  if (cityStateMatch) {
    return `${cityStateMatch[1]}, ${cityStateMatch[2]}`;
  }

  return '';
}

// Extract scope of work
function extractScope(body) {
  const patterns = [
    /(?:Scope|Work|Package)[:\s]+(.+?)(?:\n\n|\n[A-Z]|$)/is,
    /(?:Steel|Structural)\s+(?:Package|Scope)[:\s]+(.+?)(?:\n|$)/i,
    /(?:includes?|requiring)[:\s]+(.+?)(?:\n\n|$)/is,
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

  // Look for steel-specific keywords
  const steelKeywords = ['structural steel', 'misc steel', 'miscellaneous metals',
                         'steel fabrication', 'erection', 'joist', 'deck'];
  for (const keyword of steelKeywords) {
    if (body.toLowerCase().includes(keyword)) {
      return 'Structural Steel / Misc Metals';
    }
  }

  return '';
}

// Extract phone number
function extractPhone(body) {
  const phoneMatch = body.match(/(?:Phone|Tel|Cell|Mobile|Direct)?[:\s]*(\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4})/i);
  return phoneMatch?.[1] || '';
}

// Extract attachments
async function extractAttachments() {
  const attachments = [];

  // Gmail attachment containers
  const attachmentEls = document.querySelectorAll('.aQH, .aZo, [download_url]');

  attachmentEls.forEach(el => {
    const downloadUrl = el.getAttribute('download_url');
    const nameEl = el.querySelector('.aV3, .aQA') || el;
    const name = nameEl.innerText?.trim() || 'attachment';

    // Only include relevant file types
    const relevantExtensions = ['.pdf', '.dwg', '.dxf', '.xlsx', '.xls', '.doc', '.docx', '.zip'];
    const isRelevant = relevantExtensions.some(ext => name.toLowerCase().includes(ext));

    if (downloadUrl || isRelevant) {
      attachments.push({
        name: name,
        url: downloadUrl || '',
        type: getFileType(name)
      });
    }
  });

  // Also check for Google Drive links
  const driveLinks = document.querySelectorAll('a[href*="drive.google.com"]');
  driveLinks.forEach(link => {
    attachments.push({
      name: link.innerText?.trim() || 'Google Drive Link',
      url: link.href,
      type: 'drive'
    });
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

  // Track URLs to avoid duplicates
  const seenUrls = new Set();

  allLinks.forEach(link => {
    const href = link.href?.toLowerCase() || '';
    const text = link.innerText?.trim() || '';

    // Skip empty or javascript links
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

    // Check for direct file downloads (by extension)
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

// Helper: Clean text
function cleanText(text) {
  return text
    .replace(/\s+/g, ' ')
    .replace(/^\s+|\s+$/g, '')
    .replace(/^[:\-\s]+|[:\-\s]+$/g, '');
}

// Helper: Format date
function formatDate(dateStr) {
  try {
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) {
      return dateStr; // Return as-is if parsing fails
    }
    return date.toLocaleDateString('en-US', {
      month: '2-digit',
      day: '2-digit',
      year: 'numeric'
    });
  } catch {
    return dateStr;
  }
}

// Helper: Get file type
function getFileType(filename) {
  const ext = filename.split('.').pop()?.toLowerCase();
  const types = {
    pdf: 'document',
    dwg: 'drawing',
    dxf: 'drawing',
    xlsx: 'spreadsheet',
    xls: 'spreadsheet',
    doc: 'document',
    docx: 'document',
    zip: 'archive'
  };
  return types[ext] || 'file';
}

// Inject extraction button into Gmail UI
function injectExtractButton() {
  // Check if button already exists
  if (document.getElementById('bid-extractor-btn')) return;

  // Find Gmail toolbar
  const toolbar = document.querySelector('.G-atb');
  if (!toolbar) return;

  const button = document.createElement('div');
  button.id = 'bid-extractor-btn';
  button.className = 'bid-extractor-inline-btn';
  button.innerHTML = `
    <span class="bid-extractor-icon">📋</span>
    <span>Extract Bid</span>
  `;
  button.title = 'Extract bid information from this email';

  button.addEventListener('click', async () => {
    try {
      const data = await extractBidInfo();
      // Send to background for processing
      chrome.runtime.sendMessage({ action: 'bidExtracted', data });
      button.innerHTML = `<span class="bid-extractor-icon">✅</span><span>Extracted!</span>`;
      setTimeout(() => {
        button.innerHTML = `<span class="bid-extractor-icon">📋</span><span>Extract Bid</span>`;
      }, 2000);
    } catch (error) {
      button.innerHTML = `<span class="bid-extractor-icon">❌</span><span>Error</span>`;
      setTimeout(() => {
        button.innerHTML = `<span class="bid-extractor-icon">📋</span><span>Extract Bid</span>`;
      }, 2000);
    }
  });

  toolbar.appendChild(button);
}

// Watch for email opens
const observer = new MutationObserver((mutations) => {
  // Check if an email is open
  const emailOpen = document.querySelector('.a3s.aiL') || document.querySelector('[data-message-id]');
  if (emailOpen) {
    injectExtractButton();
  }
});

// Start observing
observer.observe(document.body, {
  childList: true,
  subtree: true
});

// Initial check
setTimeout(injectExtractButton, 2000);

console.log('Bid Extractor: Gmail content script loaded');
