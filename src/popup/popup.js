// Popup Script for Bid Extractor
// v1.3.0 - MATRIX EDITION

// ===== DIGITAL RAIN ANIMATION =====
// Matrix-style falling characters background

function initDigitalRain() {
  const canvas = document.getElementById('digital-rain');
  if (!canvas) return;

  const ctx = canvas.getContext('2d');

  // Set canvas size to match container
  function resizeCanvas() {
    canvas.width = canvas.parentElement.offsetWidth;
    canvas.height = canvas.parentElement.offsetHeight;
  }
  resizeCanvas();
  window.addEventListener('resize', resizeCanvas);

  // Matrix characters - mix of latin, numbers, and katakana
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789@#$%&アイウエオカキクケコサシスセソ';
  const charArray = chars.split('');

  const fontSize = 14;
  const columns = Math.floor(canvas.width / fontSize);

  // Array to track Y position of each column
  const drops = [];
  for (let i = 0; i < columns; i++) {
    drops[i] = Math.random() * -100; // Start above canvas at random positions
  }

  function draw() {
    // Semi-transparent black to create trail effect
    ctx.fillStyle = 'rgba(10, 10, 10, 0.05)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Matrix green with varying opacity
    ctx.fillStyle = 'rgba(0, 255, 0, 0.15)';
    ctx.font = `${fontSize}px JetBrains Mono, monospace`;

    for (let i = 0; i < drops.length; i++) {
      // Random character
      const char = charArray[Math.floor(Math.random() * charArray.length)];

      // Draw character
      ctx.fillText(char, i * fontSize, drops[i] * fontSize);

      // Reset drop to top when it reaches bottom + random factor
      if (drops[i] * fontSize > canvas.height && Math.random() > 0.975) {
        drops[i] = 0;
      }

      // Move drop down
      drops[i]++;
    }
  }

  // Run animation at ~20fps for subtle effect
  setInterval(draw, 50);
}

// ===== PRIORITY SCORING SYSTEM =====
// Score: 0-100 based on deadline, GC reputation, project value, completeness

// Known major GCs that get priority
const MAJOR_GCS = [
  'turner', 'skanska', 'mortenson', 'mccarthy', 'holder', 'whiting-turner',
  'hensel phelps', 'beck', 'barton malow', 'gilbane', 'brasfield gorrie',
  'jll', 'cbre', 'webcor', 'swinerton', 'hitt', 'clark construction',
  'suffolk', 'walsh', 'austin industries', 'ryan companies', 'hoar'
];

// High-value project keywords
const HIGH_VALUE_KEYWORDS = [
  'hospital', 'medical center', 'data center', 'high-rise', 'tower',
  'stadium', 'arena', 'airport', 'university', 'headquarters', 'hq',
  'million', 'campus', 'research', 'lab', 'biotech', 'pharma',
  'manufacturing', 'warehouse', 'distribution', 'hotel', 'resort'
];

