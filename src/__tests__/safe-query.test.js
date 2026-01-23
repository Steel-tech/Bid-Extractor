// Tests for safe-query utility

// Import the module - we need to set up the DOM first
beforeEach(() => {
  // Reset DOM
  document.body.innerHTML = '';

  // Clear any existing SafeQuery
  delete window.SafeQuery;
});

// Helper to load the safe-query module
function loadSafeQuery() {
  // We need to eval the module since it's not a proper ES module
  const fs = require('fs');
  const path = require('path');
  const code = fs.readFileSync(path.join(__dirname, '../utils/safe-query.js'), 'utf8');
  eval(code);
  return window.SafeQuery;
}

describe('SafeQuery.query', () => {
  test('finds element with first matching selector', () => {
    document.body.innerHTML = '<div class="test">Content</div>';
    const SafeQuery = loadSafeQuery();

    const result = SafeQuery.query(['.test', '.other'], document);
    expect(result).not.toBeNull();
    expect(result.textContent).toBe('Content');
  });

  test('falls back to next selector if first fails', () => {
    document.body.innerHTML = '<div class="other">Content</div>';
    const SafeQuery = loadSafeQuery();

    const result = SafeQuery.query(['.test', '.other'], document);
    expect(result).not.toBeNull();
    expect(result.className).toBe('other');
  });

  test('returns null when no selectors match', () => {
    document.body.innerHTML = '<div class="test">Content</div>';
    const SafeQuery = loadSafeQuery();

    const result = SafeQuery.query(['.missing', '.also-missing'], document, { silent: true });
    expect(result).toBeNull();
  });

  test('accepts single selector string', () => {
    document.body.innerHTML = '<div id="unique">Content</div>';
    const SafeQuery = loadSafeQuery();

    const result = SafeQuery.query('#unique', document);
    expect(result).not.toBeNull();
  });

  test('respects minTextLength option', () => {
    document.body.innerHTML = `
      <div class="short">Hi</div>
      <div class="long">This is much longer content that exceeds minimum</div>
    `;
    const SafeQuery = loadSafeQuery();

    // When minTextLength is specified, short text elements are skipped
    const result = SafeQuery.query(['.short', '.long'], document, { minTextLength: 10, silent: true });
    expect(result).not.toBeNull();
    expect(result.classList.contains('long')).toBe(true);
  });

  test('searches within context element', () => {
    document.body.innerHTML = `
      <div id="outer"><div class="target">Outer Target</div></div>
      <div id="inner"><div class="target">Inner Target</div></div>
    `;
    const SafeQuery = loadSafeQuery();
    const inner = document.getElementById('inner');

    const result = SafeQuery.query(['.target'], inner);
    expect(result.textContent).toBe('Inner Target');
  });
});

describe('SafeQuery.queryAll', () => {
  test('returns all matching elements', () => {
    document.body.innerHTML = `
      <div class="item">1</div>
      <div class="item">2</div>
      <div class="other">3</div>
    `;
    const SafeQuery = loadSafeQuery();

    const results = SafeQuery.queryAll(['.item']);
    expect(results.length).toBe(2);
  });

  test('combines results from multiple selectors', () => {
    document.body.innerHTML = `
      <div class="item">1</div>
      <div class="other">2</div>
    `;
    const SafeQuery = loadSafeQuery();

    const results = SafeQuery.queryAll(['.item', '.other']);
    expect(results.length).toBe(2);
  });

  test('deduplicates results', () => {
    document.body.innerHTML = '<div class="item test">1</div>';
    const SafeQuery = loadSafeQuery();

    const results = SafeQuery.queryAll(['.item', '.test']);
    expect(results.length).toBe(1);
  });

  test('returns empty array when nothing matches', () => {
    document.body.innerHTML = '<div class="test">Content</div>';
    const SafeQuery = loadSafeQuery();

    const results = SafeQuery.queryAll(['.missing']);
    expect(results).toEqual([]);
  });
});

describe('SafeQuery.createQuery', () => {
  test('creates pre-configured query function', () => {
    document.body.innerHTML = '<div class="email-body">Content</div>';
    const SafeQuery = loadSafeQuery();

    const findEmailBody = SafeQuery.createQuery(['.email-body', '.message-content']);
    const result = findEmailBody();
    expect(result.textContent).toBe('Content');
  });

  test('accepts additional options at call time', () => {
    document.body.innerHTML = `
      <div class="email-body">Short</div>
      <div class="message-content">This is longer content that exceeds minimum length</div>
    `;
    const SafeQuery = loadSafeQuery();

    const findEmailBody = SafeQuery.createQuery(['.email-body', '.message-content']);
    const result = findEmailBody(document, { minTextLength: 10, silent: true });
    expect(result).not.toBeNull();
    expect(result.classList.contains('message-content')).toBe(true);
  });
});

describe('SafeQuery.getErrorLog', () => {
  test('returns empty array initially', () => {
    const SafeQuery = loadSafeQuery();
    expect(SafeQuery.getErrorLog()).toEqual([]);
  });

  test('logs errors when selectors fail', () => {
    document.body.innerHTML = '<div>Content</div>';
    const SafeQuery = loadSafeQuery();

    // This should log an error
    SafeQuery.query(['.missing'], document, { name: 'test-element' });

    const errors = SafeQuery.getErrorLog();
    expect(errors.length).toBe(1);
    expect(errors[0].name).toBe('test-element');
    expect(errors[0].selectors).toEqual(['.missing']);
  });

  test('does not log when silent option is true', () => {
    document.body.innerHTML = '<div>Content</div>';
    const SafeQuery = loadSafeQuery();

    SafeQuery.query(['.missing'], document, { name: 'test', silent: true });

    expect(SafeQuery.getErrorLog().length).toBe(0);
  });
});

describe('SafeQuery.clearErrorLog', () => {
  test('clears all logged errors', () => {
    document.body.innerHTML = '<div>Content</div>';
    const SafeQuery = loadSafeQuery();

    SafeQuery.query(['.missing1'], document, { name: 'test1' });
    SafeQuery.query(['.missing2'], document, { name: 'test2' });

    expect(SafeQuery.getErrorLog().length).toBe(2);

    SafeQuery.clearErrorLog();

    expect(SafeQuery.getErrorLog()).toEqual([]);
  });
});

describe('error handling', () => {
  test('handles invalid selector gracefully', () => {
    document.body.innerHTML = '<div>Content</div>';
    const SafeQuery = loadSafeQuery();

    // Invalid selector should not throw
    expect(() => {
      SafeQuery.query(['[invalid['], document, { silent: true });
    }).not.toThrow();
  });
});
