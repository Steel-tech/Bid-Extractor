// @ts-nocheck
/**
 * Annotation Manager - Canvas-based PDF annotations
 * Bid Extractor v1.4.0
 *
 * Handles drawing, saving, and rendering annotations on blueprints
 */

const AnnotationManager = (() => {
  // State
  let canvas = null;
  let ctx = null;
  let viewerState = null;
  let annotations = [];
  let currentTool = 'select';
  let currentColor = '#FFFF00';
  let isDrawing = false;
  let startPoint = null;
  let currentAnnotation = null;
  let selectedAnnotation = null;

  // Tool buttons
  const toolButtons = {};

  /**
   * Initialize the annotation manager
   * @param {HTMLCanvasElement} annotationCanvas - The annotation canvas element
   * @param {object} state - Reference to viewer state
   */
  function init(annotationCanvas, state) {
    canvas = annotationCanvas;
    ctx = canvas.getContext('2d');
    viewerState = state;

    // Set up tool buttons
    document.querySelectorAll('[data-tool]').forEach(btn => {
      const tool = btn.dataset.tool;
      toolButtons[tool] = btn;
      btn.addEventListener('click', () => setTool(tool));
    });

    // Color picker
    const colorPicker = document.getElementById('annotation-color');
    if (colorPicker) {
      colorPicker.addEventListener('change', (e) => {
        currentColor = e.target.value;
      });
    }

    // Canvas event listeners
    canvas.addEventListener('mousedown', handleMouseDown);
    canvas.addEventListener('mousemove', handleMouseMove);
    canvas.addEventListener('mouseup', handleMouseUp);
    canvas.addEventListener('mouseleave', handleMouseUp);

    // Text modal handlers
    setupTextModal();

    // Export button
    document.getElementById('export-pdf')?.addEventListener('click', exportAnnotatedPDF);
  }

  /**
   * Set the current drawing tool
   * @param {string} tool - Tool name
   */
  function setTool(tool) {
    currentTool = tool;

    // Update UI
    Object.values(toolButtons).forEach(btn => btn.classList.remove('active'));
    if (toolButtons[tool]) {
      toolButtons[tool].classList.add('active');
    }

    // Toggle canvas pointer events
    if (tool === 'select') {
      canvas.classList.remove('active');
    } else {
      canvas.classList.add('active');
    }

    // Update cursor
    const cursors = {
      select: 'default',
      highlight: 'crosshair',
      text: 'text',
      rectangle: 'crosshair',
      arrow: 'crosshair'
    };
    canvas.style.cursor = cursors[tool] || 'crosshair';
  }

  /**
   * Handle mouse down on canvas
   */
  function handleMouseDown(e) {
    if (currentTool === 'select') {
      handleSelect(e);
      return;
    }

    isDrawing = true;
    const rect = canvas.getBoundingClientRect();
    startPoint = {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top
    };

    if (currentTool === 'text') {
      showTextModal(startPoint);
      isDrawing = false;
      return;
    }

    currentAnnotation = {
      id: generateId(),
      type: currentTool,
      page: viewerState.currentPage,
      coordinates: { x: startPoint.x, y: startPoint.y },
      color: currentColor,
      createdAt: new Date().toISOString()
    };
  }

  /**
   * Handle mouse move on canvas
   */
  function handleMouseMove(e) {
    if (!isDrawing || !currentAnnotation) return;

    const rect = canvas.getBoundingClientRect();
    const currentPoint = {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top
    };

    // Update annotation dimensions
    currentAnnotation.coordinates.width = currentPoint.x - startPoint.x;
    currentAnnotation.coordinates.height = currentPoint.y - startPoint.y;

    if (currentTool === 'arrow') {
      currentAnnotation.coordinates.endX = currentPoint.x;
      currentAnnotation.coordinates.endY = currentPoint.y;
    }

    // Re-render with preview
    renderAnnotations(viewerState.currentPage, currentAnnotation);
  }

  /**
   * Handle mouse up on canvas
   */
  function handleMouseUp() {
    if (!isDrawing || !currentAnnotation) {
      isDrawing = false;
      return;
    }

    isDrawing = false;

    // Validate minimum size
    const coords = currentAnnotation.coordinates;
    const minSize = 10;

    if (currentTool === 'arrow') {
      const length = Math.sqrt(
        Math.pow(coords.endX - coords.x, 2) +
        Math.pow(coords.endY - coords.y, 2)
      );
      if (length < minSize) {
        currentAnnotation = null;
        renderAnnotations(viewerState.currentPage);
        return;
      }
    } else if (Math.abs(coords.width || 0) < minSize || Math.abs(coords.height || 0) < minSize) {
      currentAnnotation = null;
      renderAnnotations(viewerState.currentPage);
      return;
    }

    // Add to annotations
    annotations.push(currentAnnotation);
    currentAnnotation = null;

    // Re-render
    renderAnnotations(viewerState.currentPage);
  }

  /**
   * Handle selection mode
   */
  function handleSelect(e) {
    const rect = canvas.getBoundingClientRect();
    const point = {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top
    };

    // Find annotation at click point
    const clicked = annotations.find(ann => {
      if (ann.page !== viewerState.currentPage) return false;
      return isPointInAnnotation(point, ann);
    });

    selectedAnnotation = clicked || null;
    renderAnnotations(viewerState.currentPage);

    // Show delete option if selected
    if (selectedAnnotation) {
      showAnnotationContextMenu(e, selectedAnnotation);
    }
  }

  /**
   * Check if point is within annotation bounds
   */
  function isPointInAnnotation(point, annotation) {
    const c = annotation.coordinates;

    if (annotation.type === 'arrow') {
      // Check if point is near the arrow line
      const dist = pointToLineDistance(point, c.x, c.y, c.endX, c.endY);
      return dist < 10;
    }

    // Rectangle-based annotations
    const x = Math.min(c.x, c.x + (c.width || 0));
    const y = Math.min(c.y, c.y + (c.height || 0));
    const w = Math.abs(c.width || 0);
    const h = Math.abs(c.height || 0);

    return point.x >= x && point.x <= x + w &&
           point.y >= y && point.y <= y + h;
  }

  /**
   * Calculate distance from point to line segment
   */
  function pointToLineDistance(point, x1, y1, x2, y2) {
    const A = point.x - x1;
    const B = point.y - y1;
    const C = x2 - x1;
    const D = y2 - y1;

    const dot = A * C + B * D;
    const lenSq = C * C + D * D;
    let param = -1;

    if (lenSq !== 0) param = dot / lenSq;

    let xx, yy;

    if (param < 0) {
      xx = x1;
      yy = y1;
    } else if (param > 1) {
      xx = x2;
      yy = y2;
    } else {
      xx = x1 + param * C;
      yy = y1 + param * D;
    }

    const dx = point.x - xx;
    const dy = point.y - yy;
    return Math.sqrt(dx * dx + dy * dy);
  }

  /**
   * Show context menu for annotation
   */
  function showAnnotationContextMenu(e, annotation) {
    // Remove existing menu
    document.querySelector('.annotation-context-menu')?.remove();

    const menu = document.createElement('div');
    menu.className = 'annotation-context-menu';
    menu.style.cssText = `
      position: fixed;
      left: ${e.clientX}px;
      top: ${e.clientY}px;
      background: #1a1a1a;
      border: 1px solid rgba(0,255,0,0.3);
      border-radius: 6px;
      padding: 4px;
      z-index: 1000;
      box-shadow: 0 4px 12px rgba(0,0,0,0.5);
    `;

    const deleteBtn = document.createElement('button');
    deleteBtn.textContent = 'Delete';
    deleteBtn.style.cssText = `
      display: block;
      width: 100%;
      padding: 8px 16px;
      border: none;
      background: transparent;
      color: #ff4040;
      font-size: 12px;
      cursor: pointer;
      text-align: left;
    `;
    deleteBtn.onmouseover = () => deleteBtn.style.background = 'rgba(255,0,0,0.1)';
    deleteBtn.onmouseout = () => deleteBtn.style.background = 'transparent';
    deleteBtn.onclick = () => {
      deleteAnnotation(annotation.id);
      menu.remove();
    };

    menu.appendChild(deleteBtn);
    document.body.appendChild(menu);

    // Close on click outside
    const closeMenu = (ev) => {
      if (!menu.contains(ev.target)) {
        menu.remove();
        document.removeEventListener('click', closeMenu);
      }
    };
    setTimeout(() => document.addEventListener('click', closeMenu), 0);
  }

  /**
   * Delete annotation by ID
   */
  function deleteAnnotation(id) {
    annotations = annotations.filter(a => a.id !== id);
    selectedAnnotation = null;
    renderAnnotations(viewerState.currentPage);
  }

  /**
   * Set up text note modal
   */
  function setupTextModal() {
    const modal = document.getElementById('text-modal');
    const noteText = document.getElementById('note-text');
    let pendingPoint = null;

    window.showTextModal = (point) => {
      pendingPoint = point;
      modal.classList.remove('hidden');
      noteText.value = '';
      noteText.focus();
    };

    document.getElementById('close-text-modal')?.addEventListener('click', () => {
      modal.classList.add('hidden');
    });

    document.getElementById('cancel-note')?.addEventListener('click', () => {
      modal.classList.add('hidden');
    });

    document.getElementById('save-note')?.addEventListener('click', () => {
      const text = noteText.value.trim();
      if (text && pendingPoint) {
        const annotation = {
          id: generateId(),
          type: 'text',
          page: viewerState.currentPage,
          coordinates: { x: pendingPoint.x, y: pendingPoint.y },
          content: text,
          color: currentColor,
          createdAt: new Date().toISOString()
        };
        annotations.push(annotation);
        renderAnnotations(viewerState.currentPage);
      }
      modal.classList.add('hidden');
    });
  }

  /**
   * Render all annotations for a page
   * @param {number} pageNum - Page number
   * @param {object} preview - Optional preview annotation being drawn
   */
  function renderAnnotations(pageNum, preview = null) {
    if (!ctx || !canvas) return;

    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Get annotations for current page
    const pageAnnotations = annotations.filter(a => a.page === pageNum);

    // Render each annotation
    pageAnnotations.forEach(ann => {
      renderAnnotation(ann, ann === selectedAnnotation);
    });

    // Render preview if drawing
    if (preview) {
      renderAnnotation(preview, false, true);
    }
  }

  /**
   * Render a single annotation
   */
  function renderAnnotation(annotation, isSelected = false, isPreview = false) {
    const c = annotation.coordinates;
    ctx.save();

    // Set style
    ctx.strokeStyle = annotation.color;
    ctx.fillStyle = annotation.color;
    ctx.lineWidth = isSelected ? 3 : 2;

    if (isPreview) {
      ctx.globalAlpha = 0.6;
      ctx.setLineDash([5, 5]);
    }

    switch (annotation.type) {
      case 'highlight':
        ctx.globalAlpha = isPreview ? 0.3 : 0.25;
        ctx.fillRect(c.x, c.y, c.width || 0, c.height || 0);
        break;

      case 'rectangle':
        ctx.strokeRect(c.x, c.y, c.width || 0, c.height || 0);
        break;

      case 'arrow':
        drawArrow(ctx, c.x, c.y, c.endX, c.endY);
        break;

      case 'text':
        drawTextNote(ctx, c.x, c.y, annotation.content, annotation.color);
        break;
    }

    // Draw selection handles
    if (isSelected && annotation.type !== 'text') {
      ctx.fillStyle = '#00ff00';
      ctx.setLineDash([]);
      const handles = getSelectionHandles(annotation);
      handles.forEach(h => {
        ctx.fillRect(h.x - 4, h.y - 4, 8, 8);
      });
    }

    ctx.restore();
  }

  /**
   * Draw an arrow
   */
  function drawArrow(ctx, fromX, fromY, toX, toY) {
    const headLen = 15;
    const angle = Math.atan2(toY - fromY, toX - fromX);

    // Line
    ctx.beginPath();
    ctx.moveTo(fromX, fromY);
    ctx.lineTo(toX, toY);
    ctx.stroke();

    // Arrowhead
    ctx.beginPath();
    ctx.moveTo(toX, toY);
    ctx.lineTo(
      toX - headLen * Math.cos(angle - Math.PI / 6),
      toY - headLen * Math.sin(angle - Math.PI / 6)
    );
    ctx.lineTo(
      toX - headLen * Math.cos(angle + Math.PI / 6),
      toY - headLen * Math.sin(angle + Math.PI / 6)
    );
    ctx.closePath();
    ctx.fill();
  }

  /**
   * Draw a text note marker
   */
  function drawTextNote(ctx, x, y, content, color) {
    // Draw marker
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(x, y, 12, 0, Math.PI * 2);
    ctx.fill();

    // Draw "T" icon
    ctx.fillStyle = '#000';
    ctx.font = 'bold 14px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('T', x, y);

    // Draw text background and content
    if (content) {
      const maxWidth = 200;
      const padding = 8;
      ctx.font = '12px Arial';

      // Measure text
      const lines = wrapText(ctx, content, maxWidth - padding * 2);
      const textHeight = lines.length * 16;

      // Background
      ctx.fillStyle = 'rgba(26, 26, 26, 0.95)';
      ctx.strokeStyle = color;
      ctx.lineWidth = 1;

      const boxX = x + 15;
      const boxY = y - 10;
      const boxWidth = Math.min(maxWidth, Math.max(...lines.map(l => ctx.measureText(l).width)) + padding * 2);
      const boxHeight = textHeight + padding * 2;

      ctx.beginPath();
      ctx.roundRect(boxX, boxY, boxWidth, boxHeight, 4);
      ctx.fill();
      ctx.stroke();

      // Text
      ctx.fillStyle = '#e0e0e0';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      lines.forEach((line, i) => {
        ctx.fillText(line, boxX + padding, boxY + padding + i * 16);
      });
    }
  }

  /**
   * Wrap text to fit width
   */
  function wrapText(ctx, text, maxWidth) {
    const words = text.split(' ');
    const lines = [];
    let currentLine = '';

    words.forEach(word => {
      const testLine = currentLine ? `${currentLine} ${word}` : word;
      if (ctx.measureText(testLine).width > maxWidth) {
        if (currentLine) lines.push(currentLine);
        currentLine = word;
      } else {
        currentLine = testLine;
      }
    });
    if (currentLine) lines.push(currentLine);

    return lines;
  }

  /**
   * Get selection handles for an annotation
   */
  function getSelectionHandles(annotation) {
    const c = annotation.coordinates;

    if (annotation.type === 'arrow') {
      return [
        { x: c.x, y: c.y },
        { x: c.endX, y: c.endY }
      ];
    }

    const x = Math.min(c.x, c.x + (c.width || 0));
    const y = Math.min(c.y, c.y + (c.height || 0));
    const w = Math.abs(c.width || 0);
    const h = Math.abs(c.height || 0);

    return [
      { x, y },
      { x: x + w, y },
      { x: x + w, y: y + h },
      { x, y: y + h }
    ];
  }

  /**
   * Generate unique ID
   */
  function generateId() {
    return 'ann_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
  }

  /**
   * Load annotations from storage data
   */
  function loadAnnotations(data) {
    annotations = Array.isArray(data) ? data : [];
    if (viewerState) {
      renderAnnotations(viewerState.currentPage);
    }
  }

  /**
   * Get all annotations
   */
  function getAnnotations() {
    return annotations;
  }

  /**
   * Export PDF with annotations burned in
   */
  async function exportAnnotatedPDF() {
    // This would require pdf-lib library
    // For now, show a message
    if (typeof showToast === 'function') {
      showToast('PDF export requires pdf-lib library', 'warning');
    }

    // TODO: Implement with pdf-lib when added
    // const pdfDoc = await PDFLib.PDFDocument.load(...)
    // Draw annotations onto pages
    // Save and download
  }

  // Public API
  return {
    init,
    setTool,
    renderAnnotations,
    loadAnnotations,
    getAnnotations,
    deleteAnnotation
  };
})();

// Export for use in other modules
if (typeof window !== 'undefined') {
  window.AnnotationManager = AnnotationManager;
}
