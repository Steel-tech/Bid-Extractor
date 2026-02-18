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
