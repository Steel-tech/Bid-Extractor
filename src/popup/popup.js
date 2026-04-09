// @ts-nocheck
// Popup Script for Bid Extractor
// v1.5.0 - MATRIX EDITION (Config-based + Email Parser)
// Uses: ScoringUtils (scoring.js), PopupUI (popup-ui.js), PopupCalendar (popup-calendar.js)

// ===== MODULE REFERENCES =====
const UI = window.PopupUI;
const Cal = window.PopupCalendar;
const Scoring = window.ScoringUtils;

// ===== CONFIG LOADING =====

let CONFIG = {
  gcList: [],
  keywords: [],
  priorityWeights: null,
  platforms: null,
  loaded: false
};

async function loadConfigs() {
  try {
    const [gcConfig, keywordsConfig, weightsConfig, platformsConfig] = await Promise.all([
      fetch(chrome.runtime.getURL('src/config/gc-list.json')).then(r => r.json()),
      fetch(chrome.runtime.getURL('src/config/keywords.json')).then(r => r.json()),
      fetch(chrome.runtime.getURL('src/config/priority-weights.json')).then(r => r.json()),
      fetch(chrome.runtime.getURL('src/config/platforms.json')).then(r => r.json())
    ]);

    CONFIG.gcList = gcConfig.contractors || [];
    CONFIG.keywords = keywordsConfig.highValueKeywords || [];
    CONFIG.priorityWeights = weightsConfig;
    CONFIG.platforms = platformsConfig;
    CONFIG.loaded = true;

    console.log('Bid Extractor: Configs loaded successfully');
  } catch (error) {
    console.error('Bid Extractor: Error loading configs, using defaults:', error);
    CONFIG.gcList = FALLBACK_GCS;
    CONFIG.keywords = FALLBACK_KEYWORDS;
    CONFIG.loaded = true;
  }
}

const FALLBACK_GCS = [
  'turner', 'skanska', 'mortenson', 'mccarthy', 'holder', 'whiting-turner',
  'hensel phelps', 'beck', 'barton malow', 'gilbane', 'brasfield gorrie',
  'jll', 'cbre', 'webcor', 'swinerton', 'hitt', 'clark construction',
  'suffolk', 'walsh', 'austin industries', 'ryan companies', 'hoar'
];

const FALLBACK_KEYWORDS = [
  'hospital', 'medical center', 'data center', 'high-rise', 'tower',
  'stadium', 'arena', 'airport', 'university', 'headquarters', 'hq',
  'million', 'campus', 'research', 'lab', 'biotech', 'pharma',
  'manufacturing', 'warehouse', 'distribution', 'hotel', 'resort'
];

// ===== PRIORITY SCORING =====
// Uses ScoringUtils from scoring.js for the pure functions,
// but orchestrates with CONFIG for GC list and keywords

function calculatePriorityScore(bidData) {
  let score = 0;
  const weights = CONFIG.priorityWeights?.weights;
  const gcList = CONFIG.gcList.length > 0 ? CONFIG.gcList : FALLBACK_GCS;
  const keywords = CONFIG.keywords.length > 0 ? CONFIG.keywords : FALLBACK_KEYWORDS;

  // 1. DEADLINE PROXIMITY
  const bidDate = Cal.parseBidDate(bidData.bidDate);
  if (bidDate) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const daysUntilDue = Math.ceil((bidDate - today) / (1000 * 60 * 60 * 24));
    score += Scoring.calculateDeadlineScore(daysUntilDue, weights?.deadline);
  }

  // 2. GC REPUTATION
  score += Scoring.calculateGcScore(bidData.gc, gcList, weights?.gcReputation);

  // 3. PROJECT VALUE INDICATORS
  const projectText = (bidData.project || '') + ' ' + (bidData.scope || '') + ' ' + (bidData.location || '');
  score += Scoring.calculateValueScore(projectText, keywords, weights?.projectValue);

  // 4. DATA COMPLETENESS
  score += Scoring.calculateCompletenessScore(bidData, weights?.dataCompleteness);

  // 5. ATTACHMENTS BONUS
  const attachmentCount = bidData.attachments?.length || 0;
  score += Scoring.calculateAttachmentScore(attachmentCount, weights?.attachments);

  const maxScore = CONFIG.priorityWeights?.maxScore || 100;
  return Math.min(score, maxScore);
}

function getPriorityLevel(score) {
  return Scoring.getPriorityLevel(score, CONFIG.priorityWeights?.priorityLevels);
}

function getPriorityLabel(score) {
  return Scoring.getPriorityLabel(score, CONFIG.priorityWeights?.priorityLevels);
}

// ===== DASHBOARD STATISTICS =====

async function updateDashboardStats() {
  const { recentExtractions = [] } = await chrome.storage.local.get('recentExtractions');

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const weekEnd = new Date(today);
  weekEnd.setDate(weekEnd.getDate() + 7);

  let dueToday = 0;
  let dueThisWeek = 0;
  let highPriority = 0;

  for (const bid of recentExtractions) {
    const bidDate = Cal.parseBidDate(bid.bidDate);
    const score = calculatePriorityScore(bid);

    if (bidDate) {
      const bidDateNorm = new Date(bidDate);
      bidDateNorm.setHours(0, 0, 0, 0);

      if (bidDateNorm.getTime() === today.getTime()) {
        dueToday++;
      }
      if (bidDateNorm >= today && bidDateNorm <= weekEnd) {
        dueThisWeek++;
      }
    }

    if (score >= 70) {
      highPriority++;
    }
  }

  UI.animateCounter('count-due-today', dueToday);
  UI.animateCounter('count-this-week', dueThisWeek);
  UI.animateCounter('count-high-priority', highPriority);

  const statDueToday = document.getElementById('stat-due-today');
  if (statDueToday) {
    if (dueToday > 0) {
      statDueToday.classList.add('urgent');
    } else {
      statDueToday.classList.remove('urgent');
    }
  }
}

