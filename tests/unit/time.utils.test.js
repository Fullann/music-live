const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const { formatRemainingDelay, msToMinutesCeil } = require("../../src/utils/time.utils");

describe("Time Utils Tests", () => {
  describe("formatRemainingDelay()", () => {
    it("should format seconds correctly when < 60s", () => {
      assert.strictEqual(formatRemainingDelay(1000), "1s");
      assert.strictEqual(formatRemainingDelay(45000), "45s");
      assert.strictEqual(formatRemainingDelay(59000), "59s");
    });

    it("should format minutes correctly without seconds", () => {
      assert.strictEqual(formatRemainingDelay(60000), "1 min");
      assert.strictEqual(formatRemainingDelay(120000), "2 min");
      assert.strictEqual(formatRemainingDelay(300000), "5 min");
    });

    it("should format combined minutes and seconds", () => {
      assert.strictEqual(formatRemainingDelay(65000), "1 min 5s");
      assert.strictEqual(formatRemainingDelay(150000), "2 min 30s");
      assert.strictEqual(formatRemainingDelay(125000), "2 min 5s");
    });

    it("should handle 0 or negative values gracefully", () => {
      assert.strictEqual(formatRemainingDelay(0), "1s");
      assert.strictEqual(formatRemainingDelay(-500), "1s");
    });
  });

  describe("msToMinutesCeil()", () => {
    it("should round up ms to nearest minute", () => {
      assert.strictEqual(msToMinutesCeil(1000), 1);
      assert.strictEqual(msToMinutesCeil(60000), 1);
      assert.strictEqual(msToMinutesCeil(60001), 2);
      assert.strictEqual(msToMinutesCeil(120000), 2);
      assert.strictEqual(msToMinutesCeil(180000), 3);
    });

    it("should return 1 as minimum even for 0 or negative values", () => {
      assert.strictEqual(msToMinutesCeil(0), 1);
      assert.strictEqual(msToMinutesCeil(-5000), 1);
    });
  });
});
