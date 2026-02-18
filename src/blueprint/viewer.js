// @ts-nocheck
/**
 * Blueprint Viewer - Main Module
 * Bid Extractor v1.4.0
 *
 * PDF rendering, navigation, zoom, and integration with OCR/annotations
 */

// ===== GLOBAL STATE =====
const ViewerState = {
  pdfDoc: null,
  currentPage: 1,
  totalPages: 0,
  zoom: 1,
  rotation: 0,
  renderTask: null,
  fileUrl: null,
  filename: 'blueprint.pdf',
  extractedData: null
};

// ===== DOM ELEMENTS =====
const elements = {
  pdfCanvas: document.getElementById('pdf-canvas'),
  annotationCanvas: document.getElementById('annotation-canvas'),
  pdfContainer: document.getElementById('pdf-container'),
  viewerArea: document.getElementById('viewer-area'),
  loadingOverlay: document.getElementById('loading-overlay'),
  thumbnails: document.getElementById('thumbnails'),
  sidebar: document.getElementById('sidebar'),
  dataPanel: document.getElementById('data-panel'),

  // Navigation
  prevPage: document.getElementById('prev-page'),
  nextPage: document.getElementById('next-page'),
  pageInput: document.getElementById('page-input'),
  totalPagesSpan: document.getElementById('total-pages'),

  // Zoom
  zoomIn: document.getElementById('zoom-in'),
  zoomOut: document.getElementById('zoom-out'),
  zoomSelect: document.getElementById('zoom-select'),

  // Rotation
  rotateLeft: document.getElementById('rotate-left'),
  rotateRight: document.getElementById('rotate-right'),

  // Actions
  extractBtn: document.getElementById('extract-btn'),
  downloadBtn: document.getElementById('download-btn'),
  printBtn: document.getElementById('print-btn'),

  // Panel
  closePanel: document.getElementById('close-panel'),
  copyData: document.getElementById('copy-data'),
  renameFile: document.getElementById('rename-file'),

  // Filename display
  filenameSpan: document.getElementById('filename'),

  // Toast container
  toastContainer: document.getElementById('toast-container'),

  // Takeoff Panel
  takeoffToggle: document.getElementById('takeoff-toggle'),
  takeoffPanel: document.getElementById('takeoff-panel'),
  closeTakeoff: document.getElementById('close-takeoff'),
  memberInput: document.getElementById('member-input'),
  memberSuggestions: document.getElementById('member-suggestions'),
  lengthInput: document.getElementById('length-input'),
  qtyInput: document.getElementById('qty-input'),
  markInput: document.getElementById('mark-input'),
  addItemBtn: document.getElementById('add-item-btn'),
  takeoffItems: document.getElementById('takeoff-items'),
  emptyTakeoff: document.getElementById('empty-takeoff'),
  totalItems: document.getElementById('total-items'),
  totalLength: document.getElementById('total-length'),
  totalWeight: document.getElementById('total-weight'),
  totalTons: document.getElementById('total-tons'),
  exportCsv: document.getElementById('export-csv'),
  clearTakeoff: document.getElementById('clear-takeoff'),

  // Auto-Detect Modal
  autoDetectBtn: document.getElementById('auto-detect-btn'),
  detectModal: document.getElementById('detect-modal'),
  closeDetectModal: document.getElementById('close-detect-modal'),
  detectLoading: document.getElementById('detect-loading'),
  detectResults: document.getElementById('detect-results'),
  detectCount: document.getElementById('detect-count'),
  selectAllBtn: document.getElementById('select-all-btn'),
  detectedList: document.getElementById('detected-list'),
  detectEmpty: document.getElementById('detect-empty'),
  cancelDetect: document.getElementById('cancel-detect'),
  addSelectedBtn: document.getElementById('add-selected-btn')
};

// ===== INITIALIZATION =====
document.addEventListener('DOMContentLoaded', async () => {
  // Initialize digital rain background
  initDigitalRain();

  // Get PDF URL from query params
  const urlParams = new URLSearchParams(window.location.search);
  const fileUrl = urlParams.get('file');
  const filename = urlParams.get('name') || 'blueprint.pdf';

  if (!fileUrl) {
    showToast('No PDF file specified', 'error');
    return;
  }

  ViewerState.fileUrl = decodeURIComponent(fileUrl);
  ViewerState.filename = decodeURIComponent(filename);
  elements.filenameSpan.textContent = ViewerState.filename;

  // Set PDF.js worker path
  if (typeof pdfjsLib !== 'undefined') {
    pdfjsLib.GlobalWorkerOptions.workerSrc = chrome.runtime.getURL('src/lib/pdf.worker.min.js');
  }

  // Load the PDF
  await loadPDF(ViewerState.fileUrl);

  // Initialize event listeners
  initEventListeners();

  // Initialize annotation system
  if (typeof AnnotationManager !== 'undefined') {
    AnnotationManager.init(elements.annotationCanvas, ViewerState);
  }

  // Initialize takeoff system
  if (typeof TakeoffManager !== 'undefined') {
    await TakeoffManager.init(ViewerState.filename);
    updateTakeoffUI();
  }
});