// ===== DOM ELEMENTS =====

const extractBtn = document.getElementById('extract-btn');
const downloadBtn = document.getElementById('download-btn');
const copyBtn = document.getElementById('copy-btn');
const calendarBtn = document.getElementById('calendar-btn');
const calendarDropdown = document.getElementById('calendar-dropdown');
const gcalBtn = document.getElementById('gcal-btn');
const outlookBtn = document.getElementById('outlook-btn');
const icalBtn = document.getElementById('ical-btn');
const previewSection = document.getElementById('preview-section');
const recentList = document.getElementById('recent-list');
const statusDot = document.querySelector('.status-dot');
const statusText = document.getElementById('status-text');
const settingsBtn = document.getElementById('settings-btn');
const settingsModal = document.getElementById('settings-modal');
const closeSettings = document.getElementById('close-settings');
const saveSettings = document.getElementById('save-settings');

let currentExtraction = null;

// ===== INITIALIZE =====

document.addEventListener('DOMContentLoaded', async () => {
  await loadConfigs();
  UI.initDigitalRain();
  await loadRecentExtractions();
  await loadSettings();
  await updateDashboardStats();
  checkCurrentTab();
});

// ===== PLATFORM DETECTION =====

const PLATFORM_SITES = [
  { pattern: 'mail.google.com', type: 'email', name: 'Gmail', action: 'extract' },
  { pattern: 'outlook.live.com', type: 'email', name: 'Outlook', action: 'extract' },
  { pattern: 'outlook.office.com', type: 'email', name: 'Outlook', action: 'extract' },
  { pattern: 'outlook.office365.com', type: 'email', name: 'Outlook', action: 'extract' },
  { pattern: 'buildingconnected.com', type: 'platform', name: 'BuildingConnected', action: 'extractDocuments' },
  { pattern: 'planhub.com', type: 'platform', name: 'PlanHub', action: 'extractDocuments' },
  { pattern: 'procore.com', type: 'platform', name: 'Procore', action: 'extractDocuments' },
  { pattern: 'smartbidnet.com', type: 'platform', name: 'SmartBid', action: 'extractDocuments' },
  { pattern: 'smartbid.co', type: 'platform', name: 'SmartBid', action: 'extractDocuments' },
  { pattern: 'pipelinesuite.com', type: 'platform', name: 'PipelineSuite', action: 'extractDocuments' },
];

let currentSite = null;

async function checkCurrentTab() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    const url = tab?.url || '';

    currentSite = PLATFORM_SITES.find(s => url.includes(s.pattern)) || null;

    if (currentSite) {
      setStatus('ready', currentSite.name);
      extractBtn.disabled = false;
      const btnLabel = currentSite.type === 'email' ? 'extract from email' : 'scan documents';
      extractBtn.querySelector('svg').nextSibling.textContent = ' ' + btnLabel;
    } else {
      setStatus('error', 'Open a supported site');
      extractBtn.disabled = true;
    }
  } catch (error) {
    console.error('Error checking tab:', error);
  }
}

function setStatus(type, text) {
  statusDot.className = 'status-dot';
  if (type === 'error') statusDot.classList.add('error');
  if (type === 'loading') statusDot.classList.add('loading');
  statusText.textContent = text;
}

// ===== EXTRACT BUTTON =====

extractBtn.addEventListener('click', async () => {
  if (!currentSite) return;

  setStatus('loading', 'Extracting...');
  UI.setButtonLoading(extractBtn);

  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) {
      setStatus('error', 'Cannot access tab');
      UI.clearButtonLoading(extractBtn);
      UI.showToast('Cannot access current tab', 'error');
      return;
    }

    const response = await chrome.tabs.sendMessage(tab.id, { action: currentSite.action });

    if (currentSite.type === 'email') {
      handleEmailResponse(response);
    } else {
      handlePlatformResponse(response);
    }
  } catch (error) {
    console.error('Extraction error:', error);
    if (error.message?.includes('Receiving end does not exist')) {
      setStatus('error', 'Refresh page first');
      UI.showToast('Refresh the page first', 'error');
    } else {
      setStatus('error', error.message || 'Try refreshing page');
      UI.showToast(error.message || 'Try refreshing the page', 'error');
    }
    extractBtn.classList.add('shake');
    setTimeout(() => extractBtn.classList.remove('shake'), 400);
  }

  UI.clearButtonLoading(extractBtn);
});

// ===== RESPONSE HANDLERS =====

function isGreeting(text) {
  if (!text) return false;
  return /^(hello|hi|hey|dear|good\s+(morning|afternoon|evening))\b/i.test(text.trim());
}

