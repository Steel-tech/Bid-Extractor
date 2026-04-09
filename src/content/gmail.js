// @ts-nocheck
// Gmail Content Script for Bid Extractor
// Uses SharedExtractors (loaded before this script via manifest)

// Config storage (loaded on init via shared ConfigLoader)
let SELECTORS = null;
let PLATFORMS = null;

// Config readiness promise — extractBidInfo() awaits this before using SELECTORS/PLATFORMS
const configReady = (async function initConfigs() {
  try {
    const loader = window.ConfigLoader;
    if (!loader) {
      console.warn('Bid Extractor: ConfigLoader not available, using defaults');
      return;
    }
    const [selectorsConfig, platformsConfig] = await Promise.all([
      loader.loadConfig('selectors'),
      loader.loadConfig('platforms')
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

// Shared helpers (loaded before this script)
const SE = window.SharedExtractors || {};

// Listen for messages from popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'extract') {
    extractBidInfo()
      .then(data => sendResponse({ success: true, data }))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true;
  }
});

// Main extraction function
async function extractBidInfo() {
  // Wait for configs with a 3-second timeout so extraction doesn't hang
  await Promise.race([configReady, new Promise(r => setTimeout(r, 3000))]);

  // Guard: SharedExtractors must be available
  if (!window.SharedExtractors) {
    throw new Error('Bid Extractor: SharedExtractors module failed to load — try refreshing the page');
  }

  console.log('Bid Extractor: Starting extraction...');

  const containerSelector = SELECTORS?.container?.primary || '[role="main"]';
  const bodySelectors = SELECTORS?.body || [
    '.a3s.aiL', '.a3s', '.ii.gt', '[data-message-id]',
    '.gmail_quote', 'div[dir="ltr"]', '.Am.aiL', '.Am'
  ];
  const fallbackSelectors = SELECTORS?.bodyFallback || [
    '.a3s.aiL', '.a3s', '.gs .ii.gt', '[role="listitem"] .a3s', '.nH .a3s'
  ];

  let emailBody = null;
  let emailContainer = null;

  // Strategy 1: Find container and body using SafeQuery
  emailContainer = document.querySelector(containerSelector);

  if (emailContainer && window.SafeQuery) {
    emailBody = SafeQuery.query(bodySelectors, emailContainer, {
      name: 'gmail-email-body',
      minTextLength: 10,
      silent: true
    });
  } else if (emailContainer) {
    for (const selector of bodySelectors) {
      emailBody = emailContainer.querySelector(selector);
      if (emailBody && emailBody.innerText?.trim().length > 10) break;
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
        if (emailBody && emailBody.innerText?.trim().length > 10) break;
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
        break;
      }
    }
  }

  if (!emailBody) {
    if (window.SafeQuery) {
      SafeQuery.reportFailure('gmail-email-body-all-strategies', [...bodySelectors, ...fallbackSelectors], document);
    }
    throw new Error('Could not find email content - try refreshing the page');
  }

  const emailText = emailBody.innerText || '';

  // Read ALL messages in the thread
  const allMessageBodies = document.querySelectorAll('.a3s.aiL, .a3s');
  const threadTexts = [];
  allMessageBodies.forEach(msgBody => {
    const msgText = msgBody.innerText?.trim();
    if (msgText && msgText.length > 10) {
      threadTexts.push(msgText);
    }
  });

  // Get email subject
  const subjectSelectors = SELECTORS?.subject || ['h2[data-thread-perm-id]', '[data-thread-perm-id] span', '.hP'];
  let subjectEl = null;
  for (const sel of subjectSelectors) {
    subjectEl = document.querySelector(sel);
    if (subjectEl) break;
  }
  const subject = subjectEl?.innerText || '';

  // Get sender info
  const senderSelectors = SELECTORS?.sender || ['.gD', '[email]'];
  let senderEl = null;
  for (const sel of senderSelectors) {
    senderEl = document.querySelector(sel);
    if (senderEl) break;
  }
  const senderEmail = senderEl?.getAttribute('email') || '';
  const senderName = senderEl?.getAttribute('name') || senderEl?.innerText || '';

  // Use EmailParser for deep extraction
  const parsed = (typeof EmailParser !== 'undefined')
    ? EmailParser.parseFullEmail(emailText)
    : { signature: {}, sections: {}, thread: [], metadata: {} };

  const bidInfo = {
    project: parsed.sections.project || SE.extractProjectName(subject, emailText),
    gc: parsed.signature.company || SE.extractGCName(senderName, emailText),
    bidDate: SE.extractBidDate(emailText),
    location: parsed.sections.location || SE.extractLocation(emailText),
    scope: parsed.sections.scope || SE.extractScope(emailText),
    contact: senderName,
    email: senderEmail,
    phone: parsed.signature.phone || SE.extractPhone(emailText),

    projectManager: parsed.metadata.projectManager || parsed.signature.name || '',
    gcCompany: parsed.signature.company || SE.extractGCName(senderName, emailText),
    gcEmail: parsed.signature.email || senderEmail,
    gcPhone: parsed.signature.phone || SE.extractPhone(emailText),
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

    attachments: await extractAttachments(),
    downloadLinks: SE.extractDownloadLinks(emailBody, PLATFORMS),
    notes: '',
    rawSubject: subject,
    rawText: emailText,
  };

  return bidInfo;
}

// Extract attachments
async function extractAttachments() {
  const attachments = [];
  const attachmentEls = document.querySelectorAll('.aQH, .aZo, [download_url]');

  attachmentEls.forEach(el => {
    const downloadUrl = el.getAttribute('download_url');
    const nameEl = el.querySelector('.aV3, .aQA') || el;
    const name = nameEl.innerText?.trim() || 'attachment';

    const relevantExtensions = ['.pdf', '.dwg', '.dxf', '.xlsx', '.xls', '.doc', '.docx', '.zip'];
    const isRelevant = relevantExtensions.some(ext => name.toLowerCase().includes(ext));

    if (downloadUrl || isRelevant) {
      attachments.push({
        name: name,
        url: downloadUrl || '',
        type: SE.getFileType(name)
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

// Inject extraction button into Gmail UI
function injectExtractButton() {
  if (document.getElementById('bid-extractor-btn')) return;

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

// Watch for email opens with debounce
const debouncedInject = SE.debounce ? SE.debounce(injectExtractButton, 500) : injectExtractButton;

const observer = new MutationObserver(() => {
  const emailOpen = document.querySelector('.a3s.aiL') || document.querySelector('[data-message-id]');
  if (emailOpen) {
    debouncedInject();
  }
});

observer.observe(document.body, {
  childList: true,
  subtree: true
});

setTimeout(injectExtractButton, 2000);

console.log('Bid Extractor: Gmail content script loaded');