// ===== PDF LOADING =====
async function loadPDF(url) {
  showLoading(true);

  try {
    // Check if PDF.js is loaded
    if (typeof pdfjsLib === 'undefined') {
      throw new Error('PDF.js library not loaded. Please ensure pdf.min.js is present.');
    }

    // Load the PDF document
    const loadingTask = pdfjsLib.getDocument(url);
    ViewerState.pdfDoc = await loadingTask.promise;
    ViewerState.totalPages = ViewerState.pdfDoc.numPages;

    // Update UI
    elements.totalPagesSpan.textContent = ViewerState.totalPages;
    elements.pageInput.max = ViewerState.totalPages;

    // Render first page
    await renderPage(1);

    // Generate thumbnails
    await generateThumbnails();

    // Load saved annotations for this file
    await loadAnnotations();

    showToast('Blueprint loaded successfully', 'success');
  } catch (error) {
    console.error('Error loading PDF:', error);
    showToast(`Failed to load PDF: ${error.message}`, 'error');
  } finally {
    showLoading(false);
  }
}

// ===== PAGE RENDERING =====
async function renderPage(pageNum) {
  if (!ViewerState.pdfDoc) return;

  // Cancel any ongoing render
  if (ViewerState.renderTask) {
    ViewerState.renderTask.cancel();
  }

  try {
    const page = await ViewerState.pdfDoc.getPage(pageNum);

    // Calculate viewport based on zoom level
    const baseViewport = page.getViewport({ scale: 1, rotation: ViewerState.rotation });
    let scale = ViewerState.zoom;

    // Handle special zoom modes
    const zoomValue = elements.zoomSelect.value;
    if (zoomValue === 'page-fit') {
      const containerRect = elements.viewerArea.getBoundingClientRect();
      const scaleX = (containerRect.width - 40) / baseViewport.width;
      const scaleY = (containerRect.height - 40) / baseViewport.height;
      scale = Math.min(scaleX, scaleY);
    } else if (zoomValue === 'page-width') {
      const containerRect = elements.viewerArea.getBoundingClientRect();
      scale = (containerRect.width - 40) / baseViewport.width;
    } else if (zoomValue === 'auto') {
      const containerRect = elements.viewerArea.getBoundingClientRect();
      const scaleX = (containerRect.width - 40) / baseViewport.width;
      scale = Math.min(scaleX, 1.5); // Cap at 150% for auto
    }

    ViewerState.zoom = scale;

    const viewport = page.getViewport({ scale, rotation: ViewerState.rotation });

    // Set canvas dimensions
    const canvas = elements.pdfCanvas;
    const context = canvas.getContext('2d');
    canvas.width = viewport.width;
    canvas.height = viewport.height;

    // Set annotation canvas dimensions
    elements.annotationCanvas.width = viewport.width;
    elements.annotationCanvas.height = viewport.height;

    // Render PDF page
    const renderContext = {
      canvasContext: context,
      viewport: viewport
    };

    ViewerState.renderTask = page.render(renderContext);
    await ViewerState.renderTask.promise;

    // Update state
    ViewerState.currentPage = pageNum;
    elements.pageInput.value = pageNum;

    // Update thumbnail selection
    updateThumbnailSelection(pageNum);

    // Re-render annotations for this page
    if (typeof AnnotationManager !== 'undefined') {
      AnnotationManager.renderAnnotations(pageNum);
    }

  } catch (error) {
    if (error.name !== 'RenderingCancelledException') {
      console.error('Error rendering page:', error);
    }
  }
}

// ===== THUMBNAIL GENERATION =====
async function generateThumbnails() {
  if (!ViewerState.pdfDoc) return;

  elements.thumbnails.innerHTML = '';

  for (let i = 1; i <= ViewerState.totalPages; i++) {
    const page = await ViewerState.pdfDoc.getPage(i);
    const viewport = page.getViewport({ scale: 0.2 });

    const canvas = document.createElement('canvas');
    canvas.width = viewport.width;
    canvas.height = viewport.height;

    const context = canvas.getContext('2d');
    await page.render({ canvasContext: context, viewport }).promise;

    const thumbnail = document.createElement('div');
    thumbnail.className = 'thumbnail' + (i === 1 ? ' active' : '');
    thumbnail.dataset.page = i;
    thumbnail.innerHTML = `
      <canvas></canvas>
      <span class="thumbnail-number">${i}</span>
    `;
    thumbnail.querySelector('canvas').replaceWith(canvas);

    thumbnail.addEventListener('click', () => {
      renderPage(i);
    });

    elements.thumbnails.appendChild(thumbnail);
  }
}

