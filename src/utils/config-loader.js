// @ts-nocheck
// Config Loader for Bid Extractor
// Loads JSON config files and caches them
// Uses XMLHttpRequest (synchronous fallback) because fetch() on chrome-extension:// URLs
// can fail in MV3 content scripts due to host page CSP or extension context issues.

const configCache = new Map();

/**
 * Load a config file from the extension's config directory
 * @param {string} configName - Name of the config file (without .json extension)
 * @returns {Promise<Object>} The parsed config object
 */
async function loadConfig(configName) {
  // Return cached config if available
  if (configCache.has(configName)) {
    return configCache.get(configName);
  }

  const url = chrome.runtime.getURL(`src/config/${configName}.json`);

  // Strategy 1: Try fetch() first (works in popup and some content script contexts)
  try {
    const response = await fetch(url);
    if (response.ok) {
      const config = await response.json();
      configCache.set(configName, config);
      return config;
    }
  } catch (fetchErr) {
    // fetch() failed — fall through to XMLHttpRequest
    console.warn(`Config Loader: fetch() failed for ${configName}, trying XHR...`);
  }

  // Strategy 2: Synchronous XMLHttpRequest (reliable in content scripts)
  try {
    const config = loadConfigSync(url);
    if (config) {
      configCache.set(configName, config);
      return config;
    }
  } catch (xhrErr) {
    console.error(`Config Loader: XHR also failed for ${configName}:`, xhrErr);
  }

  // Strategy 3: Ask background script to load it
  try {
    const config = await loadConfigViaBackground(configName);
    if (config) {
      configCache.set(configName, config);
      return config;
    }
  } catch (bgErr) {
    console.error(`Config Loader: Background fallback failed for ${configName}:`, bgErr);
  }

  throw new Error(`Failed to load config: ${configName} (all strategies failed)`);
}

/**
 * Load config synchronously via XMLHttpRequest
 * @param {string} url - chrome-extension:// URL
 * @returns {Object|null}
 */
function loadConfigSync(url) {
  const xhr = new XMLHttpRequest();
  xhr.open('GET', url, false); // synchronous
  xhr.send();
  if (xhr.status === 200 || xhr.status === 0) { // status 0 is normal for chrome-extension:// URLs
    return JSON.parse(xhr.responseText);
  }
  return null;
}

/**
 * Load config by asking the background service worker
 * @param {string} configName
 * @returns {Promise<Object>}
 */
function loadConfigViaBackground(configName) {
  return new Promise((resolve, reject) => {
    try {
      chrome.runtime.sendMessage({ action: 'loadConfig', configName }, (response) => {
        if (chrome.runtime.lastError) {
          reject(chrome.runtime.lastError);
        } else if (response?.success) {
          resolve(response.config);
        } else {
          reject(new Error(response?.error || 'Background config load failed'));
        }
      });
    } catch (e) {
      reject(e);
    }
  });
}

/**
 * Load multiple configs at once
 * @param {string[]} configNames - Array of config names to load
 * @returns {Promise<Object>} Object with config names as keys
 */
async function loadConfigs(configNames) {
  const results = {};
  await Promise.all(
    configNames.map(async (name) => {
      results[name] = await loadConfig(name);
    })
  );
  return results;
}

/**
 * Get cached config (returns null if not loaded)
 * @param {string} configName - Name of the config file
 * @returns {Object|null} The cached config or null
 */
function getCachedConfig(configName) {
  return configCache.get(configName) || null;
}

/**
 * Clear all cached configs
 */
function clearConfigCache() {
  configCache.clear();
}

/**
 * Pre-load all standard configs
 * @returns {Promise<Object>} All loaded configs
 */
async function preloadAllConfigs() {
  const configNames = [
    'gc-list',
    'keywords',
    'priority-weights',
    'selectors',
    'platforms'
  ];
  return loadConfigs(configNames);
}

// Export for use in modules (ES6) or global scope (classic scripts)
if (typeof window !== 'undefined') {
  window.ConfigLoader = {
    loadConfig,
    loadConfigs,
    getCachedConfig,
    clearConfigCache,
    preloadAllConfigs
  };
}
