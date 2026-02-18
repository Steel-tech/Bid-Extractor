/**
 * Email Parser Module
 * Extracts structured data from email signature blocks.
 * Works in both Node.js (tests) and browser (content script) environments.
 */

const EmailParser = {
  /**
   * Signature boundary patterns.
   * Order matters: more specific patterns first.
   */
  SIGNATURE_DELIMITERS: [
    /^--\s*$/m,
    /^Best regards,?\s*$/im,
    /^Kind regards,?\s*$/im,
    /^Regards,?\s*$/im,
    /^Sincerely,?\s*$/im,
    /^Thanks,?\s*$/im,
    /^Thank you,?\s*$/im,
    /^Cheers,?\s*$/im,
    /^Respectfully,?\s*$/im,
  ],

  EMAIL_REGEX: /[\w.+-]+@[\w.-]+\.\w{2,}/,
  PHONE_REGEX: /(?:[(]?\d[\d.\-() ]{6,}\d)/,
  PHONE_LABEL_REGEX: /^(?:Tel|Telephone|Phone|Ph|Direct|Office|Cell|Mobile|Fax|O|C|M|F)\s*[:.]?\s*/i,
  PHONE_LINE_REGEX: /(?:Tel|Telephone|Phone|Ph|Direct|Office|Cell|Mobile|Fax|O|C|M|F)\s*[:.]?\s*[\d(]/i,

  /**
   * Extract signature information from email text.
   * @param {string} text - Full email body text
   * @returns {{ name: string, title: string, company: string, email: string, phone: string }}
   */
  extractSignature(text) {
    const empty = { name: '', title: '', company: '', email: '', phone: '' };

    if (!text || typeof text !== 'string') {
      return empty;
    }

    const signatureBlock = this._findSignatureBlock(text);
    if (!signatureBlock) {
      return empty;
    }

    return this._parseSignatureLines(signatureBlock);
  },

  /**
   * Find the signature block by locating the delimiter and returning
   * everything after it.
   * @param {string} text
   * @returns {string|null}
   */
  _findSignatureBlock(text) {
    let earliestIndex = -1;

    for (const pattern of this.SIGNATURE_DELIMITERS) {
      const match = text.match(pattern);
      if (match) {
        const idx = text.indexOf(match[0]);
        // Take the content after the delimiter line
        const afterDelimiter = text.slice(idx + match[0].length);
        if (earliestIndex === -1 || idx < earliestIndex) {
          earliestIndex = idx;
        }
        // We want the first matching delimiter
        if (earliestIndex === idx) {
          return afterDelimiter.trim();
        }
      }
    }

    return null;
  },

  /**
   * Parse signature lines into structured fields.
   * @param {string} block - Text after the signature delimiter
   * @returns {{ name: string, title: string, company: string, email: string, phone: string }}
   */
  _parseSignatureLines(block) {
    const result = { name: '', title: '', company: '', email: '', phone: '' };

    // Split into non-empty lines
    const allLines = block.split('\n').map(l => l.trim());
    const lines = allLines.filter(l => l.length > 0);

    if (lines.length === 0) {
      return result;
    }

    // Extract email from any line
    for (const line of lines) {
      const emailMatch = line.match(this.EMAIL_REGEX);
      if (emailMatch) {
        result.email = emailMatch[0];
        break;
      }
    }

    // Extract phone from any line (check labeled lines first, then bare numbers)
    result.phone = this._extractPhone(lines);

    // Identify "content" lines: lines that are not email-only, not phone-only
    const contentLines = lines.filter(line => {
      // Skip lines that are just an email address
      if (this.EMAIL_REGEX.test(line) && line.replace(this.EMAIL_REGEX, '').trim().length === 0) {
        return false;
      }
      // Skip lines that are primarily phone numbers (with or without labels)
      if (this._isPhoneLine(line)) {
        return false;
      }
      // Skip pipe-separated phone lines like "O: (972) 555-1234 | C: (469) 555-5678"
      if (line.includes('|') && this.PHONE_REGEX.test(line)) {
        return false;
      }
      return true;
    });

    // First content line = name, second = title, third = company
    if (contentLines.length >= 1) {
      result.name = contentLines[0];
    }
    if (contentLines.length >= 2) {
      result.title = contentLines[1];
    }
    if (contentLines.length >= 3) {
      result.company = contentLines[2];
    }

    return result;
  },

  /**
   * Extract the first phone number from signature lines.
   * Handles labeled phones (Tel:, Direct:, etc.) and bare numbers.
   * @param {string[]} lines
   * @returns {string}
   */
  _extractPhone(lines) {
    // First pass: look for labeled phone lines
    for (const line of lines) {
      if (this.PHONE_LINE_REGEX.test(line)) {
        const cleaned = line.replace(this.PHONE_LABEL_REGEX, '').trim();
        // Handle pipe-separated numbers: take the first one
        const parts = cleaned.split('|');
        const phoneMatch = parts[0].trim().match(this.PHONE_REGEX);
        if (phoneMatch) {
          return phoneMatch[0].trim();
        }
      }
    }

    // Second pass: look for bare phone numbers
    for (const line of lines) {
      // Skip lines that are email-only
      if (this.EMAIL_REGEX.test(line) && !this.PHONE_REGEX.test(line)) {
        continue;
      }
      const phoneMatch = line.match(this.PHONE_REGEX);
      if (phoneMatch) {
        return phoneMatch[0].trim();
      }
    }

    return '';
  },

  /**
   * Check if a line is primarily a phone number (with optional label).
   * @param {string} line
   * @returns {boolean}
   */
  _isPhoneLine(line) {
    // Labeled phone line
    if (this.PHONE_LINE_REGEX.test(line)) {
      return true;
    }
    // Bare phone number line (just digits, parens, dashes, dots, spaces)
    if (/^[\d(][\d.\-() ]+$/.test(line.trim())) {
      return true;
    }
    return false;
  },

  // --- Section identification ---

  /**
   * Greeting patterns to strip from the top of the email body.
   */
  GREETING_REGEX: /^(?:Dear\s+.+|Hi\s+.+|Hello\s+.+|Good\s+(?:morning|afternoon|evening).*)[\s,]*$/im,

  /**
   * Patterns that indicate the start of a signature / closing block.
   * Reuses SIGNATURE_DELIMITERS but also catches "Thank you for your interest" style closings.
   */
  CLOSING_PATTERNS: [
    /^--\s*$/m,
    /^Best regards,?\s*$/im,
    /^Kind regards,?\s*$/im,
    /^Regards,?\s*$/im,
    /^Sincerely,?\s*$/im,
    /^Thanks,?\s*$/im,
    /^Thank you,?\s*$/im,
    /^Cheers,?\s*$/im,
    /^Respectfully,?\s*$/im,
  ],

  /**
   * Single-line field patterns: label on same line as value.
   */
  FIELD_PATTERNS: {
    project: /^(?:Project\s*Name|Job\s*Name)\s*:\s*(.+)/im,
    location: /^(?:Location|Site\s*Address)\s*:\s*(.+)/im,
  },

  /**
   * Multi-line section headers. Each key maps to the regex that starts
   * the section; the section body is everything until the next header
   * or a double blank line.
   */
  SECTION_HEADERS: {
    scope: /^Scope\s+of\s+Work\s*:/im,
    submissionInstructions: /^Submission\s+Instructions?\s*:/im,
    preBidMeeting: /^Pre[- ]?Bid\s+Meeting\s*:/im,
    bondRequirements: /^Bond\s+Requirements?\s*:/im,
    addenda: /^Addenda\s*:/im,
  },

  /**
   * Generic header detector: a line that begins with one or more
   * capitalized words followed by a colon.
   */
  GENERIC_HEADER_REGEX: /^[A-Z][A-Za-z\s-]+:\s*$/,

  /**
   * Identify structured sections within an email body.
   * @param {string} text - Full email body text
   * @returns {{ project: string, location: string, scope: string,
   *             submissionInstructions: string, preBidMeeting: string,
   *             bondRequirements: string, addenda: string, generalNotes: string }}
   */
  identifySections(text) {
    const empty = {
      project: '',
      location: '',
      scope: '',
      submissionInstructions: '',
      preBidMeeting: '',
      bondRequirements: '',
      addenda: '',
      generalNotes: '',
    };

    if (!text || typeof text !== 'string') {
      return empty;
    }

    // 1. Strip signature / closing block
    const body = this._removeClosing(text);

    // 2. Strip greeting line(s) to build generalNotes base
    const bodyNoGreeting = this._removeGreeting(body);

    // 3. Extract single-line fields
    const result = { ...empty };
    for (const [key, pattern] of Object.entries(this.FIELD_PATTERNS)) {
      const match = body.match(pattern);
      if (match) {
        result[key] = match[1].trim();
      }
    }

    // 4. Extract multi-line sections
    for (const [key, headerPattern] of Object.entries(this.SECTION_HEADERS)) {
      const sectionText = this._extractMultiLineSection(body, headerPattern);
      if (sectionText) {
        result[key] = sectionText;
      }
    }

    // 5. Detect scope from "includes:" pattern if scope not already found
    if (!result.scope) {
      result.scope = this._extractIncludesScope(body);
    }

    // 6. Build generalNotes: body minus greeting and signature.
    //    If no structured sections were found, generalNotes is the whole cleaned body.
    result.generalNotes = bodyNoGreeting.trim();

    return result;
  },

  /**
   * Remove everything from the first closing/signature delimiter onward.
   * @param {string} text
   * @returns {string}
   */
  _removeClosing(text) {
    let earliest = text.length;

    for (const pattern of this.CLOSING_PATTERNS) {
      const match = text.match(pattern);
      if (match) {
        const idx = text.indexOf(match[0]);
        if (idx < earliest) {
          earliest = idx;
        }
      }
    }

    return text.slice(0, earliest).trim();
  },

  /**
   * Remove greeting lines from the top of the body.
   * Strips "Dear X," / "Hi Team," style lines and any immediately
   * following blank lines.
   * @param {string} text
   * @returns {string}
   */
  _removeGreeting(text) {
    const lines = text.split('\n');
    let start = 0;

    // Skip leading blank lines
    while (start < lines.length && lines[start].trim() === '') {
      start++;
    }

    // Check if first non-blank line is a greeting
    if (start < lines.length && this.GREETING_REGEX.test(lines[start].trim())) {
      start++;
      // Skip blank lines after greeting
      while (start < lines.length && lines[start].trim() === '') {
        start++;
      }
    }

    return lines.slice(start).join('\n').trim();
  },

  /**
   * Combined pattern matching any known top-level section header.
   * Used to detect section boundaries when extracting multi-line sections.
   * Short sub-field labels like "Date:" or "Location:" within a section
   * should NOT terminate it -- only these known top-level headers do.
   */
  TOP_LEVEL_HEADER_REGEX: /^(?:Scope\s+of\s+Work|Submission\s+Instructions?|Pre[- ]?Bid\s+Meeting|Bond\s+Requirements?|Addenda|Project\s*Name|Job\s*Name|Bid\s+Date)\s*:/i,

  /**
   * Extract a multi-line section that starts with the given header pattern.
   * The section ends at the next recognized top-level header or double blank line.
   * @param {string} text
   * @param {RegExp} headerPattern
   * @returns {string}
   */
  _extractMultiLineSection(text, headerPattern) {
    const match = text.match(headerPattern);
    if (!match) {
      return '';
    }

    const startIdx = text.indexOf(match[0]) + match[0].length;
    const rest = text.slice(startIdx);
    const lines = rest.split('\n');
    const collected = [];
    let blankCount = 0;

    for (const line of lines) {
      const trimmed = line.trim();

      // Only break on known top-level section headers, not sub-field labels
      if (collected.length > 0 && this.TOP_LEVEL_HEADER_REGEX.test(trimmed)) {
        break;
      }

      if (trimmed === '') {
        blankCount++;
        if (blankCount >= 2) {
          break;
        }
        collected.push(line);
      } else {
        blankCount = 0;
        collected.push(line);
      }
    }

    return collected.join('\n').trim();
  },

  /**
   * Extract scope from an "includes:" bullet-list pattern.
   * Matches lines like "The steel package includes:" followed by
   * bullet lines starting with "-" or "*".
   * @param {string} text
   * @returns {string}
   */
  _extractIncludesScope(text) {
    const includesMatch = text.match(/includes\s*:\s*$/im);
    if (!includesMatch) {
      return '';
    }

    const startIdx = text.indexOf(includesMatch[0]) + includesMatch[0].length;
    const rest = text.slice(startIdx);
    const lines = rest.split('\n');
    const bullets = [];

    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed === '') {
        if (bullets.length > 0) {
          break;
        }
        continue;
      }
      if (/^[-*]/.test(trimmed)) {
        bullets.push(trimmed);
      } else if (bullets.length > 0) {
        break;
      }
    }

    return bullets.join('\n').trim();
  },

  // --- Thread message extraction ---

  /**
   * Pattern: "On <date> <name> <email> wrote:"
   * Captures the full header line for sender/date extraction.
   */
  REPLY_HEADER_REGEX: /^On\s+.+\s+wrote:\s*$/m,

  /**
   * Pattern: forwarded message separator.
   */
  FORWARD_SEPARATOR_REGEX: /^-{5,}\s*Forwarded message\s*-{5,}\s*$/m,

  /**
   * Pattern: Outlook-style "From: ... Sent/Date: ..." header block.
   */
  OUTLOOK_HEADER_REGEX: /^From:\s+.+\n(?:Sent|Date):\s+.+/m,

  /**
   * Extract individual messages from an email thread.
   * Splits at reply headers ("On ... wrote:"), forwarded message
   * separators, and Outlook-style "From:/Sent:" blocks.
   *
   * @param {string} text - Full email body text (may include thread)
   * @returns {Array<{ sender: string, date: string, body: string }>}
   */
  extractThreadMessages(text) {
    if (!text || typeof text !== 'string' || text.trim() === '') {
      return [];
    }

    const segments = this._splitThreadSegments(text);

    if (segments.length === 0) {
      return [];
    }

    return segments.map(seg => ({
      sender: seg.sender,
      date: seg.date,
      body: seg.body,
    }));
  },

  /**
   * Split email text into thread segments at recognized boundaries.
   * Returns an array of { sender, date, body } objects ordered
   * newest-first (the first segment is the top-level message).
   *
   * @param {string} text
   * @returns {Array<{ sender: string, date: string, body: string }>}
   */
  _splitThreadSegments(text) {
    // Build a list of boundary positions with metadata
    const boundaries = [];

    // Find "On ... wrote:" boundaries
    const replyRegex = /^(On\s+(.+?)\s+(.+?)\s+wrote:)\s*$/gm;
    let match;
    while ((match = replyRegex.exec(text)) !== null) {
      const headerLine = match[1];
      const parsed = this._parseReplyHeader(headerLine);
      boundaries.push({
        index: match.index,
        headerEnd: match.index + match[0].length,
        sender: parsed.sender,
        date: parsed.date,
      });
    }

    // Find forwarded message boundaries
    const fwdRegex = /^-{5,}\s*Forwarded message\s*-{5,}\s*$/gm;
    while ((match = fwdRegex.exec(text)) !== null) {
      boundaries.push({
        index: match.index,
        headerEnd: match.index + match[0].length,
        sender: '',
        date: '',
        isForward: true,
      });
    }

    // Find Outlook-style "From: ... Sent/Date: ..." boundaries
    // Skip any that fall within a forwarded message header region
    const outlookRegex = /^From:\s+(.+)\n(?:Sent|Date):\s+(.+)/gm;
    while ((match = outlookRegex.exec(text)) !== null) {
      // Skip if this From/Date block is inside a forwarded separator's body
      const isInsideForward = boundaries.some(
        b => b.isForward && match.index > b.index && match.index <= b.headerEnd + 50
      );
      if (isInsideForward) {
        continue;
      }
      boundaries.push({
        index: match.index,
        headerEnd: match.index + match[0].length,
        sender: match[1].trim(),
        date: match[2].trim(),
      });
    }

    // No boundaries means single message
    if (boundaries.length === 0) {
      return [{ sender: '', date: '', body: text.trim() }];
    }

    // Sort by position in text
    boundaries.sort((a, b) => a.index - b.index);

    const segments = [];

    // First segment: everything before the first boundary
    const firstBody = text.slice(0, boundaries[0].index).trim();
    if (firstBody) {
      segments.push({ sender: '', date: '', body: firstBody });
    }

    // Remaining segments
    for (let i = 0; i < boundaries.length; i++) {
      const boundary = boundaries[i];
      const bodyStart = boundary.headerEnd;
      const bodyEnd = i + 1 < boundaries.length
        ? boundaries[i + 1].index
        : text.length;

      let body = text.slice(bodyStart, bodyEnd).trim();

      // For forwarded messages, extract From/Date from the body header lines
      if (boundary.isForward) {
        const fwdParsed = this._parseForwardedHeader(body);
        boundary.sender = fwdParsed.sender;
        boundary.date = fwdParsed.date;
        body = fwdParsed.body;
      }

      // Strip ">" quote markers from replied text
      body = this._stripQuoteMarkers(body);

      segments.push({
        sender: boundary.sender,
        date: boundary.date,
        body: body.trim(),
      });
    }

    return segments;
  },

  /**
   * Parse sender and date from "On <date info> <Name> <email> wrote:" header.
   * @param {string} header - The full "On ... wrote:" line
   * @returns {{ sender: string, date: string }}
   */
  _parseReplyHeader(header) {
    // Remove "On " prefix and " wrote:" suffix
    const inner = header
      .replace(/^On\s+/, '')
      .replace(/\s+wrote:$/i, '')
      .trim();

    // Try to extract sender with email: "Name <email>"
    const emailBracket = inner.match(/([^<]+)<[^>]+>\s*$/);
    if (emailBracket) {
      const sender = emailBracket[1].trim();
      const datePart = inner.slice(0, inner.indexOf(sender)).trim();
      // Remove trailing comma from date if present
      const date = datePart.replace(/,\s*$/, '').trim();
      return { sender, date };
    }

    // Fallback: last two words are the name, rest is date
    const parts = inner.split(/\s+/);
    if (parts.length >= 3) {
      const sender = parts.slice(-2).join(' ');
      const date = parts.slice(0, -2).join(' ').replace(/,\s*$/, '').trim();
      return { sender, date };
    }

    return { sender: inner, date: '' };
  },

  /**
   * Parse From/Date/Subject lines from a forwarded message header block.
   * Returns the parsed metadata and the remaining body after the headers.
   * @param {string} text - Body text after the forwarded separator
   * @returns {{ sender: string, date: string, body: string }}
   */
  _parseForwardedHeader(text) {
    const lines = text.split('\n');
    let sender = '';
    let date = '';
    let bodyStartIdx = 0;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();

      const fromMatch = line.match(/^From:\s+(.+)/i);
      if (fromMatch) {
        sender = fromMatch[1].trim();
        bodyStartIdx = i + 1;
        continue;
      }

      const dateMatch = line.match(/^Date:\s+(.+)/i);
      if (dateMatch) {
        date = dateMatch[1].trim();
        bodyStartIdx = i + 1;
        continue;
      }

      const subjectMatch = line.match(/^Subject:\s+(.+)/i);
      if (subjectMatch) {
        bodyStartIdx = i + 1;
        continue;
      }

      // Once we hit a non-header line (and we've seen at least one header), stop
      if ((sender || date) && line !== '') {
        bodyStartIdx = i;
        break;
      }

      // Skip blank lines between headers
      if (line === '' && (sender || date)) {
        bodyStartIdx = i + 1;
      }
    }

    const body = lines.slice(bodyStartIdx).join('\n').trim();
    return { sender, date, body };
  },

  /**
   * Strip leading ">" quote markers from each line of text.
   * @param {string} text
   * @returns {string}
   */
  _stripQuoteMarkers(text) {
    return text
      .split('\n')
      .map(line => line.replace(/^>\s?/, ''))
      .join('\n');
  },

  // --- Metadata extraction ---

  /**
   * Time pattern: H:MM or HH:MM followed by AM/PM and optional timezone.
   */
  BID_TIME_REGEX: /\d{1,2}:\d{2}\s*(?:AM|PM)\s*(?:[A-Z]{2,4})?/i,

  /**
   * Keywords that signal a bid time follows or precedes the time value.
   */
  BID_TIME_CONTEXT_KEYWORDS: /(?:by|before|no\s+later\s+than|due(?:\s+at)?|deadline)/i,

  /**
   * Patterns for extracting project manager name.
   * Matches "Project Manager:", "PM:", "Point of Contact:", "POC:", "Contact:"
   * followed by a name (capitalized words).
   */
  PM_REGEX: /^(?:Project\s+Manager|PM|Point\s+of\s+Contact|POC|Contact)\s*:\s*([A-Z][a-zA-Z]+(?:[ \t]+[A-Z][a-zA-Z]+)+)/im,

  /**
   * Patterns for addenda references on a line.
   */
  ADDENDUM_REGEX: /Addendum\s+(?:No\.?\s*|#)?\d+/gi,

  /**
   * Extract metadata from email body text.
   *
   * @param {string} text - Full email body text
   * @returns {{
   *   bidTime: string,
   *   projectManager: string,
   *   preBidMeeting: { date: string, location: string, mandatory: boolean },
   *   addenda: string[],
   *   bondRequirements: string
   * }}
   */
  extractMetadata(text) {
    const empty = {
      bidTime: '',
      projectManager: '',
      preBidMeeting: { date: '', location: '', mandatory: false },
      addenda: [],
      bondRequirements: '',
    };

    if (!text || typeof text !== 'string') {
      return empty;
    }

    return {
      bidTime: this._extractBidTime(text),
      projectManager: this._extractProjectManager(text),
      preBidMeeting: this._extractPreBidMeeting(text),
      addenda: this._extractAddenda(text),
      bondRequirements: this._extractBondRequirements(text),
    };
  },

  /**
   * Extract bid time from text.
   * Looks for time patterns near context keywords like "by", "before", "due".
   * @param {string} text
   * @returns {string}
   */
  _extractBidTime(text) {
    // Strategy: scan each sentence/clause for a context keyword near a time pattern.
    // We check line by line for better precision.
    const lines = text.split('\n');

    for (const line of lines) {
      if (!this.BID_TIME_CONTEXT_KEYWORDS.test(line)) {
        continue;
      }
      const timeMatch = line.match(this.BID_TIME_REGEX);
      if (timeMatch) {
        return timeMatch[0].trim();
      }
    }

    return '';
  },

  /**
   * Extract project manager name from text.
   * @param {string} text
   * @returns {string}
   */
  _extractProjectManager(text) {
    const match = text.match(this.PM_REGEX);
    if (match) {
      return match[1].trim();
    }
    return '';
  },

  /**
   * Extract pre-bid meeting details from a "Pre-Bid Meeting:" section.
   * @param {string} text
   * @returns {{ date: string, location: string, mandatory: boolean }}
   */
  _extractPreBidMeeting(text) {
    const result = { date: '', location: '', mandatory: false };

    // Find the Pre-Bid Meeting section
    const sectionMatch = text.match(/Pre[- ]?Bid\s+Meeting\s*:/i);
    if (!sectionMatch) {
      return result;
    }

    const startIdx = text.indexOf(sectionMatch[0]) + sectionMatch[0].length;
    const rest = text.slice(startIdx);

    // Take lines until a double blank or a new top-level section header
    const lines = rest.split('\n');
    const sectionLines = [];
    let blankCount = 0;

    for (const line of lines) {
      const trimmed = line.trim();

      // Stop at known top-level headers (but not sub-fields like Date:/Location:)
      if (sectionLines.length > 0 && this.TOP_LEVEL_HEADER_REGEX.test(trimmed)) {
        break;
      }

      if (trimmed === '') {
        blankCount++;
        if (blankCount >= 2) {
          break;
        }
      } else {
        blankCount = 0;
      }

      sectionLines.push(trimmed);
    }

    const sectionText = sectionLines.join('\n');

    // Extract Date: line
    const dateMatch = sectionText.match(/Date\s*:\s*(.+)/i);
    if (dateMatch) {
      result.date = dateMatch[1].trim();
    }

    // Extract Location: line
    const locationMatch = sectionText.match(/Location\s*:\s*(.+)/i);
    if (locationMatch) {
      result.location = locationMatch[1].trim();
    }

    // Check for mandatory/required/must attend
    if (/\b(?:mandatory|required|must\s+attend)\b/i.test(sectionText)) {
      result.mandatory = true;
    }

    return result;
  },

  /**
   * Extract addenda references from text.
   * Each line containing "Addendum No. X", "Addendum #X", or "Addendum X"
   * is captured as a separate entry.
   * @param {string} text
   * @returns {string[]}
   */
  _extractAddenda(text) {
    const results = [];
    const lines = text.split('\n');

    for (const line of lines) {
      const matches = line.match(this.ADDENDUM_REGEX);
      if (matches) {
        // For each match on this line, capture the full line trimmed
        // but only add the line once per unique addendum reference
        for (const m of matches) {
          results.push(line.trim());
        }
      }
    }

    // Deduplicate in case a single line had multiple matches
    // (we want one entry per line, not per match within a line)
    const seen = new Set();
    const deduped = [];
    for (const entry of results) {
      if (!seen.has(entry)) {
        seen.add(entry);
        deduped.push(entry);
      }
    }

    return deduped;
  },

  /**
   * Orchestrate all sub-parsers into a single structured result.
   * @param {string} text - Full email body text
   * @returns {{ signature: object, sections: object, thread: Array, metadata: object }}
   */
  parseFullEmail(text) {
    return {
      signature: this.extractSignature(text),
      sections: this.identifySections(text),
      thread: this.extractThreadMessages(text),
      metadata: this.extractMetadata(text),
    };
  },

  /**
   * Extract bond requirement text.
   * Finds lines mentioning "bid bond", "performance bond", or "payment bond"
   * and collects surrounding context.
   * @param {string} text
   * @returns {string}
   */
  _extractBondRequirements(text) {
    const bondPattern = /\b(?:bid\s+bond|performance\s+(?:and\s+payment\s+)?bond|payment\s+bond|surety\s+bond)\b/i;
    const lines = text.split('\n');
    const bondLines = [];

    for (const line of lines) {
      if (bondPattern.test(line)) {
        bondLines.push(line.trim());
      }
    }

    return bondLines.join('\n').trim();
  },
};

// Dual export: Node.js (tests) and browser (content script)
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { EmailParser };
}
