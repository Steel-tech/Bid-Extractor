// Tests for shared-extractors utility

beforeEach(() => {
  document.body.innerHTML = '';
  delete window.SharedExtractors;
});

// Helper to load the module (same eval pattern as safe-query.test.js)
function loadSharedExtractors() {
  const fs = require('fs');
  const path = require('path');
  const code = fs.readFileSync(path.join(__dirname, '../utils/shared-extractors.js'), 'utf8');
  eval(code);
  return window.SharedExtractors;
}

describe('SharedExtractors.isGreeting', () => {
  test('returns true for common greetings', () => {
    const SE = loadSharedExtractors();
    expect(SE.isGreeting('Hello Team')).toBe(true);
    expect(SE.isGreeting('Hi John')).toBe(true);
    expect(SE.isGreeting('Dear Mr. Smith')).toBe(true);
    expect(SE.isGreeting('Good morning')).toBe(true);
    expect(SE.isGreeting('Good afternoon team')).toBe(true);
  });

  test('returns false for project names', () => {
    const SE = loadSharedExtractors();
    expect(SE.isGreeting('Downtown Hospital Expansion')).toBe(false);
    expect(SE.isGreeting('RFQ - Steel Fabrication')).toBe(false);
    expect(SE.isGreeting('Warehouse Project')).toBe(false);
  });

  test('handles leading/trailing punctuation', () => {
    const SE = loadSharedExtractors();
    expect(SE.isGreeting('  Hello Team,  ')).toBe(true);
    expect(SE.isGreeting('- Hello Team -')).toBe(true);
  });
});

describe('SharedExtractors.extractProjectName', () => {
  test('uses subject as project name (primary behavior)', () => {
    const SE = loadSharedExtractors();
    // Subject IS the project name for steel estimators
    expect(SE.extractProjectName('Downtown Hospital Steel Package', '')).toBe('Downtown Hospital Steel Package');
  });

  test('keeps full subject including bid type prefixes', () => {
    const SE = loadSharedExtractors();
    expect(SE.extractProjectName('RFQ: Downtown Hospital', '')).toBe('RFQ: Downtown Hospital');
  });

  test('uses full subject for bid emails', () => {
    const SE = loadSharedExtractors();
    expect(SE.extractProjectName('Bid - Steel Package Phase 2', '')).toBe('Bid - Steel Package Phase 2');
  });

  test('returns fallback for greeting subjects', () => {
    const SE = loadSharedExtractors();
    expect(SE.extractProjectName('Hello Team', 'Project Name: Stadium Build\n')).toBe('Stadium Build');
  });

  test('returns Untitled Project when nothing found', () => {
    const SE = loadSharedExtractors();
    expect(SE.extractProjectName('Hi', '')).toBe('Untitled Project');
  });

  test('strips RE/FW prefixes but keeps the rest', () => {
    const SE = loadSharedExtractors();
    expect(SE.extractProjectName('RE: Big Warehouse Project', '')).toBe('Big Warehouse Project');
    expect(SE.extractProjectName('FW: RE: Hospital Expansion', '')).toBe('Hospital Expansion');
    expect(SE.extractProjectName('RE: FW: RE: School Renovation', '')).toBe('School Renovation');
  });
});

describe('SharedExtractors.extractGCName', () => {
  test('extracts from body GC pattern', () => {
    const SE = loadSharedExtractors();
    expect(SE.extractGCName('', 'General Contractor: Turner Construction\n')).toBe('Turner Construction');
  });

  test('extracts from sender with Construction in name', () => {
    const SE = loadSharedExtractors();
    expect(SE.extractGCName('Skanska Construction', '')).toBe('Skanska Construction');
  });

  test('extracts company from sender email domain', () => {
    const SE = loadSharedExtractors();
    expect(SE.extractGCName('John Smith', '', 'john@turnerconstruction.com')).toBe('Turner Construction');
  });

  test('extracts company from hyphenated email domain', () => {
    const SE = loadSharedExtractors();
    expect(SE.extractGCName('Jane Doe', '', 'jane@henselphelps.com')).toBe('Henselphelps');
  });

  test('ignores generic email domains like gmail', () => {
    const SE = loadSharedExtractors();
    // Should fall back to sender name, not "Gmail"
    expect(SE.extractGCName('John Smith', '', 'john@gmail.com')).toBe('John Smith');
  });

  test('returns Unknown for empty inputs', () => {
    const SE = loadSharedExtractors();
    expect(SE.extractGCName('', '')).toBe('Unknown');
  });

  test('returns sender name as fallback', () => {
    const SE = loadSharedExtractors();
    expect(SE.extractGCName('John Smith', '')).toBe('John Smith');
  });
});

