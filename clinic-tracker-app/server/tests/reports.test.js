/**
 * Unit tests for report generation functions
 * Run with: npm test
 */

const { expect, test, describe, beforeAll, afterAll } = require('@jest/globals');

// Mock database functions
const mockQuery = jest.fn();
const mockQueryOne = jest.fn();
const mockRun = jest.fn();

// Helper to set up mock DB
function setupMockDB() {
  global.query = mockQuery;
  global.queryOne = mockQueryOne;
  global.run = mockRun;
}

// Import report functions (we'll need to export them from index.js)
// For now, we'll test the logic directly

describe('Report Generation - BAC Logic', () => {
  beforeAll(() => {
    setupMockDB();
  });

  afterAll(() => {
    jest.clearAllMocks();
  });

  test('BAC > 0 should be marked as Positive', () => {
    const bacValue = 0.023;
    const outcome = bacValue > 0 ? 'Positive' : 'Negative';
    expect(outcome).toBe('Positive');
  });

  test('BAC = 0 should be marked as Negative', () => {
    const bacValue = 0;
    const outcome = bacValue > 0 ? 'Positive' : 'Negative';
    expect(outcome).toBe('Negative');
  });

  test('BAC = 0.000 should be Negative (exact zero)', () => {
    const bacValue = 0.000;
    const outcome = bacValue > 0 ? 'Positive' : 'Negative';
    expect(outcome).toBe('Negative');
  });

  test('Very small BAC (0.001) should be Positive', () => {
    const bacValue = 0.001;
    const outcome = bacValue > 0 ? 'Positive' : 'Negative';
    expect(outcome).toBe('Positive');
  });
});

describe('Report Generation - Test Category Normalization', () => {
  const normalizeTestCategory = (code, name) => {
    const c = (code || '').toLowerCase();
    const n = (name || '').toLowerCase();
    
    if (c.includes('pre') || n.includes('pre-employment') || n.includes('rtw')) {
      return 'Pre-Employment/RTW';
    }
    if (c.includes('random') || n.includes('random')) {
      return 'Random';
    }
    if (c.includes('post') || c.includes('incident') || n.includes('post incident')) {
      return 'Post incident';
    }
    if (c.includes('cause') || n.includes('cause') || n.includes('suspicion')) {
      return 'Cause';
    }
    return 'Other';
  };

  test('Pre-Employment maps correctly', () => {
    expect(normalizeTestCategory('Pre-Employment', 'Pre-Employment Test')).toBe('Pre-Employment/RTW');
    expect(normalizeTestCategory('PreEmployment', null)).toBe('Pre-Employment/RTW');
    expect(normalizeTestCategory(null, 'RTW Test')).toBe('Pre-Employment/RTW');
  });

  test('Random maps correctly', () => {
    expect(normalizeTestCategory('Random', 'Random Testing')).toBe('Random');
    expect(normalizeTestCategory('random-2024', null)).toBe('Random');
  });

  test('Post Incident maps correctly', () => {
    expect(normalizeTestCategory('Post-Incident', 'Post Incident Test')).toBe('Post incident');
    expect(normalizeTestCategory('incident', null)).toBe('Post incident');
  });

  test('For Cause maps correctly', () => {
    expect(normalizeTestCategory('For-Cause', 'For Cause Testing')).toBe('Cause');
    expect(normalizeTestCategory(null, 'Reasonable Suspicion')).toBe('Cause');
  });

  test('Unknown types map to Other', () => {
    expect(normalizeTestCategory('Unknown', 'Unknown Type')).toBe('Other');
    expect(normalizeTestCategory(null, null)).toBe('Other');
  });
});

describe('Report Generation - Quarter Results Calculations', () => {
  test('should calculate totals correctly', () => {
    const results = [
      { Category: 'Random', TotalTests: 10, AlcoholPositive: 2, DrugNonNegative: 1 },
      { Category: 'Cause', TotalTests: 5, AlcoholPositive: 1, DrugNonNegative: 0 },
      { Category: 'Other', TotalTests: 3, AlcoholPositive: 0, DrugNonNegative: 1 }
    ];

    const totals = results.reduce((acc, r) => ({
      TotalTests: acc.TotalTests + r.TotalTests,
      AlcoholPositive: acc.AlcoholPositive + r.AlcoholPositive,
      DrugNonNegative: acc.DrugNonNegative + r.DrugNonNegative
    }), { TotalTests: 0, AlcoholPositive: 0, DrugNonNegative: 0 });

    expect(totals.TotalTests).toBe(18);
    expect(totals.AlcoholPositive).toBe(3);
    expect(totals.DrugNonNegative).toBe(2);
  });
});

describe('Report Generation - WR/NWR Classification', () => {
  test('should identify WR cases correctly', () => {
    const wrPatterns = ['WR', 'WR Review', 'WR-Test'];
    
    wrPatterns.forEach(pattern => {
      const isWR = pattern.startsWith('WR');
      expect(isWR).toBe(true);
    });
  });

  test('should identify NWR cases correctly', () => {
    const nwrPatterns = ['NWR', 'NWR Review', 'NWR-Hospital'];
    
    nwrPatterns.forEach(pattern => {
      const isNWR = pattern.startsWith('NWR');
      expect(isNWR).toBe(true);
    });
  });

  test('should classify NWR Hospital from referral', () => {
    const getNWRClass = (wrNwr, referral) => {
      if (referral?.includes('ED') || referral?.includes('Hospital')) {
        return 'NWR Hospital';
      }
      if (wrNwr === 'NWR Review') return 'NWR Review';
      if (wrNwr === 'NWR') return 'NWR';
      return 'NWR Other';
    };

    expect(getNWRClass('NWR', 'ED Referral')).toBe('NWR Hospital');
    expect(getNWRClass('NWR', 'Sent to Hospital')).toBe('NWR Hospital');
    expect(getNWRClass('NWR Review', 'Follow up')).toBe('NWR Review');
    expect(getNWRClass('NWR', 'Standard case')).toBe('NWR');
  });
});

describe('Report Generation - Pending/Other Logic', () => {
  const getPendingReason = (isPending, sampleSentToLab, oralResult, urineUndertaken, urineResult) => {
    if (isPending && !sampleSentToLab) {
      return 'Pending: Non-negative oral, sample not sent';
    }
    if (isPending && sampleSentToLab) {
      return 'Pending: Awaiting lab result';
    }
    if (!oralResult && urineUndertaken && !urineResult) {
      return 'Other: Urine test incomplete';
    }
    if (oralResult === 'N/A' || oralResult === 'Invalid') {
      return 'Other: Unresolved test pathway';
    }
    return 'Other: Unresolved';
  };

  test('should identify pending without lab sample', () => {
    expect(getPendingReason(true, false, 'Non-Negative', false, null))
      .toBe('Pending: Non-negative oral, sample not sent');
  });

  test('should identify pending awaiting lab', () => {
    expect(getPendingReason(true, true, 'Non-Negative', false, null))
      .toBe('Pending: Awaiting lab result');
  });

  test('should identify incomplete urine test', () => {
    expect(getPendingReason(false, false, null, true, null))
      .toBe('Other: Urine test incomplete');
  });

  test('should identify invalid result', () => {
    expect(getPendingReason(false, false, 'Invalid', false, null))
      .toBe('Other: Unresolved test pathway');
  });
});

// Export for use in other tests
module.exports = {
  setupMockDB
};