function updateThumbnailSelection(pageNum) {
  const thumbnails = elements.thumbnails.querySelectorAll('.thumbnail');
  thumbnails.forEach((thumb, index) => {
    thumb.classList.toggle('active', index + 1 === pageNum);
  });

  // Scroll thumbnail into view
  const activeThumb = elements.thumbnails.querySelector('.thumbnail.active');
  if (activeThumb) {
    activeThumb.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }
}

// ===== EVENT LISTENERS =====
function initEventListeners() {
  // Navigation
  elements.prevPage.addEventListener('click', () => {
    if (ViewerState.currentPage > 1) {
      renderPage(ViewerState.currentPage - 1);
    }
  });

  elements.nextPage.addEventListener('click', () => {
    if (ViewerState.currentPage < ViewerState.totalPages) {
      renderPage(ViewerState.currentPage + 1);
    }
  });

  elements.pageInput.addEventListener('change', (e) => {
    const page = parseInt(e.target.value);
    if (page >= 1 && page <= ViewerState.totalPages) {
      renderPage(page);
    } else {
      e.target.value = ViewerState.currentPage;
    }
  });

  // Zoom
  elements.zoomIn.addEventListener('click', () => {
    const currentIndex = getZoomIndex();
    const zoomLevels = [0.5, 0.75, 1, 1.25, 1.5, 2, 3, 4];
    if (currentIndex < zoomLevels.length - 1) {
      ViewerState.zoom = zoomLevels[currentIndex + 1];
      elements.zoomSelect.value = ViewerState.zoom;
      renderPage(ViewerState.currentPage);
    }
  });

  elements.zoomOut.addEventListener('click', () => {
    const currentIndex = getZoomIndex();
    const zoomLevels = [0.5, 0.75, 1, 1.25, 1.5, 2, 3, 4];
    if (currentIndex > 0) {
      ViewerState.zoom = zoomLevels[currentIndex - 1];
      elements.zoomSelect.value = ViewerState.zoom;
      renderPage(ViewerState.currentPage);
    }
  });

  elements.zoomSelect.addEventListener('change', (e) => {
    const value = e.target.value;
    if (!isNaN(parseFloat(value))) {
      ViewerState.zoom = parseFloat(value);
    }
    renderPage(ViewerState.currentPage);
  });

  // Rotation
  elements.rotateLeft.addEventListener('click', () => {
    ViewerState.rotation = (ViewerState.rotation - 90 + 360) % 360;
    renderPage(ViewerState.currentPage);
  });

  elements.rotateRight.addEventListener('click', () => {
    ViewerState.rotation = (ViewerState.rotation + 90) % 360;
    renderPage(ViewerState.currentPage);
  });

  // Extract button
  elements.extractBtn.addEventListener('click', extractTitleBlockData);

  // Download button
  elements.downloadBtn.addEventListener('click', () => {
    if (ViewerState.fileUrl) {
      const a = document.createElement('a');
      a.href = ViewerState.fileUrl;
      a.download = ViewerState.filename;
      a.click();
    }
  });

  // Print button
  elements.printBtn.addEventListener('click', () => {
    window.print();
  });

  // Close panel
  elements.closePanel.addEventListener('click', () => {
    elements.dataPanel.classList.add('hidden');
  });

  // Copy data
  elements.copyData.addEventListener('click', copyExtractedData);

  // Rename file
  elements.renameFile.addEventListener('click', renameFileFromData);

  // Toggle sidebar
  document.getElementById('toggle-sidebar').addEventListener('click', () => {
    elements.sidebar.classList.toggle('collapsed');
  });

  // Keyboard shortcuts
  document.addEventListener('keydown', handleKeyboardShortcuts);

  // Window resize
  window.addEventListener('resize', debounce(() => {
    const zoomValue = elements.zoomSelect.value;
    if (['page-fit', 'page-width', 'auto'].includes(zoomValue)) {
      renderPage(ViewerState.currentPage);
    }
  }, 200));

  // ===== TAKEOFF EVENT LISTENERS =====
  // Toggle takeoff panel
  elements.takeoffToggle?.addEventListener('click', () => {
    elements.takeoffPanel?.classList.toggle('hidden');
    elements.dataPanel?.classList.add('hidden'); // Close data panel
  });

  // Close takeoff panel
  elements.closeTakeoff?.addEventListener('click', () => {
    elements.takeoffPanel?.classList.add('hidden');
  });

  // Member input with suggestions
  elements.memberInput?.addEventListener('input', (e) => {
    const query = e.target.value.trim().toUpperCase();
    if (query.length >= 2 && typeof SteelDatabase !== 'undefined') {
      const results = SteelDatabase.searchShapes(query, 8);
      showMemberSuggestions(results);
    } else {
      hideMemberSuggestions();
    }
  });

  elements.memberInput?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      hideMemberSuggestions();
      addTakeoffItem();
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      selectNextSuggestion();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      selectPrevSuggestion();
    } else if (e.key === 'Escape') {
      hideMemberSuggestions();
    }
  });

  // Add item button
  elements.addItemBtn?.addEventListener('click', addTakeoffItem);

  // Export CSV
  elements.exportCsv?.addEventListener('click', exportTakeoffCSV);

  // Clear all
  elements.clearTakeoff?.addEventListener('click', () => {
    if (confirm('Clear all takeoff items?')) {
      if (typeof TakeoffManager !== 'undefined') {
        TakeoffManager.clearAll();
        updateTakeoffUI();
        showToast('Takeoff cleared', 'success');
      }
    }
  });

  // Close suggestions when clicking outside
  document.addEventListener('click', (e) => {
    if (!elements.memberInput?.contains(e.target) && !elements.memberSuggestions?.contains(e.target)) {
      hideMemberSuggestions();
    }
  });

  // ===== AUTO-DETECT EVENT LISTENERS =====
  // Auto-detect button
  elements.autoDetectBtn?.addEventListener('click', startAutoDetect);

  // Close detect modal
  elements.closeDetectModal?.addEventListener('click', closeDetectModal);
  elements.cancelDetect?.addEventListener('click', closeDetectModal);

  // Select all button
  elements.selectAllBtn?.addEventListener('click', toggleSelectAll);

  // Add selected members
  elements.addSelectedBtn?.addEventListener('click', addSelectedMembers);

  // Close modal on backdrop click
  elements.detectModal?.addEventListener('click', (e) => {
    if (e.target === elements.detectModal) {
      closeDetectModal();
    }
  });
}

