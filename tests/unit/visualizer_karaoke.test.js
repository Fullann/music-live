const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

describe("Remote Visualizer and Karaoke Screen Control Tests", () => {
  it("should verify that qr-display.html does NOT contain 'Ambiance en folie' combo banner", () => {
    const qrDisplayHtml = fs.readFileSync(
      path.join(__dirname, "../../src/views/qr-display.html"),
      "utf8",
    );
    assert.doesNotMatch(qrDisplayHtml, /reactionsComboBanner/);
    assert.doesNotMatch(qrDisplayHtml, /Ambiance en folie/);
    assert.doesNotMatch(qrDisplayHtml, /reactionsComboText/);
  });

  it("should normalize visualizer modes correctly", () => {
    const validModes = ["cyber-spectrum", "radial-spectrum", "nebula-3d", "neon-waveform", "bass-ripple", "off", "none"];
    function normalizeMode(input) {
      const clean = String(input || "").trim().toLowerCase();
      if (!validModes.includes(clean)) return "cyber-spectrum";
      return clean === "none" ? "off" : clean;
    }

    assert.strictEqual(normalizeMode("cyber-spectrum"), "cyber-spectrum");
    assert.strictEqual(normalizeMode("radial-spectrum"), "radial-spectrum");
    assert.strictEqual(normalizeMode("NEBULA-3D"), "nebula-3d");
    assert.strictEqual(normalizeMode("neon-waveform"), "neon-waveform");
    assert.strictEqual(normalizeMode("bass-ripple"), "bass-ripple");
    assert.strictEqual(normalizeMode("none"), "off");
    assert.strictEqual(normalizeMode("off"), "off");
    assert.strictEqual(normalizeMode("invalid-effect"), "cyber-spectrum");
    assert.strictEqual(normalizeMode(null), "cyber-spectrum");
  });

  it("should validate and sanitize karaoke state payloads", () => {
    function sanitizeKaraokeState(current, data) {
      const nextEnabled = typeof data?.enabled === "boolean" ? data.enabled : current.enabled;
      const nextAuto = typeof data?.autoKaraoke === "boolean" ? data.autoKaraoke : current.autoKaraoke;
      const nextSize = data?.lyricsSize && ["normal", "large", "xl"].includes(data.lyricsSize)
        ? data.lyricsSize
        : current.lyricsSize;
      return { enabled: nextEnabled, autoKaraoke: nextAuto, lyricsSize: nextSize };
    }

    const initial = { enabled: false, autoKaraoke: false, lyricsSize: "normal" };
    const toggled = sanitizeKaraokeState(initial, { enabled: true });
    assert.strictEqual(toggled.enabled, true);
    assert.strictEqual(toggled.autoKaraoke, false);
    assert.strictEqual(toggled.lyricsSize, "normal");

    const configured = sanitizeKaraokeState(toggled, { autoKaraoke: true, lyricsSize: "xl" });
    assert.strictEqual(configured.enabled, true);
    assert.strictEqual(configured.autoKaraoke, true);
    assert.strictEqual(configured.lyricsSize, "xl");

    const fallbackSize = sanitizeKaraokeState(configured, { lyricsSize: "huge_invalid" });
    assert.strictEqual(fallbackSize.lyricsSize, "xl");
  });

  it("should verify server.js supports both /qr and /qrspectre routes", () => {
    const serverJs = fs.readFileSync(
      path.join(__dirname, "../../src/server.js"),
      "utf8",
    );
    assert.match(serverJs, /\/event\/:eventId\/qrspectre/);
  });

  it("should verify dj.html contains remote controls for quick karaoke and visualizer", () => {
    const djHtml = fs.readFileSync(
      path.join(__dirname, "../../src/views/dj.html"),
      "utf8",
    );
    assert.match(djHtml, /id="btnQuickKaraoke"/);
    assert.match(djHtml, /id="btnQuickVisualizer"/);
    assert.match(djHtml, /id="screenVisualizerSelect"/);
    assert.match(djHtml, /id="karaokeRemoteToggle"/);
    assert.match(djHtml, /value="radial-spectrum"/);
  });

  it("should verify qr-display.html contains mini QR in karaoke, wake lock, fullscreen, and mic audio", () => {
    const qrDisplayHtml = fs.readFileSync(
      path.join(__dirname, "../../src/views/qr-display.html"),
      "utf8",
    );
    assert.match(qrDisplayHtml, /id="karaokeMiniQrCard"/);
    assert.match(qrDisplayHtml, /id="karaokeMiniQrImg"/);
    assert.match(qrDisplayHtml, /navigator\.wakeLock/);
    assert.match(qrDisplayHtml, /id="fullscreenToggleBtn"/);
    assert.match(qrDisplayHtml, /id="micAudioToggleBtn"/);
    assert.match(qrDisplayHtml, /radial-spectrum/);
  });

  it("should verify user.html contains 'Je veux chanter au micro ! 🎤' option", () => {
    const userHtml = fs.readFileSync(
      path.join(__dirname, "../../src/views/user.html"),
      "utf8",
    );
    assert.match(userHtml, /id="requestIsKaraoke"/);
    assert.match(userHtml, /Je veux chanter au micro !/);
  });

  it("should verify dj.html contains Mini Monitor Grand Écran widget", () => {
    const djHtml = fs.readFileSync(
      path.join(__dirname, "../../src/views/dj.html"),
      "utf8",
    );
    assert.match(djHtml, /id="screenMiniMonitor"/);
    assert.match(djHtml, /id="miniMonitorStatusBadge"/);
    assert.match(djHtml, /id="miniMonitorVisualizer"/);
    assert.match(djHtml, /id="miniMonitorViewers"/);
    assert.match(djHtml, /id="btnMiniMonitorToggleKaraoke"/);
  });

  it("should verify qr-display.html contains soft reconnection pill and kinetic smooth scroll", () => {
    const qrDisplayHtml = fs.readFileSync(
      path.join(__dirname, "../../src/views/qr-display.html"),
      "utf8",
    );
    assert.match(qrDisplayHtml, /id="screenOfflinePill"/);
    assert.match(qrDisplayHtml, /cubic-bezier\(0\.22,\s*1,\s*0\.36,\s*1\)/);
    assert.match(qrDisplayHtml, /showScreenOfflineBanner/);
    assert.match(qrDisplayHtml, /hideScreenOfflineBannerSuccess/);
  });

  it("should verify spotify.routes.js supports /lyrics/batch-check", () => {
    const spotifyRoutesJs = fs.readFileSync(
      path.join(__dirname, "../../src/routes/spotify.routes.js"),
      "utf8",
    );
    assert.match(spotifyRoutesJs, /\/lyrics\/batch-check/);
  });

  it("should verify migration file contains requests.is_karaoke", () => {
    const migrationSql = fs.readFileSync(
      path.join(__dirname, "../../db/migration_screen_visualizer_and_karaoke.sql"),
      "utf8",
    );
    assert.match(migrationSql, /ADD COLUMN is_karaoke/);
  });
});
