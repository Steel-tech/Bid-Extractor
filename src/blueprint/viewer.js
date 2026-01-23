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
  toastContainer: document.getElementById('toast-container')
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