function needsPlatformEnrichment(data) {
  if (!data) return false;
  const weakProject = !data.project || data.project === 'Untitled Project' || isGreeting(data.project);
  return weakProject || !data.bidDate;
}

function mergeProjectInfo(extraction, platformInfo) {
  if (!platformInfo) return;

  if (platformInfo.projectName &&
    (!extraction.project || extraction.project === 'Untitled Project' || isGreeting(extraction.project))) {
    extraction.project = platformInfo.projectName;
  }
  if (platformInfo.gc && !extraction.gc && !extraction.gcCompany) {
    extraction.gc = platformInfo.gc;
    extraction.gcCompany = platformInfo.gc;
  }
  if (platformInfo.bidDate && !extraction.bidDate) extraction.bidDate = platformInfo.bidDate;
  if (platformInfo.bidTime && !extraction.bidTime) extraction.bidTime = platformInfo.bidTime;
  if (platformInfo.location && !extraction.location) extraction.location = platformInfo.location;
  if (platformInfo.scope && !extraction.scope) extraction.scope = platformInfo.scope;
  if (platformInfo.notes && !extraction.notes && !extraction.generalNotes) extraction.notes = platformInfo.notes;
}

function handleEmailResponse(response) {
  if (response?.success) {
    currentExtraction = response.data;
    displayExtraction(currentExtraction);
    saveExtraction(currentExtraction);

    (async () => {
      try {
        const platformLinks = (currentExtraction.downloadLinks || []).filter(l => l.type === 'platform');

        if (needsPlatformEnrichment(currentExtraction) && platformLinks.length > 0) {
          const link = platformLinks[0];
          setStatus('loading', 'Fetching details from ' + (link.platform || 'platform') + '...');

          try {
            const result = await chrome.runtime.sendMessage({
              action: 'enrichFromPlatform',
              url: link.url
            });

            if (result?.success && result.projectInfo) {
              mergeProjectInfo(currentExtraction, result.projectInfo);
              displayExtraction(currentExtraction);
              saveExtraction(currentExtraction);
            }
          } catch (enrichErr) {
            console.warn('Platform enrichment failed:', enrichErr);
          }
        }

        const settings = await chrome.storage.local.get(['folderPattern', 'createSummary']);
        const folderPattern = settings.folderPattern || 'Bids/{gc}_{date}_{project}';
        const folderName = createFolderName(folderPattern, currentExtraction);

        const summaryContent = createSummaryText(currentExtraction);
        const summaryBlob = new Blob([summaryContent], { type: 'text/plain' });
        const summaryUrl = URL.createObjectURL(summaryBlob);
        await downloadFile(summaryUrl, folderName + '/bid_info.txt');
        URL.revokeObjectURL(summaryUrl);

        const projectInfoHtml = createProjectInfoSheet(currentExtraction);
        const htmlBlob = new Blob([projectInfoHtml], { type: 'text/html' });
        const htmlUrl = URL.createObjectURL(htmlBlob);
        await downloadFile(htmlUrl, folderName + '/Project_Info_Sheet.html');
        URL.revokeObjectURL(htmlUrl);

        setStatus('ready', 'Extracted & Saved!');
        UI.showToast('Bid extracted: ' + (currentExtraction.project || 'Unknown'), 'success');
        UI.flashButtonSuccess(extractBtn);
      } catch (downloadErr) {
        console.error('Auto-download failed:', downloadErr);
        setStatus('ready', 'Extracted!');
        UI.showToast('Extracted! Auto-download failed.', 'warning');
      }
    })();
  } else {
    setStatus('error', response?.error || 'Extraction failed');
    UI.showToast(response?.error || 'Extraction failed', 'error');
    extractBtn.classList.add('shake');
    setTimeout(() => extractBtn.classList.remove('shake'), 400);
  }
}

