// @ts-nocheck
// Popup UI Utilities for Bid Extractor
// Toast notifications, button states, digital rain animation, counter animation

(function() {
  'use strict';

  if (window.PopupUI) return;

  // ===== TOAST NOTIFICATIONS =====

  /**
   * Show a toast notification
   * @param {string} message
   * @param {'success' | 'error' | 'warning' | 'info'} type
   * @param {number} duration - Duration in ms (0 for persistent)
   * @returns {HTMLElement|null}
   */
  function showToast(message, type, duration) {
    const container = document.getElementById('toast-container');
    if (!container) return null;

    type = type || 'info';
    duration = duration !== undefined ? duration : 3000;

    const toast = document.createElement('div');
    toast.className = 'toast toast-' + type;

    const icons = { success: '✓', error: '✗', warning: '⚠', info: 'ℹ' };

    toast.innerHTML =
      '<span class="toast-icon">' + (icons[type] || icons.info) + '</span>' +
      '<span class="toast-message">' + message + '</span>' +
      '<button class="toast-close" aria-label="Close">×</button>';

    toast.querySelector('.toast-close').addEventListener('click', function() {
      dismissToast(toast);
    });

    container.appendChild(toast);

    if (duration > 0) {
      setTimeout(function() { dismissToast(toast); }, duration);
    }

    return toast;
  }

  /**
   * Dismiss a toast with animation
   * @param {HTMLElement} toast
   */
  function dismissToast(toast) {
    if (!toast || !toast.parentElement) return;
    toast.classList.add('toast-exit');
    setTimeout(function() { toast.remove(); }, 300);
  }

  /**
   * Clear all toasts
   */
  function clearAllToasts() {
    var container = document.getElementById('toast-container');
    if (!container) return;
    container.querySelectorAll('.toast').forEach(function(toast) {
      dismissToast(toast);
    });
  }

  // ===== BUTTON LOADING STATE =====

  /**
   * Set button to loading state
   * @param {HTMLElement} button
   */
  function setButtonLoading(button) {
    if (!button) return;
    button.classList.add('loading');
    button.disabled = true;
  }

  /**
   * Remove button loading state
   * @param {HTMLElement} button
   */
  function clearButtonLoading(button) {
    if (!button) return;
    button.classList.remove('loading');
    button.disabled = false;
  }

  /**
   * Flash button to indicate success
   * @param {HTMLElement} button
   */
  function flashButtonSuccess(button) {
    if (!button) return;
    button.classList.add('pulse');
    setTimeout(function() { button.classList.remove('pulse'); }, 600);
  }

  // ===== DIGITAL RAIN ANIMATION =====

  function initDigitalRain() {
    var canvas = document.getElementById('digital-rain');
    if (!canvas) return;

    var ctx = canvas.getContext('2d');

    function resizeCanvas() {
      canvas.width = canvas.parentElement.offsetWidth;
      canvas.height = canvas.parentElement.offsetHeight;
    }
    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);

    var chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789@#$%&アイウエオカキクケコサシスセソ';
    var charArray = chars.split('');

    var fontSize = 14;
    var columns = Math.floor(canvas.width / fontSize);

    var drops = [];
    for (var i = 0; i < columns; i++) {
      drops[i] = Math.random() * -100;
    }

    function draw() {
      ctx.fillStyle = 'rgba(10, 10, 10, 0.05)';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      ctx.fillStyle = 'rgba(0, 255, 0, 0.15)';
      ctx.font = fontSize + 'px JetBrains Mono, monospace';

      for (var i = 0; i < drops.length; i++) {
        var char = charArray[Math.floor(Math.random() * charArray.length)];
        ctx.fillText(char, i * fontSize, drops[i] * fontSize);

        if (drops[i] * fontSize > canvas.height && Math.random() > 0.975) {
          drops[i] = 0;
        }
        drops[i]++;
      }
    }

    setInterval(draw, 50);
  }

  // ===== COUNTER ANIMATION =====

  /**
   * Animate a counter from current to target value
   * @param {string} elementId
   * @param {number} targetValue
   */
  function animateCounter(elementId, targetValue) {
    var element = document.getElementById(elementId);
    if (!element) return;

    var currentValue = parseInt(element.textContent) || 0;
    var diff = targetValue - currentValue;

    if (diff === 0) return;

    var duration = 500;
    var steps = 20;
    var stepValue = diff / steps;
    var stepDuration = duration / steps;

    var current = currentValue;
    var step = 0;

    var timer = setInterval(function() {
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

  // ===== HTML ESCAPE =====

  /**
   * Escape HTML characters
   * @param {string} text
   * @returns {string}
   */
  function escapeHtml(text) {
    if (!text) return '';
    var div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  /**
   * Format file size in human-readable units
   * @param {number} bytes
   * @returns {string}
   */
  function formatFileSize(bytes) {
    if (!bytes) return '';
    var units = ['B', 'KB', 'MB', 'GB'];
    var size = bytes;
    var unitIndex = 0;

    while (size >= 1024 && unitIndex < units.length - 1) {
      size /= 1024;
      unitIndex++;
    }

    return size.toFixed(1) + ' ' + units[unitIndex];
  }

  // Export
  window.PopupUI = {
    showToast: showToast,
    dismissToast: dismissToast,
    clearAllToasts: clearAllToasts,
    setButtonLoading: setButtonLoading,
    clearButtonLoading: clearButtonLoading,
    flashButtonSuccess: flashButtonSuccess,
    initDigitalRain: initDigitalRain,
    animateCounter: animateCounter,
    escapeHtml: escapeHtml,
    formatFileSize: formatFileSize
  };

})();
