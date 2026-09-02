const express = require("express");
const router  = express.Router();
const axios   = require("axios");
const db = require("../config/database");
const { eventIdValidator }       = require("../validators/events.validator");
const { handleValidationErrors } = require("../middlewares/validation");
const { getValidEventToken }     = require("../services/spotifyToken.service");
const { requireAuth, requireEventOwnership } = require("../middlewares/auth");

// Cache mémoire des recherches Spotify (TTL 15 minutes, max 500 entrées)
const SPOTIFY_SEARCH_CACHE_TTL_MS = 15 * 60 * 1000;
const MAX_SEARCH_CACHE_ENTRIES = 500;
const searchCache = new Map(); // normalizedQuery -> { tracks, timestamp }

function getCachedSearch(query) {
  const key = query.trim().toLowerCase();
  const cached = searchCache.get(key);
  if (!cached) return null;
  if (Date.now() - cached.timestamp > SPOTIFY_SEARCH_CACHE_TTL_MS) {
    searchCache.delete(key);
    return null;
  }
  return cached.tracks;
}

function setCachedSearch(query, tracks) {
  if (searchCache.size >= MAX_SEARCH_CACHE_ENTRIES) {
    const oldestKey = searchCache.keys().next().value;
    if (oldestKey) searchCache.delete(oldestKey);
  }
  searchCache.set(query.trim().toLowerCase(), {
    tracks,
    timestamp: Date.now(),
  });
}

