const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const { getCamelotInfo, getHarmonicMatch } = require("../../src/utils/camelot.utils");

describe("Camelot Wheel Harmonic Detection Tests", () => {
  describe("getCamelotInfo()", () => {
    it("should correctly map C Major (key 0, mode 1) to 8B", () => {
      const res = getCamelotInfo(0, 1);
      assert.deepStrictEqual(res, {
        camelot: "8B",
        musical: "C",
        mode: "Major",
        key: 0,
      });
    });

    it("should correctly map A Minor (key 9, mode 0) to 8A", () => {
      const res = getCamelotInfo(9, 0);
      assert.deepStrictEqual(res, {
        camelot: "8A",
        musical: "F#m",
        mode: "Minor",
        key: 9,
      });
    });

    it("should correctly map C Minor (key 0, mode 0) to 5A", () => {
      const res = getCamelotInfo(0, 0);
      assert.deepStrictEqual(res, {
        camelot: "5A",
        musical: "Am",
        mode: "Minor",
        key: 0,
      });
    });

    it("should return null for invalid keys", () => {
      assert.strictEqual(getCamelotInfo(null, 1), null);
      assert.strictEqual(getCamelotInfo(-1, 1), null);
      assert.strictEqual(getCamelotInfo(12, 1), null);
      assert.strictEqual(getCamelotInfo(undefined, 0), null);
    });
  });

  describe("getHarmonicMatch()", () => {
    it("should detect Perfect Mix (same Camelot code)", () => {
      const match = getHarmonicMatch("8A", "8A");
      assert.strictEqual(match.type, "perfect");
      assert.match(match.label, /Mix Parfait/);
    });

    it("should detect Relative Major/Minor (same number, opposite letter)", () => {
      const match1 = getHarmonicMatch("8A", "8B");
      assert.strictEqual(match1.type, "relative");
      assert.match(match1.label, /Relatif/);

      const match2 = getHarmonicMatch("5B", "5A");
      assert.strictEqual(match2.type, "relative");
      assert.match(match2.label, /Relatif/);
    });

    it("should detect Harmonic Neighbor (+1 or -1 on same letter)", () => {
      const matchPlus = getHarmonicMatch("8A", "9A");
      assert.strictEqual(matchPlus.type, "harmonic");

      const matchMinus = getHarmonicMatch("8A", "7A");
      assert.strictEqual(matchMinus.type, "harmonic");

      // Circular wrap 12A <-> 1A
      const matchWrap1 = getHarmonicMatch("12A", "1A");
      assert.strictEqual(matchWrap1.type, "harmonic");

      const matchWrap2 = getHarmonicMatch("1A", "12A");
      assert.strictEqual(matchWrap2.type, "harmonic");
    });

    it("should detect Energy Boost (+2 on same letter)", () => {
      const matchBoost = getHarmonicMatch("8A", "10A");
      assert.strictEqual(matchBoost.type, "boost");
      assert.match(matchBoost.label, /Boost \+2/);

      // Wrap boost 11B -> 1B
      const matchBoostWrap = getHarmonicMatch("11B", "1B");
      assert.strictEqual(matchBoostWrap.type, "boost");
    });

    it("should return null for incompatible keys", () => {
      assert.strictEqual(getHarmonicMatch("8A", "3B"), null);
      assert.strictEqual(getHarmonicMatch("1A", "6A"), null);
      assert.strictEqual(getHarmonicMatch(null, "8A"), null);
      assert.strictEqual(getHarmonicMatch("8A", ""), null);
    });
  });
});
