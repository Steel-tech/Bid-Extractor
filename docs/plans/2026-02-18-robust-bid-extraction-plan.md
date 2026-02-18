# Robust Bid Extraction Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make the bid-extractor Chrome extension reliably extract all project information from emails — PM name, GC company, full email notes, thread messages, submission instructions, pre-bid meeting info, addenda, bond requirements — and output rich bid_info.txt, Project_Info_Sheet.html, and clipboard-ready formats.

**Architecture:** New `email-parser.js` module with 4 sub-parsers (signature, sections, thread, metadata) consumed by both `gmail.js` and `outlook.js`. Enhanced popup outputs and copy dropdown. No external dependencies — all regex/heuristic based.

**Tech Stack:** Vanilla JavaScript (Chrome Extension Manifest V3), Jest for testing, no build step.

---

### Task 1: Create email-parser.js — Signature Block Parser

**Files:**
- Create: `src/content/email-parser.js`
- Create: `src/__tests__/email-parser.test.js`

**Step 1: Write the failing test for signature extraction**

Create `src/__tests__/email-parser.test.js`:

```javascript
const { EmailParser } = require('../content/email-parser');

describe('EmailParser.extractSignature', () => {
  test('extracts name and title from "Best regards" signature', () => {
    const text = `Please submit your bid by Friday.

Best regards,
John Smith
Senior Project Manager
Turner Construction Company
jsmith@turner.com
(555) 123-4567`;

    const sig = EmailParser.extractSignature(text);
    expect(sig.name).toBe('John Smith');
    expect(sig.title).toBe('Senior Project Manager');
    expect(sig.company).toBe('Turner Construction Company');
    expect(sig.email).toBe('jsmith@turner.com');
    expect(sig.phone).toBe('(555) 123-4567');
  });

  test('extracts from dash-separated signature', () => {
    const text = `Let me know if you have questions.

--
Jane Doe
Estimating Manager
McCarthy Building Companies
jane.doe@mccarthy.com
Direct: 214-555-9876`;

    const sig = EmailParser.extractSignature(text);
    expect(sig.name).toBe('Jane Doe');
    expect(sig.title).toBe('Estimating Manager');
    expect(sig.company).toBe('McCarthy Building Companies');
    expect(sig.email).toBe('jane.doe@mccarthy.com');
    expect(sig.phone).toBe('214-555-9876');
  });

  test('extracts from "Sincerely" signature', () => {
    const text = `Thank you for your interest.

Sincerely,

Mike Johnson
Project Engineer
Hensel Phelps
mjohnson@henselphelps.com`;

    const sig = EmailParser.extractSignature(text);
    expect(sig.name).toBe('Mike Johnson');
    expect(sig.title).toBe('Project Engineer');
    expect(sig.company).toBe('Hensel Phelps');
  });

  test('extracts from "Thanks" signature', () => {
    const text = `See attached for details.

Thanks,
Sarah Lee
Preconstruction Coordinator
Skanska USA Building
sarah.lee@skanska.com
O: (972) 555-1234 | C: (469) 555-5678`;

    const sig = EmailParser.extractSignature(text);
    expect(sig.name).toBe('Sarah Lee');
    expect(sig.title).toBe('Preconstruction Coordinator');
    expect(sig.company).toBe('Skanska USA Building');
    expect(sig.email).toBe('sarah.lee@skanska.com');
  });

  test('returns empty object when no signature found', () => {
    const text = 'Just a short email with no signature.';
    const sig = EmailParser.extractSignature(text);
    expect(sig.name).toBe('');
    expect(sig.company).toBe('');
  });

  test('handles signature with phone label variations', () => {
    const text = `Regards,
Bob Builder
VP of Preconstruction
Walsh Construction
Tel: 312.555.7890
Mobile: (312) 555-1111
bob@walshgroup.com`;

    const sig = EmailParser.extractSignature(text);
    expect(sig.name).toBe('Bob Builder');
    expect(sig.phone).toMatch(/312/);
    expect(sig.email).toBe('bob@walshgroup.com');
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd /Users/vics/bid-extractor && npx jest src/__tests__/email-parser.test.js --verbose`
Expected: FAIL — `Cannot find module '../content/email-parser'`

**Step 3: Write the signature parser implementation**

Create `src/content/email-parser.js`:

```javascript
// @ts-nocheck
// Email Parser Module for Bid Extractor
// Parses email text into structured sections for robust bid extraction

const EmailParser = {
  /**
   * Extract signature block from email text
   * Looks for common signature delimiters and parses contact info
   * @param {string} text - Plain text email body
   * @returns {{ name: string, title: string, company: string, email: string, phone: string }}
   */
  extractSignature(text) {
    const result = { name: '', title: '', company: '', email: '', phone: '' };
    if (!text) return result;

    // Find signature boundary
    const sigPatterns = [
      /^--\s*$/m,                                    // -- delimiter
      /^(?:Best\s+regards|Regards|Sincerely|Thanks|Thank\s+you|Cheers|Respectfully),?\s*$/im,
      /^(?:Sent\s+from\s+my)/im,
    ];

    let sigStart = -1;
    for (const pattern of sigPatterns) {
      const match = text.match(pattern);
      if (match) {
        sigStart = match.index;
        break;
      }
    }

    if (sigStart === -1) return result;

    // Get signature text (everything after the delimiter)
    const sigText = text.substring(sigStart);
    const lines = sigText.split('\n')
      .map(l => l.trim())
      .filter(l => l.length > 0);

    // Skip the delimiter line itself
    const contentLines = [];
    let pastDelimiter = false;
    for (const line of lines) {
      if (!pastDelimiter) {
        // Skip delimiter lines (--,  Best regards, etc.)
        if (/^(?:--|Best\s+regards|Regards|Sincerely|Thanks|Thank\s+you|Cheers|Respectfully),?\s*$/i.test(line)) {
          pastDelimiter = true;
          continue;
        }
        pastDelimiter = true;
      }
      contentLines.push(line);
    }

    // Extract email from any line
    const emailMatch = contentLines.join('\n').match(/([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/);
    if (emailMatch) result.email = emailMatch[1];

    // Extract phone from any line
    const phoneMatch = contentLines.join('\n').match(/(?:Phone|Tel|Cell|Mobile|Direct|Office|O|C|M|Fax)?[:\s]*(\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4})/i);
    if (phoneMatch) result.phone = phoneMatch[1];

    // Parse structured lines (name is typically first non-empty line after delimiter)
    const nonContactLines = contentLines.filter(line => {
      // Skip lines that are just email, phone, or URL
      if (/^[a-zA-Z0-9._%+-]+@/.test(line)) return false;
      if (/^(?:Phone|Tel|Cell|Mobile|Direct|Office|O|C|M|Fax)[:\s]/i.test(line)) return false;
      if (/^\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/.test(line)) return false;
      if (/^https?:\/\//.test(line)) return false;
      if (/^www\./i.test(line)) return false;
      return true;
    });

    // First non-contact line is usually the name
    if (nonContactLines.length >= 1) {
      result.name = nonContactLines[0].replace(/,?\s*$/, '');
    }

    // Second line is usually the title
    if (nonContactLines.length >= 2) {
      result.title = nonContactLines[1].replace(/,?\s*$/, '');
    }

    // Third line is usually the company
    if (nonContactLines.length >= 3) {
      result.company = nonContactLines[2].replace(/,?\s*$/, '');
    }

    // If company not found in position, look for construction keywords
    if (!result.company) {
      for (const line of nonContactLines) {
        if (/(?:Construction|Builders|Contracting|Building|Companies|Group|Inc|LLC|Corp)/i.test(line)) {
          result.company = line.replace(/,?\s*$/, '');
          break;
        }
      }
    }

    return result;
  },
};

// Export for both Node.js (tests) and browser (content script)
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { EmailParser };
}
```

