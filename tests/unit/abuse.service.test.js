const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const abuseService = require("../../src/services/abuse.service");

describe("Abuse Service Penalty Tests", () => {
  it("should return no penalty for low scores (< 3)", () => {
    assert.deepStrictEqual(abuseService._computePenalty(0), { waitMs: 0, maxReduction: 0 });
    assert.deepStrictEqual(abuseService._computePenalty(1), { waitMs: 0, maxReduction: 0 });
    assert.deepStrictEqual(abuseService._computePenalty(2.9), { waitMs: 0, maxReduction: 0 });
  });

  it("should return 30s penalty and 1 request reduction for score 3 to 5.9", () => {
    assert.deepStrictEqual(abuseService._computePenalty(3), { waitMs: 30000, maxReduction: 1 });
    assert.deepStrictEqual(abuseService._computePenalty(4.5), { waitMs: 30000, maxReduction: 1 });
    assert.deepStrictEqual(abuseService._computePenalty(5.9), { waitMs: 30000, maxReduction: 1 });
  });

  it("should return 2 min penalty and 1 reduction for score 6 to 9.9", () => {
    assert.deepStrictEqual(abuseService._computePenalty(6), { waitMs: 120000, maxReduction: 1 });
    assert.deepStrictEqual(abuseService._computePenalty(8), { waitMs: 120000, maxReduction: 1 });
  });

  it("should return 10 min penalty and 2 reduction for high score (>= 10)", () => {
    assert.deepStrictEqual(abuseService._computePenalty(10), { waitMs: 600000, maxReduction: 2 });
    assert.deepStrictEqual(abuseService._computePenalty(25), { waitMs: 600000, maxReduction: 2 });
  });
});
