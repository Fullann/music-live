// Utilitaires de détection harmonique et Roue Camelot
const CAMELOT_MAJOR = {
  0: { code: "8B", musical: "C" },
  1: { code: "3B", musical: "Db" },
  2: { code: "10B", musical: "D" },
  3: { code: "5B", musical: "Eb" },
  4: { code: "12B", musical: "E" },
  5: { code: "7B", musical: "F" },
  6: { code: "2B", musical: "F#" },
  7: { code: "9B", musical: "G" },
  8: { code: "4B", musical: "Ab" },
  9: { code: "11B", musical: "A" },
  10: { code: "6B", musical: "Bb" },
  11: { code: "1B", musical: "B" },
};

const CAMELOT_MINOR = {
  0: { code: "5A", musical: "Am" },
  1: { code: "12A", musical: "Bbm" },
  2: { code: "7A", musical: "Bm" },
  3: { code: "2A", musical: "Cm" },
  4: { code: "9A", musical: "C#m" },
  5: { code: "4A", musical: "Dm" },
  6: { code: "11A", musical: "Ebm" },
  7: { code: "6A", musical: "Em" },
  8: { code: "1A", musical: "Fm" },
  9: { code: "8A", musical: "F#m" },
  10: { code: "3A", musical: "Gm" },
  11: { code: "10A", musical: "G#m" },
};

function getCamelotInfo(key, mode) {
  if (key == null || key < 0 || key > 11) return null;
  const isMajor = mode === 1;
  const map = isMajor ? CAMELOT_MAJOR : CAMELOT_MINOR;
  const item = map[key];
  if (!item) return null;
  return {
    camelot: item.code,
    musical: item.musical,
    mode: isMajor ? "Major" : "Minor",
    key,
  };
}

function getHarmonicMatch(currentCamelot, candidateCamelot) {
  if (!currentCamelot || !candidateCamelot) return null;
  const curNum = parseInt(currentCamelot, 10);
  const curLet = currentCamelot.replace(/[0-9]/g, "").toUpperCase();
  const candNum = parseInt(candidateCamelot, 10);
  const candLet = candidateCamelot.replace(/[0-9]/g, "").toUpperCase();

  if (isNaN(curNum) || isNaN(candNum)) return null;

  // Même clé Camelot -> Mix parfait
  if (curNum === candNum && curLet === candLet) {
    return { label: "✨ Mix Parfait", type: "perfect", color: "#10b981", bg: "rgba(16,185,129,0.18)" };
  }

  // Même numéro, lettre opposée -> Relatif Majeur / Mineur
  if (curNum === candNum && curLet !== candLet) {
    return { label: "🎶 Relatif", type: "relative", color: "#8b5cf6", bg: "rgba(139,92,246,0.18)" };
  }

  // Voisins harmoniques (+1 ou -1 modulo 12 sur même lettre, ex 8A <-> 7A ou 9A)
  const diff = (candNum - curNum + 12) % 12;
  if (curLet === candLet) {
    if (diff === 1 || diff === 11) {
      return { label: "🎶 Harmonique", type: "harmonic", color: "#06b6d4", bg: "rgba(6,182,212,0.18)" };
    }
    if (diff === 2) {
      return { label: "⚡ Boost +2", type: "boost", color: "#f59e0b", bg: "rgba(245,158,11,0.18)" };
    }
  }
  return null;
}

module.exports = {
  CAMELOT_MAJOR,
  CAMELOT_MINOR,
  getCamelotInfo,
  getHarmonicMatch,
};
