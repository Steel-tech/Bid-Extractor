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
