/**
 * Bid Extractor Type Definitions
 */

/**
 * Attachment file information
 */
interface BidAttachment {
  name: string;
  url: string;
  type: 'document' | 'drawing' | 'spreadsheet' | 'archive' | 'file' | 'drive';
}

/**
 * Download link from bid platform or file sharing service
 */
interface DownloadLink {
  url: string;
  platform: string;
  icon: string;
  text: string;
  type: 'platform' | 'file' | 'document';
  extension?: string;
}

/**
 * Extracted bid data
 */
interface BidData {
  project: string;
  gc: string;
  bidDate: string;
  location: string;
  scope: string;
  contact: string;
  email: string;
  phone: string;
  attachments: BidAttachment[];
  downloadLinks: DownloadLink[];
  notes: string;
  rawSubject?: string;
  rawText?: string;
  extractedAt?: string;
}

/**
 * Bid data with priority scoring
 */
interface ScoredBidData extends BidData {
  originalIndex?: number;
  priorityScore: number;
  priorityLevel: 'high' | 'medium' | 'low';
  priorityLabel: string;
}

/**
 * Calendar event data
 */
interface CalendarEvent {
  title: string;
  description: string;
  location: string;
  start: Date;
  end: Date;
}

/**
 * Extension settings
 */
interface ExtensionSettings {
  folderPattern: string;
  autoDownload: boolean;
  createSummary: boolean;
}

/**
 * Platform information for link extraction
 */
interface PlatformInfo {
  name: string;
  icon: string;
}

/**
 * Platforms configuration object
 */
interface PlatformsConfig {
  [domain: string]: PlatformInfo;
}

/**
 * Priority weight configuration
 */
interface PriorityWeightsConfig {
  maxScore: number;
  weights: {
    deadline: {
      maxPoints: number;
      tiers: Array<{
        daysUntil: number | null;
        points: number;
        label: string;
      }>;
    };
    gcReputation: {
      maxPoints: number;
      majorGcPoints: number;
      knownGcPoints: number;
    };
    projectValue: {
      maxPoints: number;
      pointsPerKeyword: number;
    };
    dataCompleteness: {
      maxPoints: number;
      pointsPerField: number;
      fields: string[];
    };
    attachments: {
      maxPoints: number;
      pointsPerAttachment: number;
    };
  };
  priorityLevels: {
    high: { minScore: number; label: string };
    medium: { minScore: number; label: string };
    low: { minScore: number; label: string };
  };
}

/**
 * Gmail selectors configuration
 */
interface GmailSelectors {
  container: {
    primary: string;
    fallback: string;
  };
  body: string[];
  bodyFallback: string[];
  subject: string[];
  sender: string[];
  attachments: string[];
  attachmentName: string[];
  toolbar: string;
  emailOpenIndicator: string[];
}

/**
 * Outlook selectors configuration
 */
interface OutlookSelectors {
  container: string[];
  body: string[];
  subject: string[];
  sender: string[];
  attachments: string[];
  toolbar: string[];
  emailOpenIndicator: string[];
}

/**
 * Selectors configuration
 */
interface SelectorsConfig {
  gmail: GmailSelectors;
  outlook: OutlookSelectors;
}

/**
 * Selector error for monitoring
 */
interface SelectorError {
  timestamp: string;
  name: string;
  selectors: string[];
  url: string;
  contextTag: string;
  availableClasses: string[];
  tabId?: number;
  tabUrl?: string;
  receivedAt?: string;
}

/**
 * Message types for chrome.runtime.sendMessage
 */
type ExtensionMessage =
  | { action: 'extract' }
  | { action: 'bidExtracted'; data: BidData }
  | { action: 'downloadFile'; url: string; filename: string }
  | { action: 'getRecentBids' }
  | { action: 'selectorError'; error: SelectorError }
  | { action: 'getSelectorErrors' }
  | { action: 'clearSelectorErrors' };

/**
 * SafeQuery options
 */
interface SafeQueryOptions {
  name?: string;
  minTextLength?: number;
  silent?: boolean;
}

/**
 * SafeQuery utility interface
 */
interface SafeQueryUtils {
  query: (selectors: string | string[], context?: Element | Document, options?: SafeQueryOptions) => Element | null;
  queryAll: (selectors: string | string[], context?: Element | Document) => Element[];
  createQuery: (selectors: string[], defaultOptions?: SafeQueryOptions) => (context?: Element | Document, options?: SafeQueryOptions) => Element | null;
  getErrorLog: () => SelectorError[];
  clearErrorLog: () => void;
  reportFailure: (name: string, selectors: string[], context: Element | Document) => void;
}

/**
 * Scoring utilities interface
 */
interface ScoringUtils {
  parseBidDate: (dateStr: string) => Date | null;
  calculateDeadlineScore: (daysUntilDue: number, config?: object) => number;
  calculateGcScore: (gcName: string, majorGcs: string[], config?: object) => number;
  calculateValueScore: (projectText: string, keywords: string[], config?: object) => number;
  calculateCompletenessScore: (bidData: BidData, config?: object) => number;
  calculateAttachmentScore: (attachmentCount: number, config?: object) => number;
  getPriorityLevel: (score: number, levels?: object) => string;
  getPriorityLabel: (score: number, levels?: object) => string;
  sanitizeFileName: (name: string, maxLength?: number) => string;
  createFolderName: (pattern: string, data: BidData) => string;
}

/**
 * Config loader interface
 */
interface ConfigLoaderUtils {
  loadConfig: (configName: string) => Promise<object>;
  loadConfigs: (configNames: string[]) => Promise<{ [key: string]: object }>;
  getCachedConfig: (configName: string) => object | null;
  clearConfigCache: () => void;
  preloadAllConfigs: () => Promise<{ [key: string]: object }>;
}

// Extend Window interface
interface Window {
  SafeQuery?: SafeQueryUtils;
  ScoringUtils?: ScoringUtils;
  ConfigLoader?: ConfigLoaderUtils;
}
