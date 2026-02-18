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
};

// Dual export: Node.js (tests) and browser (content script)
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { EmailParser };
}
