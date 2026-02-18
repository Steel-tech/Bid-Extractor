# Platform Extractors Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Fix broken platform extraction (popup doesn't work on BC/PlanHub/Procore) and add SmartBidNet + PipelineSuite extractors.

**Architecture:** Make popup.js platform-aware so it detects which site the user is on, sends the correct message action, and handles document-type responses. Build two new content scripts following the existing BuildingConnected pattern.

**Tech Stack:** Chrome Extension Manifest V3, vanilla JS content scripts, Chrome messaging API

---

### Task 1: Make popup.js detect platform pages

**Files:**
- Modify: `src/popup/popup.js:460-476` (checkCurrentTab function)
- Modify: `src/popup/popup.html:57` (button label)
- Modify: `src/popup/popup.html:59` (hint text)

**Step 1: Add platform detection map to popup.js**

Add this above the `checkCurrentTab` function (around line 458):

```javascript
// Platform detection - maps URL patterns to site type and message action
const PLATFORM_SITES = [
  { pattern: 'mail.google.com', type: 'email', name: 'Gmail', action: 'extract' },
  { pattern: 'outlook.live.com', type: 'email', name: 'Outlook', action: 'extract' },
  { pattern: 'outlook.office.com', type: 'email', name: 'Outlook', action: 'extract' },
  { pattern: 'outlook.office365.com', type: 'email', name: 'Outlook', action: 'extract' },
  { pattern: 'buildingconnected.com', type: 'platform', name: 'BuildingConnected', action: 'extractDocuments' },
  { pattern: 'planhub.com', type: 'platform', name: 'PlanHub', action: 'extractDocuments' },
  { pattern: 'procore.com', type: 'platform', name: 'Procore', action: 'extractDocuments' },
  { pattern: 'smartbidnet.com', type: 'platform', name: 'SmartBid', action: 'extractDocuments' },
  { pattern: 'pipelinesuite.com', type: 'platform', name: 'PipelineSuite', action: 'extractDocuments' },
];

let currentSite = null; // Tracks detected site for extract handler
```

**Step 2: Replace checkCurrentTab**

Replace the entire `checkCurrentTab` function:

```javascript
async function checkCurrentTab() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    const url = tab?.url || '';

    currentSite = PLATFORM_SITES.find(s => url.includes(s.pattern)) || null;

    if (currentSite) {
      setStatus('ready', currentSite.name);
      extractBtn.disabled = false;

      // Update button label based on site type
      const btnLabel = currentSite.type === 'email' ? 'extract from email' : 'scan documents';
      extractBtn.querySelector('svg').nextSibling.textContent = ` ${btnLabel}`;
    } else {
      setStatus('error', 'Open a supported site');
      extractBtn.disabled = true;
    }
  } catch (error) {
    console.error('Error checking tab:', error);
  }
}
```

**Step 3: Update hint text in popup.html**

Change line 59 from:
```html
<p class="hint">// open rfq email, then click to extract</p>
```
To:
```html
<p class="hint" id="extract-hint">// open rfq email or bid portal</p>
```

**Step 4: Commit**

```
git add src/popup/popup.js src/popup/popup.html
git commit -m "feat: make popup detect platform pages (BC, PlanHub, Procore, SmartBid, PipelineSuite)"
```

---

### Task 2: Route extract button to correct handler based on site type

**Files:**
- Modify: `src/popup/popup.js:486-565` (extract button click handler)

**Step 1: Replace the extract button handler**

Replace the entire `extractBtn.addEventListener('click', ...)` block with:

```javascript
extractBtn.addEventListener('click', async () => {
  if (!currentSite) return;

  setStatus('loading', 'Extracting...');
  setButtonLoading(extractBtn);

  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) {
      setStatus('error', 'Cannot access tab');
      clearButtonLoading(extractBtn);
      showToast('Cannot access current tab', 'error');
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
      showToast('Refresh the page first', 'error');
    } else {
      setStatus('error', error.message || 'Try refreshing page');
      showToast(error.message || 'Try refreshing the page', 'error');
    }
    extractBtn.classList.add('shake');
    setTimeout(() => extractBtn.classList.remove('shake'), 400);
  }

  clearButtonLoading(extractBtn);
});
```