function calculatePriorityScore(bidData) {
  let score = 0;

  // 1. DEADLINE PROXIMITY (max 40 points)
  const bidDate = parseBidDate(bidData.bidDate);
  if (bidDate) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const daysUntilDue = Math.ceil((bidDate - today) / (1000 * 60 * 60 * 24));

    if (daysUntilDue <= 0) {
      score += 40; // Due today or overdue - MAXIMUM URGENCY
    } else if (daysUntilDue <= 1) {
      score += 38; // Tomorrow
    } else if (daysUntilDue <= 2) {
      score += 35;
    } else if (daysUntilDue <= 3) {
      score += 32;
    } else if (daysUntilDue <= 5) {
      score += 28;
    } else if (daysUntilDue <= 7) {
      score += 25; // This week
    } else if (daysUntilDue <= 14) {
      score += 15; // Two weeks
    } else if (daysUntilDue <= 30) {
      score += 10; // Month out
    } else {
      score += 5; // Far out
    }
  }

  // 2. GC REPUTATION (max 20 points)
  if (bidData.gc) {
    const gcLower = bidData.gc.toLowerCase();
    for (const gc of MAJOR_GCS) {
      if (gcLower.includes(gc)) {
        score += 20;
        break;
      }
    }
    // Partial credit for any named GC
    if (score < 20 && bidData.gc !== 'Unknown GC') {
      score += 10;
    }
  }

  // 3. PROJECT VALUE INDICATORS (max 20 points)
  const projectText = `${bidData.project || ''} ${bidData.scope || ''} ${bidData.location || ''}`.toLowerCase();
  let valuePoints = 0;

  for (const keyword of HIGH_VALUE_KEYWORDS) {
    if (projectText.includes(keyword)) {
      valuePoints += 5;
    }
  }
  score += Math.min(valuePoints, 20); // Cap at 20

  // 4. DATA COMPLETENESS (max 10 points)
  const fields = ['project', 'gc', 'bidDate', 'location', 'scope', 'contact', 'email'];
  let filledFields = 0;
  for (const field of fields) {
    if (bidData[field] && bidData[field] !== 'N/A' && bidData[field] !== '-') {
      filledFields++;
    }
  }
  score += Math.min(Math.floor(filledFields * 1.5), 10);

  // 5. ATTACHMENTS BONUS (max 10 points)
  if (bidData.attachments?.length) {
    score += Math.min(bidData.attachments.length * 2, 10);
  }

  return Math.min(score, 100); // Cap at 100
}

function getPriorityLevel(score) {
  if (score >= 70) return 'high';
  if (score >= 40) return 'medium';
  return 'low';
}

function getPriorityLabel(score) {
  if (score >= 70) return 'HIGH';
  if (score >= 40) return 'MED';
  return 'LOW';
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
    const bidDate = parseBidDate(bid.bidDate);
    const score = calculatePriorityScore(bid);

    if (bidDate) {
      const bidDateNorm = new Date(bidDate);
      bidDateNorm.setHours(0, 0, 0, 0);

      // Due today
      if (bidDateNorm.getTime() === today.getTime()) {
        dueToday++;
      }

      // Due this week (today through 7 days)
      if (bidDateNorm >= today && bidDateNorm <= weekEnd) {
        dueThisWeek++;
      }
    }

    // High priority (score >= 70)
    if (score >= 70) {
      highPriority++;
    }
  }

  // Update DOM with animated counting
  animateCounter('count-due-today', dueToday);
  animateCounter('count-this-week', dueThisWeek);
  animateCounter('count-high-priority', highPriority);

  // Add urgent class if items due today
  const statDueToday = document.getElementById('stat-due-today');
  if (statDueToday) {
    if (dueToday > 0) {
      statDueToday.classList.add('urgent');
    } else {
      statDueToday.classList.remove('urgent');
    }
  }
}

function animateCounter(elementId, targetValue) {
  const element = document.getElementById(elementId);
  if (!element) return;

  const currentValue = parseInt(element.textContent) || 0;
  const diff = targetValue - currentValue;

  if (diff === 0) return;

  const duration = 500; // ms
  const steps = 20;
  const stepValue = diff / steps;
  const stepDuration = duration / steps;

  let current = currentValue;
  let step = 0;

  const timer = setInterval(() => {
    step++;
    current += stepValue;

    if (step >= steps) {
      element.textContent = targetValue;
      clearInterval(timer);
    } else {
      element.textContent = Math.round(current);
    }
  }, stepDuration);
}

// DOM Elements
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

// Current extraction data
let currentExtraction = null;

// Initialize
document.addEventListener('DOMContentLoaded', async () => {
  // Start Matrix digital rain animation
  initDigitalRain();

  // Load data and settings
  await loadRecentExtractions();
  await loadSettings();
  await updateDashboardStats();

  // Check current tab status
  checkCurrentTab();
});

// Check if we're on a supported email page
async function checkCurrentTab() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    const url = tab?.url || '';

    if (url.includes('mail.google.com') || url.includes('outlook')) {
      setStatus('ready', 'Ready');
      extractBtn.disabled = false;
    } else {
      setStatus('error', 'Open Gmail or Outlook');
      extractBtn.disabled = true;
    }
  } catch (error) {
    console.error('Error checking tab:', error);
  }
}