**Step 4: Run test to verify it passes**

Run: `cd /Users/vics/bid-extractor && npx jest src/__tests__/email-parser.test.js --verbose`
Expected: All 6 signature tests PASS

**Step 5: Commit**

```bash
git add src/content/email-parser.js src/__tests__/email-parser.test.js
git commit -m "feat: add email-parser module with signature block extraction"
```

---

### Task 2: Add Section Identifier to email-parser.js

**Files:**
- Modify: `src/content/email-parser.js`
- Modify: `src/__tests__/email-parser.test.js`

**Step 1: Write the failing test for section identification**

Add to `src/__tests__/email-parser.test.js`:

```javascript
describe('EmailParser.identifySections', () => {
  test('extracts labeled sections from structured email', () => {
    const text = `Dear Subcontractor,

We are requesting bids for the following project.

Project Name: Dallas Medical Center Expansion
Location: 1234 Main St, Dallas, TX 75201
Bid Date: February 25, 2026 at 2:00 PM CST

Scope of Work:
Furnish and install structural steel, miscellaneous metals,
and steel deck per plans and specifications.
Approximately 500 tons.

Submission Instructions:
Please submit your proposal via BuildingConnected
by 2:00 PM CST on February 25, 2026.
Include all alternates and unit prices.

Pre-Bid Meeting:
Date: February 18, 2026 at 10:00 AM
Location: Project Site - 1234 Main St, Dallas, TX
Attendance is mandatory for all bidders.

Bond Requirements:
Bid Bond: 5% of bid amount
Performance and Payment Bond: 100% of contract

Thank you for your interest.`;

    const sections = EmailParser.identifySections(text);
    expect(sections.project).toBe('Dallas Medical Center Expansion');
    expect(sections.location).toBe('1234 Main St, Dallas, TX 75201');
    expect(sections.scope).toContain('structural steel');
    expect(sections.submissionInstructions).toContain('BuildingConnected');
    expect(sections.preBidMeeting).toContain('February 18');
    expect(sections.bondRequirements).toContain('5%');
  });

  test('captures general notes from unstructured email', () => {
    const text = `Hi Team,

I wanted to reach out regarding an upcoming steel package. We have a
new warehouse project in Houston that needs structural steel and joists.
The plans are not finalized yet but we expect around 200 tons.

Let me know if you're interested and I'll send the plans over.

Thanks,
Mark`;

    const sections = EmailParser.identifySections(text);
    expect(sections.generalNotes).toContain('warehouse project in Houston');
    expect(sections.generalNotes).toContain('200 tons');
  });

  test('extracts scope from "includes" pattern', () => {
    const text = `The steel package includes:
- Structural steel framing
- Miscellaneous metals
- Steel deck (composite)
- Connection design

Bid Date: March 1, 2026`;

    const sections = EmailParser.identifySections(text);
    expect(sections.scope).toContain('Structural steel framing');
  });

  test('handles emails with no clear sections', () => {
    const text = 'Quick note - bid is due Friday. Plans on BC.';
    const sections = EmailParser.identifySections(text);
    expect(sections.generalNotes).toBe('Quick note - bid is due Friday. Plans on BC.');
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd /Users/vics/bid-extractor && npx jest src/__tests__/email-parser.test.js --verbose --testNamePattern="identifySections"`
Expected: FAIL — `EmailParser.identifySections is not a function`

**Step 3: Implement section identification**

Add to `src/content/email-parser.js` inside the `EmailParser` object, after `extractSignature`:

