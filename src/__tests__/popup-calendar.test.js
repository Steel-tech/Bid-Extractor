// Tests for popup-calendar utility

beforeEach(() => {
  delete window.PopupCalendar;
});

// Helper to load the module
function loadPopupCalendar() {
  const fs = require('fs');
  const path = require('path');
  const code = fs.readFileSync(path.join(__dirname, '../popup/popup-calendar.js'), 'utf8');
  eval(code);
  return window.PopupCalendar;
}

describe('PopupCalendar.parseBidDate', () => {
  test('parses MM/DD/YYYY', () => {
    const Cal = loadPopupCalendar();
    const date = Cal.parseBidDate('01/15/2025');
    expect(date).toBeInstanceOf(Date);
    expect(date.getMonth()).toBe(0);
    expect(date.getDate()).toBe(15);
    expect(date.getFullYear()).toBe(2025);
  });

  test('parses YYYY-MM-DD', () => {
    const Cal = loadPopupCalendar();
    const date = Cal.parseBidDate('2025-03-20');
    expect(date).toBeInstanceOf(Date);
    expect(date.getMonth()).toBe(2);
    expect(date.getDate()).toBe(20);
  });

  test('parses "Month DD, YYYY"', () => {
    const Cal = loadPopupCalendar();
    const date = Cal.parseBidDate('January 15, 2025');
    expect(date).toBeInstanceOf(Date);
    expect(date.getMonth()).toBe(0);
    expect(date.getDate()).toBe(15);
  });

  test('parses abbreviated month "Jan 15, 2025"', () => {
    const Cal = loadPopupCalendar();
    const date = Cal.parseBidDate('Jan 15, 2025');
    expect(date).toBeInstanceOf(Date);
    expect(date.getMonth()).toBe(0);
  });

  test('parses "May 10, 2025" (the may bug)', () => {
    const Cal = loadPopupCalendar();
    const date = Cal.parseBidDate('May 10, 2025');
    expect(date).toBeInstanceOf(Date);
    expect(date.getMonth()).toBe(4); // May = 4
    expect(date.getDate()).toBe(10);
  });

  test('parses DD Month YYYY', () => {
    const Cal = loadPopupCalendar();
    const date = Cal.parseBidDate('15 January 2025');
    expect(date).toBeInstanceOf(Date);
    expect(date.getMonth()).toBe(0);
    expect(date.getDate()).toBe(15);
  });

  test('parses DD abbreviated Month YYYY', () => {
    const Cal = loadPopupCalendar();
    const date = Cal.parseBidDate('10 May 2025');
    expect(date).toBeInstanceOf(Date);
    expect(date.getMonth()).toBe(4);
    expect(date.getDate()).toBe(10);
  });

  test('returns null for empty/null', () => {
    const Cal = loadPopupCalendar();
    expect(Cal.parseBidDate('')).toBeNull();
    expect(Cal.parseBidDate(null)).toBeNull();
    expect(Cal.parseBidDate(undefined)).toBeNull();
  });

  test('returns null for garbage input', () => {
    const Cal = loadPopupCalendar();
    expect(Cal.parseBidDate('not a date at all xyz')).toBeNull();
  });
});

describe('PopupCalendar.createCalendarEvent', () => {
  test('creates event with correct title', () => {
    const Cal = loadPopupCalendar();
    const event = Cal.createCalendarEvent({
      project: 'Test Hospital',
      bidDate: '01/15/2025',
      location: 'Dallas, TX'
    });
    expect(event.title).toBe('BID DUE: Test Hospital');
    expect(event.location).toBe('Dallas, TX');
    expect(event.start).toBeInstanceOf(Date);
    expect(event.end).toBeInstanceOf(Date);
  });

  test('defaults to 2 PM when no time specified', () => {
    const Cal = loadPopupCalendar();
    const event = Cal.createCalendarEvent({
      project: 'Test',
      bidDate: '01/15/2025'
    });
    expect(event.start.getHours()).toBe(14);
    expect(event.start.getMinutes()).toBe(0);
  });

  test('extracts time from bidTime', () => {
    const Cal = loadPopupCalendar();
    const event = Cal.createCalendarEvent({
      project: 'Test',
      bidDate: '01/15/2025',
      bidTime: '3:30 PM'
    });
    expect(event.start.getHours()).toBe(15);
    expect(event.start.getMinutes()).toBe(30);
  });

  test('end is 1 hour after start', () => {
    const Cal = loadPopupCalendar();
    const event = Cal.createCalendarEvent({
      project: 'Test',
      bidDate: '01/15/2025'
    });
    expect(event.end.getTime() - event.start.getTime()).toBe(60 * 60 * 1000);
  });

  test('uses fallback date when bidDate is invalid', () => {
    const Cal = loadPopupCalendar();
    const event = Cal.createCalendarEvent({ project: 'Test' });
    // Should not throw, should default to future date
    expect(event.start).toBeInstanceOf(Date);
    expect(event.start.getTime()).toBeGreaterThan(Date.now());
  });
});

