// @ts-nocheck
// Safe Query Utility for Bid Extractor
// Wraps DOM queries with fallback and error reporting
// TODO: Enable type checking after incremental migration

// Error storage for reporting
const errorLog = [];
const MAX_ERRORS = 50;

/**
 * Safely query for an element using multiple selectors
 * @param {string[]} selectors - Array of CSS selectors to try in order
 * @param {Element} [context=document] - Element to search within
 * @param {Object} [options] - Additional options
 * @param {string} [options.name] - Name of what we're looking for (for logging)
 * @param {number} [options.minTextLength] - Minimum text length to consider valid
 * @param {boolean} [options.silent] - Don't log errors
 * @returns {Element|null} The found element or null
 */
function safeQuery(selectors, context = document, options = {}) {
  const { name = 'element', minTextLength = 0, silent = false } = options;

  if (!Array.isArray(selectors)) {
    selectors = [selectors];
  }

  for (const selector of selectors) {
    try {
      const element = context.querySelector(selector);
      if (element) {
        // Check minimum text length if specified
        if (minTextLength > 0) {
          // Use textContent as fallback for environments where innerText isn't available (like JSDOM)
          const text = (element.innerText || element.textContent || '').trim();
          if (text.length < minTextLength) {
            continue; // Try next selector
          }
        }
        return element;
      }
    } catch (error) {
      if (!silent) {
        console.warn(`SafeQuery: Invalid selector "${selector}":`, error.message);
      }
    }
  }

  // All selectors failed - report error
  if (!silent) {
    reportSelectorFailure(name, selectors, context);
  }

  return null;
}

/**
 * Safely query for all matching elements
 * @param {string[]} selectors - Array of CSS selectors to try
 * @param {Element} [context=document] - Element to search within
 * @returns {Element[]} Array of found elements (may be empty)
 */
function safeQueryAll(selectors, context = document) {
  if (!Array.isArray(selectors)) {
    selectors = [selectors];
  }

  const results = [];
  const seen = new Set();

  for (const selector of selectors) {
    try {
      const elements = context.querySelectorAll(selector);
      for (const el of elements) {
        // Avoid duplicates using element reference
        if (!seen.has(el)) {
          seen.add(el);
          results.push(el);
        }
      }
    } catch (error) {
      console.warn(`SafeQueryAll: Invalid selector "${selector}":`, error.message);
    }
  }

  return results;
}

/**
 * Report a selector failure for monitoring
 * @param {string} name - What we were looking for
 * @param {string[]} selectors - Selectors that failed
 * @param {Element} context - Context element
 */
function reportSelectorFailure(name, selectors, context) {
  const error = {
    timestamp: new Date().toISOString(),
    name,
    selectors,
    url: window.location.href,
    contextTag: context?.tagName || 'document',
    availableClasses: getAvailableClasses(context, 10)
  };

  // Log to console
  console.warn(`SafeQuery: Failed to find "${name}"`, {
    selectors,
    availableClasses: error.availableClasses
  });

  // Store error for potential reporting
  errorLog.push(error);
  if (errorLog.length > MAX_ERRORS) {
    errorLog.shift();
  }

  // Send to background for potential aggregation
  try {
    chrome.runtime.sendMessage({
      action: 'selectorError',
      error
    }).catch(() => {
      // Ignore if background script not available
    });
  } catch (e) {
    // Ignore messaging errors
  }
}

/**
 * Get available CSS classes in context for debugging
 * @param {Element} context - Element to search within
 * @param {number} limit - Max classes to return
 * @returns {string[]} Array of class names
 */
function getAvailableClasses(context, limit = 20) {
  const classes = new Set();
  const root = context === document ? document.body : context;

  if (!root) return [];

  const elements = root.querySelectorAll('[class]');
  for (const el of elements) {
    for (const cls of el.classList) {
      classes.add(cls);
      if (classes.size >= limit) break;
    }
    if (classes.size >= limit) break;
  }

  return Array.from(classes);
}

/**
 * Get all logged errors
 * @returns {Object[]} Array of error objects
 */
function getErrorLog() {
  return [...errorLog];
}

/**
 * Clear error log
 */
function clearErrorLog() {
  errorLog.length = 0;
}

/**
 * Helper: Create a resilient query function with pre-configured selectors
 * @param {string[]} selectors - Default selectors
 * @param {Object} defaultOptions - Default options
 * @returns {Function} Configured query function
 */
function createQuery(selectors, defaultOptions = {}) {
  return (context = document, options = {}) => {
    return safeQuery(selectors, context, { ...defaultOptions, ...options });
  };
}

// Export for use
if (typeof window !== 'undefined') {
  window.SafeQuery = {
    query: safeQuery,
    queryAll: safeQueryAll,
    createQuery,
    getErrorLog,
    clearErrorLog,
    reportFailure: reportSelectorFailure
  };
}
