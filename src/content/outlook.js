// @ts-nocheck
// Outlook Content Script for Bid Extractor
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

// Main extraction function for Outlook
async function extractBidInfo() {
  // Wait for configs with a 3-second timeout so extraction doesn't hang
  await Promise.race([configReady, new Promise(r => setTimeout(r, 3000))]);

  // Guard: SharedExtractors must be available
  if (!window.SharedExtractors) {
    throw new Error('Bid Extractor: SharedExtractors module failed to load — try refreshing the page');
  }

  console.log('Bid Extractor: Starting Outlook extraction...');

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
      if (emailContainer) break;
    }
  }

  if (!emailContainer) {
    emailContainer = document.body;
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
      if (emailBody && emailBody.innerText?.trim().length > 20) break;
    }
  }

  // Strategy 2: Find any div with substantial email content
  if (!emailBody) {
    const allDivs = emailContainer.querySelectorAll('div');
    for (const div of allDivs) {
      const text = div.innerText?.trim() || '';
      if (text.length > 100 && (text.includes('@') || text.includes('Dear') || text.includes('Hi ') || text.includes('Hello'))) {
        emailBody = div;
        break;
      }
    }
  }

  if (!emailBody) {
    if (window.SafeQuery) {
      SafeQuery.reportFailure('outlook-email-body-all-strategies', bodySelectors, emailContainer);
    }
    throw new Error('Could not find email content - try clicking on the email');
  }

  const emailText = emailBody.innerText || '';

  // Read all message bodies in thread
  const allMessageBodies = emailContainer.querySelectorAll(
    '[aria-label*="Message body"], [id*="UniqueMessageBody"], .allowTextSelection'
  );
  const threadTexts = [];
  allMessageBodies.forEach(msgBody => {
    const msgText = msgBody.innerText?.trim();
    if (msgText && msgText.length > 10) {
      threadTexts.push(msgText);
    }
  });

  // Get subject
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

  // Get sender
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
  const senderEmail = SE.extractEmailFromText(senderEl?.innerText || '') || '';

  // Use EmailParser for deep extraction
  const parsed = (typeof EmailParser !== 'undefined')
    ? EmailParser.parseFullEmail(emailText)
    : { signature: {}, sections: {}, thread: [], metadata: {} };

  const bidInfo = {
    project: parsed.sections.project || SE.extractProjectName(subject, emailText),
    gc: parsed.signature.company || SE.extractGCName(senderName, emailText, senderEmail),
    bidDate: SE.extractBidDate(emailText),
    location: parsed.sections.location || SE.extractLocation(emailText),
    scope: parsed.sections.scope || SE.extractScope(emailText),
    contact: senderName,
    email: senderEmail,
    phone: parsed.signature.phone || SE.extractPhone(emailText),

    projectManager: parsed.metadata.projectManager || parsed.signature.name || '',
    gcCompany: parsed.signature.company || SE.extractGCName(senderName, emailText, senderEmail),
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

// Extract attachments from Outlook
async function extractAttachments() {
  const attachments = [];
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
        type: SE.getFileType(name)
      });
    }
  });

  return attachments;
}

// Inject button into Outlook toolbar
function injectExtractButton() {
  if (document.getElementById('bid-extractor-btn')) return;

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

// Watch for email opens with debounce
const debouncedInject = SE.debounce ? SE.debounce(injectExtractButton, 500) : injectExtractButton;

const observer = new MutationObserver(() => {
  const emailOpen = document.querySelector('[aria-label*="Message body"]') ||
                    document.querySelector('[id*="UniqueMessageBody"]');
  if (emailOpen) {
    debouncedInject();
  }
});

observer.observe(document.body, { childList: true, subtree: true });

setTimeout(injectExtractButton, 2000);

console.log('Bid Extractor: Outlook content script loaded');