```javascript
  /**
   * Identify and extract sections from email body text
   * @param {string} text - Plain text email body
   * @returns {{ project: string, location: string, scope: string, submissionInstructions: string, preBidMeeting: string, bondRequirements: string, addenda: string, generalNotes: string }}
   */
  identifySections(text) {
    const result = {
      project: '',
      location: '',
      scope: '',
      submissionInstructions: '',
      preBidMeeting: '',
      bondRequirements: '',
      addenda: '',
      generalNotes: '',
    };

    if (!text) return result;

    // Remove signature block for section parsing
    const sigBoundary = text.search(/^(?:--|Best\s+regards|Regards|Sincerely|Thanks|Thank\s+you|Cheers),?\s*$/im);
    const bodyText = sigBoundary > 0 ? text.substring(0, sigBoundary).trim() : text.trim();

    // Extract labeled fields (Key: Value on same line)
    const fieldPatterns = {
      project: /(?:Project(?:\s+Name)?|Job(?:\s+Name)?)[:\s]+(.+?)(?:\n|$)/i,
      location: /(?:(?:Project\s+)?Location|Site(?:\s+Address)?|Address)[:\s]+(.+?)(?:\n|$)/i,
    };

    for (const [field, pattern] of Object.entries(fieldPatterns)) {
      const match = bodyText.match(pattern);
      if (match?.[1]) {
        result[field] = match[1].trim();
      }
    }

    // Extract multi-line sections (Header:\n content...)
    const sectionDefs = [
      { key: 'scope', patterns: [
        /(?:Scope\s+of\s+Work|Scope|Work\s+Package|Steel\s+Package)[:\s]*\n([\s\S]*?)(?=\n\s*(?:[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*\s*:|$))/i,
        /(?:(?:The\s+)?(?:steel\s+)?package\s+includes)[:\s]*\n?([\s\S]*?)(?=\n\s*(?:[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*\s*:|$))/i,
        /(?:Scope\s+of\s+Work|Scope)[:\s]+(.+?)(?:\n\n|$)/is,
      ]},
      { key: 'submissionInstructions', patterns: [
        /(?:Submission\s+Instructions?|How\s+to\s+(?:Submit|Bid)|Submit(?:tal)?\s+(?:Requirements?|Instructions?))[:\s]*\n?([\s\S]*?)(?=\n\s*(?:[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*\s*:|$))/i,
        /(?:Please\s+submit|Proposals?\s+(?:should|shall|must)\s+be\s+(?:submitted|sent))([\s\S]*?)(?:\.\s*\n|\n\n)/i,
      ]},
      { key: 'preBidMeeting', patterns: [
        /(?:Pre-?\s*Bid\s+(?:Meeting|Conference|Walk))[:\s]*\n?([\s\S]*?)(?=\n\s*(?:[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*\s*:|$))/i,
      ]},
      { key: 'bondRequirements', patterns: [
        /(?:Bond\s+Requirements?|Bonding)[:\s]*\n?([\s\S]*?)(?=\n\s*(?:[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*\s*:|$))/i,
      ]},
      { key: 'addenda', patterns: [
        /(?:Addend(?:a|um))[:\s]*\n?([\s\S]*?)(?=\n\s*(?:[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*\s*:|$))/i,
      ]},
    ];

    for (const { key, patterns } of sectionDefs) {
      for (const pattern of patterns) {
        const match = bodyText.match(pattern);
        if (match?.[1]) {
          result[key] = match[1].trim();
          break;
        }
      }
    }

    // General notes: capture the full body text (for raw reference)
    // Remove greeting lines at start
    let notes = bodyText
      .replace(/^(?:Dear|Hi|Hello|Good\s+(?:morning|afternoon|evening))[\s\S]*?,?\s*\n\n?/i, '')
      .trim();

    // If no structured sections were found, the entire body is general notes
    const hasStructuredContent = result.project || result.scope || result.submissionInstructions;
    if (!hasStructuredContent) {
      result.generalNotes = notes;
    } else {
      result.generalNotes = bodyText.trim();
    }

    return result;
  },
```

**Step 4: Run test to verify it passes**

Run: `cd /Users/vics/bid-extractor && npx jest src/__tests__/email-parser.test.js --verbose --testNamePattern="identifySections"`
Expected: All 4 section tests PASS

**Step 5: Commit**

```bash
git add src/content/email-parser.js src/__tests__/email-parser.test.js
git commit -m "feat: add section identifier to email-parser"
```

---

### Task 3: Add Thread Parser to email-parser.js

**Files:**
- Modify: `src/content/email-parser.js`
- Modify: `src/__tests__/email-parser.test.js`

**Step 1: Write the failing test for thread parsing**

Add to `src/__tests__/email-parser.test.js`:

```javascript
describe('EmailParser.extractThreadMessages', () => {
  test('extracts messages from "On ... wrote:" thread', () => {
    const text = `Here is the updated scope.

Best regards,
John

On Mon, Feb 10, 2026 at 3:15 PM Jane Doe <jane@turner.com> wrote:
> Hi John,
> Can you send the updated drawings?
> Thanks,
> Jane

On Fri, Feb 7, 2026 at 9:00 AM John Smith <john@steelco.com> wrote:
> Attached are the initial plans for review.
> Let me know if you have questions.`;

    const messages = EmailParser.extractThreadMessages(text);
    expect(messages.length).toBe(3);
    expect(messages[0].body).toContain('updated scope');
    expect(messages[1].sender).toContain('Jane Doe');
    expect(messages[1].body).toContain('updated drawings');
    expect(messages[2].sender).toContain('John Smith');
  });

  test('extracts from forwarded message', () => {
    const text = `FYI - see below for the original RFQ.

---------- Forwarded message ---------
From: Mark Wilson <mark@gccompany.com>
Date: Wed, Feb 5, 2026 at 10:30 AM
Subject: RFQ - Steel Package

Please bid on the attached steel package.`;

    const messages = EmailParser.extractThreadMessages(text);
    expect(messages.length).toBe(2);
    expect(messages[1].sender).toContain('Mark Wilson');
    expect(messages[1].body).toContain('steel package');
  });

  test('returns single message for non-threaded email', () => {
    const text = 'Please submit your bid by Friday.';
    const messages = EmailParser.extractThreadMessages(text);
    expect(messages.length).toBe(1);
    expect(messages[0].body).toContain('submit your bid');
  });

  test('handles empty input', () => {
    expect(EmailParser.extractThreadMessages('')).toEqual([]);
    expect(EmailParser.extractThreadMessages(null)).toEqual([]);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd /Users/vics/bid-extractor && npx jest src/__tests__/email-parser.test.js --verbose --testNamePattern="extractThreadMessages"`
Expected: FAIL

**Step 3: Implement thread parser**

Add to `src/content/email-parser.js` inside the `EmailParser` object:

```javascript
  /**
   * Extract individual messages from an email thread
   * @param {string} text - Full email text including thread
   * @returns {Array<{ sender: string, date: string, body: string }>}
   */
  extractThreadMessages(text) {
    if (!text) return [];

    const messages = [];

    // Split on thread boundaries
    const threadPatterns = [
      /\n\s*On\s+.+?\s+wrote:\s*\n/g,
      /\n\s*-{5,}\s*Forwarded\s+message\s*-{5,}\s*\n/gi,
      /\n\s*From:\s+.+?\n\s*(?:Sent|Date):\s+.+?\n/g,
    ];

    // Find all split points
    const splitPoints = [{ index: 0, sender: '', date: '' }];

    for (const pattern of threadPatterns) {
      let match;
      while ((match = pattern.exec(text)) !== null) {
        const header = match[0];
        let sender = '';
        let date = '';

        // Extract sender from "On ... <email> wrote:" pattern
        const onWroteMatch = header.match(/On\s+(.+?)\s+(.+?)\s*(?:<(.+?)>)?\s*wrote:/i);
        if (onWroteMatch) {
          date = onWroteMatch[1];
          sender = onWroteMatch[2] + (onWroteMatch[3] ? ` <${onWroteMatch[3]}>` : '');
        }

        // Extract from forwarded message
        const fromMatch = header.match(/From:\s*(.+?)(?:\n|$)/i);
        if (fromMatch) sender = fromMatch[1].trim();
        const dateMatch = header.match(/(?:Sent|Date):\s*(.+?)(?:\n|$)/i);
        if (dateMatch) date = dateMatch[1].trim();

        splitPoints.push({ index: match.index, headerEnd: match.index + match[0].length, sender, date });
      }
    }

    // Sort by position
    splitPoints.sort((a, b) => a.index - b.index);

    // Extract message bodies
    for (let i = 0; i < splitPoints.length; i++) {
      const start = splitPoints[i].headerEnd || splitPoints[i].index;
      const end = (i + 1 < splitPoints.length) ? splitPoints[i + 1].index : text.length;
      let body = text.substring(start, end).trim();

      // Remove quote markers (>) from replied text
      body = body.split('\n').map(line => line.replace(/^>\s?/, '')).join('\n').trim();

      if (body) {
        messages.push({
          sender: splitPoints[i].sender || '',
          date: splitPoints[i].date || '',
          body: body,
        });
      }
    }

    return messages;
  },
```

**Step 4: Run test to verify it passes**

Run: `cd /Users/vics/bid-extractor && npx jest src/__tests__/email-parser.test.js --verbose --testNamePattern="extractThreadMessages"`
Expected: All 4 thread parser tests PASS

**Step 5: Commit**

```bash
git add src/content/email-parser.js src/__tests__/email-parser.test.js
git commit -m "feat: add thread parser to email-parser"
```

---

### Task 4: Add Metadata Extractor to email-parser.js

**Files:**
- Modify: `src/content/email-parser.js`
- Modify: `src/__tests__/email-parser.test.js`

**Step 1: Write the failing test for metadata extraction**

Add to `src/__tests__/email-parser.test.js`:

```javascript
describe('EmailParser.extractMetadata', () => {
  test('extracts bid time separately from date', () => {
    const text = 'Bids are due by 2:00 PM CST on February 25, 2026.';
    const meta = EmailParser.extractMetadata(text);
    expect(meta.bidTime).toBe('2:00 PM CST');
  });

  test('extracts bid time with "before" pattern', () => {
    const text = 'Please submit before 5:00 PM EST.';
    const meta = EmailParser.extractMetadata(text);
    expect(meta.bidTime).toBe('5:00 PM EST');
  });

  test('extracts pre-bid meeting details', () => {
    const text = `Pre-Bid Meeting:
Date: February 18, 2026 at 10:00 AM
Location: Project Site - 1234 Main St
Attendance is mandatory.`;

    const meta = EmailParser.extractMetadata(text);
    expect(meta.preBidMeeting.date).toContain('February 18');
    expect(meta.preBidMeeting.location).toContain('1234 Main St');
    expect(meta.preBidMeeting.mandatory).toBe(true);
  });

  test('extracts addenda references', () => {
    const text = `Addendum No. 1 has been issued.
Please also see Addendum #2 attached.
Addendum 3 was posted to BuildingConnected.`;

    const meta = EmailParser.extractMetadata(text);
    expect(meta.addenda.length).toBe(3);
    expect(meta.addenda[0]).toContain('Addendum No. 1');
  });

  test('extracts bond requirements', () => {
    const text = `A bid bond of 5% is required.
Performance and payment bond will be required at 100%.`;

    const meta = EmailParser.extractMetadata(text);
    expect(meta.bondRequirements).toContain('bid bond');
    expect(meta.bondRequirements).toContain('5%');
  });

  test('extracts project manager from body', () => {
    const text = 'Project Manager: Sarah Johnson\nPlease direct questions to the PM.';
    const meta = EmailParser.extractMetadata(text);
    expect(meta.projectManager).toBe('Sarah Johnson');
  });

  test('returns empty values for no metadata', () => {
    const meta = EmailParser.extractMetadata('Just a short email.');
    expect(meta.bidTime).toBe('');
    expect(meta.addenda).toEqual([]);
    expect(meta.preBidMeeting.date).toBe('');
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd /Users/vics/bid-extractor && npx jest src/__tests__/email-parser.test.js --verbose --testNamePattern="extractMetadata"`
Expected: FAIL

**Step 3: Implement metadata extractor**

Add to `src/content/email-parser.js` inside the `EmailParser` object:

