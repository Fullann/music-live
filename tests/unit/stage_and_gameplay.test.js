const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { getCamelotInfo, getHarmonicMatch } = require("../../src/utils/camelot.utils");

describe("Stage Experience, Hype Meter, Blind-Test & Harmonic Matching Tests", () => {

  // ── 1. Décompte d'Intro Visuel Karaoké ──
  describe("1. Visual Intro Countdown Logic", () => {
    function computeIntroCountdown(curSec, firstLineTime) {
      if (firstLineTime < 3.5) return { visible: false };
      const diff = firstLineTime - curSec;
      if (diff > 0 && diff <= 5.0) {
        const progress = Math.max(0, Math.min(1, diff / 5.0));
        const count = Math.ceil(diff);
        return {
          visible: true,
          phase: count > 3 ? "ready" : "countdown",
          count: count > 3 ? "READY" : String(count),
          progressRatio: progress,
        };
      }
      if (diff <= 0 && diff >= -1.4) {
        return {
          visible: true,
          phase: "sing",
          count: "CHANTEZ ! 🎤",
          progressRatio: 0,
        };
      }
      return { visible: false };
    }

    it("should stay hidden if the song has almost no instrumental intro (<3.5s)", () => {
      const state = computeIntroCountdown(1.0, 2.0);
      assert.strictEqual(state.visible, false);
    });

    it("should show READY when between 5s and 3s before vocals", () => {
      const state = computeIntroCountdown(10.5, 15.0); // 4.5s remaining
      assert.strictEqual(state.visible, true);
      assert.strictEqual(state.phase, "ready");
      assert.strictEqual(state.count, "READY");
    });

    it("should show animated countdown 3, 2, 1 as first line approaches", () => {
      const state3 = computeIntroCountdown(12.2, 15.0); // 2.8s -> 3
      assert.strictEqual(state3.visible, true);
      assert.strictEqual(state3.phase, "countdown");
      assert.strictEqual(state3.count, "3");

      const state2 = computeIntroCountdown(13.5, 15.0); // 1.5s -> 2
      assert.strictEqual(state2.count, "2");

      const state1 = computeIntroCountdown(14.3, 15.0); // 0.7s -> 1
      assert.strictEqual(state1.count, "1");
    });

    it("should show 'CHANTEZ ! 🎤' right when the first lyric line hits", () => {
      const state = computeIntroCountdown(15.2, 15.0); // 0.2s after start
      assert.strictEqual(state.visible, true);
      assert.strictEqual(state.phase, "sing");
      assert.strictEqual(state.count, "CHANTEZ ! 🎤");
    });

    it("should hide countdown once the singer is well into the first line", () => {
      const state = computeIntroCountdown(17.0, 15.0); // 2s after start
      assert.strictEqual(state.visible, false);
    });
  });

  // ── 2. Jauge d'Énergie Live (Hype Meter) & Pyrotechnie ──
  describe("2. Hype Meter & Pyrotechnics Logic", () => {
    it("should accumulate energy from reactions and clamp at 100%", () => {
      let energy = 0;
      function addReaction(count = 1) {
        const points = count ? Math.min(count * 4, 16) : 6;
        energy = Math.min(100, energy + points);
        return energy;
      }

      addReaction(1);
      assert.strictEqual(energy, 4);

      addReaction(3);
      assert.strictEqual(energy, 16);

      // Spam burst
      for (let i = 0; i < 15; i++) {
        addReaction(4);
      }
      assert.strictEqual(energy, 100);
    });

    it("should trigger explosion at 100% and decay naturally", () => {
      let energy = 95;
      let explosionTriggered = false;

      function checkExplosion() {
        if (energy >= 100) {
          explosionTriggered = true;
          return true;
        }
        return false;
      }

      energy += 10;
      assert.strictEqual(checkExplosion(), true);
      assert.strictEqual(explosionTriggered, true);

      // Simulation decay
      function decay(current, step = 1) {
        return Math.max(0, current - step);
      }
      let decayed = decay(50, 5);
      assert.strictEqual(decayed, 45);
      decayed = decay(2, 5);
      assert.strictEqual(decayed, 0);
    });
  });

  // ── 3. Suggestions Automatiques Roue de Camelot & BPM ──
  describe("3. Camelot & BPM Harmonic Transition Engine", () => {
    it("should detect perfect harmonic transitions (same Camelot code)", () => {
      const match = getHarmonicMatch("8B", "8B");
      assert.notStrictEqual(match, null);
      assert.strictEqual(match.type, "perfect");
    });

    it("should detect relative major / minor transitions (e.g. 8A to 8B)", () => {
      const match = getHarmonicMatch("8A", "8B");
      assert.notStrictEqual(match, null);
      assert.strictEqual(match.type, "relative");
    });

    it("should detect harmonic neighbor transitions (+1 / -1 modulo 12)", () => {
      const matchUp = getHarmonicMatch("8A", "9A");
      assert.notStrictEqual(matchUp, null);
      assert.strictEqual(matchUp.type, "harmonic");

      const matchDown = getHarmonicMatch("8A", "7A");
      assert.notStrictEqual(matchDown, null);
      assert.strictEqual(matchDown.type, "harmonic");

      const matchBoost = getHarmonicMatch("8A", "10A");
      assert.notStrictEqual(matchBoost, null);
      assert.strictEqual(matchBoost.type, "boost");
    });

    it("should filter out transitions when BPM delta is too extreme (> 8 BPM)", () => {
      function isTransitionViable(camelotA, camelotB, bpmA, bpmB) {
        const match = getHarmonicMatch(camelotA, camelotB);
        if (!match) return false;
        if (bpmA != null && bpmB != null) {
          const delta = Math.abs(bpmA - bpmB);
          if (delta > 8) return false;
        }
        return true;
      }

      assert.strictEqual(isTransitionViable("8B", "8B", 125, 127), true); // Delta 2 BPM -> OK
      assert.strictEqual(isTransitionViable("8B", "8B", 125, 140), false); // Delta 15 BPM -> Trop rapide
      assert.strictEqual(isTransitionViable("8B", "1B", 125, 126), false); // Dissonance harmonique -> Non viable
    });
  });

  // ── 4. Mini Blind-Test Flash (Quiz & Podium) ──
  describe("4. Mini Blind-Test Flash Engine", () => {
    it("should calculate correct winners and rank fastest respondents", () => {
      const answers = new Map();
      const correctIndex = 2;

      // Simulation de réponses de plusieurs invités
      answers.set("client-1", { userName: "Alice", answerIndex: 2, answerTimeMs: 2450, isCorrect: true });
      answers.set("client-2", { userName: "Bob", answerIndex: 0, answerTimeMs: 1200, isCorrect: false }); // Faux
      answers.set("client-3", { userName: "Charlie", answerIndex: 2, answerTimeMs: 1840, isCorrect: true });
      answers.set("client-4", { userName: "David", answerIndex: 2, answerTimeMs: 3100, isCorrect: true });
      answers.set("client-5", { userName: "Eve", answerIndex: 2, answerTimeMs: 4500, isCorrect: true });

      const correctAnswers = [];
      answers.forEach((ans) => {
        if (ans.isCorrect) correctAnswers.push(ans);
      });
      correctAnswers.sort((a, b) => a.answerTimeMs - b.answerTimeMs);

      const podium = correctAnswers.slice(0, 3).map((a, idx) => ({
        rank: idx + 1,
        userName: a.userName,
        timeSec: (a.answerTimeMs / 1000).toFixed(2),
      }));

      assert.strictEqual(podium.length, 3);
      assert.strictEqual(podium[0].userName, "Charlie");
      assert.strictEqual(podium[0].rank, 1);
      assert.strictEqual(podium[0].timeSec, "1.84");

      assert.strictEqual(podium[1].userName, "Alice");
      assert.strictEqual(podium[1].rank, 2);
      assert.strictEqual(podium[1].timeSec, "2.45");

      assert.strictEqual(podium[2].userName, "David");
      assert.strictEqual(podium[2].rank, 3);
      assert.strictEqual(podium[2].timeSec, "3.10");
    });
  });

  // ── 5. Multi-Display Profiles ──
  describe("5. Multi-Display Profiles", () => {
    function resolveDisplayProfile(pathname, searchParam) {
      if (pathname.includes("/screen/bar") || searchParam === "bar") return "bar";
      if (pathname.includes("/screen/stage") || searchParam === "stage") return "stage";
      return "standard";
    }

    it("should resolve bar profile correctly from path or query param", () => {
      assert.strictEqual(resolveDisplayProfile("/event/xyz123/screen/bar", null), "bar");
      assert.strictEqual(resolveDisplayProfile("/event/xyz123/qr", "bar"), "bar");
    });

    it("should resolve stage profile correctly from path or query param", () => {
      assert.strictEqual(resolveDisplayProfile("/event/xyz123/screen/stage", null), "stage");
      assert.strictEqual(resolveDisplayProfile("/event/xyz123/qr", "stage"), "stage");
    });

    it("should resolve standard profile for default qr and qrspectre paths", () => {
      assert.strictEqual(resolveDisplayProfile("/event/xyz123/qr", null), "standard");
      assert.strictEqual(resolveDisplayProfile("/event/xyz123/qrspectre", null), "standard");
    });
  });

  // ── 6. UI & Template Validations ──
  describe("6. Template Elements Validation", () => {
    it("should verify that qr-display.html contains all new UI components", () => {
      const qrDisplayHtml = fs.readFileSync(path.join(__dirname, "../../src/views/qr-display.html"), "utf8");
      assert.match(qrDisplayHtml, /id="karaokeCountdownOverlay"/);
      assert.match(qrDisplayHtml, /id="karaokeCountdownCircle"/);
      assert.match(qrDisplayHtml, /id="hypeMeterContainer"/);
      assert.match(qrDisplayHtml, /id="hypeMaxBanner"/);
      assert.match(qrDisplayHtml, /id="blindTestScreenOverlay"/);
      assert.match(qrDisplayHtml, /id="blindTestPodiumList"/);
      assert.match(qrDisplayHtml, /profile-bar/);
      assert.match(qrDisplayHtml, /profile-stage/);
    });

    it("should verify that user.html contains blindTestGuestModal", () => {
      const userHtml = fs.readFileSync(path.join(__dirname, "../../src/views/user.html"), "utf8");
      assert.match(userHtml, /id="blindTestGuestModal"/);
      assert.match(userHtml, /id="guestBtOptionsContainer"/);
      assert.match(userHtml, /id="guestBtTimerBar"/);
    });

    it("should verify that dj.html contains blind-test and screen profile controls", () => {
      const djHtml = fs.readFileSync(path.join(__dirname, "../../src/views/dj.html"), "utf8");
      assert.match(djHtml, /id="btnBlindTestFlash"/);
      assert.match(djHtml, /id="blindTestDjModal"/);
      assert.match(djHtml, /id="btnOpenScreenBar"/);
      assert.match(djHtml, /id="btnOpenScreenStage"/);
    });
  });
});