**Step 2: Add handleEmailResponse (extracted from old handler)**

Add after the extract button handler:

```javascript
function handleEmailResponse(response) {
  if (response?.success) {
    currentExtraction = response.data;
    displayExtraction(currentExtraction);
    saveExtraction(currentExtraction);

    // Auto-download
    (async () => {
      try {
        const settings = await chrome.storage.local.get(['folderPattern', 'createSummary']);
        const folderPattern = settings.folderPattern || 'Bids/{gc}_{date}_{project}';
        const folderName = createFolderName(folderPattern, currentExtraction);

        const summaryContent = createSummaryText(currentExtraction);
        const summaryBlob = new Blob([summaryContent], { type: 'text/plain' });
        const summaryUrl = URL.createObjectURL(summaryBlob);
        await downloadFile(summaryUrl, `${folderName}/bid_info.txt`);
        URL.revokeObjectURL(summaryUrl);

        const projectInfoHtml = createProjectInfoSheet(currentExtraction);
        const htmlBlob = new Blob([projectInfoHtml], { type: 'text/html' });
        const htmlUrl = URL.createObjectURL(htmlBlob);
        await downloadFile(htmlUrl, `${folderName}/Project_Info_Sheet.html`);
        URL.revokeObjectURL(htmlUrl);

        setStatus('ready', 'Extracted & Saved!');
        showToast(`Bid extracted: ${currentExtraction.project || 'Unknown'}`, 'success');
        flashButtonSuccess(extractBtn);
      } catch (downloadErr) {
        console.error('Auto-download failed:', downloadErr);
        setStatus('ready', 'Extracted!');
        showToast('Extracted! Auto-download failed.', 'warning');
      }
    })();
  } else {
    setStatus('error', response?.error || 'Extraction failed');
    showToast(response?.error || 'Extraction failed', 'error');
    extractBtn.classList.add('shake');
    setTimeout(() => extractBtn.classList.remove('shake'), 400);
  }
}
```

**Step 3: Add handlePlatformResponse**

```javascript
function handlePlatformResponse(response) {
  if (response?.success && response.documents) {
    const docs = response.documents;
    const count = docs.length;

    setStatus('ready', `${count} document(s) found`);
    showToast(`Found ${count} document(s) on ${currentSite.name}`, 'success');
    flashButtonSuccess(extractBtn);

    // Show documents in the download links section
    displayDownloadLinks(docs.map(doc => ({
      url: doc.url,
      platform: currentSite.name,
      icon: doc.type === 'CAD Drawing' ? '📐' : '📄',
      text: doc.name,
      type: 'file'
    })));

    previewSection.classList.remove('hidden');

    // Enable download button to trigger downloadAll on the platform
    downloadBtn.onclick = async () => {
      setButtonLoading(downloadBtn);
      try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        const result = await chrome.tabs.sendMessage(tab.id, { action: 'downloadAllDocuments' });
        setStatus('ready', `Downloaded ${result.downloaded || 0} file(s)`);
        showToast(`Downloaded ${result.downloaded || 0} file(s)`, 'success');
        flashButtonSuccess(downloadBtn);
      } catch (err) {
        showToast('Download failed: ' + err.message, 'error');
      }
      clearButtonLoading(downloadBtn);
    };
  } else {
    setStatus('error', response?.error || 'No documents found');
    showToast(response?.error || 'No documents found on this page', 'warning');
  }
}
```

**Step 4: Commit**

```
git add src/popup/popup.js
git commit -m "feat: route extract button to email or platform handler based on detected site"
```

---

### Task 3: Build SmartBidNet extractor

**Files:**
- Create: `src/content/platforms/smartbidnet.js`

**Step 1: Create the SmartBidNet content script**

Create `src/content/platforms/smartbidnet.js` following the BuildingConnected pattern. Key differences: ASP.NET WebForms with DataTables, `divBodyContent` container, `.GridButtons_Row` selectors, `[id*="ContentPlaceHolder"]` wrapper.

