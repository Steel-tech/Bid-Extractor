# Platform Extractors: Bug Fix + SmartBidNet + PipelineSuite

**Date:** 2026-02-18
**Branch:** feat/robust-bid-extraction

## Problem

Platform extractors (BuildingConnected, PlanHub, Procore) exist as content scripts but are non-functional because:

1. **popup.js `checkCurrentTab()`** only recognizes Gmail/Outlook URLs. On any other site it shows "Open Gmail or Outlook" and disables the extract button.
2. **Message action mismatch:** Popup sends `{ action: 'extract' }` but platform scripts listen for `{ action: 'extractDocuments' }`.
3. **Floating buttons** only appear on specific URL subpaths and are the sole working trigger - but they're unreliable.

## Solution

### 1. Platform-Aware Popup

Update `checkCurrentTab()` to detect platform sites and adapt the UI:

```javascript
// Platform detection map
const PLATFORM_PATTERNS = {
  'mail.google.com': { type: 'email', name: 'Gmail', action: 'extract' },
  'outlook': { type: 'email', name: 'Outlook', action: 'extract' },
  'buildingconnected.com': { type: 'platform', name: 'BuildingConnected', action: 'extractDocuments' },
  'planhub.com': { type: 'platform', name: 'PlanHub', action: 'extractDocuments' },
  'procore.com': { type: 'platform', name: 'Procore', action: 'extractDocuments' },
  'smartbidnet.com': { type: 'platform', name: 'SmartBid', action: 'extractDocuments' },
  'pipelinesuite.com': { type: 'platform', name: 'PipelineSuite', action: 'extractDocuments' },
};
```

When on a platform page:
- Status shows "Ready - {PlatformName}"
- Extract button enabled, label changes to "scan documents"
- Sends `{ action: 'extractDocuments' }` instead of `{ action: 'extract' }`
- Response handler shows document count instead of bid preview

### 2. Platform Response Handling in Popup

Platform extractors return `{ success: true, documents: [...] }` not bid data.

Add a branch in the extract button handler:
- If email site: existing flow (display bid preview, save, auto-download)
- If platform site: show document count, enable "Download All" button, send `downloadAllDocuments` on click

### 3. SmartBidNet Extractor (`smartbidnet.js`)

**Target:** ASP.NET WebForms app with DataTables grids.

**URL patterns:** `*://*.smartbidnet.com/*`
**Page detection:** URL contains `/Main/` or `divBodyContent` exists

**DOM selectors:**
- DataTables rows: `table.dataTable tr.odd, table.dataTable tr.even`
- Grid buttons: `.GridButtons_Row`
- Content area: `[id*="ContentPlaceHolder"]`
- Download links: `a[href*="Download"]`, `a[href*=".pdf"]`
- Tab navigation: `.InternalTabActiveSkin`, `.InternalTabSkin`

**Strategy:**
1. Scan DataTables rows for file links
2. Scan all anchors in content placeholder for file extensions
3. Look for download buttons (ASP.NET `input[id*="btnDownload"]`)
4. Click "Documents" tab if not active, re-scan

### 4. PipelineSuite Extractor (`pipelinesuite.js`)

**Target:** Server-rendered app with stable IDs.

**URL patterns:** `*://*.pipelinesuite.com/*`
**Page detection:** URL contains `/ehPipelineSubs/dspOpenProject` or `#viewRespond` exists

**DOM selectors:**
- File container: `#viewRespond`
- File links: `#viewRespond a[href]` with relevant extensions
- Addenda: `#addenda` links
- Download All shortcut: Build URL from projectID in path → `/ehPipelineSubs/dspProject/projectID/{id}/allFiles/1`
- Tabs: `#viewRespond`, `#projectInfo`, `#addenda`, `#projectContacts`

**Strategy:**
1. Extract projectID from URL path
2. Scan `#viewRespond` for file links
3. Scan `#addenda` for addendum files
4. Offer "Download All (ZIP)" using the native allFiles endpoint as a bonus option

### 5. Manifest Changes

```json
// host_permissions - add:
"https://*.smartbidnet.com/*",
"https://*.pipelinesuite.com/*"

// content_scripts - add:
{
  "matches": ["https://*.smartbidnet.com/*"],
  "js": ["src/utils/config-loader.js", "src/utils/safe-query.js", "src/content/platforms/smartbidnet.js"]
},
{
  "matches": ["https://*.pipelinesuite.com/*"],
  "js": ["src/utils/config-loader.js", "src/utils/safe-query.js", "src/content/platforms/pipelinesuite.js"]
}
```

## What's NOT Included

- No project info extraction from platforms (documents only)
- No API integration (DOM scraping sufficient)
- No floating buttons (popup is the trigger)
- No per-platform settings
