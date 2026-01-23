// @ts-nocheck
// Priority Scoring Utilities
// Pure functions for bid priority calculation
// TODO: Enable type checking after incremental migration

/**
 * Parse a bid date string into a Date object
 * @param {string} dateStr - Date string in various formats
 * @returns {Date|null} Parsed date or null if invalid
 */
function parseBidDate(dateStr) {
  if (!dateStr) return null;

  // Try MM/DD/YYYY
  let match = dateStr.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (match) {
    return new Date(match[3], match[1] - 1, match[2]);
  }

  // Try YYYY-MM-DD
  match = dateStr.match(/(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (match) {
    return new Date(match[1], match[2] - 1, match[3]);
  }

  // Try Month DD, YYYY
  match = dateStr.match(/(\w+)\s+(\d{1,2}),?\s*(\d{4})/);
  if (match) {
    const months = {
      'january': 0, 'february': 1, 'march': 2, 'april': 3, 'may': 4, 'june': 5,
      'july': 6, 'august': 7, 'september': 8, 'october': 9, 'november': 10, 'december': 11,
      'jan': 0, 'feb': 1, 'mar': 2, 'apr': 3, 'jun': 5, 'jul': 6, 'aug': 7, 'sep': 8, 'oct': 9, 'nov': 10, 'dec': 11
    };
    const month = months[match[1].toLowerCase()];
    if (month !== undefined) {
      return new Date(match[3], month, match[2]);
    }
  }

  // Fallback to Date.parse
  const parsed = Date.parse(dateStr);
  if (!isNaN(parsed)) {
    return new Date(parsed);
  }

  return null;
}

/**
 * Calculate deadline score based on days until due
 * @param {number} daysUntilDue - Days until bid is due
 * @param {Object} config - Scoring configuration
 * @returns {number} Score points for deadline
 */
function calculateDeadlineScore(daysUntilDue, config = {}) {
  const tiers = config.tiers || [
    { daysUntil: 0, points: 40 },
    { daysUntil: 1, points: 38 },
    { daysUntil: 2, points: 35 },
    { daysUntil: 3, points: 32 },
    { daysUntil: 5, points: 28 },
    { daysUntil: 7, points: 25 },
    { daysUntil: 14, points: 15 },
    { daysUntil: 30, points: 10 },
    { daysUntil: null, points: 5 }
  ];

  for (const tier of tiers) {
    if (tier.daysUntil === null || daysUntilDue <= tier.daysUntil) {
      return tier.points;
    }
  }

  return 5; // Default for far out dates
}

/**
 * Calculate GC reputation score
 * @param {string} gcName - General contractor name
 * @param {string[]} majorGcs - List of major GC names
 * @param {Object} config - Scoring configuration
 * @returns {number} Score points for GC reputation
 */
function calculateGcScore(gcName, majorGcs = [], config = {}) {
  const majorGcPoints = config.majorGcPoints || 20;
  const knownGcPoints = config.knownGcPoints || 10;

  if (!gcName) return 0;

  const gcLower = gcName.toLowerCase();
  for (const gc of majorGcs) {
    if (gcLower.includes(gc.toLowerCase())) {
      return majorGcPoints;
    }
  }

  // Partial credit for any named GC
  if (gcName !== 'Unknown GC' && gcName !== 'Unknown') {
    return knownGcPoints;
  }

  return 0;
}

/**
 * Calculate project value score based on keywords
 * @param {string} projectText - Combined project text (name, scope, location)
 * @param {string[]} keywords - High-value keywords
 * @param {Object} config - Scoring configuration
 * @returns {number} Score points for project value
 */
function calculateValueScore(projectText, keywords = [], config = {}) {
  const maxPoints = config.maxPoints || 20;
  const pointsPerKeyword = config.pointsPerKeyword || 5;

  if (!projectText) return 0;

  const textLower = projectText.toLowerCase();
  let valuePoints = 0;

  for (const keyword of keywords) {
    if (textLower.includes(keyword.toLowerCase())) {
      valuePoints += pointsPerKeyword;
    }
  }

  return Math.min(valuePoints, maxPoints);
}

/**
 * Calculate data completeness score
 * @param {Object} bidData - Bid data object
 * @param {Object} config - Scoring configuration
 * @returns {number} Score points for completeness
 */
function calculateCompletenessScore(bidData, config = {}) {
  const maxPoints = config.maxPoints || 10;
  const pointsPerField = config.pointsPerField || 1.5;
  const fields = config.fields || ['project', 'gc', 'bidDate', 'location', 'scope', 'contact', 'email'];

  let filledFields = 0;
  for (const field of fields) {
    if (bidData[field] && bidData[field] !== 'N/A' && bidData[field] !== '-') {
      filledFields++;
    }
  }

  return Math.min(Math.floor(filledFields * pointsPerField), maxPoints);
}

/**
 * Calculate attachment bonus score
 * @param {number} attachmentCount - Number of attachments
 * @param {Object} config - Scoring configuration
 * @returns {number} Score points for attachments
 */
function calculateAttachmentScore(attachmentCount, config = {}) {
  const maxPoints = config.maxPoints || 10;
  const pointsPerAttachment = config.pointsPerAttachment || 2;

  if (!attachmentCount || attachmentCount <= 0) return 0;

  return Math.min(attachmentCount * pointsPerAttachment, maxPoints);
}

/**
 * Get priority level from score
 * @param {number} score - Priority score
 * @param {Object} levels - Priority level thresholds
 * @returns {string} Priority level (high, medium, low)
 */
function getPriorityLevel(score, levels = {}) {
  const highMin = levels.high?.minScore ?? 70;
  const mediumMin = levels.medium?.minScore ?? 40;

  if (score >= highMin) return 'high';
  if (score >= mediumMin) return 'medium';
  return 'low';
}

/**
 * Get priority label from score
 * @param {number} score - Priority score
 * @param {Object} levels - Priority level thresholds
 * @returns {string} Priority label (HIGH, MED, LOW)
 */
function getPriorityLabel(score, levels = {}) {
  const highMin = levels.high?.minScore ?? 70;
  const mediumMin = levels.medium?.minScore ?? 40;

  if (score >= highMin) return levels.high?.label || 'HIGH';
  if (score >= mediumMin) return levels.medium?.label || 'MED';
  return levels.low?.label || 'LOW';
}

/**
 * Sanitize a filename
 * @param {string} name - Filename to sanitize
 * @param {number} maxLength - Maximum length
 * @returns {string} Sanitized filename
 */
function sanitizeFileName(name, maxLength = 50) {
  if (!name) return '';
  return name
    .replace(/[<>:"/\\|?*]/g, '')
    .replace(/\s+/g, '_')
    .substring(0, maxLength);
}

/**
 * Create folder name from pattern
 * @param {string} pattern - Folder pattern with placeholders
 * @param {Object} data - Bid data
 * @returns {string} Folder name
 */
function createFolderName(pattern, data) {
  const date = data.bidDate ? data.bidDate.replace(/\//g, '-') : 'unknown-date';
  const project = sanitizeFileName(data.project || 'Unknown Project');
  const gc = sanitizeFileName(data.gc || 'Unknown GC');
  const location = sanitizeFileName(data.location || 'Unknown Location');

  return pattern
    .replace('{project}', project)
    .replace('{date}', date)
    .replace('{gc}', gc)
    .replace('{location}', location);
}

// Export for Node.js/Jest or browser
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    parseBidDate,
    calculateDeadlineScore,
    calculateGcScore,
    calculateValueScore,
    calculateCompletenessScore,
    calculateAttachmentScore,
    getPriorityLevel,
    getPriorityLabel,
    sanitizeFileName,
    createFolderName
  };
}

// Export for browser
if (typeof window !== 'undefined') {
  window.ScoringUtils = {
    parseBidDate,
    calculateDeadlineScore,
    calculateGcScore,
    calculateValueScore,
    calculateCompletenessScore,
    calculateAttachmentScore,
    getPriorityLevel,
    getPriorityLabel,
    sanitizeFileName,
    createFolderName
  };
}