function handlePlatformResponse(response) {
  if (response?.success) {
    const docs = response.documents || [];
    const info = response.projectInfo || {};
    const count = docs.length;

    if (info.projectName) {
      const el = document.getElementById('preview-project');
      if (el) el.textContent = info.projectName;
    }
    if (info.gc) {
      const el = document.getElementById('preview-gc');
      if (el) el.textContent = info.gc;
    }
    if (info.bidDate) {
      const el = document.getElementById('preview-date');
      if (el) el.textContent = info.bidDate;
    }
    if (info.bidTime) {
      const el = document.getElementById('preview-time');
      if (el) el.textContent = info.bidTime;
    }
    if (info.location) {
      const el = document.getElementById('preview-location');
      if (el) el.textContent = info.location;
    }
    if (info.scope) {
      const el = document.getElementById('preview-scope');
      if (el) el.textContent = info.scope;
    }
    if (info.notes) {
      const el = document.getElementById('preview-notes');
      if (el) {
        const short = info.notes.length > 80 ? info.notes.substring(0, 80) + '...' : info.notes;
        el.textContent = short;
        el.title = info.notes;
        el.style.cursor = 'pointer';
        el.onclick = () => {
          const expanded = document.getElementById('notes-expanded');
          const fullText = document.getElementById('notes-full-text');
          if (expanded && fullText) {
            fullText.textContent = info.notes;
            expanded.classList.toggle('hidden');
          }
        };
      }
    }
    const pmEl = document.getElementById('preview-pm');
    if (pmEl) pmEl.textContent = info.source || currentSite.name;

    const attEl = document.getElementById('preview-attachments');
    if (attEl) attEl.textContent = count > 0 ? count + ' file(s)' : 'none found';

    const threadEl = document.getElementById('preview-thread');
    if (threadEl) threadEl.textContent = info.source || currentSite.name;

    const hasInfo = info.projectName || info.gc || info.bidDate || info.location;
    const statusMsg = hasInfo
      ? (info.projectName || currentSite.name) + ' - ' + count + ' doc(s)'
      : count + ' document(s) found';
    setStatus('ready', statusMsg);
    UI.showToast('Found ' + count + ' document(s) on ' + currentSite.name, 'success');
    UI.flashButtonSuccess(extractBtn);

    if (count > 0) {
      displayDownloadLinks(docs.map(doc => ({
        url: doc.url,
        platform: currentSite.name,
        icon: doc.type === 'CAD Drawing' ? '\uD83D\uDCD0' : '\uD83D\uDCC4',
        text: doc.name,
        type: 'file'
      })));
    }

    previewSection.classList.remove('hidden');

    currentExtraction = {
      project: info.projectName || '',
      gc: info.gc || '',
      bidDate: info.bidDate || '',
      bidTime: info.bidTime || '',
      location: info.location || '',
      scope: info.scope || '',
      notes: info.notes || '',
      attachments: docs.map(d => d.name),
      source: info.source || currentSite.name
    };

    downloadBtn.onclick = async () => {
      UI.setButtonLoading(downloadBtn);
      try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        const result = await chrome.tabs.sendMessage(tab.id, { action: 'downloadAllDocuments' });
        setStatus('ready', 'Downloaded ' + (result.downloaded || 0) + ' file(s)');
        UI.showToast('Downloaded ' + (result.downloaded || 0) + ' file(s)', 'success');
        UI.flashButtonSuccess(downloadBtn);
      } catch (err) {
        UI.showToast('Download failed: ' + err.message, 'error');
      }
      UI.clearButtonLoading(downloadBtn);
    };
  } else {
    setStatus('error', response?.error || 'No documents found');
    UI.showToast(response?.error || 'No documents found on this page', 'warning');
  }
}

// ===== DISPLAY EXTRACTION =====

function displayExtraction(data) {
  previewSection.classList.remove('hidden');

  document.getElementById('preview-project').textContent = data.project || '-';
  document.getElementById('preview-gc').textContent = data.gcCompany || data.gc || '-';
  document.getElementById('preview-pm').textContent = data.projectManager || data.contact || '-';
  document.getElementById('preview-date').textContent = data.bidDate || '-';
  document.getElementById('preview-time').textContent = data.bidTime || '-';
  document.getElementById('preview-location').textContent = data.location || '-';
  document.getElementById('preview-scope').textContent = data.scope || '-';
  document.getElementById('preview-attachments').textContent =
    data.attachments?.length ? data.attachments.length + ' file(s)' : 'None';

  const threadCount = data.threadMessages?.length || 0;
  document.getElementById('preview-thread').textContent =
    threadCount > 0 ? threadCount + ' message(s)' : '-';

  const notesText = data.generalNotes || data.notes || '';
  const notesPreview = document.getElementById('preview-notes');
  const notesExpanded = document.getElementById('notes-expanded');
  const notesFullText = document.getElementById('notes-full-text');

  if (notesText && notesText.length > 10) {
    notesPreview.textContent = notesText.substring(0, 150);
    notesFullText.textContent = notesText;
    notesPreview.style.cursor = 'pointer';
    notesPreview.onclick = () => {
      notesExpanded.classList.toggle('hidden');
    };
  } else {
    notesPreview.textContent = '-';
    notesExpanded.classList.add('hidden');
  }

  displayDownloadLinks(data.downloadLinks || []);
  displayBlueprints(data.attachments || []);
}

function displayBlueprints(attachments) {
  const blueprintSection = document.getElementById('blueprint-section');
  const blueprintList = document.getElementById('blueprint-list');
  if (!blueprintSection || !blueprintList) return;

  const blueprints = (attachments || []).filter(att =>
    att.name?.toLowerCase().endsWith('.pdf') || att.type?.includes('pdf')
  );

  if (blueprints.length === 0) {
    blueprintSection.classList.add('hidden');
    return;
  }

  blueprintSection.classList.remove('hidden');
  blueprintList.innerHTML = '';

  blueprints.forEach(blueprint => {
    const item = document.createElement('div');
    item.className = 'blueprint-item';
    item.innerHTML =
      '<span class="blueprint-icon">\uD83D\uDDC2</span>' +
      '<div class="blueprint-info">' +
        '<div class="blueprint-name">' + UI.escapeHtml(blueprint.name) + '</div>' +
        '<div class="blueprint-size">' + (blueprint.size ? UI.formatFileSize(blueprint.size) : 'PDF') + '</div>' +
      '</div>' +
      '<span class="blueprint-action">View \u2192</span>';

    item.addEventListener('click', () => {
      openBlueprintViewer(blueprint.url, blueprint.name);
    });

    blueprintList.appendChild(item);
  });
}

function openBlueprintViewer(url, name) {
  const viewerUrl = chrome.runtime.getURL('src/blueprint/viewer.html');
  const params = new URLSearchParams({
    file: encodeURIComponent(url),
    name: encodeURIComponent(name)
  });
  chrome.tabs.create({ url: viewerUrl + '?' + params.toString() });
  UI.showToast('Opening blueprint viewer...', 'info', 2000);
}