function handleKeyboardShortcuts(e) {
  // Don't trigger shortcuts when typing in inputs
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

  switch (e.key) {
    case 'ArrowLeft':
      if (ViewerState.currentPage > 1) renderPage(ViewerState.currentPage - 1);
      break;
    case 'ArrowRight':
      if (ViewerState.currentPage < ViewerState.totalPages) renderPage(ViewerState.currentPage + 1);
      break;
    case '+':
    case '=':
      elements.zoomIn.click();
      break;
    case '-':
      elements.zoomOut.click();
      break;
    case 'v':
      document.querySelector('[data-tool="select"]')?.click();
      break;
    case 'h':
      document.querySelector('[data-tool="highlight"]')?.click();
      break;
    case 't':
      document.querySelector('[data-tool="text"]')?.click();
      break;
    case 'r':
      document.querySelector('[data-tool="rectangle"]')?.click();
      break;
    case 'a':
      document.querySelector('[data-tool="arrow"]')?.click();
      break;
  }
}

// ===== OCR EXTRACTION =====
async function extractTitleBlockData() {
  const btn = elements.extractBtn;
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span> Extracting...';

  try {
    // Check for API key
    const { googleVisionApiKey } = await chrome.storage.sync.get('googleVisionApiKey');

    if (!googleVisionApiKey) {
      showApiKeyModal();
      return;
    }

    // Render current page to high-res canvas for OCR
    const ocrCanvas = document.createElement('canvas');
    const page = await ViewerState.pdfDoc.getPage(ViewerState.currentPage);
    const viewport = page.getViewport({ scale: 2.0 }); // Higher scale for better OCR

    ocrCanvas.width = viewport.width;
    ocrCanvas.height = viewport.height;
    const ctx = ocrCanvas.getContext('2d');

    await page.render({ canvasContext: ctx, viewport }).promise;

    // Convert to base64
    const imageData = ocrCanvas.toDataURL('image/png').split(',')[1];

    // Call OCR service
    if (typeof OCRService !== 'undefined') {
      const result = await OCRService.extractTitleBlock(imageData, googleVisionApiKey);

      if (result.success) {
        ViewerState.extractedData = result.data;
        displayExtractedData(result.data);
        showToast('Title block data extracted', 'success');
      } else {
        showToast(result.error || 'Extraction failed', 'error');
      }
    } else {
      showToast('OCR service not available', 'error');
    }
  } catch (error) {
    console.error('OCR extraction error:', error);
    showToast(`Extraction failed: ${error.message}`, 'error');
  } finally {
    btn.disabled = false;
    btn.innerHTML = `
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M14 2H6a2 2 0 0 0-2 2v16c0 1.1.9 2 2 2h12a2 2 0 0 0 2-2V8l-6-6z"></path>
        <path d="M14 3v5h5"></path>
        <path d="M12 18v-6"></path>
        <path d="M9 15l3 3 3-3"></path>
      </svg>
      <span>Extract Data</span>
    `;
  }
}