```javascript
  /**
   * Extract bid metadata from email text
   * @param {string} text - Email body text
   * @returns {{ bidTime: string, projectManager: string, preBidMeeting: { date: string, location: string, mandatory: boolean }, addenda: string[], bondRequirements: string }}
   */
  extractMetadata(text) {
    const result = {
      bidTime: '',
      projectManager: '',
      preBidMeeting: { date: '', location: '', mandatory: false },
      addenda: [],
      bondRequirements: '',
    };

    if (!text) return result;

    // Bid time extraction
    const timePatterns = [
      /(?:by|before|no\s+later\s+than)\s+(\d{1,2}:\d{2}\s*(?:AM|PM)\s*(?:[A-Z]{2,4})?)/i,
      /(?:due|deadline)\s+(?:at\s+)?(\d{1,2}:\d{2}\s*(?:AM|PM)\s*(?:[A-Z]{2,4})?)/i,
    ];
    for (const pattern of timePatterns) {
      const match = text.match(pattern);
      if (match?.[1]) {
        result.bidTime = match[1].trim();
        break;
      }
    }

    // Project Manager extraction
    const pmPatterns = [
      /(?:Project\s+Manager|PM|Point\s+of\s+Contact|POC)[:\s]+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)/,
      /(?:Contact|Direct\s+questions?\s+to)[:\s]+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)/,
    ];
    for (const pattern of pmPatterns) {
      const match = text.match(pattern);
      if (match?.[1]) {
        result.projectManager = match[1].trim();
        break;
      }
    }

    // Pre-bid meeting
    const preBidSection = text.match(/(?:Pre-?\s*Bid\s+(?:Meeting|Conference|Walk))[:\s]*\n?([\s\S]*?)(?:\n\s*\n|\n\s*[A-Z][a-z]+\s*:|$)/i);
    if (preBidSection) {
      const section = preBidSection[1] || preBidSection[0];

      const dateMatch = section.match(/(?:Date|When)[:\s]*(.+?)(?:\n|$)/i) ||
                         section.match(/(\w+\s+\d{1,2},?\s+\d{4}(?:\s+at\s+\d{1,2}:\d{2}\s*(?:AM|PM)?)?)/i);
      if (dateMatch) result.preBidMeeting.date = dateMatch[1].trim();

      const locMatch = section.match(/(?:Location|Where|At)[:\s]*(.+?)(?:\n|$)/i);
      if (locMatch) result.preBidMeeting.location = locMatch[1].trim();

      result.preBidMeeting.mandatory = /mandatory|required|must\s+attend/i.test(section);
    }

    // Addenda
    const addendaPattern = /(?:Addend(?:um|a)\s*(?:No\.?\s*|#)?\s*\d+[\s\S]*?)(?=(?:Addend(?:um|a)|$))/gi;
    let addMatch;
    while ((addMatch = addendaPattern.exec(text)) !== null) {
      const entry = addMatch[0].trim();
      if (entry.length > 0 && entry.length < 200) {
        result.addenda.push(entry);
      }
    }
    // Deduplicate if addenda pattern found nothing, try line-by-line
    if (result.addenda.length === 0) {
      const lines = text.split('\n');
      for (const line of lines) {
        if (/Addend(?:um|a)\s*(?:No\.?\s*|#)?\s*\d+/i.test(line)) {
          result.addenda.push(line.trim());
        }
      }
    }

    // Bond requirements
    const bondMatch = text.match(/((?:bid\s+bond|performance\s+(?:and\s+)?payment\s+bond|bonding)[\s\S]*?)(?:\n\s*\n|\n\s*[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*\s*:|$)/i);
    if (bondMatch) {
      result.bondRequirements = bondMatch[1].trim();
    } else {
      // Try multi-line capture
      const lines = text.split('\n');
      const bondLines = [];
      let inBond = false;
      for (const line of lines) {
        if (/(?:bid\s+bond|performance|payment\s+bond|bonding)/i.test(line)) {
          inBond = true;
        }
        if (inBond) {
          if (line.trim() === '' || /^[A-Z][a-z]+\s*:/i.test(line)) break;
          bondLines.push(line.trim());
        }
      }
      if (bondLines.length > 0) {
        result.bondRequirements = bondLines.join('\n');
      }
    }

    return result;
  },
```

**Step 4: Run test to verify it passes**

Run: `cd /Users/vics/bid-extractor && npx jest src/__tests__/email-parser.test.js --verbose --testNamePattern="extractMetadata"`
Expected: All 7 metadata tests PASS

**Step 5: Run all email-parser tests**

Run: `cd /Users/vics/bid-extractor && npx jest src/__tests__/email-parser.test.js --verbose`
Expected: All tests PASS (signature + sections + thread + metadata)

**Step 6: Commit**

```bash
git add src/content/email-parser.js src/__tests__/email-parser.test.js
git commit -m "feat: add metadata extractor (bid time, PM, pre-bid, addenda, bonds)"
```

---

### Task 5: Add parseFullEmail Orchestrator + Update manifest.json

**Files:**
- Modify: `src/content/email-parser.js`
- Modify: `src/__tests__/email-parser.test.js`
- Modify: `manifest.json`

**Step 1: Write the failing test for full parsing**

Add to `src/__tests__/email-parser.test.js`:

```javascript
describe('EmailParser.parseFullEmail', () => {
  test('combines all parsers into structured output', () => {
    const text = `Dear Subcontractor,

We are requesting bids for the following project.

Project Name: Dallas Medical Center Expansion
Location: 1234 Main St, Dallas, TX 75201
Project Manager: Sarah Johnson

Scope of Work:
Structural steel, misc metals, steel deck.
Approximately 500 tons.

Submission Instructions:
Submit via BuildingConnected by 2:00 PM CST on Feb 25, 2026.

Pre-Bid Meeting:
Date: February 18, 2026 at 10:00 AM
Location: Project Site
Attendance is mandatory.

Best regards,
John Smith
Senior PM
Turner Construction
jsmith@turner.com
(555) 123-4567`;

    const result = EmailParser.parseFullEmail(text);

    // Signature
    expect(result.signature.name).toBe('John Smith');
    expect(result.signature.company).toBe('Turner Construction');

    // Sections
    expect(result.sections.project).toBe('Dallas Medical Center Expansion');
    expect(result.sections.scope).toContain('structural steel');

    // Metadata
    expect(result.metadata.bidTime).toBe('2:00 PM CST');
    expect(result.metadata.projectManager).toBe('Sarah Johnson');
    expect(result.metadata.preBidMeeting.mandatory).toBe(true);

    // Thread (single message)
    expect(result.thread.length).toBe(1);

    // General notes
    expect(result.sections.generalNotes.length).toBeGreaterThan(0);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd /Users/vics/bid-extractor && npx jest src/__tests__/email-parser.test.js --verbose --testNamePattern="parseFullEmail"`
Expected: FAIL

**Step 3: Add parseFullEmail orchestrator**

Add to `src/content/email-parser.js` inside the `EmailParser` object:

```javascript
  /**
   * Parse an email fully — orchestrates all sub-parsers
   * @param {string} text - Full email text
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
```

**Step 4: Run test to verify it passes**

Run: `cd /Users/vics/bid-extractor && npx jest src/__tests__/email-parser.test.js --verbose`
Expected: ALL tests PASS

**Step 5: Update manifest.json to include email-parser.js in content scripts**

In `manifest.json`, add `"src/content/email-parser.js"` BEFORE `gmail.js` and `outlook.js` in both content_scripts entries:

For the Gmail content script (line 44), change:
```json
"js": ["src/utils/config-loader.js", "src/utils/safe-query.js", "src/content/gmail.js"]
```
to:
```json
"js": ["src/utils/config-loader.js", "src/utils/safe-query.js", "src/content/email-parser.js", "src/content/gmail.js"]
```

For the Outlook content script (line 54), change:
```json
"js": ["src/utils/config-loader.js", "src/utils/safe-query.js", "src/content/outlook.js"]
```
to:
```json
"js": ["src/utils/config-loader.js", "src/utils/safe-query.js", "src/content/email-parser.js", "src/content/outlook.js"]
```

