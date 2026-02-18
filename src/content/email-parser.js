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
};

// Dual export: Node.js (tests) and browser (content script)
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { EmailParser };
}