function displayExtractedData(data) {
  elements.dataPanel.classList.remove('hidden');

  document.getElementById('data-project').textContent = data.projectName || '-';
  document.getElementById('data-sheet').textContent = data.sheetNumber || '-';
  document.getElementById('data-revision').textContent = data.revision || '-';
  document.getElementById('data-date').textContent = data.date || '-';
  document.getElementById('data-scale').textContent = data.scale || '-';
  document.getElementById('data-drawn-by').textContent = data.drawnBy || '-';

  const confidence = data.confidence || 0;
  document.getElementById('data-confidence').textContent = `${Math.round(confidence * 100)}%`;
  document.getElementById('confidence-fill').style.width = `${confidence * 100}%`;
}

function copyExtractedData() {
  if (!ViewerState.extractedData) {
    showToast('No extracted data to copy', 'warning');
    return;
  }

  const data = ViewerState.extractedData;
  const text = `Project: ${data.projectName || 'N/A'}
Sheet: ${data.sheetNumber || 'N/A'}
Revision: ${data.revision || 'N/A'}
Date: ${data.date || 'N/A'}
Scale: ${data.scale || 'N/A'}
Drawn By: ${data.drawnBy || 'N/A'}`;

  navigator.clipboard.writeText(text).then(() => {
    showToast('Data copied to clipboard', 'success');
  }).catch(() => {
    showToast('Failed to copy data', 'error');
  });
}

async function renameFileFromData() {
  if (!ViewerState.extractedData) {
    showToast('No extracted data for renaming', 'warning');
    return;
  }

  const data = ViewerState.extractedData;
  const { namingPattern } = await chrome.storage.sync.get({ namingPattern: '{project}_{sheet}_{rev}' });

  let newName = namingPattern
    .replace('{project}', sanitizeFilename(data.projectName || 'Unknown'))
    .replace('{sheet}', sanitizeFilename(data.sheetNumber || 'Sheet'))
    .replace('{rev}', sanitizeFilename(data.revision || 'Rev0'))
    .replace('{date}', sanitizeFilename(data.date || ''))
    .replace('{scale}', sanitizeFilename(data.scale || ''));

  // Clean up multiple underscores and trim
  newName = newName.replace(/_+/g, '_').replace(/^_|_$/g, '') + '.pdf';

  // Send message to download with new name
  chrome.runtime.sendMessage({
    action: 'downloadFile',
    url: ViewerState.fileUrl,
    filename: newName
  }, (response) => {
    if (response?.success) {
      showToast(`File saved as: ${newName}`, 'success');
    } else {
      showToast('Failed to save file', 'error');
    }
  });
}

// ===== ANNOTATIONS PERSISTENCE =====
async function loadAnnotations() {
  const fileHash = await hashString(ViewerState.fileUrl);
  const key = `blueprint_annotations_${fileHash}`;

  const data = await chrome.storage.local.get(key);
  if (data[key] && typeof AnnotationManager !== 'undefined') {
    AnnotationManager.loadAnnotations(data[key]);
  }
}

async function saveAnnotations() {
  if (typeof AnnotationManager === 'undefined') return;

  const fileHash = await hashString(ViewerState.fileUrl);
  const key = `blueprint_annotations_${fileHash}`;
  const annotations = AnnotationManager.getAnnotations();

  await chrome.storage.local.set({ [key]: annotations });
  showToast('Annotations saved', 'success');
}

// ===== API KEY MODAL =====
function showApiKeyModal() {
  const modal = document.getElementById('api-key-modal');
  modal.classList.remove('hidden');

  document.getElementById('close-api-modal').onclick = () => {
    modal.classList.add('hidden');
  };

  document.getElementById('cancel-api-key').onclick = () => {
    modal.classList.add('hidden');
  };

  document.getElementById('save-api-key').onclick = async () => {
    const apiKey = document.getElementById('api-key-input').value.trim();
    if (apiKey) {
      await chrome.storage.sync.set({ googleVisionApiKey: apiKey });
      modal.classList.add('hidden');
      showToast('API key saved', 'success');
      extractTitleBlockData(); // Retry extraction
    } else {
      showToast('Please enter a valid API key', 'warning');
    }
  };
}

// ===== UTILITY FUNCTIONS =====
function showLoading(show) {
  elements.loadingOverlay.classList.toggle('hidden', !show);
}

function showToast(message, type = 'info') {
  const icons = { success: '\u2713', error: '\u2717', warning: '\u26A0', info: '\u2139' };

  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.innerHTML = `
    <span class="toast-icon">${icons[type]}</span>
    <span class="toast-message">${message}</span>
    <button class="toast-close">&times;</button>
  `;

  toast.querySelector('.toast-close').onclick = () => dismissToast(toast);
  elements.toastContainer.appendChild(toast);

  setTimeout(() => dismissToast(toast), 4000);
}