**Step 6: Commit**

```bash
git add src/content/email-parser.js src/__tests__/email-parser.test.js manifest.json
git commit -m "feat: add parseFullEmail orchestrator, register parser in manifest"
```

---

### Task 6: Update gmail.js to Use Email Parser + Extract New Fields

**Files:**
- Modify: `src/content/gmail.js`

**Step 1: Update extractBidInfo() to read email thread**

In `src/content/gmail.js`, replace the section that reads email body (lines 53-115 approximately) to also read all thread messages. After finding the single `emailBody`, add thread reading:

After line 117 (`const emailText = emailBody.innerText || '';`), add:

```javascript
  const emailHtml = emailBody.innerHTML || '';

  // Read ALL messages in the thread (Gmail puts each in a separate .a3s container)
  const allMessageBodies = document.querySelectorAll('.a3s.aiL, .a3s');
  const threadTexts = [];
  allMessageBodies.forEach(msgBody => {
    const msgText = msgBody.innerText?.trim();
    if (msgText && msgText.length > 10) {
      threadTexts.push(msgText);
    }
  });

  // Combine all thread text for comprehensive parsing
  const fullThreadText = threadTexts.length > 1
    ? threadTexts.join('\n\n--- Next Message ---\n\n')
    : emailText;
```

**Step 2: Integrate EmailParser and add new fields**

Replace the bidInfo construction (lines 142-158) with:

```javascript
  // Use EmailParser for deep extraction
  const parsed = (typeof EmailParser !== 'undefined')
    ? EmailParser.parseFullEmail(emailText)
    : { signature: {}, sections: {}, thread: [], metadata: {} };

  // Build enhanced bid info
  const bidInfo = {
    // Core fields — use parser results with fallbacks to existing regex
    project: parsed.sections.project || extractProjectName(subject, emailText),
    gc: parsed.signature.company || extractGCName(senderName, emailText),
    bidDate: extractBidDate(emailText),
    location: parsed.sections.location || extractLocation(emailText),
    scope: parsed.sections.scope || extractScope(emailText),
    contact: senderName,
    email: senderEmail,
    phone: parsed.signature.phone || extractPhone(emailText),

    // New fields from parser
    projectManager: parsed.metadata.projectManager || parsed.signature.name || '',
    gcCompany: parsed.signature.company || extractGCName(senderName, emailText),
    gcEmail: parsed.signature.email || senderEmail,
    gcPhone: parsed.signature.phone || extractPhone(emailText),
    bidTime: parsed.metadata.bidTime || '',
    submissionInstructions: parsed.sections.submissionInstructions || '',
    preBidMeeting: parsed.metadata.preBidMeeting || { date: '', location: '', mandatory: false },
    addenda: parsed.metadata.addenda || [],
    bondRequirements: parsed.sections.bondRequirements || parsed.metadata.bondRequirements || '',
    generalNotes: parsed.sections.generalNotes || emailText,
    threadMessages: parsed.thread.length > 1 ? parsed.thread : (threadTexts.length > 1 ? threadTexts.map((t, i) => ({ sender: '', date: '', body: t })) : []),

    // Existing fields
    attachments: await extractAttachments(),
    downloadLinks: extractDownloadLinks(emailBody),
    notes: '',
    rawSubject: subject,
    rawText: emailText,
  };
```

**Step 3: Verify gmail.js loads without syntax errors**

Open `manifest.json` and confirm `email-parser.js` is listed before `gmail.js`.

**Step 4: Commit**

```bash
git add src/content/gmail.js
git commit -m "feat: integrate email-parser into gmail.js with new extraction fields"
```

---

### Task 7: Update outlook.js to Use Email Parser + Extract New Fields

**Files:**
- Modify: `src/content/outlook.js`

**Step 1: Apply the same enhancements to outlook.js**

After line 127 (`const emailText = emailBody.innerText || '';`), add:

```javascript
  const emailHtml = emailBody.innerHTML || '';

  // Read all message bodies in thread (Outlook uses multiple body containers)
  const allMessageBodies = emailContainer.querySelectorAll(
    '[aria-label*="Message body"], [id*="UniqueMessageBody"], .allowTextSelection'
  );
  const threadTexts = [];
  allMessageBodies.forEach(msgBody => {
    const msgText = msgBody.innerText?.trim();
    if (msgText && msgText.length > 10) {
      threadTexts.push(msgText);
    }
  });

  const fullThreadText = threadTexts.length > 1
    ? threadTexts.join('\n\n--- Next Message ---\n\n')
    : emailText;
```

Replace the bidInfo construction (lines 155-171) with the same enhanced version as Task 6 Step 2 (using `EmailParser.parseFullEmail`), with the same field structure.

**Step 2: Commit**

```bash
git add src/content/outlook.js
git commit -m "feat: integrate email-parser into outlook.js with new extraction fields"
```

---

### Task 8: Update popup.html with New Preview Fields + Copy Dropdown

**Files:**
- Modify: `src/popup/popup.html`

**Step 1: Add new preview rows**

In `src/popup/popup.html`, within the `.preview-card` div (after the existing preview rows at line 89), add new rows. Insert after the `preview-gc` row and before `preview-date`:

```html
          <div class="preview-row">
            <span class="label">pm:</span>
            <span id="preview-pm" class="value">-</span>
          </div>
```

After the `preview-date` row, add bid time:

```html
          <div class="preview-row">
            <span class="label">bid_time:</span>
            <span id="preview-time" class="value highlight">-</span>
          </div>
```

After the `preview-attachments` row (before closing `</div>` of preview-card), add:

```html
          <div class="preview-row">
            <span class="label">thread:</span>
            <span id="preview-thread" class="value">-</span>
          </div>
          <div class="preview-row preview-row-notes">
            <span class="label">notes:</span>
            <span id="preview-notes" class="value notes-preview">-</span>
          </div>
          <div id="notes-expanded" class="notes-expanded hidden">
            <pre id="notes-full-text"></pre>
          </div>
```

**Step 2: Replace the copy button with a copy dropdown**

Replace the existing copy button (lines 114-119) with:

```html
          <div class="copy-section">
            <button id="copy-btn" class="btn btn-secondary">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
              </svg>
              copy
            </button>
            <div id="copy-dropdown" class="copy-dropdown hidden">
              <button id="copy-all-btn" class="dropdown-item">copy all info</button>
              <button id="copy-spreadsheet-btn" class="dropdown-item">copy for spreadsheet</button>
              <button id="copy-notes-btn" class="dropdown-item">copy notes only</button>
            </div>
          </div>
```

