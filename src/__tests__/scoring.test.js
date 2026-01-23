// Tests for scoring utilities
const {
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
} = require('../utils/scoring');

describe('parseBidDate', () => {
  test('parses MM/DD/YYYY format', () => {
    const date = parseBidDate('01/15/2025');
    expect(date).toBeInstanceOf(Date);
    expect(date.getMonth()).toBe(0); // January
    expect(date.getDate()).toBe(15);
    expect(date.getFullYear()).toBe(2025);
  });

  test('parses YYYY-MM-DD format', () => {
    const date = parseBidDate('2025-03-20');
    expect(date).toBeInstanceOf(Date);
    expect(date.getMonth()).toBe(2); // March
    expect(date.getDate()).toBe(20);
    expect(date.getFullYear()).toBe(2025);
  });

  test('parses Month DD, YYYY format', () => {
    const date = parseBidDate('January 15, 2025');
    expect(date).toBeInstanceOf(Date);
    expect(date.getMonth()).toBe(0);
    expect(date.getDate()).toBe(15);
  });

  test('parses abbreviated month format', () => {
    const date = parseBidDate('Jan 15, 2025');
    expect(date).toBeInstanceOf(Date);
    expect(date.getMonth()).toBe(0);
  });

  test('returns null for empty string', () => {
    expect(parseBidDate('')).toBeNull();
  });

  test('returns null for null input', () => {
    expect(parseBidDate(null)).toBeNull();
  });

  test('returns null for invalid date', () => {
    expect(parseBidDate('not a date')).toBeNull();
  });
});

describe('calculateDeadlineScore', () => {
  test('returns max points for due today (0 days)', () => {
    expect(calculateDeadlineScore(0)).toBe(40);
  });

  test('returns high points for tomorrow', () => {
    expect(calculateDeadlineScore(1)).toBe(38);
  });

  test('returns lower points for further out dates', () => {
    expect(calculateDeadlineScore(7)).toBe(25);
    expect(calculateDeadlineScore(14)).toBe(15);
    expect(calculateDeadlineScore(30)).toBe(10);
    expect(calculateDeadlineScore(60)).toBe(5);
  });

  test('uses custom config tiers', () => {
    const config = {
      tiers: [
        { daysUntil: 5, points: 100 },
        { daysUntil: null, points: 0 }
      ]
    };
    expect(calculateDeadlineScore(3, config)).toBe(100);
    expect(calculateDeadlineScore(10, config)).toBe(0);
  });
});

describe('calculateGcScore', () => {
  const majorGcs = ['turner', 'skanska', 'mortenson'];

  test('returns max points for major GC', () => {
    expect(calculateGcScore('Turner Construction', majorGcs)).toBe(20);
  });

  test('matches case-insensitively', () => {
    expect(calculateGcScore('SKANSKA USA', majorGcs)).toBe(20);
  });

  test('returns partial points for known non-major GC', () => {
    expect(calculateGcScore('ABC Builders', majorGcs)).toBe(10);
  });

  test('returns 0 for Unknown GC', () => {
    expect(calculateGcScore('Unknown GC', majorGcs)).toBe(0);
    expect(calculateGcScore('Unknown', majorGcs)).toBe(0);
  });

  test('returns 0 for empty/null GC', () => {
    expect(calculateGcScore('', majorGcs)).toBe(0);
    expect(calculateGcScore(null, majorGcs)).toBe(0);
  });

  test('uses custom config points', () => {
    const config = { majorGcPoints: 50, knownGcPoints: 25 };
    expect(calculateGcScore('Turner', majorGcs, config)).toBe(50);
    expect(calculateGcScore('Other Builder', majorGcs, config)).toBe(25);
  });
});

describe('calculateValueScore', () => {
  const keywords = ['hospital', 'data center', 'stadium'];

  test('adds points for each keyword found', () => {
    expect(calculateValueScore('Memorial Hospital', keywords)).toBe(5);
  });

  test('caps at max points', () => {
    const text = 'Hospital Data Center Stadium Complex';
    expect(calculateValueScore(text, keywords)).toBe(15); // 3 * 5 = 15
  });

  test('respects maxPoints config', () => {
    const text = 'Hospital Data Center Stadium Complex';
    const config = { maxPoints: 10, pointsPerKeyword: 5 };
    expect(calculateValueScore(text, keywords, config)).toBe(10);
  });

  test('returns 0 for no keywords found', () => {
    expect(calculateValueScore('Office Building', keywords)).toBe(0);
  });

  test('returns 0 for empty text', () => {
    expect(calculateValueScore('', keywords)).toBe(0);
    expect(calculateValueScore(null, keywords)).toBe(0);
  });
});