// Set status indicator
function setStatus(type, text) {
  statusDot.className = 'status-dot';
  if (type === 'error') statusDot.classList.add('error');
  if (type === 'loading') statusDot.classList.add('loading');
  statusText.textContent = text;
}

// Extract button click
extractBtn.addEventListener('click', async () => {
  setStatus('loading', 'Extracting...');
  extractBtn.disabled = true;

  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    console.log('Current tab:', tab?.url);

    if (!tab?.id) {
      setStatus('error', 'Cannot access tab');
      extractBtn.disabled = false;
      return;
    }

    // Send message to content script
    const response = await chrome.tabs.sendMessage(tab.id, { action: 'extract' });
    console.log('Response from content script:', response);

    if (response?.success) {
      currentExtraction = response.data;
      displayExtraction(currentExtraction);
      await saveExtraction(currentExtraction);

      // AUTO-DOWNLOAD files immediately after extraction
      try {
        const settings = await chrome.storage.local.get(['folderPattern', 'createSummary']);
        // Default: GC Name + Bid Date + Project (Company first, then date)
        const folderPattern = settings.folderPattern || 'Bids/{gc}_{date}_{project}';
        const folderName = createFolderName(folderPattern, currentExtraction);

        // 1. Create the summary text file
        const summaryContent = createSummaryText(currentExtraction);
        const summaryBlob = new Blob([summaryContent], { type: 'text/plain' });
        const summaryUrl = URL.createObjectURL(summaryBlob);
        await downloadFile(summaryUrl, `${folderName}/bid_info.txt`);
        URL.revokeObjectURL(summaryUrl);

        // 2. Create the Project Info Sheet HTML (opens in Word, Google Docs, or browser)
        const projectInfoHtml = createProjectInfoSheet(currentExtraction);
        const htmlBlob = new Blob([projectInfoHtml], { type: 'text/html' });
        const htmlUrl = URL.createObjectURL(htmlBlob);
        await downloadFile(htmlUrl, `${folderName}/Project_Info_Sheet.html`);
        URL.revokeObjectURL(htmlUrl);

        console.log('Files saved to:', folderName);
        setStatus('ready', 'Extracted & Saved!');
      } catch (downloadErr) {
        console.error('Auto-download failed:', downloadErr);
        setStatus('ready', 'Extracted! Click Download to save.');
      }
    } else {
      setStatus('error', response?.error || 'Extraction failed');
    }
  } catch (error) {
    console.error('Extraction error:', error);
    // More helpful error messages
    if (error.message?.includes('Receiving end does not exist')) {
      setStatus('error', 'Refresh Gmail page first');
    } else if (error.message?.includes('Cannot access')) {
      setStatus('error', 'Cannot access this page');
    } else {
      setStatus('error', error.message || 'Try refreshing page');
    }
  }

  extractBtn.disabled = false;
});

// Display extracted data
function displayExtraction(data) {
  previewSection.classList.remove('hidden');

  document.getElementById('preview-project').textContent = data.project || '-';
  document.getElementById('preview-gc').textContent = data.gc || '-';
  document.getElementById('preview-date').textContent = data.bidDate || '-';
  document.getElementById('preview-location').textContent = data.location || '-';
  document.getElementById('preview-scope').textContent = data.scope || '-';
  document.getElementById('preview-attachments').textContent =
    data.attachments?.length ? `${data.attachments.length} file(s)` : 'None';

  // Display download links
  displayDownloadLinks(data.downloadLinks || []);
}

