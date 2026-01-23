/**
 * Global declarations for Bid Extractor
 */

// SafeQuery is loaded as a global from safe-query.js
declare const SafeQuery: SafeQueryUtils | undefined;

// ScoringUtils is loaded as a global from scoring.js
declare const ScoringUtils: ScoringUtils | undefined;

// ConfigLoader is loaded as a global from config-loader.js
declare const ConfigLoader: ConfigLoaderUtils | undefined;

// Content script global variables
declare let SELECTORS: GmailSelectors | OutlookSelectors | null;
declare let PLATFORMS: PlatformsConfig | null;