function displayDownloadLinks(links) {
  const linksSection = document.getElementById('links-section');
  const linksList = document.getElementById('links-list');

  if (!links || links.length === 0) {
    linksSection.classList.add('hidden');
    return;
  }

  linksSection.classList.remove('hidden');
  linksList.innerHTML = '';

  links.forEach(link => {
    const linkItem = document.createElement('div');
    linkItem.className = 'link-item';
    linkItem.innerHTML =
      '<span class="link-icon">' + (link.icon || '📄') + '</span>' +
      '<div class="link-info">' +
        '<div class="link-platform">' + link.platform + '</div>' +
        '<div class="link-text">' + link.text + '</div>' +
      '</div>' +
      '<span class="link-open">Open →</span>';

    linkItem.addEventListener('click', () => {
      chrome.tabs.create({ url: link.url });
    });

    linksList.appendChild(linkItem);
  });

  if (links.length > 1) {
    const openAllBtn = document.createElement('button');
    openAllBtn.className = 'btn btn-open-all';
    openAllBtn.innerHTML =
      '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">' +
        '<path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path>' +
        '<polyline points="15 3 21 3 21 9"></polyline>' +
        '<line x1="10" y1="14" x2="21" y2="3"></line>' +
      '</svg>' +
      ' Open All ' + links.length + ' Links';

    openAllBtn.addEventListener('click', () => {
      links.forEach((link, i) => {
        setTimeout(() => {
          chrome.tabs.create({ url: link.url, active: i === 0 });
        }, i * 300);
      });
    });

    linksList.appendChild(openAllBtn);
  }
}

// ===== DOWNLOAD =====

downloadBtn.addEventListener('click', async () => {
  if (!currentExtraction) {
    UI.showToast('No extraction data available', 'warning');
    return;
  }

  setStatus('loading', 'Downloading...');
  UI.setButtonLoading(downloadBtn);

  try {
    const settings = await chrome.storage.local.get(['folderPattern', 'createSummary']);
    const folderPattern = settings.folderPattern || 'Bids/{gc}_{date}_{project}';
    const createSummary = settings.createSummary !== false;

    const folderName = createFolderName(folderPattern, currentExtraction);

    let downloadCount = 0;

    if (currentExtraction.attachments?.length) {
      for (const attachment of currentExtraction.attachments) {
        await downloadFile(attachment.url, folderName + '/' + attachment.name);
        downloadCount++;
      }
    }

    if (createSummary) {
      const summaryContent = createSummaryText(currentExtraction);
      const blob = new Blob([summaryContent], { type: 'text/plain' });
      const url = URL.createObjectURL(blob);
      await downloadFile(url, folderName + '/bid_info.txt');
      URL.revokeObjectURL(url);
      downloadCount++;
    }

    const projectInfoHtml = createProjectInfoSheet(currentExtraction);
    const htmlBlob = new Blob([projectInfoHtml], { type: 'text/html' });
    const htmlUrl = URL.createObjectURL(htmlBlob);
    await downloadFile(htmlUrl, folderName + '/Project_Info_Sheet.html');
    URL.revokeObjectURL(htmlUrl);
    downloadCount++;

    setStatus('ready', 'Downloaded!');
    UI.showToast(downloadCount + ' file(s) downloaded', 'success');
    UI.flashButtonSuccess(downloadBtn);
  } catch (error) {
    console.error('Download error:', error);
    setStatus('error', 'Download failed');
    UI.showToast('Download failed: ' + (error.message || 'Unknown error'), 'error');
    downloadBtn.classList.add('shake');
    setTimeout(() => downloadBtn.classList.remove('shake'), 400);
  }

  UI.clearButtonLoading(downloadBtn);
});

// ===== COPY =====

const copyDropdown = document.getElementById('copy-dropdown');
const copyAllBtn = document.getElementById('copy-all-btn');
const copySpreadsheetBtn = document.getElementById('copy-spreadsheet-btn');
const copyNotesBtn = document.getElementById('copy-notes-btn');

copyBtn.addEventListener('click', () => {
  if (!currentExtraction) {
    UI.showToast('No extraction data to copy', 'warning');
    return;
  }
  copyDropdown.classList.toggle('hidden');
});

document.addEventListener('click', (e) => {
  if (!copyBtn.contains(e.target) && !copyDropdown.contains(e.target)) {
    copyDropdown.classList.add('hidden');
  }
});

copyAllBtn.addEventListener('click', async () => {
  if (!currentExtraction) return;
  try {
    await navigator.clipboard.writeText(createSummaryText(currentExtraction));
    UI.showToast('All bid info copied', 'success', 2000);
    UI.flashButtonSuccess(copyBtn);
  } catch (error) {
    UI.showToast('Failed to copy', 'error');
  }
  copyDropdown.classList.add('hidden');
});