// Display download links from bid portals
function displayDownloadLinks(links) {
  const linksSection = document.getElementById('links-section');
  const linksList = document.getElementById('links-list');

  if (!links || links.length === 0) {
    linksSection.classList.add('hidden');
    return;
  }

  linksSection.classList.remove('hidden');
  linksList.innerHTML = '';

  // Add each link
  links.forEach((link, index) => {
    const linkItem = document.createElement('div');
    linkItem.className = 'link-item';
    linkItem.innerHTML = `
      <span class="link-icon">${link.icon || '📄'}</span>
      <div class="link-info">
        <div class="link-platform">${link.platform}</div>
        <div class="link-text">${link.text}</div>
      </div>
      <span class="link-open">Open →</span>
    `;

    linkItem.addEventListener('click', () => {
      chrome.tabs.create({ url: link.url });
    });

    linksList.appendChild(linkItem);
  });

  // Add "Open All" button if multiple links
  if (links.length > 1) {
    const openAllBtn = document.createElement('button');
    openAllBtn.className = 'btn btn-open-all';
    openAllBtn.innerHTML = `
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path>
        <polyline points="15 3 21 3 21 9"></polyline>
        <line x1="10" y1="14" x2="21" y2="3"></line>
      </svg>
      Open All ${links.length} Links
    `;

    openAllBtn.addEventListener('click', () => {
      links.forEach((link, i) => {
        // Stagger opening to avoid popup blockers
        setTimeout(() => {
          chrome.tabs.create({ url: link.url, active: i === 0 });
        }, i * 300);
      });
    });

    linksList.appendChild(openAllBtn);
  }
}

// Download button click
downloadBtn.addEventListener('click', async () => {
  if (!currentExtraction) return;

  setStatus('loading', 'Downloading...');
  downloadBtn.disabled = true;

  try {
    // Get settings
    const settings = await chrome.storage.local.get(['folderPattern', 'createSummary']);
    // Default: GC Name + Bid Date + Project (Company first, then date)
    const folderPattern = settings.folderPattern || 'Bids/{gc}_{date}_{project}';
    const createSummary = settings.createSummary !== false;

    // Create folder name
    const folderName = createFolderName(folderPattern, currentExtraction);

    // Download attachments
    if (currentExtraction.attachments?.length) {
      for (const attachment of currentExtraction.attachments) {
        await downloadFile(attachment.url, `${folderName}/${attachment.name}`);
      }
    }

    // Create summary file
    if (createSummary) {
      const summaryContent = createSummaryText(currentExtraction);
      const blob = new Blob([summaryContent], { type: 'text/plain' });
      const url = URL.createObjectURL(blob);
      await downloadFile(url, `${folderName}/bid_info.txt`);
      URL.revokeObjectURL(url);
    }

    // Create Project Info Sheet HTML
    const projectInfoHtml = createProjectInfoSheet(currentExtraction);
    const htmlBlob = new Blob([projectInfoHtml], { type: 'text/html' });
    const htmlUrl = URL.createObjectURL(htmlBlob);
    await downloadFile(htmlUrl, `${folderName}/Project_Info_Sheet.html`);
    URL.revokeObjectURL(htmlUrl);

    setStatus('ready', 'Downloaded!');
  } catch (error) {
    console.error('Download error:', error);
    setStatus('error', 'Download failed');
  }

  downloadBtn.disabled = false;
});

// Copy button click
copyBtn.addEventListener('click', async () => {
  if (!currentExtraction) return;

  const text = createSummaryText(currentExtraction);

  try {
    await navigator.clipboard.writeText(text);
    copyBtn.textContent = 'copied!';
    setTimeout(() => {
      copyBtn.innerHTML = `
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
          <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
        </svg>
        copy
      `;
    }, 2000);
  } catch (error) {
    console.error('Copy error:', error);
  }
});