```javascript
// @ts-nocheck
// SmartBidNet Content Script - Document Extractor
// Extracts and downloads bid documents from SmartBidNet plan room pages

(function() {
  'use strict';

  console.log('Bid Extractor: SmartBidNet script loaded');

  let extractedDocuments = [];

  // Listen for messages from popup/background
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    switch (request.action) {
      case 'extractDocuments':
        extractDocuments().then(docs => {
          sendResponse({ success: true, documents: docs });
        }).catch(err => {
          sendResponse({ success: false, error: err.message });
        });
        return true;

      case 'downloadAllDocuments':
        downloadAllDocuments().then(result => {
          sendResponse({ success: true, ...result });
        }).catch(err => {
          sendResponse({ success: false, error: err.message });
        });
        return true;

      case 'getPageInfo':
        sendResponse({
          success: true,
          platform: 'SmartBid',
          url: window.location.href,
          projectName: getProjectName(),
          documentCount: extractedDocuments.length
        });
        return true;

      default:
        return false;
    }
  });

  function getProjectName() {
    const selectors = [
      'h1', 'h2',
      '[id*="ProjectName"]', '[id*="projectName"]',
      '[id*="lblProject"]',
      '[class*="project-name"]'
    ];
    for (const sel of selectors) {
      const el = document.querySelector(sel);
      if (el?.textContent?.trim()) return el.textContent.trim();
    }
    const title = document.title;
    if (title && !title.toLowerCase().includes('smartbid')) {
      return title.split('|')[0].split('-')[0].trim();
    }
    return 'Unknown Project';
  }

  async function extractDocuments() {
    extractedDocuments = [];
    await waitForContent();

    // Strategy 1: DataTables rows
    document.querySelectorAll('table.dataTable tr.odd, table.dataTable tr.even, .GridButtons_Row').forEach(row => {
      const doc = extractDocFromRow(row);
      if (doc) extractedDocuments.push(doc);
    });

    // Strategy 2: Content placeholder links
    const placeholder = document.querySelector('[id*="ContentPlaceHolder"]') || document.getElementById('divBodyContent');
    if (placeholder) {
      placeholder.querySelectorAll('a[href]').forEach(link => {
        const doc = extractDocFromLink(link);
        if (doc && !extractedDocuments.find(d => d.url === doc.url)) {
          extractedDocuments.push(doc);
        }
      });
    }

    // Strategy 3: Any download-related links anywhere
    document.querySelectorAll('a[href*="Download"], a[href*="download"], a[download], input[type="button"][id*="btnDownload"]').forEach(el => {
      const doc = extractDocFromLink(el);
      if (doc && !extractedDocuments.find(d => d.url === doc.url || d.name === doc.name)) {
        extractedDocuments.push(doc);
      }
    });

    // Strategy 4: Try clicking Documents/Files tab if present
    await activateDocumentsTab();

    console.log(`SmartBid: Found ${extractedDocuments.length} documents`);
    return extractedDocuments;
  }

  function extractDocFromRow(row) {
    const nameEl = row.querySelector('a, span, td:first-child');
    const linkEl = row.querySelector('a[href]');
    const name = nameEl?.textContent?.trim() || '';
    const url = linkEl?.href || '';

    if (isRelevantFile(name) || isRelevantUrl(url)) {
      return { name: name || extractFilename(url), url, type: getFileType(name || url), source: 'SmartBid' };
    }
    return null;
  }

  function extractDocFromLink(el) {
    const url = el.href || el.dataset?.url || '';
    let name = el.textContent?.trim() || el.getAttribute('download') || '';
    if (!name || name.length < 3) name = extractFilename(url);

    if (isRelevantFile(name) || isRelevantUrl(url)) {
      return { name: name || 'document', url, type: getFileType(name || url), source: 'SmartBid' };
    }
    return null;
  }

  async function activateDocumentsTab() {
    const tabs = document.querySelectorAll('.InternalTabSkin, .InternalTabActiveSkin, [role="tab"]');
    for (const tab of tabs) {
      const text = tab.textContent?.toLowerCase() || '';
      if (text.includes('document') || text.includes('file') || text.includes('plan')) {
        if (!tab.classList.contains('InternalTabActiveSkin') && !tab.getAttribute('aria-selected')) {
          tab.click();
          await sleep(1500);
          // Re-scan after tab click
          const placeholder = document.querySelector('[id*="ContentPlaceHolder"]') || document.getElementById('divBodyContent');
          if (placeholder) {
            placeholder.querySelectorAll('a[href]').forEach(link => {
              const doc = extractDocFromLink(link);
              if (doc && !extractedDocuments.find(d => d.url === doc.url || d.name === doc.name)) {
                extractedDocuments.push(doc);
              }
            });
          }
        }
        break;
      }
    }
  }

  async function downloadAllDocuments() {
    if (extractedDocuments.length === 0) await extractDocuments();
    if (extractedDocuments.length === 0) throw new Error('No documents found to download');

    const projectName = sanitize(getProjectName());
    const results = { total: extractedDocuments.length, downloaded: 0, failed: 0, documents: [] };

    for (const doc of extractedDocuments) {
      try {
        if (doc.url) {
          await chrome.runtime.sendMessage({
            action: 'downloadFile',
            url: doc.url,
            filename: `Bids/${projectName}/${sanitize(doc.name)}`
          });
          results.downloaded++;
          results.documents.push({ ...doc, status: 'downloaded' });
        } else {
          results.failed++;
          results.documents.push({ ...doc, status: 'no_url' });
        }
      } catch (error) {
        results.failed++;
        results.documents.push({ ...doc, status: 'error', error: error.message });
      }
      await sleep(300);
    }
    return results;
  }

  // Helpers
  const EXTENSIONS = ['.pdf', '.dwg', '.dxf', '.xlsx', '.xls', '.doc', '.docx', '.zip', '.rar'];

  function isRelevantFile(name) {
    if (!name) return false;
    const lower = name.toLowerCase();
    return EXTENSIONS.some(ext => lower.includes(ext));
  }

  function isRelevantUrl(url) {
    if (!url) return false;
    const lower = url.toLowerCase();
    return EXTENSIONS.some(ext => lower.includes(ext)) || lower.includes('download') || lower.includes('/files/');
  }

  function getFileType(name) {
    const ext = name?.split('.').pop()?.toLowerCase();
    const types = { pdf: 'PDF Document', dwg: 'CAD Drawing', dxf: 'CAD Drawing', xlsx: 'Spreadsheet', xls: 'Spreadsheet', doc: 'Word Document', docx: 'Word Document', zip: 'Archive', rar: 'Archive' };
    return types[ext] || 'Document';
  }

  function extractFilename(url) {
    try { return decodeURIComponent(new URL(url).pathname.split('/').pop().split('?')[0]) || 'document'; }
    catch { return 'document'; }
  }

  function sanitize(name) {
    return name.replace(/[<>:"/\\|?*]/g, '').replace(/\s+/g, '_').substring(0, 100);
  }

  async function waitForContent(timeout = 3000) {
    return new Promise(resolve => {
      let elapsed = 0;
      const interval = setInterval(() => {
        elapsed += 200;
        if (document.querySelector('table, [id*="ContentPlaceHolder"], #divBodyContent') || elapsed >= timeout) {
          clearInterval(interval);
          resolve();
        }
      }, 200);
    });
  }

  function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
})();
```

