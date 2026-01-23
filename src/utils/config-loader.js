// @ts-nocheck
// Config Loader for Bid Extractor
// Loads JSON config files and caches them
// TODO: Enable type checking after incremental migration

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

  try {
    const url = chrome.runtime.getURL(`src/config/${configName}.json`);
    const response = await fetch(url);

    if (!response.ok) {
      throw new Error(`Failed to load config: ${configName} (${response.status})`);
    }

    const config = await response.json();
    configCache.set(configName, config);
    return config;
  } catch (error) {
    console.error(`Config Loader: Error loading ${configName}:`, error);
    throw error;
  }
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