// Create folder name from pattern
function createFolderName(pattern, data) {
  const date = data.bidDate ? data.bidDate.replace(/\//g, '-') : 'unknown-date';
  const project = sanitizeFileName(data.project || 'Unknown Project');
  const gc = sanitizeFileName(data.gc || 'Unknown GC');
  const location = sanitizeFileName(data.location || 'Unknown Location');

  return pattern
    .replace('{project}', project)
    .replace('{date}', date)
    .replace('{gc}', gc)
    .replace('{location}', location);
}

// Sanitize file name
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

Notes:
${data.notes || ''}
`;
}

// ===== PROJECT INFO SHEET (HTML) =====
// Creates a professional HTML document that opens in Word, Google Docs, or browser

function createProjectInfoSheet(data) {
  const extractedDate = new Date().toLocaleDateString('en-US', {
    year: 'numeric', month: 'long', day: 'numeric'
  });

  const attachmentsList = data.attachments?.length
    ? data.attachments.map(a => `<li>${escapeHtml(a.name)}</li>`).join('\n              ')
    : '<li>None</li>';

  const downloadLinksList = data.downloadLinks?.length
    ? data.downloadLinks.map(l => `<li><a href="${escapeHtml(l.url)}">${escapeHtml(l.icon || '📄')} ${escapeHtml(l.text || l.platform)}</a></li>`).join('\n              ')
    : '';

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Project Info Sheet - ${escapeHtml(data.project || 'Unknown Project')}</title>
  <style>
    /* Print-friendly styles that work in Word, Google Docs, and browsers */
    @page { margin: 0.75in; }

    body {
      font-family: Arial, Helvetica, sans-serif;
      font-size: 11pt;
      line-height: 1.4;
      color: #333;
      max-width: 8.5in;
      margin: 0 auto;
      padding: 20px;
    }

    .header {
      text-align: center;
      border-bottom: 3px solid #2563eb;
      padding-bottom: 15px;
      margin-bottom: 25px;
    }

    .header h1 {
      font-size: 24pt;
      color: #1e40af;
      margin: 0 0 5px 0;
    }

    .header .subtitle {
      font-size: 10pt;
      color: #666;
    }

    .project-title {
      background: linear-gradient(135deg, #2563eb 0%, #1e40af 100%);
      background: #2563eb; /* Fallback for Word */
      color: white;
      padding: 12px 20px;
      font-size: 16pt;
      font-weight: bold;
      margin: 0 0 20px 0;
      border-radius: 4px;
    }

    .section {
      margin-bottom: 20px;
    }

    .section-title {
      font-size: 12pt;
      font-weight: bold;
      color: #1e40af;
      border-bottom: 1px solid #ddd;
      padding-bottom: 5px;
      margin-bottom: 10px;
    }

    table {
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 15px;
    }

    table td {
      padding: 8px 12px;
      border: 1px solid #ddd;
      vertical-align: top;
    }

    table td:first-child {
      width: 30%;
      font-weight: bold;
      background: #f8fafc;
      color: #475569;
    }

    table td:last-child {
      width: 70%;
    }

    .highlight {
      background: #fef3c7 !important;
      font-weight: bold;
    }

    .bid-date-row td {
      background: #fef3c7 !important;
    }

    .bid-date-row td:last-child {
      color: #b45309;
      font-weight: bold;
      font-size: 12pt;
    }

    ul {
      margin: 0;
      padding-left: 20px;
    }

    li {
      margin-bottom: 4px;
    }

    a {
      color: #2563eb;
      text-decoration: none;
    }

    a:hover {
      text-decoration: underline;
    }

    .footer {
      margin-top: 30px;
      padding-top: 15px;
      border-top: 1px solid #ddd;
      font-size: 9pt;
      color: #888;
      text-align: center;
    }

    .notes-area {
      min-height: 100px;
      border: 1px solid #ddd;
      padding: 10px;
      background: #fafafa;
    }

    @media print {
      body { padding: 0; }
      .no-print { display: none; }
    }
  </style>
</head>
<body>
  <div class="header">
    <h1>PROJECT INFORMATION SHEET</h1>
    <div class="subtitle">Extracted: ${extractedDate}</div>
  </div>

  <div class="project-title">
    ${escapeHtml(data.project || 'Unknown Project')}
  </div>

  <div class="section">
    <div class="section-title">📋 Project Details</div>
    <table>
      <tr>
        <td>Project Name</td>
        <td>${escapeHtml(data.project || 'N/A')}</td>
      </tr>
      <tr>
        <td>General Contractor</td>
        <td>${escapeHtml(data.gc || 'N/A')}</td>
      </tr>
      <tr class="bid-date-row">
        <td>Bid Date / Deadline</td>
        <td>📅 ${escapeHtml(data.bidDate || 'N/A')}</td>
      </tr>
      <tr>
        <td>Project Location</td>
        <td>${escapeHtml(data.location || 'N/A')}</td>
      </tr>
      <tr>
        <td>Scope of Work</td>
        <td>${escapeHtml(data.scope || 'N/A')}</td>
      </tr>
    </table>
  </div>

  <div class="section">
    <div class="section-title">👤 Contact Information</div>
    <table>
      <tr>
        <td>Contact Name</td>
        <td>${escapeHtml(data.contact || 'N/A')}</td>
      </tr>
      <tr>
        <td>Email</td>
        <td><a href="mailto:${escapeHtml(data.email || '')}">${escapeHtml(data.email || 'N/A')}</a></td>
      </tr>
      <tr>
        <td>Phone</td>
        <td>${escapeHtml(data.phone || 'N/A')}</td>
      </tr>
    </table>
  </div>

  <div class="section">
    <div class="section-title">📎 Attachments & Documents</div>
    <table>
      <tr>
        <td>Files</td>
        <td>
          <ul>
              ${attachmentsList}
          </ul>
        </td>
      </tr>
      ${downloadLinksList ? `
      <tr>
        <td>Download Links</td>
        <td>
          <ul>
              ${downloadLinksList}
          </ul>
        </td>
      </tr>
      ` : ''}
    </table>
  </div>

  <div class="section">
    <div class="section-title">📝 Notes</div>
    <div class="notes-area">
      ${escapeHtml(data.notes || '')}
      &nbsp;
    </div>
  </div>

  <div class="footer">
    Generated by Bid Extractor • ${extractedDate}
  </div>
</body>
</html>`;
}