describe('PopupCalendar.createGoogleCalendarUrl', () => {
  test('creates a valid Google Calendar URL', () => {
    const Cal = loadPopupCalendar();
    const event = Cal.createCalendarEvent({
      project: 'Test',
      bidDate: '01/15/2025',
      location: 'Dallas'
    });
    const url = Cal.createGoogleCalendarUrl(event);
    expect(url).toContain('https://calendar.google.com/calendar/render');
    expect(url).toContain('action=TEMPLATE');
    expect(url).toContain('BID+DUE');
  });
});

describe('PopupCalendar.createOutlookCalendarUrl', () => {
  test('creates a valid Outlook Calendar URL', () => {
    const Cal = loadPopupCalendar();
    const event = Cal.createCalendarEvent({
      project: 'Test',
      bidDate: '01/15/2025'
    });
    const url = Cal.createOutlookCalendarUrl(event);
    expect(url).toContain('https://outlook.live.com/calendar');
    expect(url).toContain('subject=');
  });
});

describe('PopupCalendar.createICSFile', () => {
  test('produces valid ICS with CRLF line endings', () => {
    const Cal = loadPopupCalendar();
    const event = Cal.createCalendarEvent({
      project: 'Test Hospital',
      bidDate: '01/15/2025',
      location: 'Dallas, TX'
    });
    const ics = Cal.createICSFile(event);

    // Should use CRLF
    expect(ics).toContain('\r\n');
    // Should NOT have bare LF (every \n should be preceded by \r)
    const lines = ics.split('\r\n');
    for (const line of lines) {
      expect(line).not.toContain('\n');
    }

    // Must start with BEGIN:VCALENDAR
    expect(ics.startsWith('BEGIN:VCALENDAR\r\n')).toBe(true);
    // Must end with END:VCALENDAR
    expect(ics.trimEnd().endsWith('END:VCALENDAR')).toBe(true);

    // Must contain required fields
    expect(ics).toContain('DTSTART:');
    expect(ics).toContain('DTEND:');
    expect(ics).toContain('SUMMARY:');
    expect(ics).toContain('BEGIN:VALARM');
  });

  test('escapes commas, semicolons, and newlines in description', () => {
    const Cal = loadPopupCalendar();
    const event = Cal.createCalendarEvent({
      project: 'Test, Project; Phase 1',
      bidDate: '01/15/2025',
      gc: 'Turner, Inc.',
      gcCompany: 'Turner, Inc.'
    });
    const ics = Cal.createICSFile(event);
    // Commas and semicolons should be escaped in ICS content
    expect(ics).toContain('\\,');
  });

  test('contains two VALARM blocks', () => {
    const Cal = loadPopupCalendar();
    const event = Cal.createCalendarEvent({
      project: 'Test',
      bidDate: '01/15/2025'
    });
    const ics = Cal.createICSFile(event);
    const alarmCount = (ics.match(/BEGIN:VALARM/g) || []).length;
    expect(alarmCount).toBe(2);
  });
});

describe('PopupCalendar double-initialization guard', () => {
  test('does not overwrite existing PopupCalendar', () => {
    const Cal = loadPopupCalendar();
    Cal._marker = true;
    // Load again
    loadPopupCalendar();
    expect(window.PopupCalendar._marker).toBe(true);
  });
});