copySpreadsheetBtn.addEventListener('click', async () => {
  if (!currentExtraction) return;
  const d = currentExtraction;
  const row = [
    d.project || '', d.gcCompany || d.gc || '', d.projectManager || '',
    d.bidDate || '', d.bidTime || '', d.location || '', d.scope || '',
    d.gcEmail || d.email || '', d.gcPhone || d.phone || '',
    d.attachments?.length || 0, d.bondRequirements || '', d.submissionInstructions || ''
  ].join('\t');

  try {
    await navigator.clipboard.writeText(row);
    UI.showToast('Copied for spreadsheet', 'success', 2000);
    UI.flashButtonSuccess(copyBtn);
  } catch (error) {
    UI.showToast('Failed to copy', 'error');
  }
  copyDropdown.classList.add('hidden');
});

copyNotesBtn.addEventListener('click', async () => {
  if (!currentExtraction) return;
  const notes = currentExtraction.generalNotes || currentExtraction.notes || '';
  try {
    await navigator.clipboard.writeText(notes);
    UI.showToast('Notes copied', 'success', 2000);
    UI.flashButtonSuccess(copyBtn);
  } catch (error) {
    UI.showToast('Failed to copy', 'error');
  }
  copyDropdown.classList.add('hidden');
});

// ===== HELPERS =====

function createFolderName(pattern, data) {
  return Scoring.createFolderName(pattern, data);
}

function sanitizeFileName(name) {
  return Scoring.sanitizeFileName(name);
}

function createSummaryText(data) {
  const lines = [
    'BID INFORMATION', '================',
    'Extracted: ' + new Date().toLocaleString(), '',
    'Project: ' + (data.project || 'N/A'),
    'General Contractor: ' + (data.gcCompany || data.gc || 'N/A'),
    'Project Manager: ' + (data.projectManager || 'N/A'),
    'Bid Date: ' + (data.bidDate || 'N/A'),
    'Bid Time: ' + (data.bidTime || 'N/A'),
    'Location: ' + (data.location || 'N/A'),
    'Scope: ' + (data.scope || 'N/A'), '',
    'Contact: ' + (data.contact || 'N/A'),
    'Email: ' + (data.gcEmail || data.email || 'N/A'),
    'Phone: ' + (data.gcPhone || data.phone || 'N/A'),
  ];

  if (data.submissionInstructions) {
    lines.push('', 'Submission Instructions: ' + data.submissionInstructions);
  }
  if (data.bondRequirements) {
    lines.push('Bond Requirements: ' + data.bondRequirements);
  }
  if (data.preBidMeeting?.date) {
    lines.push('', 'Pre-Bid Meeting:');
    lines.push('  Date: ' + data.preBidMeeting.date);
    if (data.preBidMeeting.location) lines.push('  Location: ' + data.preBidMeeting.location);
    lines.push('  Mandatory: ' + (data.preBidMeeting.mandatory ? 'Yes' : 'No'));
  }
  if (data.addenda?.length) {
    lines.push('', 'Addenda:');
    data.addenda.forEach(a => lines.push('  - ' + a));
  }

  lines.push(
    '', 'Attachments:',
    data.attachments?.map(a => '- ' + a.name).join('\n') || 'None',
    '', 'Notes:',
    data.generalNotes || data.notes || ''
  );

  return lines.join('\n');
}

// ===== PROJECT INFO SHEET =====