**Step 3: Commit**

```bash
git add src/popup/popup.html
git commit -m "feat: add PM, bid time, thread, notes preview and copy dropdown to popup"
```

---

### Task 9: Update popup.css with New Styles

**Files:**
- Modify: `src/popup/popup.css`

**Step 1: Add styles for new elements**

Append to end of `src/popup/popup.css`:

```css
/* ============================================
   NOTES PREVIEW
   ============================================ */
.preview-row-notes {
  flex-direction: column;
}

.preview-row-notes .label {
  margin-bottom: 4px;
}

.notes-preview {
  max-height: 60px;
  overflow: hidden;
  position: relative;
  cursor: pointer;
  font-size: 12px;
  line-height: 1.4;
  color: var(--text-secondary);
}

.notes-preview::after {
  content: '... click to expand';
  position: absolute;
  bottom: 0;
  right: 0;
  background: linear-gradient(90deg, transparent, var(--bg-dark) 40%);
  padding-left: 20px;
  color: var(--matrix-green);
  font-family: var(--font-terminal);
  font-size: 10px;
}

.notes-expanded {
  background: var(--bg-deepest);
  border: 1px solid rgba(0, 255, 0, 0.1);
  border-radius: 6px;
  padding: 12px;
  margin-top: 8px;
  max-height: 200px;
  overflow-y: auto;
}

.notes-expanded pre {
  white-space: pre-wrap;
  word-wrap: break-word;
  font-family: var(--font-terminal);
  font-size: 11px;
  color: var(--text-secondary);
  margin: 0;
  line-height: 1.5;
}

/* ============================================
   COPY DROPDOWN
   ============================================ */
.copy-section {
  position: relative;
  flex: 1;
}

.copy-dropdown {
  position: absolute;
  bottom: 100%;
  left: 0;
  right: 0;
  background: var(--bg-dark);
  border: 1px solid rgba(0, 255, 0, 0.2);
  border-radius: 8px;
  box-shadow: 0 -4px 20px rgba(0, 0, 0, 0.5), 0 0 20px rgba(0, 255, 0, 0.1);
  margin-bottom: 4px;
  overflow: hidden;
  z-index: 10;
}

.copy-dropdown.hidden {
  display: none;
}
```

**Step 2: Commit**

```bash
git add src/popup/popup.css
git commit -m "feat: add styles for notes preview, expanded notes, copy dropdown"
```

---

### Task 10: Update popup.js — Enhanced Display, Outputs, and Copy Formats

**Files:**
- Modify: `src/popup/popup.js`

**Step 1: Update displayExtraction() to show new fields**

In `src/popup/popup.js`, update the `displayExtraction` function to populate the new DOM elements:

After `document.getElementById('preview-scope').textContent = data.scope || '-';` add:

```javascript
  // New fields
  document.getElementById('preview-pm').textContent = data.projectManager || '-';
  document.getElementById('preview-time').textContent = data.bidTime || '-';
  document.getElementById('preview-thread').textContent =
    data.threadMessages?.length > 0
      ? `${data.threadMessages.length} message(s) in thread`
      : 'Single message';

  // Notes preview
  const notesPreview = document.getElementById('preview-notes');
  const notesExpanded = document.getElementById('notes-expanded');
  const notesFullText = document.getElementById('notes-full-text');
  const notesText = data.generalNotes || data.rawText || '';

  if (notesText) {
    notesPreview.textContent = notesText.substring(0, 200);
    notesFullText.textContent = notesText;

    notesPreview.onclick = () => {
      notesExpanded.classList.toggle('hidden');
    };
  } else {
    notesPreview.textContent = '-';
  }
```

**Step 2: Update createSummaryText() with rich format**

Replace the `createSummaryText` function (around line 830) with:

```javascript
function createSummaryText(data) {
  let text = `BID INFORMATION
================
Extracted: ${new Date().toLocaleString()}

PROJECT: ${data.project || 'N/A'}
GENERAL CONTRACTOR: ${data.gcCompany || data.gc || 'N/A'}
PROJECT MANAGER: ${data.projectManager || 'N/A'}
BID DATE: ${data.bidDate || 'N/A'}
BID TIME: ${data.bidTime || 'N/A'}
LOCATION: ${data.location || 'N/A'}

CONTACT INFORMATION:
  Name: ${data.contact || 'N/A'}
  Title: ${data.projectManager ? 'Project Manager' : 'N/A'}
  Email: ${data.gcEmail || data.email || 'N/A'}
  Phone: ${data.gcPhone || data.phone || 'N/A'}

SCOPE OF WORK:
  ${data.scope || 'N/A'}
`;

  if (data.submissionInstructions) {
    text += `
SUBMISSION INSTRUCTIONS:
  ${data.submissionInstructions}
`;
  }

  if (data.preBidMeeting?.date) {
    text += `
PRE-BID MEETING:
  Date: ${data.preBidMeeting.date}
  Location: ${data.preBidMeeting.location || 'TBD'}
  Mandatory: ${data.preBidMeeting.mandatory ? 'Yes' : 'No'}
`;
  }

  if (data.bondRequirements) {
    text += `
BOND REQUIREMENTS:
  ${data.bondRequirements}
`;
  }

  if (data.addenda?.length > 0) {
    text += `
ADDENDA:
${data.addenda.map(a => `  - ${a}`).join('\n')}
`;
  }

  text += `
ATTACHMENTS:
${data.attachments?.map(a => `  - ${a.name}`).join('\n') || '  None'}
`;

  if (data.downloadLinks?.length > 0) {
    text += `
DOWNLOAD LINKS:
${data.downloadLinks.map(l => `  - ${l.platform}: ${l.url}`).join('\n')}
`;
  }

  text += `
GENERAL NOTES:
  ${data.generalNotes || data.rawText || 'N/A'}
`;

  if (data.threadMessages?.length > 1) {
    text += `
EMAIL THREAD:
`;
    data.threadMessages.forEach((msg, i) => {
      text += `  --- Message ${i + 1}${msg.sender ? ` (${msg.sender})` : ''}${msg.date ? ` - ${msg.date}` : ''} ---
  ${msg.body.substring(0, 500)}
`;
    });
  }

  return text;
}
```

**Step 3: Update createProjectInfoSheet() with new sections**

