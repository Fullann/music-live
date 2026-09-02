const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const { parseLrc } = require("../../src/utils/lyrics.utils");

describe("Lyrics LRC Parser Tests", () => {
  it("should parse valid LRC strings into timestamped lines", () => {
    const lrc = `
[00:12.34]Première phrase
[00:15.80]Deuxième phrase
[01:05.120]Refrain puissant !
    `.trim();

    const result = parseLrc(lrc);
    assert.strictEqual(result.length, 3);
    assert.strictEqual(result[0].time, 12.34);
    assert.strictEqual(result[0].text, "Première phrase");
    assert.strictEqual(result[1].time, 15.8);
    assert.strictEqual(result[1].text, "Deuxième phrase");
    assert.strictEqual(result[2].time, 65.12);
    assert.strictEqual(result[2].text, "Refrain puissant !");
  });

  it("should ignore header tags and empty text", () => {
    const lrc = `
[ti:Awesome Song]
[ar:Super Artist]
[00:05.00]
[00:10.50]Real Lyric Line
    `.trim();

    const result = parseLrc(lrc);
    assert.strictEqual(result.length, 1);
    assert.strictEqual(result[0].text, "Real Lyric Line");
    assert.strictEqual(result[0].time, 10.5);
  });

  it("should sort lines chronologically", () => {
    const lrc = `
[00:20.00]Line 2
[00:10.00]Line 1
    `.trim();

    const result = parseLrc(lrc);
    assert.strictEqual(result[0].text, "Line 1");
    assert.strictEqual(result[1].text, "Line 2");
  });

  it("should return an empty array for empty or invalid input", () => {
    assert.deepStrictEqual(parseLrc(""), []);
    assert.deepStrictEqual(parseLrc(null), []);
    assert.deepStrictEqual(parseLrc("Not an LRC text"), []);
  });
});