// HTML escape helper
function escapeHtml(text) {
  if (!text) return '';
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// Download file
async function downloadFile(url, filename) {
  console.log('Downloading to:', filename);
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
        console.log('Download started, ID:', downloadId);
        resolve(downloadId);
      }
    });
  });
}

// Save extraction to storage
async function saveExtraction(data) {
  const { recentExtractions = [] } = await chrome.storage.local.get('recentExtractions');

  // Add to beginning of array
  recentExtractions.unshift({
    ...data,
    extractedAt: new Date().toISOString()
  });

  // Keep only last 20
  if (recentExtractions.length > 20) {
    recentExtractions.pop();
  }

  await chrome.storage.local.set({ recentExtractions });
  await loadRecentExtractions();
}

// Load recent extractions with priority scoring and sorting
async function loadRecentExtractions() {
  const { recentExtractions = [] } = await chrome.storage.local.get('recentExtractions');

  if (recentExtractions.length === 0) {
    recentList.innerHTML = '<p class="empty-state">no data found</p>';
    return;
  }

  // Calculate priority scores and sort by priority (highest first)
  const scoredExtractions = recentExtractions.map((item, originalIndex) => ({
    ...item,
    originalIndex,
    priorityScore: calculatePriorityScore(item),
    priorityLevel: getPriorityLevel(calculatePriorityScore(item)),
    priorityLabel: getPriorityLabel(calculatePriorityScore(item))
  }));

  // Sort by priority score descending
  scoredExtractions.sort((a, b) => b.priorityScore - a.priorityScore);

  // Display top 5 by priority
  recentList.innerHTML = scoredExtractions.slice(0, 5).map((item, displayIndex) => `
    <div class="recent-item" data-index="${item.originalIndex}" data-priority="${item.priorityLevel}">
      <div class="recent-item-info">
        <div class="recent-item-header">
          <span class="recent-item-project">${item.project || 'unknown project'}</span>
          <span class="priority-badge ${item.priorityLevel}">${item.priorityLabel}</span>
        </div>
        <div class="recent-item-date">due: ${item.bidDate || 'n/a'}</div>
        <div class="recent-item-meta">
          <span class="gc-name">${item.gc || 'unknown gc'}</span>
          <span class="priority-score">${item.priorityScore}</span>
        </div>
      </div>
    </div>
  `).join('');

  // Add click handlers
  recentList.querySelectorAll('.recent-item').forEach(item => {
    item.addEventListener('click', () => {
      const index = parseInt(item.dataset.index);
      currentExtraction = recentExtractions[index];
      displayExtraction(currentExtraction);
    });
  });

  // Update dashboard stats whenever recent list loads
  updateDashboardStats();
}

