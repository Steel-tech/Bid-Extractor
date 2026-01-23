// Jest setup file for Chrome extension environment

// Mock Chrome APIs
global.chrome = {
  runtime: {
    getURL: jest.fn((path) => `chrome-extension://test-extension-id/${path}`),
    sendMessage: jest.fn(() => Promise.resolve()),
    onMessage: {
      addListener: jest.fn()
    },
    lastError: null,
    onInstalled: {
      addListener: jest.fn()
    }
  },
  storage: {
    local: {
      get: jest.fn(() => Promise.resolve({})),
      set: jest.fn(() => Promise.resolve())
    }
  },
  downloads: {
    download: jest.fn((options, callback) => {
      if (callback) callback(1);
      return 1;
    })
  },
  tabs: {
    query: jest.fn(() => Promise.resolve([{ id: 1, url: 'https://mail.google.com/' }])),
    sendMessage: jest.fn(() => Promise.resolve()),
    create: jest.fn(() => Promise.resolve({ id: 2 }))
  }
};

// Mock fetch for config loading
global.fetch = jest.fn((url) => {
  // Return mock configs based on URL
  if (url.includes('gc-list.json')) {
    return Promise.resolve({
      ok: true,
      json: () => Promise.resolve({
        contractors: ['turner', 'skanska', 'mortenson']
      })
    });
  }
  if (url.includes('keywords.json')) {
    return Promise.resolve({
      ok: true,
      json: () => Promise.resolve({
        highValueKeywords: ['hospital', 'data center', 'stadium']
      })
    });
  }
  if (url.includes('priority-weights.json')) {
    return Promise.resolve({
      ok: true,
      json: () => Promise.resolve({
        maxScore: 100,
        weights: {
          deadline: { maxPoints: 40 },
          gcReputation: { maxPoints: 20, majorGcPoints: 20, knownGcPoints: 10 },
          projectValue: { maxPoints: 20, pointsPerKeyword: 5 },
          dataCompleteness: { maxPoints: 10, pointsPerField: 1.5, fields: ['project', 'gc', 'bidDate'] },
          attachments: { maxPoints: 10, pointsPerAttachment: 2 }
        },
        priorityLevels: {
          high: { minScore: 70, label: 'HIGH' },
          medium: { minScore: 40, label: 'MED' },
          low: { minScore: 0, label: 'LOW' }
        }
      })
    });
  }
  return Promise.resolve({
    ok: true,
    json: () => Promise.resolve({})
  });
});

// Reset mocks before each test
beforeEach(() => {
  jest.clearAllMocks();
});
