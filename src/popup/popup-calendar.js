// @ts-nocheck
// Popup Calendar Utilities for Bid Extractor
// Calendar event creation, Google Calendar, Outlook, ICS file generation

(function() {
  'use strict';

  if (window.PopupCalendar) return;

  // Single month name map shared by all date parsers
  var MONTH_MAP = {
    'january': 0, 'february': 1, 'march': 2, 'april': 3, 'may': 4, 'june': 5,
    'july': 6, 'august': 7, 'september': 8, 'october': 9, 'november': 10, 'december': 11,
    'jan': 0, 'feb': 1, 'mar': 2, 'apr': 3, 'may': 4, 'jun': 5,
    'jul': 6, 'aug': 7, 'sep': 8, 'oct': 9, 'nov': 10, 'dec': 11
  };

  /**
   * Parse bid date string into Date object
   * @param {string} dateStr
   * @returns {Date|null}
   */
  function parseBidDate(dateStr) {
    if (!dateStr) return null;

    // Try MM/DD/YYYY
    var match = dateStr.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
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
      var month = MONTH_MAP[match[1].toLowerCase()];
      if (month !== undefined) {
        return new Date(match[3], month, match[2]);
      }
    }

    // Try DD Month YYYY
    match = dateStr.match(/(\d{1,2})\s+(\w+)\s+(\d{4})/);
    if (match) {
      var month2 = MONTH_MAP[match[2].toLowerCase()];
      if (month2 !== undefined) {
        return new Date(match[3], month2, match[1]);
      }
    }

    // Fallback to Date.parse
    var parsed = Date.parse(dateStr);
    if (!isNaN(parsed)) {
      return new Date(parsed);
    }

    return null;
  }

  /**
   * Create calendar event data from bid extraction
   * @param {Object} data - Bid extraction data
   * @returns {Object} Calendar event object
   */
  function createCalendarEvent(data) {
    var bidDate = parseBidDate(data.bidDate);

    // Default to today + 7 days if no valid date
    var eventDate = bidDate || new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    // Extract time from bidTime field, bidDate, or default to 2 PM
    var hours = 14;
    var minutes = 0;

    var timeSource = data.bidTime || data.bidDate || '';
    if (timeSource) {
      var timeMatch = timeSource.match(/(\d{1,2}):(\d{2})\s*(am|pm)?/i);
      if (timeMatch) {
        hours = parseInt(timeMatch[1]);
        minutes = parseInt(timeMatch[2]);
        if (timeMatch[3]?.toLowerCase() === 'pm' && hours < 12) hours += 12;
        if (timeMatch[3]?.toLowerCase() === 'am' && hours === 12) hours = 0;
      }
    }

    eventDate.setHours(hours, minutes, 0, 0);

    // End time is 1 hour later
    var endDate = new Date(eventDate.getTime() + 60 * 60 * 1000);

    return {
      title: 'BID DUE: ' + (data.project || 'Unknown Project'),
      description: 'Project: ' + (data.project || 'N/A') + '\n' +
        'General Contractor: ' + (data.gcCompany || data.gc || 'N/A') + '\n' +
        'Project Manager: ' + (data.projectManager || 'N/A') + '\n' +
        'Location: ' + (data.location || 'N/A') + '\n' +
        'Scope: ' + (data.scope || 'N/A') + '\n' +
        (data.submissionInstructions ? '\nSubmission: ' + data.submissionInstructions + '\n' : '') +
        'Contact: ' + (data.projectManager || data.contact || 'N/A') + '\n' +
        'Email: ' + (data.gcEmail || data.email || 'N/A') + '\n' +
        'Phone: ' + (data.gcPhone || data.phone || 'N/A') + '\n\n' +
        'Attachments: ' + (data.attachments?.length || 0) + ' file(s)',
      location: data.location || '',
      start: eventDate,
      end: endDate
    };
  }

  /**
   * Format date for Google Calendar URL (YYYYMMDDTHHmmss)
   * @param {Date} date
   * @returns {string}
   */
  function formatDateGoogle(date) {
    return date.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
  }

  /**
   * Create Google Calendar URL
   * @param {Object} event - Calendar event object
   * @returns {string}
   */
  function createGoogleCalendarUrl(event) {
    var baseUrl = 'https://calendar.google.com/calendar/render';
    var params = new URLSearchParams({
      action: 'TEMPLATE',
      text: event.title,
      dates: formatDateGoogle(event.start) + '/' + formatDateGoogle(event.end),
      details: event.description,
      location: event.location
    });

    return baseUrl + '?' + params.toString();
  }

  /**
   * Create Outlook Calendar URL
   * @param {Object} event - Calendar event object
   * @returns {string}
   */
  function createOutlookCalendarUrl(event) {
    var baseUrl = 'https://outlook.live.com/calendar/0/deeplink/compose';
    var params = new URLSearchParams({
      subject: event.title,
      startdt: event.start.toISOString(),
      enddt: event.end.toISOString(),
      body: event.description,
      location: event.location,
      path: '/calendar/action/compose',
      rru: 'addevent'
    });

    return baseUrl + '?' + params.toString();
  }

  /**
   * Create .ics file content
   * @param {Object} event - Calendar event object
   * @returns {string}
   */
  function createICSFile(event) {
    function formatICSDate(date) {
      return date.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
    }

    function escapeICS(str) {
      return (str || '').replace(/\n/g, '\\n').replace(/,/g, '\\,').replace(/;/g, '\\;');
    }

    var uid = 'bid-' + Date.now() + '@bidextractor';
    var now = formatICSDate(new Date());

    // RFC 5545 requires CRLF line endings
    var ics = 'BEGIN:VCALENDAR\n' +
      'VERSION:2.0\n' +
      'PRODID:-//Bid Extractor//Chrome Extension//EN\n' +
      'BEGIN:VEVENT\n' +
      'UID:' + uid + '\n' +
      'DTSTAMP:' + now + '\n' +
      'DTSTART:' + formatICSDate(event.start) + '\n' +
      'DTEND:' + formatICSDate(event.end) + '\n' +
      'SUMMARY:' + escapeICS(event.title) + '\n' +
      'DESCRIPTION:' + escapeICS(event.description) + '\n' +
      'LOCATION:' + escapeICS(event.location) + '\n' +
      'BEGIN:VALARM\n' +
      'TRIGGER:-P1D\n' +
      'ACTION:DISPLAY\n' +
      'DESCRIPTION:Bid due tomorrow: ' + escapeICS(event.title) + '\n' +
      'END:VALARM\n' +
      'BEGIN:VALARM\n' +
      'TRIGGER:-PT2H\n' +
      'ACTION:DISPLAY\n' +
      'DESCRIPTION:Bid due in 2 hours: ' + escapeICS(event.title) + '\n' +
      'END:VALARM\n' +
      'END:VEVENT\n' +
      'END:VCALENDAR';
    return ics.replace(/\n/g, '\r\n');
  }

  // Export
  window.PopupCalendar = {
    parseBidDate: parseBidDate,
    createCalendarEvent: createCalendarEvent,
    formatDateGoogle: formatDateGoogle,
    createGoogleCalendarUrl: createGoogleCalendarUrl,
    createOutlookCalendarUrl: createOutlookCalendarUrl,
    createICSFile: createICSFile
  };

})();