function dismissToast(toast) {
  if (!toast.parentElement) return;
  toast.classList.add('toast-exit');
  setTimeout(() => toast.remove(), 300);
}

function getZoomIndex() {
  const zoomLevels = [0.5, 0.75, 1, 1.25, 1.5, 2, 3, 4];
  const currentZoom = ViewerState.zoom;

  for (let i = 0; i < zoomLevels.length; i++) {
    if (Math.abs(zoomLevels[i] - currentZoom) < 0.01) return i;
  }
  return 2; // Default to 100%
}

function sanitizeFilename(name) {
  if (!name) return '';
  return name
    .replace(/[<>:"/\\|?*]/g, '')
    .replace(/\s+/g, '_')
    .substring(0, 50);
}

async function hashString(str) {
  const encoder = new TextEncoder();
  const data = encoder.encode(str);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('').substring(0, 16);
}

function debounce(func, wait) {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

// ===== DIGITAL RAIN ANIMATION =====
function initDigitalRain() {
  const canvas = document.getElementById('digital-rain');
  if (!canvas) return;

  const ctx = canvas.getContext('2d');

  function resizeCanvas() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
  }
  resizeCanvas();
  window.addEventListener('resize', resizeCanvas);

  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789@#$%&';
  const charArray = chars.split('');
  const fontSize = 14;
  const columns = Math.floor(canvas.width / fontSize);
  const drops = [];

  for (let i = 0; i < columns; i++) {
    drops[i] = Math.random() * -100;
  }

  function draw() {
    ctx.fillStyle = 'rgba(10, 10, 10, 0.05)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = 'rgba(0, 255, 0, 0.15)';
    ctx.font = `${fontSize}px monospace`;

    for (let i = 0; i < drops.length; i++) {
      const char = charArray[Math.floor(Math.random() * charArray.length)];
      ctx.fillText(char, i * fontSize, drops[i] * fontSize);

      if (drops[i] * fontSize > canvas.height && Math.random() > 0.975) {
        drops[i] = 0;
      }
      drops[i]++;
    }
  }

  setInterval(draw, 50);
}

// Export for annotation save button
document.getElementById('save-annotations')?.addEventListener('click', saveAnnotations);

// ===== STEEL TAKEOFF FUNCTIONS =====
function showMemberSuggestions(results) {
  if (!elements.memberSuggestions || results.length === 0) {
    hideMemberSuggestions();
    return;
  }

  elements.memberSuggestions.innerHTML = results.map((item, index) => `
    <div class="suggestion-item${index === 0 ? ' active' : ''}" data-shape="${item.shape}" data-weight="${item.weight}">
      <span>${item.shape}</span>
      <span class="weight">${item.weight} lbs/ft</span>
    </div>
  `).join('');

  elements.memberSuggestions.classList.remove('hidden');

  // Add click handlers
  elements.memberSuggestions.querySelectorAll('.suggestion-item').forEach(item => {
    item.addEventListener('click', () => {
      elements.memberInput.value = item.dataset.shape;
      hideMemberSuggestions();
      elements.lengthInput?.focus();
    });
  });
}

function hideMemberSuggestions() {
  elements.memberSuggestions?.classList.add('hidden');
}

function selectNextSuggestion() {
  const items = elements.memberSuggestions?.querySelectorAll('.suggestion-item');
  if (!items || items.length === 0) return;

  const active = elements.memberSuggestions.querySelector('.suggestion-item.active');
  if (active) {
    active.classList.remove('active');
    const next = active.nextElementSibling || items[0];
    next.classList.add('active');
    elements.memberInput.value = next.dataset.shape;
  }
}

function selectPrevSuggestion() {
  const items = elements.memberSuggestions?.querySelectorAll('.suggestion-item');
  if (!items || items.length === 0) return;

  const active = elements.memberSuggestions.querySelector('.suggestion-item.active');
  if (active) {
    active.classList.remove('active');
    const prev = active.previousElementSibling || items[items.length - 1];
    prev.classList.add('active');
    elements.memberInput.value = prev.dataset.shape;
  }
}

function addTakeoffItem() {
  if (typeof TakeoffManager === 'undefined') {
    showToast('Takeoff system not loaded', 'error');
    return;
  }

  const member = elements.memberInput?.value.trim().toUpperCase();
  const length = elements.lengthInput?.value.trim();
  const qty = parseInt(elements.qtyInput?.value) || 1;
  const mark = elements.markInput?.value.trim();

  if (!member) {
    showToast('Please enter a steel member', 'warning');
    elements.memberInput?.focus();
    return;
  }

  if (!length) {
    showToast('Please enter a length', 'warning');
    elements.lengthInput?.focus();
    return;
  }

  // Validate member with steel database
  if (typeof SteelDatabase !== 'undefined') {
    const parsed = SteelDatabase.parseMember(member);
    if (!parsed.valid) {
      showToast(`Unknown member: ${member}. Adding anyway.`, 'warning');
    }
  }

  const result = TakeoffManager.addItem({
    member,
    length,
    quantity: qty,
    mark: mark || undefined,
    page: ViewerState.currentPage
  });

  if (result.success) {
    // Clear inputs
    elements.memberInput.value = '';
    elements.lengthInput.value = '';
    elements.qtyInput.value = '1';
    elements.markInput.value = '';
    elements.memberInput.focus();

    updateTakeoffUI();
    showToast(`Added: ${member} x${qty}`, 'success');
  } else {
    showToast(result.error || 'Failed to add item', 'error');
  }
}

function updateTakeoffUI() {
  if (typeof TakeoffManager === 'undefined') return;

  const items = TakeoffManager.getItems();
  const summary = TakeoffManager.getSummary();

  // Update items list
  if (items.length === 0) {
    elements.emptyTakeoff?.classList.remove('hidden');
    elements.takeoffItems.innerHTML = '';
    elements.takeoffItems?.appendChild(elements.emptyTakeoff);
  } else {
    elements.emptyTakeoff?.classList.add('hidden');
    elements.takeoffItems.innerHTML = items.map(item => `
      <div class="takeoff-item" data-id="${item.id}">
        <div class="member">
          ${item.member}
          ${item.mark ? `<span class="mark">${item.mark}</span>` : ''}
        </div>
        <div class="length">${item.lengthDisplay || item.length}</div>
        <div class="qty">${item.quantity}</div>
        <div class="weight">${formatNumber(item.totalWeight)} lbs</div>
        <button class="delete-btn" data-id="${item.id}" title="Remove">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <line x1="18" y1="6" x2="6" y2="18"></line>
            <line x1="6" y1="6" x2="18" y2="18"></line>
          </svg>
        </button>
      </div>
    `).join('');

    // Add delete handlers
    elements.takeoffItems?.querySelectorAll('.delete-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const id = e.currentTarget.dataset.id;
        TakeoffManager.removeItem(id);
        updateTakeoffUI();
        showToast('Item removed', 'success');
      });
    });
  }

  // Update totals
  elements.totalItems.textContent = summary.totalItems;
  elements.totalLength.textContent = `${formatNumber(summary.totalLengthFeet)} ft`;
  elements.totalWeight.textContent = `${formatNumber(summary.totalWeight)} lbs`;
  elements.totalTons.textContent = `${summary.totalTons.toFixed(2)} tons`;
}