**Step 2: Commit**

```
git add src/content/platforms/smartbidnet.js
git commit -m "feat: add SmartBidNet document extractor"
```

---

### Task 4: Build PipelineSuite extractor

**Files:**
- Create: `src/content/platforms/pipelinesuite.js`

**Step 1: Create the PipelineSuite content script**

Key differences from others: server-rendered, stable `#viewRespond` / `#addenda` IDs, native "Download All" URL at `/ehPipelineSubs/dspProject/projectID/{id}/allFiles/1`.

```javascript
// @ts-nocheck
// PipelineSuite Content Script - Document Extractor
// Extracts and downloads bid documents from PipelineSuite plan room pages

(function() {
  'use strict';

  console.log('Bid Extractor: PipelineSuite script loaded');

  let extractedDocuments = [];

  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    switch (request.action) {
      case 'extractDocuments':
        extractDocuments().then(docs => {
          sendResponse({ success: true, documents: docs });
        }).catch(err => {
          sendResponse({ success: false, error: err.message });
        });
        return true;

      case 'downloadAllDocuments':
        downloadAllDocuments().then(result => {
          sendResponse({ success: true, ...result });
        }).catch(err => {
          sendResponse({ success: false, error: err.message });
        });
        return true;

      case 'getPageInfo':
        sendResponse({
          success: true,
          platform: 'PipelineSuite',
          url: window.location.href,
          projectName: getProjectName(),
          documentCount: extractedDocuments.length
        });
        return true;

      default:
        return false;
    }
  });

  function getProjectName() {
    // Try project info table first
    const infoSection = document.getElementById('projectInfo');
    if (infoSection) {
      const rows = infoSection.querySelectorAll('tr, td');
      for (const row of rows) {
        const text = row.textContent || '';
        if (text.includes('Project Name')) {
          const cells = row.querySelectorAll('td');
          if (cells.length >= 2) return cells[1].textContent.trim();
        }
      }
    }

    const selectors = ['h1', 'h2', '.project-name', '[class*="projectName"]'];
    for (const sel of selectors) {
      const el = document.querySelector(sel);
      if (el?.textContent?.trim()) return el.textContent.trim();
    }

    const title = document.title;
    if (title && !title.toLowerCase().includes('pipeline')) {
      return title.split('|')[0].split('-')[0].trim();
    }
    return 'Unknown Project';
  }

  function getProjectId() {
    const match = window.location.pathname.match(/projectID\/(\d+)/i);
    return match ? match[1] : null;
  }

  async function extractDocuments() {
    extractedDocuments = [];

    // Strategy 1: Scan #viewRespond for file links
    const fileContainer = document.getElementById('viewRespond');
    if (fileContainer) {
      fileContainer.querySelectorAll('a[href]').forEach(link => {
        const doc = extractDocFromLink(link);
        if (doc && !extractedDocuments.find(d => d.url === doc.url)) {
          extractedDocuments.push(doc);
        }
      });
    }

    // Strategy 2: Scan #addenda for addendum files
    const addendaContainer = document.getElementById('addenda');
    if (addendaContainer) {
      addendaContainer.querySelectorAll('a[href]').forEach(link => {
        const doc = extractDocFromLink(link);
        if (doc && !extractedDocuments.find(d => d.url === doc.url)) {
          extractedDocuments.push(doc);
        }
      });
    }

    // Strategy 3: Fallback - scan entire page for file links
    if (extractedDocuments.length === 0) {
      document.querySelectorAll('a[href]').forEach(link => {
        const doc = extractDocFromLink(link);
        if (doc && !extractedDocuments.find(d => d.url === doc.url)) {
          extractedDocuments.push(doc);
        }
      });
    }

    // Add "Download All (ZIP)" as a special entry if projectId is available
    const projectId = getProjectId();
    if (projectId) {
      const allFilesUrl = `${window.location.origin}/ehPipelineSubs/dspProject/projectID/${projectId}/allFiles/1`;
      if (!extractedDocuments.find(d => d.url === allFilesUrl)) {
        extractedDocuments.unshift({
          name: 'Download All Files (ZIP)',
          url: allFilesUrl,
          type: 'Archive',
          source: 'PipelineSuite'
        });
      }
    }

    console.log(`PipelineSuite: Found ${extractedDocuments.length} documents`);
    return extractedDocuments;
  }

  function extractDocFromLink(el) {
    const url = el.href || '';
    let name = el.textContent?.trim() || el.getAttribute('download') || '';
    if (!name || name.length < 3) name = extractFilename(url);

    if (isRelevantFile(name) || isRelevantUrl(url)) {
      return { name: name || 'document', url, type: getFileType(name || url), source: 'PipelineSuite' };
    }
    return null;
  }

  async function downloadAllDocuments() {
    if (extractedDocuments.length === 0) await extractDocuments();
    if (extractedDocuments.length === 0) throw new Error('No documents found to download');

    const projectName = sanitize(getProjectName());
    const results = { total: extractedDocuments.length, downloaded: 0, failed: 0, documents: [] };

    for (const doc of extractedDocuments) {
      try {
        if (doc.url) {
          await chrome.runtime.sendMessage({
            action: 'downloadFile',
            url: doc.url,
            filename: `Bids/${projectName}/${sanitize(doc.name)}`
          });
          results.downloaded++;
          results.documents.push({ ...doc, status: 'downloaded' });
        } else {
          results.failed++;
          results.documents.push({ ...doc, status: 'no_url' });
        }
      } catch (error) {
        results.failed++;
        results.documents.push({ ...doc, status: 'error', error: error.message });
      }
      await sleep(300);
    }
    return results;
  }

  // Helpers
  const EXTENSIONS = ['.pdf', '.dwg', '.dxf', '.xlsx', '.xls', '.doc', '.docx', '.zip', '.rar'];

  function isRelevantFile(name) {
    if (!name) return false;
    const lower = name.toLowerCase();
    return EXTENSIONS.some(ext => lower.includes(ext));
  }

  function isRelevantUrl(url) {
    if (!url) return false;
    const lower = url.toLowerCase();
    return EXTENSIONS.some(ext => lower.includes(ext)) || lower.includes('download') || lower.includes('/files/') || lower.includes('allFiles');
  }

  function getFileType(name) {
    const ext = name?.split('.').pop()?.toLowerCase();
    const types = { pdf: 'PDF Document', dwg: 'CAD Drawing', dxf: 'CAD Drawing', xlsx: 'Spreadsheet', xls: 'Spreadsheet', doc: 'Word Document', docx: 'Word Document', zip: 'Archive', rar: 'Archive' };
    return types[ext] || 'Document';
  }

  function extractFilename(url) {
    try { return decodeURIComponent(new URL(url).pathname.split('/').pop().split('?')[0]) || 'document'; }
    catch { return 'document'; }
  }

  function sanitize(name) {
    return name.replace(/[<>:"/\\|?*]/g, '').replace(/\s+/g, '_').substring(0, 100);
  }

  function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
})();
```