// Settings
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

  await chrome.storage.local.set({
    folderPattern,
    autoDownload,
    createSummary
  });

  settingsModal.classList.add('hidden');
});

async function loadSettings() {
  const settings = await chrome.storage.local.get(['folderPattern', 'autoDownload', 'createSummary']);

  // Default: GC Name + Bid Date + Project (Company first, then date)
  document.getElementById('folder-pattern').value = settings.folderPattern || 'Bids/{gc}_{date}_{project}';
  document.getElementById('auto-download').checked = settings.autoDownload !== false;
  document.getElementById('create-summary').checked = settings.createSummary !== false;
}

// Close modal on outside click
settingsModal.addEventListener('click', (e) => {
  if (e.target === settingsModal) {
    settingsModal.classList.add('hidden');
  }
});

// ===== CALENDAR FUNCTIONALITY =====

// Toggle calendar dropdown
calendarBtn.addEventListener('click', () => {
  if (!currentExtraction || !currentExtraction.bidDate) {
    setStatus('error', 'No bid date found');
    return;
  }
  calendarDropdown.classList.toggle('hidden');
});

// Close dropdown when clicking outside
document.addEventListener('click', (e) => {
  if (!calendarBtn.contains(e.target) && !calendarDropdown.contains(e.target)) {
    calendarDropdown.classList.add('hidden');
  }
});

// Google Calendar
gcalBtn.addEventListener('click', () => {
  if (!currentExtraction) return;

  const eventData = createCalendarEvent(currentExtraction);
  const gcalUrl = createGoogleCalendarUrl(eventData);

  chrome.tabs.create({ url: gcalUrl });
  calendarDropdown.classList.add('hidden');
  setStatus('ready', 'Opening Google Calendar...');
});

// Outlook Calendar
outlookBtn.addEventListener('click', () => {
  if (!currentExtraction) return;

  const eventData = createCalendarEvent(currentExtraction);
  const outlookUrl = createOutlookCalendarUrl(eventData);

  chrome.tabs.create({ url: outlookUrl });
  calendarDropdown.classList.add('hidden');
  setStatus('ready', 'Opening Outlook Calendar...');
});

// Download .ics file
icalBtn.addEventListener('click', async () => {
  if (!currentExtraction) return;

  const eventData = createCalendarEvent(currentExtraction);
  const icsContent = createICSFile(eventData);

  const blob = new Blob([icsContent], { type: 'text/calendar' });
  const url = URL.createObjectURL(blob);

  const filename = `bid_${sanitizeFileName(currentExtraction.project || 'unknown')}.ics`;

  await downloadFile(url, filename);
  URL.revokeObjectURL(url);

  calendarDropdown.classList.add('hidden');
  setStatus('ready', 'Calendar file downloaded!');
});

// Parse bid date string into Date object
function parseBidDate(dateStr) {
  if (!dateStr) return null;

  // Try various date formats
  const formats = [
    // MM/DD/YYYY
    /(\d{1,2})\/(\d{1,2})\/(\d{4})/,
    // YYYY-MM-DD
    /(\d{4})-(\d{1,2})-(\d{1,2})/,
    // Month DD, YYYY
    /(\w+)\s+(\d{1,2}),?\s*(\d{4})/,
    // DD Month YYYY
    /(\d{1,2})\s+(\w+)\s+(\d{4})/
  ];

  // Try MM/DD/YYYY
  let match = dateStr.match(formats[0]);
  if (match) {
    return new Date(match[3], match[1] - 1, match[2]);
  }

  // Try YYYY-MM-DD
  match = dateStr.match(formats[1]);
  if (match) {
    return new Date(match[1], match[2] - 1, match[3]);
  }

  // Try Month DD, YYYY
  match = dateStr.match(formats[2]);
  if (match) {
    const months = {
      'january': 0, 'february': 1, 'march': 2, 'april': 3, 'may': 4, 'june': 5,
      'july': 6, 'august': 7, 'september': 8, 'october': 9, 'november': 10, 'december': 11,
      'jan': 0, 'feb': 1, 'mar': 2, 'apr': 3, 'jun': 5, 'jul': 6, 'aug': 7, 'sep': 8, 'oct': 9, 'nov': 10, 'dec': 11
    };
    const month = months[match[1].toLowerCase()];
    if (month !== undefined) {
      return new Date(match[3], month, match[2]);
    }
  }

  // Fallback to Date.parse
  const parsed = Date.parse(dateStr);
  if (!isNaN(parsed)) {
    return new Date(parsed);
  }

  return null;
}