function createProjectInfoSheet(data) {
  const extractedDate = new Date().toLocaleDateString('en-US', {
    year: 'numeric', month: 'long', day: 'numeric'
  });

  const attachmentsList = data.attachments?.length
    ? data.attachments.map(a => '<li>' + UI.escapeHtml(a.name) + '</li>').join('\n              ')
    : '<li>None</li>';

  const downloadLinksList = data.downloadLinks?.length
    ? data.downloadLinks.map(l => '<li><a href="' + UI.escapeHtml(l.url) + '">' + UI.escapeHtml(l.icon || '📄') + ' ' + UI.escapeHtml(l.text || l.platform) + '</a></li>').join('\n              ')
    : '';

  return '<!DOCTYPE html>\n<html>\n<head>\n  <meta charset="UTF-8">\n  <title>Project Info Sheet - ' + UI.escapeHtml(data.project || 'Unknown Project') + '</title>\n  <style>\n    @page { margin: 0.75in; }\n    body { font-family: Arial, Helvetica, sans-serif; font-size: 11pt; line-height: 1.4; color: #333; max-width: 8.5in; margin: 0 auto; padding: 20px; }\n    .header { text-align: center; border-bottom: 3px solid #2563eb; padding-bottom: 15px; margin-bottom: 25px; }\n    .header h1 { font-size: 24pt; color: #1e40af; margin: 0 0 5px 0; }\n    .header .subtitle { font-size: 10pt; color: #666; }\n    .project-title { background: #2563eb; color: white; padding: 12px 20px; font-size: 16pt; font-weight: bold; margin: 0 0 20px 0; border-radius: 4px; }\n    .section { margin-bottom: 20px; }\n    .section-title { font-size: 12pt; font-weight: bold; color: #1e40af; border-bottom: 1px solid #ddd; padding-bottom: 5px; margin-bottom: 10px; }\n    table { width: 100%; border-collapse: collapse; margin-bottom: 15px; }\n    table td { padding: 8px 12px; border: 1px solid #ddd; vertical-align: top; }\n    table td:first-child { width: 30%; font-weight: bold; background: #f8fafc; color: #475569; }\n    table td:last-child { width: 70%; }\n    .bid-date-row td { background: #fef3c7 !important; }\n    .bid-date-row td:last-child { color: #b45309; font-weight: bold; font-size: 12pt; }\n    ul { margin: 0; padding-left: 20px; }\n    li { margin-bottom: 4px; }\n    a { color: #2563eb; text-decoration: none; }\n    .footer { margin-top: 30px; padding-top: 15px; border-top: 1px solid #ddd; font-size: 9pt; color: #888; text-align: center; }\n    .notes-area { min-height: 100px; border: 1px solid #ddd; padding: 10px; background: #fafafa; }\n    @media print { body { padding: 0; } .no-print { display: none; } }\n  </style>\n</head>\n<body>\n  <div class="header">\n    <h1>PROJECT INFORMATION SHEET</h1>\n    <div class="subtitle">Extracted: ' + extractedDate + '</div>\n  </div>\n  <div class="project-title">' + UI.escapeHtml(data.project || 'Unknown Project') + '</div>\n  <div class="section">\n    <div class="section-title">📋 Project Details</div>\n    <table>\n      <tr><td>Project Name</td><td>' + UI.escapeHtml(data.project || 'N/A') + '</td></tr>\n      <tr><td>General Contractor</td><td>' + UI.escapeHtml(data.gcCompany || data.gc || 'N/A') + '</td></tr>\n      <tr><td>Project Manager</td><td>' + UI.escapeHtml(data.projectManager || 'N/A') + '</td></tr>\n      <tr class="bid-date-row"><td>Bid Date / Deadline</td><td>📅 ' + UI.escapeHtml(data.bidDate || 'N/A') + (data.bidTime ? ' @ ' + UI.escapeHtml(data.bidTime) : '') + '</td></tr>\n      <tr><td>Project Location</td><td>' + UI.escapeHtml(data.location || 'N/A') + '</td></tr>\n      <tr><td>Scope of Work</td><td>' + UI.escapeHtml(data.scope || 'N/A') + '</td></tr>\n' + (data.submissionInstructions ? '      <tr><td>Submission Instructions</td><td>' + UI.escapeHtml(data.submissionInstructions) + '</td></tr>\n' : '') + (data.bondRequirements ? '      <tr><td>Bond Requirements</td><td>' + UI.escapeHtml(data.bondRequirements) + '</td></tr>\n' : '') + '    </table>\n  </div>\n  <div class="section">\n    <div class="section-title">👤 Contact Information</div>\n    <table>\n      <tr><td>Contact Name</td><td>' + UI.escapeHtml(data.projectManager || data.contact || 'N/A') + '</td></tr>\n      <tr><td>Email</td><td><a href="mailto:' + UI.escapeHtml(data.gcEmail || data.email || '') + '">' + UI.escapeHtml(data.gcEmail || data.email || 'N/A') + '</a></td></tr>\n      <tr><td>Phone</td><td>' + UI.escapeHtml(data.gcPhone || data.phone || 'N/A') + '</td></tr>\n    </table>\n  </div>\n  <div class="section">\n    <div class="section-title">📎 Attachments & Documents</div>\n    <table>\n      <tr><td>Files</td><td><ul>' + attachmentsList + '</ul></td></tr>\n' + (downloadLinksList ? '      <tr><td>Download Links</td><td><ul>' + downloadLinksList + '</ul></td></tr>\n' : '') + '    </table>\n  </div>\n  <div class="section">\n    <div class="section-title">📝 Notes</div>\n    <div class="notes-area">' + UI.escapeHtml(data.generalNotes || data.notes || '') + '&nbsp;</div>\n  </div>\n  <div class="footer">Generated by Bid Extractor • ' + extractedDate + '</div>\n</body>\n</html>';
}

// ===== FILE OPERATIONS =====

async function downloadFile(url, filename) {
  return new Promise((resolve, reject) => {
    chrome.downloads.download({
      url: url,
      filename: filename,
      saveAs: false,
      conflictAction: 'uniquify'
    }, (downloadId) => {
      if (chrome.runtime.lastError) {
        reject(chrome.runtime.lastError);
      } else {
        resolve(downloadId);
      }
    });
  });
}

// ===== STORAGE =====

async function saveExtraction(data) {
  const { recentExtractions = [] } = await chrome.storage.local.get('recentExtractions');
  recentExtractions.unshift({ ...data, extractedAt: new Date().toISOString() });
  if (recentExtractions.length > 20) recentExtractions.pop();
  await chrome.storage.local.set({ recentExtractions });
  await loadRecentExtractions();
}