describe('SharedExtractors.extractCompanyFromEmail', () => {
  test('extracts company from construction domain', () => {
    const SE = loadSharedExtractors();
    expect(SE.extractCompanyFromEmail('pm@turnerconstruction.com')).toBe('Turner Construction');
  });

  test('returns empty for generic email providers', () => {
    const SE = loadSharedExtractors();
    expect(SE.extractCompanyFromEmail('user@gmail.com')).toBe('');
    expect(SE.extractCompanyFromEmail('user@yahoo.com')).toBe('');
    expect(SE.extractCompanyFromEmail('user@outlook.com')).toBe('');
  });

  test('capitalizes company name', () => {
    const SE = loadSharedExtractors();
    const result = SE.extractCompanyFromEmail('info@suffolk.com');
    expect(result).toBe('Suffolk');
  });

  test('returns empty for no email', () => {
    const SE = loadSharedExtractors();
    expect(SE.extractCompanyFromEmail('')).toBe('');
    expect(SE.extractCompanyFromEmail(null)).toBe('');
  });
});

describe('SharedExtractors.extractBidDate', () => {
  test('extracts labeled date', () => {
    const SE = loadSharedExtractors();
    const result = SE.extractBidDate('Bid Date: 01/15/2025\nPlease respond');
    expect(result).toBeTruthy();
    expect(result).toContain('2025');
  });

  test('extracts date near due keyword', () => {
    const SE = loadSharedExtractors();
    const result = SE.extractBidDate('Bids due by 03/20/2025');
    expect(result).toBeTruthy();
  });

  test('returns empty for no date', () => {
    const SE = loadSharedExtractors();
    expect(SE.extractBidDate('No dates here')).toBe('');
  });
});

describe('SharedExtractors.extractLocation', () => {
  test('extracts labeled location', () => {
    const SE = loadSharedExtractors();
    expect(SE.extractLocation('Location: Dallas, TX\n')).toBe('Dallas, TX');
  });

  test('extracts city/state/zip pattern', () => {
    const SE = loadSharedExtractors();
    expect(SE.extractLocation('Work at Seattle, WA 98101')).toBe('Seattle, WA');
  });

  test('returns empty for no location', () => {
    const SE = loadSharedExtractors();
    expect(SE.extractLocation('Just some random text without addresses')).toBe('');
  });
});

describe('SharedExtractors.extractScope', () => {
  test('extracts scope field', () => {
    const SE = loadSharedExtractors();
    const result = SE.extractScope('Scope: Structural steel fabrication and erection\n\nOther info');
    expect(result).toContain('steel');
  });

  test('detects steel keywords', () => {
    const SE = loadSharedExtractors();
    expect(SE.extractScope('We need structural steel for this project')).toBe('Structural Steel / Misc Metals');
  });

  test('returns empty for no scope', () => {
    const SE = loadSharedExtractors();
    expect(SE.extractScope('Just some random text')).toBe('');
  });
});

describe('SharedExtractors.extractPhone', () => {
  test('extracts phone number', () => {
    const SE = loadSharedExtractors();
    expect(SE.extractPhone('Phone: (214) 555-1234')).toBe('(214) 555-1234');
  });

  test('handles null/undefined input', () => {
    const SE = loadSharedExtractors();
    expect(SE.extractPhone(null)).toBe('');
    expect(SE.extractPhone(undefined)).toBe('');
    expect(SE.extractPhone('')).toBe('');
  });
});

describe('SharedExtractors.extractEmailFromText', () => {
  test('extracts email address', () => {
    const SE = loadSharedExtractors();
    expect(SE.extractEmailFromText('Contact john@example.com for info')).toBe('john@example.com');
  });

  test('handles null/undefined input', () => {
    const SE = loadSharedExtractors();
    expect(SE.extractEmailFromText(null)).toBe('');
    expect(SE.extractEmailFromText(undefined)).toBe('');
    expect(SE.extractEmailFromText('')).toBe('');
  });
});