// Create calendar event data
function createCalendarEvent(data) {
  const bidDate = parseBidDate(data.bidDate);

  // Default to today + 7 days if no valid date
  const eventDate = bidDate || new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

  // Extract time if present, otherwise default to 2 PM
  let hours = 14;
  let minutes = 0;

  if (data.bidDate) {
    const timeMatch = data.bidDate.match(/(\d{1,2}):(\d{2})\s*(am|pm)?/i);
    if (timeMatch) {
      hours = parseInt(timeMatch[1]);
      minutes = parseInt(timeMatch[2]);
      if (timeMatch[3]?.toLowerCase() === 'pm' && hours < 12) hours += 12;
      if (timeMatch[3]?.toLowerCase() === 'am' && hours === 12) hours = 0;
    }
  }

  eventDate.setHours(hours, minutes, 0, 0);

  // End time is 1 hour later
  const endDate = new Date(eventDate.getTime() + 60 * 60 * 1000);

  return {
    title: `BID DUE: ${data.project || 'Unknown Project'}`,
    description: `Project: ${data.project || 'N/A'}
General Contractor: ${data.gc || 'N/A'}
Location: ${data.location || 'N/A'}
Scope: ${data.scope || 'N/A'}

Contact: ${data.contact || 'N/A'}
Email: ${data.email || 'N/A'}
Phone: ${data.phone || 'N/A'}

Attachments: ${data.attachments?.length || 0} file(s)`,
    location: data.location || '',
    start: eventDate,
    end: endDate
  };
}

// Format date for Google Calendar URL (YYYYMMDDTHHmmss)
function formatDateGoogle(date) {
  return date.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
}

// Create Google Calendar URL
function createGoogleCalendarUrl(event) {
  const baseUrl = 'https://calendar.google.com/calendar/render';
  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: event.title,
    dates: `${formatDateGoogle(event.start)}/${formatDateGoogle(event.end)}`,
    details: event.description,
    location: event.location
  });

  return `${baseUrl}?${params.toString()}`;
}

// Create Outlook Calendar URL
function createOutlookCalendarUrl(event) {
  const baseUrl = 'https://outlook.live.com/calendar/0/deeplink/compose';
  const params = new URLSearchParams({
    subject: event.title,
    startdt: event.start.toISOString(),
    enddt: event.end.toISOString(),
    body: event.description,
    location: event.location,
    path: '/calendar/action/compose',
    rru: 'addevent'
  });

  return `${baseUrl}?${params.toString()}`;
}

// Create .ics file content
function createICSFile(event) {
  const formatICSDate = (date) => {
    return date.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
  };

  const escapeICS = (str) => {
    return (str || '').replace(/\n/g, '\\n').replace(/,/g, '\\,').replace(/;/g, '\\;');
  };

  const uid = `bid-${Date.now()}@bidextractor`;
  const now = formatICSDate(new Date());

  return `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//Bid Extractor//Chrome Extension//EN
BEGIN:VEVENT
UID:${uid}
DTSTAMP:${now}
DTSTART:${formatICSDate(event.start)}
DTEND:${formatICSDate(event.end)}
SUMMARY:${escapeICS(event.title)}
DESCRIPTION:${escapeICS(event.description)}
LOCATION:${escapeICS(event.location)}
BEGIN:VALARM
TRIGGER:-P1D
ACTION:DISPLAY
DESCRIPTION:Bid due tomorrow: ${escapeICS(event.title)}
END:VALARM
BEGIN:VALARM
TRIGGER:-PT2H
ACTION:DISPLAY
DESCRIPTION:Bid due in 2 hours: ${escapeICS(event.title)}
END:VALARM
END:VEVENT
END:VCALENDAR`;
}