**Step 2: Commit**

```
git add src/content/platforms/pipelinesuite.js
git commit -m "feat: add PipelineSuite document extractor"
```

---

### Task 5: Update manifest.json with new platforms

**Files:**
- Modify: `manifest.json`

**Step 1: Add host_permissions**

Add to the `host_permissions` array:
```json
"https://*.smartbidnet.com/*",
"https://*.pipelinesuite.com/*"
```

**Step 2: Add content_scripts entries**

Add two new entries to the `content_scripts` array:
```json
{
  "matches": ["https://*.smartbidnet.com/*"],
  "js": ["src/utils/config-loader.js", "src/utils/safe-query.js", "src/content/platforms/smartbidnet.js"]
},
{
  "matches": ["https://*.pipelinesuite.com/*"],
  "js": ["src/utils/config-loader.js", "src/utils/safe-query.js", "src/content/platforms/pipelinesuite.js"]
}
```

**Step 3: Add to web_accessible_resources matches**

Add to the first `web_accessible_resources` entry's `matches` array:
```json
"https://*.smartbidnet.com/*",
"https://*.pipelinesuite.com/*"
```

**Step 4: Update description**

Update manifest description to mention SmartBid and PipelineSuite.

**Step 5: Commit**

```
git add manifest.json
git commit -m "feat: register SmartBidNet and PipelineSuite in manifest"
```

---

### Task 6: Run tests, verify, push

**Step 1: Run all tests**

```bash
npm test
```

Expected: All 83+ tests pass (no test changes needed - new code is content scripts that run in browser context)

**Step 2: Verify manifest is valid JSON**

```bash
node -e "JSON.parse(require('fs').readFileSync('manifest.json','utf8')); console.log('Valid')"
```

**Step 3: Push**

```bash
git push
```
