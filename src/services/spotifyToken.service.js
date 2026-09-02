/**
 * Service de gestion des tokens Spotify pour les events.
 *
 * Toutes les routes qui appellent l'API Spotify doivent passer par
 * `getValidEventToken(eventId)` plutôt qu'interroger directement la DB.
 * Ce service :
 *   - vérifie si le token est encore valide (avec une marge de 5 min)
 *   - sinon, utilise le refresh_token pour en obtenir un nouveau
 *   - met à jour spotify_tokens ET le record djs pour que les prochains
 *     événements créés par ce DJ aient des tokens frais
 */

const axios = require("axios");
const db    = require("../config/database");

// Marge avant expiration à partir de laquelle on rafraîchit pro-activement (5 min)
const REFRESH_MARGIN_MS = 5 * 60 * 1000;

// Registre des promesses de rafraîchissement en cours (dédoublonnage anti-stampede)
const pendingRefreshes = new Map();

/**
 * Retourne un access_token valide pour l'event donné.
 * Rafraîchit automatiquement si nécessaire.
 *
 * @param {string} eventId
 * @returns {Promise<string|null>} access_token ou null si impossible
 */
async function getValidEventToken(eventId) {
  // Si un rafraîchissement est déjà en cours pour cet event, on attend la même promesse
  if (pendingRefreshes.has(eventId)) {
    return await pendingRefreshes.get(eventId);
  }

  let [rows] = await db.query(
    "SELECT access_token, refresh_token, expires_at FROM spotify_tokens WHERE event_id = ?",
    [eventId],
  );

  let access_token, refresh_token, expires_at;
  if (rows.length > 0) {
    access_token = rows[0].access_token;
    refresh_token = rows[0].refresh_token;
    expires_at = rows[0].expires_at;
  } else {
    // Fallback automatique sur le compte DJ propriétaire si tokens non dupliqués sur l'event
    const [djRows] = await db.query(
      `SELECT d.sp_access_token, d.sp_refresh_token, d.sp_token_expires_at
       FROM djs d
       JOIN events e ON e.dj_id = d.id
       WHERE e.id = ?`,
      [eventId],
    );
    if (djRows.length === 0 || !djRows[0].sp_refresh_token) return null;
    access_token  = djRows[0].sp_access_token;
    refresh_token = djRows[0].sp_refresh_token;
    expires_at    = djRows[0].sp_token_expires_at;

    // Dupliquer immédiatement dans spotify_tokens pour les prochains appels
    try {
      await db.query(
        `INSERT INTO spotify_tokens (event_id, access_token, refresh_token, expires_at)
         VALUES (?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE
           access_token = VALUES(access_token),
           refresh_token = VALUES(refresh_token),
           expires_at = VALUES(expires_at)`,
        [eventId, access_token, refresh_token, expires_at || Date.now()],
      );
    } catch {}
  }

  const expiresAtMs = parseInt(expires_at || 0, 10);

  // Token encore valide : on le retourne directement
  if (access_token && expiresAtMs > Date.now() + REFRESH_MARGIN_MS) {
    return access_token;
  }

  // Token expiré ou sur le point d'expirer : refresh
  if (!refresh_token) {
    console.warn(`[SpotifyToken] Event ${eventId} : token expiré sans refresh_token.`);
    return access_token || null;
  }

  const refreshPromise = (async () => {
    try {
      const refreshRes = await axios.post(
        "https://accounts.spotify.com/api/token",
        new URLSearchParams({
          grant_type:    "refresh_token",
          refresh_token,
          client_id:     process.env.SPOTIFY_CLIENT_ID,
          client_secret: process.env.SPOTIFY_CLIENT_SECRET,
        }),
        { headers: { "Content-Type": "application/x-www-form-urlencoded" } },
      );

      const newAccessToken  = refreshRes.data.access_token;
      // Spotify retourne parfois un nouveau refresh_token (rotation)
      const newRefreshToken = refreshRes.data.refresh_token || refresh_token;
      const newExpiresAt    = Date.now() + refreshRes.data.expires_in * 1000;

      // 1. Mettre à jour spotify_tokens pour cet event
      await db.query(
        `UPDATE spotify_tokens
            SET access_token = ?, refresh_token = ?, expires_at = ?
          WHERE event_id = ?`,
        [newAccessToken, newRefreshToken, newExpiresAt, eventId],
      );

      // 2. Mettre à jour les tokens du DJ propriétaire de l'event (pour les futurs events)
      await db.query(
        `UPDATE djs
            SET sp_access_token = ?, sp_refresh_token = ?, sp_token_expires_at = ?
          WHERE id = (SELECT dj_id FROM events WHERE id = ?)`,
        [newAccessToken, newRefreshToken, newExpiresAt, eventId],
      );

      console.info(`[SpotifyToken] Token rafraîchi pour l'event ${eventId}.`);
      return newAccessToken;
    } catch (err) {
      console.error(
        `[SpotifyToken] Impossible de rafraîchir le token pour l'event ${eventId}:`,
        err.response?.data || err.message,
      );
      return null;
    } finally {
      pendingRefreshes.delete(eventId);
    }
  })();

  pendingRefreshes.set(eventId, refreshPromise);
  return await refreshPromise;
}

module.exports = { getValidEventToken };
