// @ts-nocheck
// Config Loader for Bid Extractor v2
// Loads JSON config files via background service worker messaging.
//
// Why not fetch()? In MV3, content scripts run in an isolated world but their
// fetch/XHR requests can still be blocked by the host page's CSP (Gmail, Outlook, etc.).
// The background service worker always has unrestricted access to extension resources,
// so we route config loading through it as the primary strategy.

const configCache = new Map();

/**
 * Load a config file from the extension's config directory.
 * Primary: asks background service worker (always works).
 * Fallback: direct fetch (works in popup context).
 *
 * @param {string} configName - Name of the config file (without .json extension)
 * @returns {Promise<Object>} The parsed config object
 */
async function loadConfig(configName) {
  // Return cached config if available
  if (configCache.has(configName)) {
    return configCache.get(configName);
  }

  // Strategy 1: Ask background service worker to load it (most reliable for content scripts)
  try {
    const config = await loadConfigViaBackground(configName);
    if (config) {
      configCache.set(configName, config);
      return config;
    }
  } catch (bgErr) {
    console.warn('Config Loader: background strategy failed for ' + configName + ':', bgErr.message || bgErr);
  }

  // Strategy 2: Direct fetch (works in popup and extension pages)
  try {
    const url = chrome.runtime.getURL('src/config/' + configName + '.json');
    const response = await fetch(url);
    if (response.ok) {
      const config = await response.json();
      configCache.set(configName, config);
      return config;
    }
  } catch (fetchErr) {
    console.warn('Config Loader: fetch() failed for ' + configName + ':', fetchErr.message || fetchErr);
  }

  // Strategy 3: Synchronous XHR (last resort)
  try {
    const url = chrome.runtime.getURL('src/config/' + configName + '.json');
    const xhr = new XMLHttpRequest();
    xhr.open('GET', url, false);
    xhr.send();
    if (xhr.status === 200 || xhr.status === 0) {
      const config = JSON.parse(xhr.responseText);
      configCache.set(configName, config);
      return config;
    }
  } catch (xhrErr) {
    console.warn('Config Loader: XHR failed for ' + configName + ':', xhrErr.message || xhrErr);
  }

  console.error('Config Loader: ALL strategies failed for ' + configName);
  throw new Error('Failed to load config: ' + configName);
}

/**
 * Load config by asking the background service worker.
 * Background can always fetch its own extension resources.
 * @param {string} configName
 * @returns {Promise<Object>}
 */
function loadConfigViaBackground(configName) {
  return new Promise(function(resolve, reject) {
    if (!chrome.runtime || !chrome.runtime.sendMessage) {
      return reject(new Error('chrome.runtime.sendMessage not available'));
    }
    try {
      chrome.runtime.sendMessage({ action: 'loadConfig', configName: configName }, function(response) {
        if (chrome.runtime.lastError) {
          return reject(new Error(chrome.runtime.lastError.message));
        }
        if (response && response.success && response.config) {
          resolve(response.config);
        } else {
          reject(new Error((response && response.error) || 'No config in response'));
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
    configNames.map(async function(name) {
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
  var configNames = [
    'gc-list',
    'keywords',
    'priority-weights',
    'selectors',
    'platforms'
  ];
  return loadConfigs(configNames);
}

// Export for use in content scripts and popup
if (typeof window !== 'undefined') {
  window.ConfigLoader = {
    loadConfig: loadConfig,
    loadConfigs: loadConfigs,
    getCachedConfig: getCachedConfig,
    clearConfigCache: clearConfigCache,
    preloadAllConfigs: preloadAllConfigs
  };
}