In the `createProjectInfoSheet` function, add new rows and sections. After the existing "Scope of Work" row in the project details table (around line 1040), add a Project Manager row:

```html
      <tr>
        <td>Project Manager</td>
        <td>${escapeHtml(data.projectManager || 'N/A')}</td>
      </tr>
```

Change the Bid Date row to include time:

```html
      <tr class="bid-date-row">
        <td>Bid Date / Deadline</td>
        <td>📅 ${escapeHtml(data.bidDate || 'N/A')}${data.bidTime ? ` at ${escapeHtml(data.bidTime)}` : ''}</td>
      </tr>
```

After the Contact Information section, add new sections:

```html
  ${data.submissionInstructions ? `
  <div class="section">
    <div class="section-title">📤 Submission Instructions</div>
    <div class="notes-area">${escapeHtml(data.submissionInstructions)}</div>
  </div>
  ` : ''}

  ${data.preBidMeeting?.date ? `
  <div class="section">
    <div class="section-title">🤝 Pre-Bid Meeting</div>
    <table>
      <tr><td>Date</td><td>${escapeHtml(data.preBidMeeting.date)}</td></tr>
      <tr><td>Location</td><td>${escapeHtml(data.preBidMeeting.location || 'TBD')}</td></tr>
      <tr><td>Mandatory</td><td>${data.preBidMeeting.mandatory ? '<strong style="color:#b45309">Yes - Required</strong>' : 'Optional'}</td></tr>
    </table>
  </div>
  ` : ''}

  ${data.bondRequirements ? `
  <div class="section">
    <div class="section-title">🔒 Bond Requirements</div>
    <div class="notes-area">${escapeHtml(data.bondRequirements)}</div>
  </div>
  ` : ''}

  ${data.addenda?.length > 0 ? `
  <div class="section">
    <div class="section-title">📋 Addenda</div>
    <ul>
      ${data.addenda.map(a => `<li>${escapeHtml(a)}</li>`).join('\n')}
    </ul>
  </div>
  ` : ''}
```

Update the Notes section to use `generalNotes`:

```html
  <div class="section">
    <div class="section-title">📝 General Notes</div>
    <div class="notes-area">
      ${escapeHtml(data.generalNotes || data.rawText || '')}
      &nbsp;
    </div>
  </div>
```

**Step 4: Add copy dropdown handlers**

After the existing `copyBtn.addEventListener('click', ...)` handler, add:

```javascript
// Copy dropdown toggle
copyBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  const dropdown = document.getElementById('copy-dropdown');
  if (dropdown) dropdown.classList.toggle('hidden');
});

// Copy All
document.getElementById('copy-all-btn')?.addEventListener('click', async () => {
  if (!currentExtraction) return;
  const text = createSummaryText(currentExtraction);
  await navigator.clipboard.writeText(text);
  showToast('Full bid info copied', 'success', 2000);
  document.getElementById('copy-dropdown')?.classList.add('hidden');
});

// Copy for Spreadsheet (tab-separated)
document.getElementById('copy-spreadsheet-btn')?.addEventListener('click', async () => {
  if (!currentExtraction) return;
  const d = currentExtraction;
  const headers = 'Project\tGC\tPM\tBid Date\tBid Time\tLocation\tScope\tEmail\tPhone';
  const values = [
    d.project || '', d.gcCompany || d.gc || '', d.projectManager || '',
    d.bidDate || '', d.bidTime || '', d.location || '', d.scope || '',
    d.gcEmail || d.email || '', d.gcPhone || d.phone || ''
  ].join('\t');
  await navigator.clipboard.writeText(headers + '\n' + values);
  showToast('Copied for spreadsheet', 'success', 2000);
  document.getElementById('copy-dropdown')?.classList.add('hidden');
});

// Copy Notes Only
document.getElementById('copy-notes-btn')?.addEventListener('click', async () => {
  if (!currentExtraction) return;
  const notes = currentExtraction.generalNotes || currentExtraction.rawText || '';
  await navigator.clipboard.writeText(notes);
  showToast('Notes copied', 'success', 2000);
  document.getElementById('copy-dropdown')?.classList.add('hidden');
});

// Close copy dropdown when clicking outside
document.addEventListener('click', (e) => {
  const dropdown = document.getElementById('copy-dropdown');
  const btn = document.getElementById('copy-btn');
  if (dropdown && btn && !btn.contains(e.target) && !dropdown.contains(e.target)) {
    dropdown.classList.add('hidden');
  }
});
```

NOTE: You'll need to remove/modify the original `copyBtn.addEventListener` click handler since we're replacing it. The new copy button toggles a dropdown. Remove the original handler (around line 779-805) and replace with the dropdown toggle above.

**Step 5: Run all tests to verify nothing broke**

Run: `cd /Users/vics/bid-extractor && npx jest --verbose`
Expected: All tests PASS

**Step 6: Commit**

```bash
git add src/popup/popup.js
git commit -m "feat: enhanced popup with rich outputs, notes preview, copy dropdown"
```

---

### Task 11: Final Integration Test + Version Bump

**Files:**
- Modify: `manifest.json` (version bump)
- Modify: `package.json` (version bump)

**Step 1: Run full test suite**

Run: `cd /Users/vics/bid-extractor && npx jest --verbose --coverage`
Expected: All tests PASS, coverage meets thresholds

**Step 2: Bump version to 1.6.0**

In `manifest.json`, change `"version": "1.5.0"` to `"version": "1.6.0"`.

In `package.json`, change `"version": "1.5.0"` to `"version": "1.6.0"`.

In `src/popup/popup.html`, change `v1.3.0` to `v1.6.0` (footer version display).

**Step 3: Commit**

```bash
git add manifest.json package.json src/popup/popup.html
git commit -m "chore: bump version to 1.6.0 - Robust Bid Extraction"
```

---

## Execution Notes

- **No external dependencies needed** — all regex/heuristic based
- **email-parser.js uses dual export pattern** — `module.exports` for Node.js tests + global `EmailParser` for browser
- **Content scripts load order matters** — email-parser.js must be listed BEFORE gmail.js/outlook.js in manifest
- **The copy button behavior changes** — from single-click copy to dropdown toggle. The original handler must be replaced, not duplicated
- **generalNotes stores the FULL email body** — no more 2000-char truncation
- **threadMessages only populated when multiple messages exist** — saves storage for single emails
