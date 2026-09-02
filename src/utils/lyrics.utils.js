/**
 * Parse un texte de paroles au format LRC en tableau d'objets { time: seconds, text: string }
 * @param {string} lrcText
 * @returns {Array<{ time: number, text: string }>}
 */
function parseLrc(lrcText) {
  if (!lrcText || typeof lrcText !== "string") return [];
  const lines = lrcText.split("\n");
  const result = [];
  const regex = /^\[(\d{2}):(\d{2})\.(\d{2,3})\](.*)$/;
  for (const line of lines) {
    const match = line.trim().match(regex);
    if (match) {
      const min = parseInt(match[1], 10);
      const sec = parseInt(match[2], 10);
      const ms = parseInt(match[3].padEnd(3, "0").slice(0, 3), 10);
      const time = min * 60 + sec + ms / 1000;
      const text = match[4].trim();
      if (text) {
        result.push({ time, text });
      }
    }
  }
  return result.sort((a, b) => a.time - b.time);
}

module.exports = {
  parseLrc,
};