async function loadRecentExtractions() {
  const { recentExtractions = [] } = await chrome.storage.local.get('recentExtractions');

  if (recentExtractions.length === 0) {
    recentList.innerHTML = '<p class="empty-state">no data found</p>';
    return;
  }

  const scoredExtractions = recentExtractions.map((item, originalIndex) => ({
    ...item,
    originalIndex,
    priorityScore: calculatePriorityScore(item),
    priorityLevel: getPriorityLevel(calculatePriorityScore(item)),
    priorityLabel: getPriorityLabel(calculatePriorityScore(item))
  }));

  scoredExtractions.sort((a, b) => b.priorityScore - a.priorityScore);

  recentList.innerHTML = scoredExtractions.slice(0, 5).map(item =>
    '<div class="recent-item" data-index="' + item.originalIndex + '" data-priority="' + item.priorityLevel + '">' +
      '<div class="recent-item-info">' +
        '<div class="recent-item-header">' +
          '<span class="recent-item-project">' + (item.project || 'unknown project') + '</span>' +
          '<span class="priority-badge ' + item.priorityLevel + '">' + item.priorityLabel + '</span>' +
        '</div>' +
        '<div class="recent-item-date">due: ' + (item.bidDate || 'n/a') + '</div>' +
        '<div class="recent-item-meta">' +
          '<span class="gc-name">' + (item.gc || 'unknown gc') + '</span>' +
          '<span class="priority-score">' + item.priorityScore + '</span>' +
        '</div>' +
      '</div>' +
    '</div>'
  ).join('');

  recentList.querySelectorAll('.recent-item').forEach(item => {
    item.addEventListener('click', () => {
      const index = parseInt(item.dataset.index);
      currentExtraction = recentExtractions[index];
      displayExtraction(currentExtraction);
    });
  });

  updateDashboardStats();
}

// ===== SETTINGS =====

settingsBtn.addEventListener('click', () => {
  settingsModal.classList.remove('hidden');
});

closeSettings.addEventListener('click', () => {
  settingsModal.classList.add('hidden');
});

saveSettings.addEventListener('click', async () => {
  const folderPattern = document.getElementById('folder-pattern').value;
  const autoDownload = document.getElementById('auto-download').checked;
  const createSummary = document.getElementById('create-summary').checked;
  const blueprintNaming = document.getElementById('blueprint-naming')?.value || '{project}_{sheet}_{rev}';
  const autoRenameBlueprint = document.getElementById('auto-rename-blueprint')?.checked || false;
  const visionApiKey = document.getElementById('vision-api-key')?.value || '';

  try {
    await chrome.storage.local.set({
      folderPattern, autoDownload, createSummary, blueprintNaming, autoRenameBlueprint
    });
    if (visionApiKey) {
      await chrome.storage.sync.set({ googleVisionApiKey: visionApiKey });
    }
    settingsModal.classList.add('hidden');
    UI.showToast('Settings saved', 'success', 2000);
  } catch (error) {
    console.error('Failed to save settings:', error);
    UI.showToast('Failed to save settings', 'error');
  }
});

async function loadSettings() {
  const settings = await chrome.storage.local.get([
    'folderPattern', 'autoDownload', 'createSummary', 'blueprintNaming', 'autoRenameBlueprint'
  ]);
  const syncSettings = await chrome.storage.sync.get(['googleVisionApiKey']);

  document.getElementById('folder-pattern').value = settings.folderPattern || 'Bids/{gc}_{date}_{project}';
  document.getElementById('auto-download').checked = settings.autoDownload !== false;
  document.getElementById('create-summary').checked = settings.createSummary !== false;

  const blueprintNamingEl = document.getElementById('blueprint-naming');
  const autoRenameBlueprintEl = document.getElementById('auto-rename-blueprint');
  const visionApiKeyEl = document.getElementById('vision-api-key');

  if (blueprintNamingEl) blueprintNamingEl.value = settings.blueprintNaming || '{project}_{sheet}_{rev}';
  if (autoRenameBlueprintEl) autoRenameBlueprintEl.checked = settings.autoRenameBlueprint || false;
  if (visionApiKeyEl && syncSettings.googleVisionApiKey) visionApiKeyEl.value = syncSettings.googleVisionApiKey;
}

settingsModal.addEventListener('click', (e) => {
  if (e.target === settingsModal) settingsModal.classList.add('hidden');
});

// ===== CALENDAR =====

calendarBtn.addEventListener('click', () => {
  if (!currentExtraction || !currentExtraction.bidDate) {
    setStatus('error', 'No bid date found');
    return;
  }
  calendarDropdown.classList.toggle('hidden');
});

document.addEventListener('click', (e) => {
  if (!calendarBtn.contains(e.target) && !calendarDropdown.contains(e.target)) {
    calendarDropdown.classList.add('hidden');
  }
});

gcalBtn.addEventListener('click', () => {
  if (!currentExtraction) return;
  const eventData = Cal.createCalendarEvent(currentExtraction);
  chrome.tabs.create({ url: Cal.createGoogleCalendarUrl(eventData) });
  calendarDropdown.classList.add('hidden');
  setStatus('ready', 'Opening Google Calendar...');
});

outlookBtn.addEventListener('click', () => {
  if (!currentExtraction) return;
  const eventData = Cal.createCalendarEvent(currentExtraction);
  chrome.tabs.create({ url: Cal.createOutlookCalendarUrl(eventData) });
  calendarDropdown.classList.add('hidden');
  setStatus('ready', 'Opening Outlook Calendar...');
});

icalBtn.addEventListener('click', async () => {
  if (!currentExtraction) return;
  const eventData = Cal.createCalendarEvent(currentExtraction);
  const icsContent = Cal.createICSFile(eventData);
  const blob = new Blob([icsContent], { type: 'text/calendar' });
  const url = URL.createObjectURL(blob);
  const filename = 'bid_' + sanitizeFileName(currentExtraction.project || 'unknown') + '.ics';
  await downloadFile(url, filename);
  URL.revokeObjectURL(url);
  calendarDropdown.classList.add('hidden');
  setStatus('ready', 'Calendar file downloaded!');
});