// Recherche Spotify
router.get("/search", async (req, res) => {
  const { q, eventId } = req.query;

  if (!q || q.trim().length < 2) {
    return res.json({ tracks: [] });
  }

  if (!eventId) {
    return res.status(400).json({ error: "eventId manquant" });
  }

  // Vérifier d'abord le cache
  const cachedTracks = getCachedSearch(q);
  if (cachedTracks) {
    return res.json({ tracks: cachedTracks, cached: true });
  }

  try {
    const token = await getValidEventToken(eventId);
    if (!token) {
      return res.status(401).json({
        error: "Spotify non connecté ou token expiré pour cet événement",
        tracks: [],
      });
    }

    // Rechercher sur Spotify
    const response = await axios.get("https://api.spotify.com/v1/search", {
      params: {
        q: q,
        type: "track",
        limit: 10,
        market: "FR",
      },
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    // Formater les résultats
    const tracks = response.data.tracks.items.map((track) => ({
      id: track.id,
      name: track.name,
      artist: track.artists.map((a) => a.name).join(", "),
      album: track.album.name,
      image: track.album.images[0]?.url || "",
      uri: track.uri,
      duration_ms: track.duration_ms,
      preview_url: track.preview_url,
      explicit: !!track.explicit,
    }));

    // Sauvegarder dans le cache
    setCachedSearch(q, tracks);

    res.json({ tracks });
  } catch (error) {
    console.error(
      "Erreur recherche Spotify:",
      error.response?.data || error.message,
    );

    // Si erreur 401, le token est invalide
    if (error.response?.status === 401) {
      return res.status(401).json({
        error: "Token Spotify invalide, reconnectez-vous",
        tracks: [],
      });
    }

    res.status(500).json({
      error: "Erreur lors de la recherche",
      tracks: [],
    });
  }
});

// Status de connexion Spotify
router.get(
  "/status/:eventId",
  eventIdValidator,
  handleValidationErrors,
  async (req, res) => {
    const { eventId } = req.params;

    try {
      // getValidEventToken tente un refresh si nécessaire
      const token = await getValidEventToken(eventId);
      if (!token) {
        return res.json({ connected: false, reason: "Token expiré ou absent" });
      }
      return res.json({ connected: true });
    } catch (error) {
      console.error("Erreur Spotify status:", error);
      res.status(500).json({ error: "Erreur serveur" });
    }
  },
);

// Login Spotify
router.get(
  "/login/:eventId",
  eventIdValidator,
  handleValidationErrors,
  (req, res) => {
    const { eventId } = req.params;

    if (!process.env.SPOTIFY_CLIENT_ID) {
      return res.status(500).json({
        error: "Spotify non configuré. Ajoutez SPOTIFY_CLIENT_ID dans .env",
      });
    }

    const scopes = [
      "user-read-playback-state",
      "user-modify-playback-state",
      "streaming",
      "user-read-email",
      "user-read-private",
    ];

    const authUrl =
      "https://accounts.spotify.com/authorize?" +
      new URLSearchParams({
        response_type: "code",
        client_id: process.env.SPOTIFY_CLIENT_ID,
        scope: scopes.join(" "),
        redirect_uri:
          process.env.SPOTIFY_REDIRECT_URI || "http://localhost:3000/callback",
        state: eventId,
      });

    res.json({ authUrl });
  },
);

// Token Spotify (pour le player — DJ uniquement)
router.get(
  "/token/:eventId",
  requireAuth,
  requireEventOwnership,
  eventIdValidator,
  handleValidationErrors,
  async (req, res) => {
    const { eventId } = req.params;

    try {
      const token = await getValidEventToken(eventId);
      if (!token) {
        return res.status(401).json({ error: "Token Spotify expiré ou absent" });
      }
      res.json({ access_token: token });
    } catch (error) {
      console.error("Erreur récupération token:", error);
      res.status(500).json({ error: "Erreur serveur" });
    }
  },
);

// Play sur Spotify (DJ uniquement)
router.post(
  "/play/:eventId",
  requireAuth,
  requireEventOwnership,
  eventIdValidator,
  handleValidationErrors,
  async (req, res) => {
    const { eventId } = req.params;
    const { uri, device_id } = req.body;

    try {
      const token = await getValidEventToken(eventId);
      if (!token) {
        return res.status(401).json({ error: "Token Spotify expiré ou absent" });
      }

      // Si device_id fourni (Web Player), l'utiliser directement
      // Sinon laisser Spotify utiliser l'appareil actif
      const playUrl = device_id
        ? `https://api.spotify.com/v1/me/player/play?device_id=${device_id}`
        : "https://api.spotify.com/v1/me/player/play";

      await axios.put(
        playUrl,
        { uris: [uri] },
        {
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
        },
      );

      res.json({ success: true, device_id });
    } catch (error) {
      console.error(
        "Erreur lecture Spotify:",
        error.response?.data || error.message,
      );

      // Gérer les erreurs spécifiques
      if (error.response?.status === 404) {
        const errorReason = error.response.data?.error?.reason;

        if (errorReason === "NO_ACTIVE_DEVICE") {
          return res.status(404).json({
            error:
              "Aucun appareil actif. Ouvrez Spotify Desktop ou attendez que le Web Player se connecte.",
            details: error.response.data,
          });
        }

        return res.status(404).json({
          error: "Appareil non trouvé",
          details: error.response.data,
        });
      }

      if (error.response?.status === 403) {
        return res.status(403).json({
          error: "Spotify Premium requis",
          details: error.response.data,
        });
      }

      res.status(500).json({
        error: "Erreur lors de la lecture",
        details: error.response?.data,
      });
    }
  },
);

// ── Reprendre la lecture (Play / Resume) ──
router.post(
  "/resume/:eventId",
  requireAuth,
  requireEventOwnership,
  eventIdValidator,
  handleValidationErrors,
  async (req, res) => {
    const { eventId } = req.params;
    const { device_id } = req.body;

    try {
      const token = await getValidEventToken(eventId);
      if (!token) return res.status(401).json({ error: "Token Spotify non valide" });

      const url = device_id
        ? `https://api.spotify.com/v1/me/player/play?device_id=${device_id}`
        : "https://api.spotify.com/v1/me/player/play";

      await axios.put(url, {}, { headers: { Authorization: `Bearer ${token}` } });
      res.json({ success: true });
    } catch (error) {
      res.status(error.response?.status || 500).json({ error: "Impossible de relancer la lecture", details: error.response?.data });
    }
  },
);

// ── Mettre en pause (Pause) ──
router.post(
  "/pause/:eventId",
  requireAuth,
  requireEventOwnership,
  eventIdValidator,
  handleValidationErrors,
  async (req, res) => {
    const { eventId } = req.params;
    const { device_id } = req.body;

    try {
      const token = await getValidEventToken(eventId);
      if (!token) return res.status(401).json({ error: "Token Spotify non valide" });

      const url = device_id
        ? `https://api.spotify.com/v1/me/player/pause?device_id=${device_id}`
        : "https://api.spotify.com/v1/me/player/pause";

      await axios.put(url, {}, { headers: { Authorization: `Bearer ${token}` } });
      res.json({ success: true });
    } catch (error) {
      res.status(error.response?.status || 500).json({ error: "Impossible de mettre en pause", details: error.response?.data });
    }
  },
);

// ── Transférer la lecture sur un appareil (Transfer Playback) ──
router.post(
  "/transfer/:eventId",
  requireAuth,
  requireEventOwnership,
  eventIdValidator,
  handleValidationErrors,
  async (req, res) => {
    const { eventId } = req.params;
    const { device_id, play = true } = req.body;

    if (!device_id) return res.status(400).json({ error: "device_id requis" });

    try {
      const token = await getValidEventToken(eventId);
      if (!token) return res.status(401).json({ error: "Token Spotify non valide" });

      await axios.put(
        "https://api.spotify.com/v1/me/player",
        { device_ids: [device_id], play: !!play },
        {
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
        },
      );
      res.json({ success: true, device_id });
    } catch (error) {
      res.status(error.response?.status || 500).json({ error: "Impossible de transférer la lecture", details: error.response?.data });
    }
  },
);

// ── Lister les appareils Spotify disponibles ──
router.get(
  "/devices/:eventId",
  requireAuth,
  requireEventOwnership,
  eventIdValidator,
  handleValidationErrors,
  async (req, res) => {
    const { eventId } = req.params;
    try {
      const token = await getValidEventToken(eventId);
      if (!token) return res.status(401).json({ error: "Token Spotify non valide" });

      const r = await axios.get("https://api.spotify.com/v1/me/player/devices", {
        headers: { Authorization: `Bearer ${token}` },
      });
      res.json({ devices: r.data?.devices || [] });
    } catch (error) {
      res.status(500).json({ error: "Impossible de récupérer les appareils", details: error.response?.data });
    }
  },
);

// Métadonnées enrichies des pistes (BPM si dispo, popularité en fallback — DJ uniquement)
// Note: l'endpoint audio-features Spotify est restreint aux apps créées avant nov. 2024.
// On essaie audio-features, sinon on utilise /v1/tracks (popularité comme proxy d'énergie).
router.get(
  "/audio-features/:eventId",
  requireAuth,
  requireEventOwnership,
  eventIdValidator,
  handleValidationErrors,
  async (req, res) => {
    const { eventId } = req.params;
    const { ids } = req.query;

    if (!ids) return res.json({});

    const trackIds = ids.split(",").filter(Boolean).slice(0, 50);
    if (trackIds.length === 0) return res.json({});

    try {
      const token = await getValidEventToken(eventId);
      if (!token) return res.json({});

      const headers  = { Authorization: `Bearer ${token}` };
      const features = {};

      // ── Tentative 1 : audio-features (BPM, énergie, tonalité) ──
      try {
        const afRes = await axios.get(
          "https://api.spotify.com/v1/audio-features",
          { params: { ids: trackIds.join(",") }, headers },
        );
        (afRes.data.audio_features || []).forEach((f) => {
          if (f) {
            features[f.id] = {
              bpm:    Math.round(f.tempo),
              energy: f.energy,
              key:    f.key,
              mode:   f.mode,
            };
          }
        });
      } catch (afErr) {
        // 403 = endpoint restreint pour cette app (apps créées après nov. 2024)
        if (afErr.response?.status !== 403) {
          console.error("audio-features:", afErr.message);
        }
      }

      // ── Fallback : /v1/tracks (popularité comme indicateur d'énergie) ──
      const missingIds = trackIds.filter((id) => !features[id]);
      if (missingIds.length > 0) {
        try {
          const tracksRes = await axios.get(
            "https://api.spotify.com/v1/tracks",
            { params: { ids: missingIds.join(",") }, headers },
          );
          (tracksRes.data.tracks || []).forEach((t) => {
            if (t) {
              features[t.id] = {
                bpm:        null,
                energy:     t.popularity / 100,
                popularity: t.popularity,
                key:        null,
                mode:       null,
              };
            }
          });
        } catch (tracksErr) {
          console.error("tracks fallback:", tracksErr.response?.data || tracksErr.message);
        }
      }

      // ── Cache DB pour réutilisation analytics / projection BPM ──
      try {
        const rows = Object.entries(features);
        if (rows.length > 0) {
          const values = [];
          const placeholders = rows.map(([trackId, v]) => {
            values.push(
              trackId,
              Number.isFinite(v.bpm) ? v.bpm : null,
              Number.isFinite(v.energy) ? v.energy : null,
              Number.isFinite(v.popularity) ? v.popularity : null,
            );
            return "(?, ?, ?, ?)";
          });
          await db.query(
            `INSERT INTO track_audio_cache (track_id, bpm, energy, popularity)
             VALUES ${placeholders.join(",")}
             ON DUPLICATE KEY UPDATE
               bpm = VALUES(bpm),
               energy = VALUES(energy),
               popularity = VALUES(popularity)`,
            values,
          );
        }
      } catch (cacheErr) {
        console.error("track_audio_cache upsert:", cacheErr.message || cacheErr);
      }

      res.json(features);
    } catch (error) {
      console.error("Erreur track-meta:", error.response?.data || error.message);
      res.json({});
    }
  },
);

// Aperçu d'une playlist (nom + image + taille) — DJ uniquement
router.get(
  "/playlist-info/:eventId/:playlistId",
  requireAuth,
  requireEventOwnership,
  eventIdValidator,
  handleValidationErrors,
  async (req, res) => {
    const { eventId, playlistId } = req.params;
    try {
      const token = await getValidEventToken(eventId);
      if (!token) {
        return res.status(401).json({ error: "Token Spotify expiré ou absent" });
      }

      const infoRes = await axios.get(
        `https://api.spotify.com/v1/playlists/${playlistId}`,
        {
          params: { fields: "name,images,tracks.total,owner(display_name),external_urls.spotify" },
          headers: { Authorization: `Bearer ${token}` },
        },
      );

      return res.json({
        id: playlistId,
        name: infoRes.data?.name || "Playlist",
        image: infoRes.data?.images?.[0]?.url || null,
        totalTracks: Number(infoRes.data?.tracks?.total || 0),
        owner: infoRes.data?.owner?.display_name || null,
        url: infoRes.data?.external_urls?.spotify || null,
      });
    } catch (error) {
      console.error(
        "Erreur playlist-info:",
        error.response?.data || error.message,
      );
      return res.status(500).json({ error: "Erreur lors de la récupération de la playlist" });
    }
  },
);

// Piste aléatoire depuis une playlist (fallback — DJ uniquement)
router.get(
  "/playlist/:eventId/:playlistId",
  requireAuth,
  requireEventOwnership,
  eventIdValidator,
  handleValidationErrors,
  async (req, res) => {
    const { eventId, playlistId } = req.params;

    try {
      const token = await getValidEventToken(eventId);
      if (!token) {
        return res.status(401).json({ error: "Token Spotify expiré ou absent" });
      }

      const headers = { Authorization: `Bearer ${token}` };

      // 1. Récupérer le total de la playlist
      const infoRes = await axios.get(
        `https://api.spotify.com/v1/playlists/${playlistId}`,
        { params: { fields: "tracks.total,name" }, headers },
      );

      const total        = infoRes.data.tracks?.total || 0;
      const playlistName = infoRes.data.name || "Playlist";

      if (total === 0) {
        return res.status(404).json({ error: "Playlist vide" });
      }

      // 2. Tenter jusqu'à 5 fois d'obtenir une piste valide (éviter fichiers locaux)
      let track = null;
      for (let attempt = 0; attempt < 5; attempt++) {
        const offset = Math.floor(Math.random() * total);
        const tracksRes = await axios.get(
          `https://api.spotify.com/v1/playlists/${playlistId}/tracks`,
          {
            params: {
              fields: "items(track(id,name,uri,artists,album,preview_url,duration_ms))",
              limit:  1,
              offset,
            },
            headers,
          },
        );

        const item = tracksRes.data.items?.[0]?.track;
        if (item && item.uri && item.uri.startsWith("spotify:track:")) {
          track = item;
          break;
        }
      }

      if (!track) {
        return res.status(404).json({ error: "Aucune piste valide trouvée" });
      }

      res.json({
        id:           track.id,
        name:         track.name,
        artist:       track.artists.map((a) => a.name).join(", "),
        uri:          track.uri,
        image:        track.album.images?.[0]?.url || null,
        duration_ms:  track.duration_ms,
        playlistName,
      });
    } catch (error) {
      console.error(
        "Erreur playlist fallback:",
        error.response?.data || error.message,
      );
      res.status(500).json({ error: "Erreur lors de la récupération de la playlist" });
    }
  },
);

// ── Cache mémoire des paroles (TTL 24h, max 500 chansons) ──
const { parseLrc } = require("../utils/lyrics.utils");
const lyricsCache = new Map();

function cleanLyricsSearchTitle(t) {
  return String(t || "")
    .replace(/\s*-\s*Remaster(ed)?(\s*\d*)?/gi, "")
    .replace(/\s*-\s*Radio\s*Edit/gi, "")
    .replace(/\s*-\s*Club\s*Mix/gi, "")
    .replace(/\s*\(.*(feat|with|version|remaster|radio edit|deluxe|bonus).*\)/gi, "")
    .replace(/\s*\[.*(feat|with|version|remaster|radio edit|deluxe|bonus).*\]/gi, "")
    .trim();
}

// ── Endpoint Paroles Synchronisées (Karaoké) ──
router.get("/lyrics", async (req, res) => {
  const { track, artist, duration } = req.query;
  if (!track || !artist) {
    return res.status(400).json({ error: "Paramètres 'track' et 'artist' requis" });
  }

  const cacheKey = `${track.toLowerCase().trim()}:::${artist.toLowerCase().trim()}`;
  if (lyricsCache.has(cacheKey)) {
    return res.json(lyricsCache.get(cacheKey));
  }

  const cleanedTitle = cleanLyricsSearchTitle(track);
  const headers = { "User-Agent": "MusicLiveApp/2.0 (https://music-live.fullann.ch)" };
  const durNum = duration ? Math.round(Number(duration)) : null;

  async function fetchLrclib(tName, aName, dSec) {
    const params = { track_name: tName, artist_name: aName };
    if (dSec) params.duration = dSec;
    try {
      const response = await axios.get("https://lrclib.net/api/get", { params, timeout: 3500, headers });
      return response.data;
    } catch {
      return null;
    }
  }

  try {
    // 1. Essai exact avec durée
    let data = await fetchLrclib(track, artist, durNum);

    // 2. Essai exact sans durée
    if (!data && durNum) {
      data = await fetchLrclib(track, artist, null);
    }

    // 3. Essai avec titre nettoyé
    if (!data && cleanedTitle && cleanedTitle !== track) {
      data = await fetchLrclib(cleanedTitle, artist, durNum);
      if (!data && durNum) {
        data = await fetchLrclib(cleanedTitle, artist, null);
      }
    }

    // 4. Recherche générique par mots-clés
    if (!data || (!data.syncedLyrics && !data.plainLyrics)) {
      try {
        const searchRes = await axios.get("https://lrclib.net/api/search", {
          params: { q: `${cleanedTitle || track} ${artist}` },
          timeout: 3500,
          headers,
        });
        const items = searchRes.data || [];
        const syncedItem = items.find((x) => x.syncedLyrics) || items[0];
        if (syncedItem) data = syncedItem;
      } catch {}
    }

    let payload = null;
    if (data?.syncedLyrics) {
      payload = {
        synced: true,
        lines: parseLrc(data.syncedLyrics),
      };
    } else if (data?.plainLyrics) {
      payload = {
        synced: false,
        lines: data.plainLyrics.split("\n").map((t) => ({ time: 0, text: t.trim() })).filter((l) => l.text.length > 0),
      };
    }

    if (payload && payload.lines.length > 0) {
      if (lyricsCache.size >= 500) lyricsCache.delete(lyricsCache.keys().next().value);
      lyricsCache.set(cacheKey, payload);
      return res.json(payload);
    }
    return res.status(404).json({ error: "Paroles introuvables" });
  } catch {
    return res.status(404).json({ error: "Paroles non disponibles" });
  }
});

// ── Endpoint Export Playlist Spotify de Soirée (DJ) ──
router.post(
  "/export-playlist/:eventId",
  requireAuth,
  requireEventOwnership,
  eventIdValidator,
  handleValidationErrors,
  async (req, res) => {
    const { eventId } = req.params;

    try {
      const token = await getValidEventToken(eventId);
      if (!token) {
        return res.status(401).json({ error: "Compte Spotify non connecté ou token expiré" });
      }

      // 1. Récupérer les infos de l'événement et tous les morceaux joués
      const [eventRows] = await db.query(
        "SELECT name, after_party_playlist_url FROM events WHERE id = ?",
        [eventId],
      );
      if (eventRows.length === 0) {
        return res.status(404).json({ error: "Événement non trouvé" });
      }
      const eventName = eventRows[0].name || "Soirée";

      const [playedRows] = await db.query(
        "SELECT song_name, artist, spotify_uri FROM requests WHERE event_id = ? AND status = 'played' AND spotify_uri IS NOT NULL ORDER BY played_at ASC",
        [eventId],
      );

      if (playedRows.length === 0) {
        return res.status(400).json({ error: "Aucun morceau joué à exporter dans la playlist" });
      }

      // 2. Récupérer l'ID utilisateur Spotify du DJ
      const meRes = await axios.get("https://api.spotify.com/v1/me", {
        headers: { Authorization: `Bearer ${token}` },
      });
      const spotifyUserId = meRes.data?.id;
      if (!spotifyUserId) {
        return res.status(400).json({ error: "Impossible de récupérer le profil Spotify" });
      }

      // 3. Créer la playlist publique sur Spotify
      const dateStr = new Date().toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric" });
      const createRes = await axios.post(
        `https://api.spotify.com/v1/users/${spotifyUserId}/playlists`,
        {
          name: `Music Live — ${eventName} (${dateStr})`,
          description: `Playlist officielle de la soirée "${eventName}" mixée en direct sur Music Live 🎵`,
          public: true,
        },
        {
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
        },
      );

      const playlistId = createRes.data?.id;
      const playlistUrl = createRes.data?.external_urls?.spotify || `https://open.spotify.com/playlist/${playlistId}`;

      // 4. Ajouter les morceaux par lots de 100
      const uris = playedRows.map((r) => r.spotify_uri).filter(Boolean);
      for (let i = 0; i < uris.length; i += 100) {
        const batch = uris.slice(i, i + 100);
        await axios.post(
          `https://api.spotify.com/v1/playlists/${playlistId}/tracks`,
          { uris: batch },
          {
            headers: {
              Authorization: `Bearer ${token}`,
              "Content-Type": "application/json",
            },
          },
        );
      }

      // 5. Sauvegarder l'URL sur l'événement
      await db.query(
        "UPDATE events SET after_party_playlist_url = ? WHERE id = ?",
        [playlistUrl, eventId],
      );

      res.json({
        success: true,
        playlistId,
        playlistUrl,
        totalTracks: uris.length,
      });
    } catch (error) {
      console.error("Erreur export playlist Spotify:", error.response?.data || error.message);
      res.status(500).json({ error: "Erreur lors de la création de la playlist Spotify" });
    }
  },
);

module.exports = router;