describe('calculateCompletenessScore', () => {
  test('gives points for each filled field', () => {
    const bidData = {
      project: 'Test Project',
      gc: 'Test GC',
      bidDate: '01/15/2025'
    };
    // 3 fields * 1.5 = 4.5, floor = 4
    expect(calculateCompletenessScore(bidData)).toBe(4);
  });

  test('ignores N/A and dash values', () => {
    const bidData = {
      project: 'Test',
      gc: 'N/A',
      bidDate: '-',
      location: 'Seattle'
    };
    // 2 valid fields * 1.5 = 3
    expect(calculateCompletenessScore(bidData)).toBe(3);
  });

  test('caps at max points', () => {
    const bidData = {
      project: 'Test',
      gc: 'Test GC',
      bidDate: '01/01/2025',
      location: 'Seattle',
      scope: 'Steel',
      contact: 'John',
      email: 'john@test.com'
    };
    // 7 fields * 1.5 = 10.5, but capped at 10
    expect(calculateCompletenessScore(bidData)).toBe(10);
  });

  test('uses custom config fields', () => {
    const bidData = { project: 'Test', gc: 'GC' };
    const config = { fields: ['project', 'gc'], pointsPerField: 5, maxPoints: 10 };
    expect(calculateCompletenessScore(bidData, config)).toBe(10);
  });
});

describe('calculateAttachmentScore', () => {
  test('gives points per attachment', () => {
    expect(calculateAttachmentScore(1)).toBe(2);
    expect(calculateAttachmentScore(3)).toBe(6);
  });

  test('caps at max points', () => {
    expect(calculateAttachmentScore(10)).toBe(10);
  });

  test('returns 0 for no attachments', () => {
    expect(calculateAttachmentScore(0)).toBe(0);
    expect(calculateAttachmentScore(null)).toBe(0);
    expect(calculateAttachmentScore(-1)).toBe(0);
  });

  test('uses custom config', () => {
    const config = { maxPoints: 20, pointsPerAttachment: 5 };
    expect(calculateAttachmentScore(2, config)).toBe(10);
    expect(calculateAttachmentScore(10, config)).toBe(20);
  });
});

describe('getPriorityLevel', () => {
  test('returns high for scores >= 70', () => {
    expect(getPriorityLevel(70)).toBe('high');
    expect(getPriorityLevel(100)).toBe('high');
  });

  test('returns medium for scores 40-69', () => {
    expect(getPriorityLevel(40)).toBe('medium');
    expect(getPriorityLevel(69)).toBe('medium');
  });

  test('returns low for scores < 40', () => {
    expect(getPriorityLevel(0)).toBe('low');
    expect(getPriorityLevel(39)).toBe('low');
  });

  test('uses custom thresholds', () => {
    const levels = {
      high: { minScore: 80 },
      medium: { minScore: 50 },
      low: { minScore: 0 }
    };
    expect(getPriorityLevel(70, levels)).toBe('medium');
    expect(getPriorityLevel(80, levels)).toBe('high');
  });
});

describe('getPriorityLabel', () => {
  test('returns correct labels', () => {
    expect(getPriorityLabel(70)).toBe('HIGH');
    expect(getPriorityLabel(40)).toBe('MED');
    expect(getPriorityLabel(20)).toBe('LOW');
  });

  test('uses custom labels', () => {
    const levels = {
      high: { minScore: 70, label: 'URGENT' },
      medium: { minScore: 40, label: 'NORMAL' },
      low: { minScore: 0, label: 'LATER' }
    };
    expect(getPriorityLabel(70, levels)).toBe('URGENT');
    expect(getPriorityLabel(40, levels)).toBe('NORMAL');
    expect(getPriorityLabel(20, levels)).toBe('LATER');
  });
});

describe('sanitizeFileName', () => {
  test('removes invalid characters', () => {
    expect(sanitizeFileName('file:name?test')).toBe('filenametest');
  });

  test('replaces spaces with underscores', () => {
    expect(sanitizeFileName('my file name')).toBe('my_file_name');
  });

  test('truncates to max length', () => {
    const longName = 'a'.repeat(100);
    expect(sanitizeFileName(longName).length).toBe(50);
  });

  test('uses custom max length', () => {
    expect(sanitizeFileName('test name', 5)).toBe('test_');
  });

  test('handles empty/null input', () => {
    expect(sanitizeFileName('')).toBe('');
    expect(sanitizeFileName(null)).toBe('');
  });
});

describe('createFolderName', () => {
  test('replaces placeholders with data', () => {
    const data = {
      project: 'Test Project',
      gc: 'Turner',
      bidDate: '01/15/2025',
      location: 'Seattle'
    };
    const pattern = 'Bids/{gc}_{date}_{project}';
    expect(createFolderName(pattern, data)).toBe('Bids/Turner_01-15-2025_Test_Project');
  });

  test('uses defaults for missing data', () => {
    const data = {};
    const pattern = '{gc}/{project}';
    expect(createFolderName(pattern, data)).toBe('Unknown_GC/Unknown_Project');
  });

  test('sanitizes all parts', () => {
    const data = {
      project: 'Test: Project?',
      gc: 'GC/Name',
      bidDate: '01/15/2025'
    };
    expect(createFolderName('{gc}_{project}', data)).toBe('GCName_Test_Project');
  });
});