describe('SharedExtractors.getFileType', () => {
  test('identifies PDF', () => {
    const SE = loadSharedExtractors();
    expect(SE.getFileType('plans.pdf')).toBe('document');
  });

  test('identifies CAD files', () => {
    const SE = loadSharedExtractors();
    expect(SE.getFileType('drawing.dwg')).toBe('drawing');
    expect(SE.getFileType('model.dxf')).toBe('drawing');
  });

  test('identifies spreadsheets', () => {
    const SE = loadSharedExtractors();
    expect(SE.getFileType('budget.xlsx')).toBe('spreadsheet');
  });

  test('returns file for unknown extension', () => {
    const SE = loadSharedExtractors();
    expect(SE.getFileType('readme.txt')).toBe('file');
  });

  test('handles null/undefined input', () => {
    const SE = loadSharedExtractors();
    expect(SE.getFileType(null)).toBe('file');
    expect(SE.getFileType(undefined)).toBe('file');
  });
});

describe('SharedExtractors.cleanText', () => {
  test('normalizes whitespace', () => {
    const SE = loadSharedExtractors();
    expect(SE.cleanText('  hello   world  ')).toBe('hello world');
  });

  test('strips leading/trailing dashes and colons', () => {
    const SE = loadSharedExtractors();
    expect(SE.cleanText(': Project Name -')).toBe('Project Name');
  });
});

describe('SharedExtractors.debounce', () => {
  beforeEach(() => { jest.useFakeTimers(); });
  afterEach(() => { jest.useRealTimers(); });

  test('delays execution', () => {
    const SE = loadSharedExtractors();
    const fn = jest.fn();
    const debounced = SE.debounce(fn, 200);

    debounced();
    expect(fn).not.toHaveBeenCalled();

    jest.advanceTimersByTime(200);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  test('coalesces rapid calls', () => {
    const SE = loadSharedExtractors();
    const fn = jest.fn();
    const debounced = SE.debounce(fn, 200);

    debounced();
    debounced();
    debounced();

    jest.advanceTimersByTime(200);
    expect(fn).toHaveBeenCalledTimes(1);
  });
});

describe('SharedExtractors.extractDownloadLinks', () => {
  test('extracts platform links', () => {
    const SE = loadSharedExtractors();
    document.body.innerHTML = '<div id="email"><a href="https://app.buildingconnected.com/bids/123">View Bid</a></div>';
    const emailBody = document.getElementById('email');
    const links = SE.extractDownloadLinks(emailBody, null);
    expect(links.length).toBe(1);
    expect(links[0].platform).toBe('BuildingConnected');
    expect(links[0].type).toBe('platform');
  });

  test('extracts file download links', () => {
    const SE = loadSharedExtractors();
    document.body.innerHTML = '<div id="email"><a href="https://example.com/plans.pdf">Plans PDF</a></div>';
    const emailBody = document.getElementById('email');
    const links = SE.extractDownloadLinks(emailBody, null);
    expect(links.length).toBe(1);
    expect(links[0].type).toBe('file');
  });

  test('deduplicates links', () => {
    const SE = loadSharedExtractors();
    document.body.innerHTML = '<div id="email"><a href="https://example.com/file.pdf">Link 1</a><a href="https://example.com/file.pdf">Link 2</a></div>';
    const emailBody = document.getElementById('email');
    const links = SE.extractDownloadLinks(emailBody, null);
    expect(links.length).toBe(1);
  });

  test('skips mailto and javascript links', () => {
    const SE = loadSharedExtractors();
    document.body.innerHTML = '<div id="email"><a href="mailto:test@x.com">Email</a><a href="javascript:void(0)">JS</a></div>';
    const emailBody = document.getElementById('email');
    const links = SE.extractDownloadLinks(emailBody, null);
    expect(links.length).toBe(0);
  });

  test('filters out data: URIs', () => {
    const SE = loadSharedExtractors();
    document.body.innerHTML = '<div id="email"><a href="data:text/html,<script>alert(1)</script>">Malicious</a><a href="https://example.com/plans.pdf">Plans</a></div>';
    const emailBody = document.getElementById('email');
    const links = SE.extractDownloadLinks(emailBody, null);
    // Only the https link should pass
    expect(links.length).toBe(1);
    expect(links[0].url).toContain('plans.pdf');
  });
});

describe('SharedExtractors double-initialization guard', () => {
  test('does not overwrite existing SharedExtractors', () => {
    const SE = loadSharedExtractors();
    // Add a marker
    SE._marker = true;
    // Load again
    loadSharedExtractors();
    // Marker should still exist (module skipped re-init)
    expect(window.SharedExtractors._marker).toBe(true);
  });
});
