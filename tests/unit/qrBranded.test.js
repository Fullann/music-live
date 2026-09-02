const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const { buildBrandedQrDataUrl } = require("../../src/utils/qrBranded");

describe("QR Code Generation Tests", () => {
  it("should generate a valid PNG data URL for a given target URL", async () => {
    const dataUrl = await buildBrandedQrDataUrl("https://music-live.fullann.ch/event/123", "Soirée VIP");
    assert.strictEqual(typeof dataUrl, "string");
    assert.match(dataUrl, /^data:image\/(png|svg\+xml);base64,/);
  });

  it("should generate QR with title even with special XML characters", async () => {
    process.env.ENABLE_BRANDED_QR = "1";
    const dataUrl = await buildBrandedQrDataUrl("https://music-live.fullann.ch/event/456", "DJ <Mix> & 'Rock' \"Live\"");
    assert.strictEqual(typeof dataUrl, "string");
    assert.match(dataUrl, /^data:image\/(png|svg\+xml);base64,/);
    delete process.env.ENABLE_BRANDED_QR;
  });
});