function exportTakeoffCSV() {
  if (typeof TakeoffManager === 'undefined') {
    showToast('Takeoff system not loaded', 'error');
    return;
  }

  const items = TakeoffManager.getItems();
  if (items.length === 0) {
    showToast('No items to export', 'warning');
    return;
  }

  const csv = TakeoffManager.exportToCSV();
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);

  const filename = ViewerState.filename.replace(/\.pdf$/i, '') + '_takeoff.csv';
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();

  URL.revokeObjectURL(url);
  showToast(`Exported: ${filename}`, 'success');
}

function formatNumber(num) {
  if (num === undefined || num === null) return '0';
  return Math.round(num).toLocaleString();
}

// ===== AUTO-DETECT FUNCTIONS =====
let detectedMembersCache = [];

async function startAutoDetect() {
  // Check for API key
  const { googleVisionApiKey } = await chrome.storage.sync.get('googleVisionApiKey');

  if (!googleVisionApiKey) {
    showApiKeyModal();
    return;
  }

  // Show modal with loading state
  elements.detectModal?.classList.remove('hidden');
  elements.detectLoading?.classList.remove('hidden');
  elements.detectResults?.classList.add('hidden');
  elements.detectEmpty?.classList.add('hidden');

  try {
    if (typeof MemberDetector === 'undefined') {
      throw new Error('Member detector not loaded');
    }

    // Run detection on current page
    const result = await MemberDetector.detectMembers(
      ViewerState.pdfDoc,
      ViewerState.currentPage,
      googleVisionApiKey,
      2.5  // High resolution for better OCR
    );

    detectedMembersCache = result.members;

    // Show results
    displayDetectedMembers(result.members);

  } catch (error) {
    console.error('Auto-detect error:', error);
    showToast(`Detection failed: ${error.message}`, 'error');
    closeDetectModal();
  }
}

function displayDetectedMembers(members) {
  elements.detectLoading?.classList.add('hidden');
  elements.detectResults?.classList.remove('hidden');

  if (members.length === 0) {
    elements.detectEmpty?.classList.remove('hidden');
    elements.detectedList.innerHTML = '';
    elements.detectCount.textContent = '0 members found';
    elements.addSelectedBtn.disabled = true;
    return;
  }

  elements.detectEmpty?.classList.add('hidden');
  elements.detectCount.textContent = `${members.length} member${members.length === 1 ? '' : 's'} found`;

  // Render detected members
  elements.detectedList.innerHTML = members.map((member, index) => `
    <div class="detected-item${member.isValid ? '' : ' invalid'}" data-index="${index}">
      <input type="checkbox" id="member-${index}" ${member.isValid ? 'checked' : ''}>
      <div class="member-info">
        <span class="member-name">${member.normalized}</span>
        <span class="member-details">
          ${member.type}${member.isValid ? '' : ' (not in database)'}
        </span>
      </div>
      ${member.weight ? `<span class="member-weight">${member.weight} lbs/ft</span>` : ''}
      ${member.context ? `<span class="member-context" title="${member.context}">${member.context}</span>` : ''}
    </div>
  `).join('');

  // Add click handlers for items
  elements.detectedList.querySelectorAll('.detected-item').forEach(item => {
    item.addEventListener('click', (e) => {
      if (e.target.type !== 'checkbox') {
        const checkbox = item.querySelector('input[type="checkbox"]');
        checkbox.checked = !checkbox.checked;
      }
      item.classList.toggle('selected', item.querySelector('input').checked);
      updateAddSelectedButton();

      // Highlight on canvas if position available
      const index = parseInt(item.dataset.index);
      highlightMemberOnCanvas(detectedMembersCache[index]);
    });
  });

  // Initial selection state
  elements.detectedList.querySelectorAll('.detected-item').forEach(item => {
    const checkbox = item.querySelector('input[type="checkbox"]');
    item.classList.toggle('selected', checkbox.checked);
  });

  updateAddSelectedButton();
}

function updateAddSelectedButton() {
  const selectedCount = elements.detectedList?.querySelectorAll('input[type="checkbox"]:checked').length || 0;
  elements.addSelectedBtn.disabled = selectedCount === 0;
  elements.addSelectedBtn.innerHTML = `
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <line x1="12" y1="5" x2="12" y2="19"></line>
      <line x1="5" y1="12" x2="19" y2="12"></line>
    </svg>
    Add Selected (${selectedCount})
  `;
}

function toggleSelectAll() {
  const checkboxes = elements.detectedList?.querySelectorAll('input[type="checkbox"]');
  if (!checkboxes) return;

  const allChecked = Array.from(checkboxes).every(cb => cb.checked);
  const newState = !allChecked;

  checkboxes.forEach(cb => {
    cb.checked = newState;
    cb.closest('.detected-item')?.classList.toggle('selected', newState);
  });

  elements.selectAllBtn.textContent = newState ? 'Deselect All' : 'Select All';
  updateAddSelectedButton();
}

function addSelectedMembers() {
  if (typeof TakeoffManager === 'undefined') {
    showToast('Takeoff system not loaded', 'error');
    return;
  }

  const selectedIndices = [];
  elements.detectedList?.querySelectorAll('input[type="checkbox"]:checked').forEach(cb => {
    const item = cb.closest('.detected-item');
    if (item) {
      selectedIndices.push(parseInt(item.dataset.index));
    }
  });

  let addedCount = 0;
  selectedIndices.forEach(index => {
    const member = detectedMembersCache[index];
    if (member) {
      const result = TakeoffManager.addItem({
        member: member.normalized,
        length: '',  // User will need to enter length
        quantity: 1,
        page: ViewerState.currentPage
      });
      if (result.success) {
        addedCount++;
      }
    }
  });

  if (addedCount > 0) {
    updateTakeoffUI();
    showToast(`Added ${addedCount} member${addedCount === 1 ? '' : 's'} to takeoff`, 'success');

    // Open takeoff panel if not already open
    elements.takeoffPanel?.classList.remove('hidden');
  }

  closeDetectModal();
}

function closeDetectModal() {
  elements.detectModal?.classList.add('hidden');
  clearHighlights();
}

function highlightMemberOnCanvas(member) {
  clearHighlights();

  if (!member?.position) return;

  const pos = member.position;
  const container = elements.pdfContainer;
  if (!container) return;

  // Create highlight element
  const highlight = document.createElement('div');
  highlight.className = 'member-highlight';
  highlight.style.left = `${pos.x * ViewerState.zoom}px`;
  highlight.style.top = `${pos.y * ViewerState.zoom}px`;
  highlight.style.width = `${Math.max(pos.width * ViewerState.zoom, 50)}px`;
  highlight.style.height = `${Math.max(pos.height * ViewerState.zoom, 20)}px`;

  container.appendChild(highlight);

  // Auto-remove after 3 seconds
  setTimeout(() => highlight.remove(), 3000);
}

function clearHighlights() {
  document.querySelectorAll('.member-highlight').forEach(el => el.remove());
}
