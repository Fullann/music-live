  const eventId = window.location.pathname.split("/")[2];
  if (!eventId || eventId === "undefined") {
    alert("ID d'événement manquant");
    window.location.href = "/dashboard";
    throw new Error("EventId manquant");
  }

  const socket = io();
  let pendingRequests  = [];
  let queue            = [];
  let queueSortable    = null; // instance SortableJS unique pour la queue
  let spotifyPlayer    = null;
  let deviceId         = null;
  let isPlaying        = false;
  let autoPlayEnabled  = true;
  let allowDuplicates  = false;
  let votesEnabled     = true;
  let autoAcceptEnabled= false;
  let searchTimeout;
  let currentPosition  = 0;
  let currentDuration  = 0;
  let progressInterval = null;
  let spotifyToken     = null;
  let audioFeatures       = {};
  let currentVolume       = 0.8;
  let isCrossfading       = false;
  let crossfadeDuration   = parseInt(localStorage.getItem("djq-crossfade") || "0");
  let fallbackPlaylistUri  = null;
  let fallbackPlaylistPreviewKey = null;
  let isFallbackFetching   = false;
  let isAutoPlayLocked     = false;
  let currentPlayingRequestId = null;
  let currentPlayingUri = null;
  let projectionVisualsEnabled = false;
  let projectionVisualsMode    = "aurora";
  let projectionVisualsAutoPerTrack = false;
  let requestsFrozenUntil = null;
  let livePollState = null;
  let recentClientErrors = [];
  let socketLatencyMs = null;
  let liveHealthPanelOpen = false;

  function fmtDuration(ms) {
    if (ms == null || Number.isNaN(ms)) return "—";
    const s = Math.max(0, Math.floor(ms / 1000));
    if (s < 60) return `${s}s`;
    const m = Math.floor(s / 60);
    const rem = s % 60;
    return `${m}m ${rem}s`;
  }
  function pushClientError(message) {
    const text = String(message || "").trim();
    if (!text) return;
    recentClientErrors.unshift({
      message: text.slice(0, 140),
      created_at: new Date().toISOString(),
      source: "client",
    });
    recentClientErrors = recentClientErrors.slice(0, 8);
  }
  function renderLiveHealth(health) {
    const spotifyEl = document.getElementById("liveHealthSpotify");
    const latencyEl = document.getElementById("liveHealthSocketLatency");
    const backlogEl = document.getElementById("liveHealthBacklog");
    const errorsCountEl = document.getElementById("liveHealthErrorsCount");
    const errorsListEl = document.getElementById("liveHealthErrorsList");
    const updatedAtEl = document.getElementById("liveHealthUpdatedAt");
    const healthPanelEl = document.getElementById("liveHealthPanel");
    const healthDotEl = document.getElementById("liveHealthDot");
    const healthBtnEl = document.getElementById("liveHealthToggleBtn");

    const sp = health?.spotify || {};
    const spText = sp.status === "ok"
      ? `OK (${fmtDuration(sp.expiresInMs)} restants)`
      : sp.status === "expiring-soon"
        ? `Expire bientôt (${fmtDuration(sp.expiresInMs)})`
        : sp.status === "expired"
          ? "Expiré"
          : "Absent";
    spotifyEl.textContent = spText;
    spotifyEl.style.color = sp.status === "ok" ? "var(--green)" : (sp.status === "expiring-soon" ? "var(--amber)" : "var(--red)");

    latencyEl.textContent = socketLatencyMs == null ? "—" : `${socketLatencyMs} ms`;
    latencyEl.style.color = socketLatencyMs != null && socketLatencyMs > 250 ? "var(--amber)" : "var(--text-primary)";

    const q = health?.queue || {};
    backlogEl.textContent = `${Number(q.backlogTotal || 0)} (P:${Number(q.pending || 0)} / Q:${Number(q.accepted || 0)})`;

    const mergedErrors = [...(health?.recentErrors || []), ...recentClientErrors]
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
      .slice(0, 6);
    errorsCountEl.textContent = String(mergedErrors.length);
    if (!mergedErrors.length) {
      errorsListEl.innerHTML = `<p style="color:var(--text-muted)">Aucune erreur récente</p>`;
    } else {
      errorsListEl.innerHTML = mergedErrors.map((e) => {
        const at = e.created_at ? new Date(e.created_at).toLocaleTimeString("fr-FR") : "--:--";
        const msg = (e.action_type || e.message || "Erreur").toString();
        return `<p>• [${at}] ${msg}</p>`;
      }).join("");
    }

    const hasIssue =
      sp.status === "expired" ||
      sp.status === "missing" ||
      sp.status === "expiring-soon" ||
      (socketLatencyMs != null && socketLatencyMs > 350) ||
      Number(q.pending || 0) >= 20 ||
      mergedErrors.length > 0;
    healthDotEl.style.background = hasIssue ? "var(--amber)" : "var(--green)";
    if (healthBtnEl) {
      healthBtnEl.title = hasIssue ? "Santé: attention (cliquer pour détails)" : "Santé: OK";
    }
    if (!liveHealthPanelOpen) {
      healthPanelEl.classList.add("hidden");
    }

    updatedAtEl.textContent = `MAJ ${new Date().toLocaleTimeString("fr-FR")}`;
  }
  async function pingSocketLatency() {
    if (!socket.connected) {
      socketLatencyMs = null;
      return;
    }
    const start = Date.now();
    try {
      await new Promise((resolve, reject) => {
        socket.timeout(2000).emit("health-ping", { ts: start }, (err) => {
          if (err) return reject(err);
          resolve();
        });
      });
      socketLatencyMs = Date.now() - start;
    } catch {
      socketLatencyMs = null;
      pushClientError("Ping socket timeout");
    }
  }
  async function loadLiveHealth() {
    try {
      await pingSocketLatency();
      const res = await fetch(`/api/events/${eventId}/live-health`);
      const data = await res.json();
      renderLiveHealth(data);
    } catch (err) {
      pushClientError(err?.message || "Erreur récupération live-health");
      renderLiveHealth(null);
    }
  }
  document.getElementById("liveHealthToggleBtn")?.addEventListener("click", () => {
    const panel = document.getElementById("liveHealthPanel");
    liveHealthPanelOpen = !liveHealthPanelOpen;
    panel.classList.toggle("hidden", !liveHealthPanelOpen);
  });

  // ── Spotify SDK & Auto-Recovery ──
  window.onSpotifyWebPlaybackSDKReady = () => {
    if (!spotifyToken) return;
    initializePlayer();
  };

  let playerReconnectTimer = null;
  function schedulePlayerReconnect(delayMs = 2500) {
    clearTimeout(playerReconnectTimer);
    playerReconnectTimer = setTimeout(() => {
      console.log("Tentative automatique de reconnexion du Player Spotify...");
      reconnectSpotifyPlayer(true);
    }, delayMs);
  }

  async function reconnectSpotifyPlayer(isSilent = false) {
    if (!isSilent) showToast("🔄 Reconnexion au lecteur Spotify…", "info");
    try {
      const res = await fetch(`/api/spotify/token/${eventId}`);
      const data = await res.json();
      if (data.access_token) {
        spotifyToken = data.access_token;
      }
      if (spotifyPlayer) {
        try { await spotifyPlayer.disconnect(); } catch {}
        const connected = await spotifyPlayer.connect();
        if (connected) {
          if (!isSilent) showToast("✅ Lecteur Spotify reconnecté !", "success");
          hideSpotifyError();
        }
      } else {
        initializePlayer();
      }
    } catch (err) {
      console.error("Erreur lors de la reconnexion Spotify:", err);
      if (!isSilent) showToast("⚠️ Impossible de reconnecter Spotify — vérifiez votre réseau", "error");
    }
  }

  function initializePlayer() {
    if (spotifyPlayer) {
      try { spotifyPlayer.disconnect(); } catch {}
    }

    spotifyPlayer = new Spotify.Player({
      name: "Music Live Pro Console",
      getOAuthToken: async (cb) => {
        try {
          const res  = await fetch(`/api/spotify/token/${eventId}`);
          const data = await res.json();
          if (data.access_token) {
            spotifyToken = data.access_token;
            cb(data.access_token);
          } else if (spotifyToken) {
            cb(spotifyToken);
          }
        } catch (err) {
          console.error("Erreur refresh token SDK Spotify:", err);
          if (spotifyToken) cb(spotifyToken);
        }
      },
      volume: 0.8,
    });

    spotifyPlayer.addListener("ready", ({ device_id }) => {
      deviceId = device_id;
      console.log("Spotify Web Playback SDK ready on device:", deviceId);
      document.getElementById("spotifyPlayer").classList.remove("hidden");
      document.getElementById("autoPlayToggle").classList.remove("hidden");
      document.getElementById("autoPlayToggle").style.display = "flex";
      hideSpotifyError();

      // Transférer la lecture sur le web player pour s'assurer qu'il est actif
      fetch(`/api/spotify/transfer/${eventId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ device_id: deviceId, play: false }),
      }).catch(() => {});

      tryStartFallback();
    });

    spotifyPlayer.addListener("not_ready", ({ device_id }) => {
      console.warn("Spotify Player not ready / disconnected:", device_id);
      showSpotifyError("Appareil Spotify déconnecté ou en veille. Reconnexion automatique…");
      schedulePlayerReconnect(3000);
    });

    spotifyPlayer.addListener("player_state_changed", (state) => {
      if (!state) return;
      const track = state.track_window?.current_track;
      if (!track) return;

      document.getElementById("currentTrackName").textContent   = track.name;
      document.getElementById("currentTrackArtist").textContent = track.artists.map((a) => a.name).join(", ");
      const img = document.getElementById("currentTrackImage");
      if (track.album?.images?.[0]?.url) {
        img.src = track.album.images[0].url;
        img.classList.remove("hidden");
        document.getElementById("currentTrackPlaceholder").classList.add("hidden");
      }

      isPlaying = !state.paused;
      document.getElementById("playIcon").classList.toggle("hidden", isPlaying);
      document.getElementById("pauseIcon").classList.toggle("hidden", !isPlaying);

      currentPosition = state.position;
      currentDuration = state.duration;
      updateProgress();

      if (isPlaying) startProgressUpdate();
      else stopProgressUpdate();

      // Diffuser aux invités
      clearTimeout(window._nowPlayingDebounce);
      window._nowPlayingDebounce = setTimeout(() => {
        const currentTrackUri = track?.uri || currentPlayingUri || null;
        socket.emit("broadcast-now-playing", {
          eventId,
          track: {
            name:       track.name,
            artist:     track.artists.map((a) => a.name).join(", "),
            albumArt:   track.album?.images?.[0]?.url || "",
            durationMs: state.duration,
            uri:        currentTrackUri,
            bpm:        currentTrackUri ? audioFeatures[getTrackId(currentTrackUri)]?.bpm || null : null,
            energy:     currentTrackUri ? audioFeatures[getTrackId(currentTrackUri)]?.energy || null : null,
          },
          positionMs: state.position,
          isPlaying:  !state.paused,
          timestamp:  Date.now(),
        });
      }, 300);

      // Fin de piste -> Auto-play
      if (state.position === 0 && state.paused && autoPlayEnabled && !isAutoPlayLocked && !isCrossfading) {
        isAutoPlayLocked = true;
        setTimeout(() => { isAutoPlayLocked = false; }, 5000);
        if (queue.length > 0) {
          playNextInQueue();
        } else if (fallbackPlaylistUri) {
          playFallbackTrack();
        }
      }
    });

    spotifyPlayer.addListener("initialization_error", ({ message }) => {
      console.error("Spotify initialization_error:", message);
      pushClientError("Spotify init error: " + message);
      showSpotifyError("Erreur d'initialisation du lecteur Spotify : " + message);
    });

    spotifyPlayer.addListener("authentication_error", async () => {
      pushClientError("Spotify authentication_error");
      showSpotifyError("Session Spotify expirée. Reconnexion automatique…");
      reconnectSpotifyPlayer(true);
    });

    spotifyPlayer.addListener("account_error", () => {
      pushClientError("Spotify account_error (Premium requis)");
      showSpotifyError("Un compte Spotify Premium est requis pour le contrôle régie.");
    });

    spotifyPlayer.addListener("playback_error", ({ message }) => {
      console.error("Spotify playback_error:", message);
      pushClientError("Spotify playback_error: " + message);
      showSpotifyError("Erreur de flux Spotify : " + message);
      schedulePlayerReconnect(4000);
    });

    spotifyPlayer.connect();
  }

  // ── Contrôle Lecture Résilient (Play / Pause / Resume) ──
  async function togglePlayPause() {
    if (!spotifyPlayer) {
      if (queue.length > 0) return playNextInQueue();
      if (fallbackPlaylistUri) return playFallbackTrack();
      return;
    }

    try {
      const state = await spotifyPlayer.getCurrentState();
      if (!state) {
        // Si aucun état actif (ex: première lecture ou réveil)
        if (queue.length > 0) {
          await playNextInQueue();
        } else {
          // Essayer de reprendre via l'API REST
          const res = await fetch(`/api/spotify/resume/${eventId}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ device_id: deviceId }),
          });
          if (!res.ok) {
            await spotifyPlayer.resume();
          }
        }
        return;
      }

      if (state.paused) {
        await spotifyPlayer.resume().catch(async () => {
          await fetch(`/api/spotify/resume/${eventId}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ device_id: deviceId }),
          });
        });
      } else {
        await spotifyPlayer.pause().catch(async () => {
          await fetch(`/api/spotify/pause/${eventId}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ device_id: deviceId }),
          });
        });
      }
    } catch (err) {
      console.error("Erreur togglePlayPause:", err);
      // Dernier recours : tenter de relancer le prochain titre si la lecture est coupée
      if (!isPlaying && queue.length > 0) {
        playNextInQueue();
      }
    }
  }

  // ── Progress ──
  function updateProgress() {
    if (currentDuration === 0) return;
    const percent = (currentPosition / currentDuration) * 100;
    document.getElementById("progressFill").style.width  = percent + "%";
    document.getElementById("currentTime").textContent   = formatTime(currentPosition);
    document.getElementById("totalTime").textContent     = formatTime(currentDuration);
  }
  function startProgressUpdate() {
    stopProgressUpdate();
    progressInterval = setInterval(() => {
      if (isPlaying && currentDuration > 0) {
        currentPosition = Math.min(currentPosition + 1000, currentDuration);
        updateProgress();
      }
    }, 1000);
  }
  function stopProgressUpdate() {
    if (progressInterval) { clearInterval(progressInterval); progressInterval = null; }
  }
  function formatTime(ms) {
    const s = Math.floor(ms / 1000);
    return `${Math.floor(s/60)}:${(s%60).toString().padStart(2,"0")}`;
  }

  // ── Modal Message aux invités ──
  function toggleMessagePanel(close = false) {
    const panel = document.getElementById("messagePanel");
    if (close || !panel.classList.contains("hidden")) {
      panel.classList.add("hidden");
    } else {
      panel.classList.remove("hidden");
      document.getElementById("djMessageInput").focus();
    }
  }

  document.getElementById("showMessagePanel")?.addEventListener("click", () => toggleMessagePanel());
  document.getElementById("closeMessagePanel")?.addEventListener("click", () => toggleMessagePanel(true));
  document.getElementById("messagePanel")?.addEventListener("click", (e) => { if (e.target.id === "messagePanel") toggleMessagePanel(true); });

  const djMsgInput = document.getElementById("djMessageInput");
  const djMsgCount = document.getElementById("djMessageCount");
  djMsgInput?.addEventListener("input", () => {
    if (djMsgCount) djMsgCount.textContent = `${djMsgInput.value.length} / 200`;
  });

  document.getElementById("sendDjMessage")?.addEventListener("click", () => {
    if (!djMsgInput) return;
    const msg = djMsgInput.value.trim();
    if (!msg) return;
    socket.emit("dj-message", { eventId, message: msg });
    const feedback = document.getElementById("djMessageFeedback");
    if (feedback) feedback.classList.remove("hidden");
    djMsgInput.value = "";
    if (djMsgCount) djMsgCount.textContent = "0 / 200";
    if (feedback) setTimeout(() => feedback.classList.add("hidden"), 3000);
  });

  djMsgInput?.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) document.getElementById("sendDjMessage")?.click();
  });

  // ── Event listeners ──
  document.getElementById("showSettings")?.addEventListener("click", () => toggleSettings());
  document.getElementById("closeSettings")?.addEventListener("click", () => toggleSettings());
  document.getElementById("closeSettingsBottom")?.addEventListener("click", () => toggleSettings());
  document.getElementById("settingsPanel")?.addEventListener("click", (e) => { if (e.target.id === "settingsPanel") toggleSettings(); });

  document.getElementById("showQRCode")?.addEventListener("click", showQRCodePanel);
  document.getElementById("closeQRCode")?.addEventListener("click", closeQRCodePanel);
  document.getElementById("closeQRCodeBottom")?.addEventListener("click", closeQRCodePanel);
  document.getElementById("qrCodePanel")?.addEventListener("click", (e) => { if (e.target.id === "qrCodePanel") closeQRCodePanel(); });
  document.getElementById("copyLinkBtn")?.addEventListener("click", copyUserLink);
  const liveStatsBtnEl = document.getElementById("liveStatsBtn");
  if (liveStatsBtnEl) liveStatsBtnEl.href = `/event/${eventId}/stats`;
  document.getElementById("openPublicDisplay")?.addEventListener("click", openPublicDisplay);
  document.getElementById("openPublicDisplayFromQR")?.addEventListener("click", openPublicDisplay);

  document.getElementById("addSongBtn")?.addEventListener("click", showAddSongPanel);
  document.getElementById("closeAddSong")?.addEventListener("click", closeAddSongPanel);
  document.getElementById("closeAddSongBottom")?.addEventListener("click", closeAddSongPanel);
  document.getElementById("addSongPanel")?.addEventListener("click", (e) => { if (e.target.id === "addSongPanel") closeAddSongPanel(); });

  // Pas de bouton connectSpotify — connexion automatique au chargement
  document.getElementById("votesToggle")?.addEventListener("change", toggleVotes);
  document.getElementById("duplicatesToggle")?.addEventListener("change", toggleDuplicates);
  document.getElementById("autoAcceptToggle")?.addEventListener("change", toggleAutoAccept);
  document.getElementById("filterExplicitToggle")?.addEventListener("change", (e) => {
    socket.emit("update-event-settings", { eventId, filterExplicit: e.target.checked });
  });
  document.getElementById("btnExportSpotifyPlaylist")?.addEventListener("click", async () => {
    const btn = document.getElementById("btnExportSpotifyPlaylist");
    const orig = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = `<span class="animate-spin text-xs">⏳</span> Création…`;
    try {
      const csrf = document.cookie.match(/XSRF-TOKEN=([^;]+)/)?.[1] || "";
      const res = await fetch(`/api/spotify/export-playlist/${eventId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-csrf-token": csrf },
      });
      const data = await res.json();
      if (res.ok && data.success) {
        showToast(`🎵 Playlist Spotify créée (${data.totalTracks} titres) !`);
        window.open(data.playlistUrl, "_blank");
      } else {
        showToast(data.error || "Erreur lors de la création de la playlist", "error");
      }
    } catch {
      showToast("Erreur communication Spotify", "error");
    } finally {
      btn.disabled = false;
      btn.innerHTML = orig;
    }
  });
  document.getElementById("btnUpdateRateLimit")?.addEventListener("click", updateRateLimit);
  document.getElementById("btnFreeze5")?.addEventListener("click", () => {
    socket.emit("update-event-settings", { eventId, requestFreezeMinutes: 5 });
    showToast("Demandes gelées 5 min", "info");
  });
  document.getElementById("btnFreeze10")?.addEventListener("click", () => {
    socket.emit("update-event-settings", { eventId, requestFreezeMinutes: 10 });
    showToast("Demandes gelées 10 min", "info");
  });
  document.getElementById("btnFreezeOff")?.addEventListener("click", () => {
    socket.emit("update-event-settings", { eventId, requestFreezeMinutes: 0 });
    showToast("Gel des demandes désactivé", "info");
  });

  document.getElementById("btnLaunchPoll")?.addEventListener("click", () => {
    const question = (document.getElementById("pollQuestionInput")?.value || "").trim();
    const options = [
      document.getElementById("pollOption1")?.value,
      document.getElementById("pollOption2")?.value,
      document.getElementById("pollOption3")?.value,
      document.getElementById("pollOption4")?.value,
    ].map((v) => String(v || "").trim()).filter(Boolean);
    if (!question || options.length < 2) {
      showToast("Question + 2 options minimum", "error");
      return;
    }
    socket.emit("create-live-poll", { eventId, question, options });
    showToast("Sondage lancé", "info");
  });
  document.getElementById("btnClosePoll")?.addEventListener("click", () => {
    if (!livePollState?.id) return;
    socket.emit("close-live-poll", { eventId, pollId: livePollState.id });
  });
  document.getElementById("btnSaveMessage")?.addEventListener("click", saveThankYouMessage);
  document.getElementById("playPauseBtn")?.addEventListener("click", togglePlayPause);
  document.getElementById("btnReconnectPlayer")?.addEventListener("click", () => reconnectSpotifyPlayer(false));
  document.getElementById("btnPrevious")?.addEventListener("click", () => { if (spotifyPlayer) spotifyPlayer.previousTrack(); });
  document.getElementById("btnNext")?.addEventListener("click", () => {
    if (
      spotifyPlayer &&
      currentPlayingRequestId &&
      currentDuration > 0 &&
      currentPosition / currentDuration < 0.85
    ) {
      socket.emit("mark-skipped", { eventId, requestId: currentPlayingRequestId });
    }
    if (spotifyPlayer) spotifyPlayer.nextTrack();
  });
  document.getElementById("autoPlay")?.addEventListener("change", (e) => { autoPlayEnabled = e.target.checked; });
  document.getElementById("sortByVotes")?.addEventListener("click", sortQueueByVotes);
  document.getElementById("endEvent")?.addEventListener("click", endEventConfirm);

  const progressBarEl = document.getElementById("progressBar");
  progressBarEl?.addEventListener("click", (e) => {
    const bar  = e.currentTarget;
    const rect = bar.getBoundingClientRect();
    seekToPosition(Math.floor((e.clientX - rect.left) / rect.width * currentDuration));
  });
  progressBarEl?.addEventListener("mousemove", (e) => {
    const bar  = e.currentTarget;
    const rect = bar.getBoundingClientRect();
    const hover= document.getElementById("progressHover");
    if (hover) hover.style.width = ((e.clientX - rect.left) / rect.width * 100) + "%";
  });
  progressBarEl?.addEventListener("mouseleave", () => {
    const hover = document.getElementById("progressHover");
    if (hover) hover.style.width = "0%";
  });

  document.getElementById("djSearchInput")?.addEventListener("input", (e) => {
    const query = e.target.value.trim();
    clearTimeout(searchTimeout);
    if (query.length < 2) { 
      const res = document.getElementById("djSearchResults");
      if (res) res.innerHTML = ""; 
      return; 
    }
    searchTimeout = setTimeout(() => searchSpotifyForDJ(query), 500);
  });

  document.getElementById("djSearchResults")?.addEventListener("click", (e) => {
    const trackDiv = e.target.closest("[data-dj-track]");
    if (trackDiv) addSongDirectlyToQueue(JSON.parse(trackDiv.dataset.djTrack));
  });

  document.getElementById("pendingRequests")?.addEventListener("click", (e) => {
    const button = e.target.closest("button");
    if (!button) return;
    const { action, requestId, previewUrl, trackName, artist, img, userName } = button.dataset;
    if (action === "accept")       acceptRequest(requestId);
    else if (action === "reject")  rejectRequest(requestId);
    else if (action === "preview") startPreview(previewUrl, trackName, artist, img);
    else if (action === "ban")     openBanModal(requestId, userName);
  });

  document.getElementById("queue")?.addEventListener("click", (e) => {
    const button = e.target.closest("button");
    if (!button) return;
    const { action, requestId, spotifyUri, previewUrl, trackName, artist, img } = button.dataset;
    if (action === "play" && spotifyUri) playTrack(spotifyUri, requestId);
    else if (action === "mark-played") markPlayed(requestId);
    else if (action === "preview") startPreview(previewUrl, trackName, artist, img);
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      toggleSettings(true);
      closeQRCodePanel();
      closeAddSongPanel();
    }
  });

  document.getElementById("sortByBPM")?.addEventListener("click", sortPendingByBPM);

  document.getElementById("btnAcceptAllPending")?.addEventListener("click", () => {
    if (pendingRequests.length === 0) return;
    if (!confirm(`Accepter les ${pendingRequests.length} demande(s) en attente ?`)) return;
    socket.emit("accept-all-pending", { eventId });
  });
  document.getElementById("btnRejectAllPending")?.addEventListener("click", () => {
    if (pendingRequests.length === 0) return;
    if (!confirm(`Refuser les ${pendingRequests.length} demande(s) en attente ?`)) return;
    socket.emit("reject-all-pending", { eventId });
  });

  document.getElementById("btnSaveRepeatCooldown")?.addEventListener("click", () => {
    const input = document.getElementById("repeatCooldownMinutes");
    if (!input) return;
    let n = parseInt(input.value, 10);
    if (Number.isNaN(n)) n = 0;
    n = Math.max(0, Math.min(240, n));
    input.value = n;
    socket.emit("update-event-settings", { eventId, repeatCooldownMinutes: n });
    showToast("Anti-répétition enregistrée", "info");
  });

  document.getElementById("btnSaveProjectionVisuals")?.addEventListener("click", () => {
    const toggle = document.getElementById("projectionVisualsToggle");
    const mode = document.getElementById("projectionVisualsMode");
    const autoPerTrack = document.getElementById("projectionVisualsAutoPerTrack");
    projectionVisualsEnabled = toggle ? toggle.checked : false;
    projectionVisualsMode    = mode ? (mode.value || "aurora") : "aurora";
    projectionVisualsAutoPerTrack = autoPerTrack ? autoPerTrack.checked : false;
    socket.emit("update-event-settings", {
      eventId,
      projectionVisualsEnabled,
      projectionVisualsMode,
      projectionVisualsAutoPerTrack,
    });
    showToast("Visuels de projection mis à jour", "info");
  });

  let undoRejectRequestId = null;
  let undoRejectTimer     = null;
  document.getElementById("rejectUndoBtn")?.addEventListener("click", () => {
    if (undoRejectRequestId) {
      socket.emit("undo-reject-request", { requestId: undoRejectRequestId });
    }
    document.getElementById("rejectUndoBar")?.classList.add("hidden");
    undoRejectRequestId = null;
    clearTimeout(undoRejectTimer);
  });

  document.getElementById("btnSaveFallbackPlaylist")?.addEventListener("click", saveFallbackPlaylist);
  document.getElementById("btnClearFallbackPlaylist")?.addEventListener("click", () => {
    const input = document.getElementById("fallbackPlaylistInput");
    if (input) input.value = "";
    saveFallbackPlaylist();
  });
  document.getElementById("fallbackPlaylistInput")?.addEventListener("blur", async () => {
    const input = document.getElementById("fallbackPlaylistInput");
    const val = input ? input.value.trim() : "";
    fallbackPlaylistUri = val || null;
    updateFallbackPlaylistUI();
    await loadFallbackPlaylistPreview();
  });

  // Crossfade slider
  (function initCrossfadeSlider() {
    const slider = document.getElementById("crossfadeSlider");
    const label  = document.getElementById("crossfadeValue");
    if (!slider) return;
    slider.value = crossfadeDuration;
    if (label) label.textContent = crossfadeDuration === 0 ? "Désactivé" : `${crossfadeDuration} s`;
    slider.addEventListener("input", () => {
      crossfadeDuration = parseInt(slider.value);
      localStorage.setItem("djq-crossfade", crossfadeDuration);
      if (label) label.textContent = crossfadeDuration === 0 ? "Désactivé" : `${crossfadeDuration} s`;
    });
  })();


  // ── Preview Audio ──────────────────────────────────────────────
  const previewAudio   = document.getElementById("previewAudio");
  const previewBar     = document.getElementById("previewBar");
  let   previewCurrent = null; // URL en cours

  // Sélecteur de sorties audio (si l'API est supportée)
  // Appelé seulement lors du premier clic Preview, pas au chargement de la page
  let audioOutputsLoaded = false;
  async function loadAudioOutputs() {
    if (audioOutputsLoaded || !navigator.mediaDevices?.enumerateDevices) return;
    audioOutputsLoaded = true;
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const outputs = devices.filter((d) => d.kind === "audiooutput");
      if (outputs.length <= 1) return;
      const sel = document.getElementById("previewOutputSelect");
      sel.innerHTML = outputs.map((d) =>
        `<option value="${d.deviceId}">${d.label || "Sortie audio " + (outputs.indexOf(d) + 1)}</option>`
      ).join("");
      document.getElementById("previewOutputWrap").classList.remove("hidden");
      sel.addEventListener("change", () => {
        if (previewAudio.setSinkId) previewAudio.setSinkId(sel.value).catch(console.warn);
      });
    } catch { /* silencieux si permission refusée */ }
  }

  function startPreview(url, trackName, artistName, imgUrl) {
    if (!url) return;
    loadAudioOutputs(); // charge les sorties audio au premier clic (sans demander le micro)
    if (previewCurrent === url && !previewAudio.paused) {
      // Toggle : stopper si déjà en lecture
      previewAudio.pause();
      previewCurrent = null;
      previewBar.classList.add("hidden");
      return;
    }
    previewCurrent = url;
    previewAudio.src = url;
    previewAudio.play().catch(console.warn);
    document.getElementById("previewTitle").textContent  = trackName  || "";
    document.getElementById("previewArtist").textContent = artistName || "";
    const art = document.getElementById("previewArt");
    art.src = imgUrl || "";
    art.classList.toggle("hidden", !imgUrl);
    previewBar.classList.remove("hidden");
    document.getElementById("previewProgressBar").style.width = "0%";
    document.getElementById("previewPlayIcon").classList.remove("hidden");
    document.getElementById("previewPauseIcon").classList.add("hidden");
  }

  previewAudio?.addEventListener("play", () => {
    document.getElementById("previewPlayIcon")?.classList.add("hidden");
    document.getElementById("previewPauseIcon")?.classList.remove("hidden");
  });
  previewAudio?.addEventListener("pause", () => {
    document.getElementById("previewPlayIcon")?.classList.remove("hidden");
    document.getElementById("previewPauseIcon")?.classList.add("hidden");
  });
  previewAudio?.addEventListener("ended", () => {
    previewCurrent = null;
    if (previewBar) previewBar.classList.add("hidden");
    const pBar = document.getElementById("previewProgressBar");
    if (pBar) pBar.style.width = "0%";
  });
  previewAudio?.addEventListener("timeupdate", () => {
    if (!previewAudio.duration) return;
    const pct = (previewAudio.currentTime / previewAudio.duration) * 100;
    const pBar = document.getElementById("previewProgressBar");
    if (pBar) pBar.style.width = `${pct}%`;
  });

  document.getElementById("previewPlayPauseBtn")?.addEventListener("click", () => {
    if (previewAudio.paused) previewAudio.play().catch(console.warn);
    else previewAudio.pause();
  });
  document.getElementById("previewCloseBtn")?.addEventListener("click", () => {
    previewAudio.pause();
    previewAudio.src = "";
    previewCurrent = null;
    if (previewBar) previewBar.classList.add("hidden");
  });

  // ── Système de dons ────────────────────────────────────────────
  let donationSettings = {
    enabled: false, required: false, amount: 2, link: "", message: "", goalAmount: 0, raisedTotal: 0,
  };

  function applyDonationSettings(s) {
    donationSettings = { ...donationSettings, ...s };
    const enabled = !!donationSettings.enabled;
    const toggle = document.getElementById("donationsEnabledToggle") || document.getElementById("donationEnabledToggle");
    if (toggle) toggle.checked = enabled;
    const opt = document.getElementById("donationOptions");
    if (opt) opt.classList.toggle("hidden", !enabled);
    const req = document.getElementById("donationRequiredToggle");
    if (req && s.required !== undefined) req.checked = !!s.required;
    const amt = document.getElementById("donationAmountInput");
    if (amt && s.amount !== undefined) amt.value = s.amount;
    const link = document.getElementById("donationsUrlInput") || document.getElementById("donationLinkInput");
    if (link && s.link !== undefined) link.value = s.link || "";
    const msg = document.getElementById("donationMessageInput");
    if (msg && s.message !== undefined) msg.value = s.message || "";
    const goal = document.getElementById("donationsTargetInput") || document.getElementById("donationGoalAmountInput");
    if (goal && s.goalAmount !== undefined) goal.value = s.goalAmount || 0;
    const raised = document.getElementById("donationsRaisedTotalInput");
    if (raised && s.raisedTotal !== undefined) raised.value = s.raisedTotal || 0;
  }

  document.getElementById("donationsEnabledToggle")?.addEventListener("change", (e) => {
    const opt = document.getElementById("donationOptions");
    if (opt) opt.classList.toggle("hidden", !e.target.checked);
  });
  document.getElementById("donationEnabledToggle")?.addEventListener("change", (e) => {
    const opt = document.getElementById("donationOptions");
    if (opt) opt.classList.toggle("hidden", !e.target.checked);
  });

  document.getElementById("btnSaveDonation")?.addEventListener("click", () => {
    const linkInput = document.getElementById("donationsUrlInput") || document.getElementById("donationLinkInput");
    const link = linkInput ? linkInput.value.trim() : "";
    const amountInput = document.getElementById("donationAmountInput");
    const amount = amountInput ? parseFloat(amountInput.value) : 2;
    const reqToggle = document.getElementById("donationRequiredToggle");
    const required = reqToggle ? reqToggle.checked : false;
    const enToggle = document.getElementById("donationsEnabledToggle") || document.getElementById("donationEnabledToggle");
    const enabled = enToggle ? enToggle.checked : false;
    const msgInput = document.getElementById("donationMessageInput");
    const message = msgInput ? msgInput.value.trim() : "";
    const targetInput = document.getElementById("donationsTargetInput") || document.getElementById("donationGoalAmountInput");
    const goalAmount = targetInput ? parseFloat(targetInput.value) : 0;
    const raisedInput = document.getElementById("donationsRaisedTotalInput");
    const raisedTotal = raisedInput ? parseFloat(raisedInput.value) : 0;

    if (enabled && (!link || !link.startsWith("https://"))) {
      alert("Le lien de paiement doit commencer par https://");
      return;
    }

    donationSettings = {
      enabled,
      required,
      amount: isNaN(amount) ? 2 : amount,
      link,
      message,
      goalAmount: isNaN(goalAmount) ? 0 : goalAmount,
      raisedTotal: isNaN(raisedTotal) ? 0 : raisedTotal,
    };
    socket.emit("update-event-settings", {
      eventId,
      donationEnabled:  enabled,
      donationRequired: required,
      donationAmount:   donationSettings.amount,
      donationLink:     link,
      donationMessage:  message,
      donationGoalAmount: donationSettings.goalAmount,
      donationsRaisedTotal: donationSettings.raisedTotal,
    });

    const fb = document.getElementById("donationSaveFeedback");
    if (fb) {
      fb.classList.remove("hidden");
      setTimeout(() => fb.classList.add("hidden"), 2500);
    }
  });

  // ── Système de ban ─────────────────────────────────────────────────────────
  let banTargetRequestId = null;

  function openBanModal(requestId, userName) {
    banTargetRequestId = requestId;
    const nameEl = document.getElementById("banModalName");
    if (nameEl) nameEl.textContent = `Invité : ${userName || "Anonyme"}`;
    const modal = document.getElementById("banModal");
    if (modal) modal.classList.remove("hidden");
  }

  function closeBanModal() {
    banTargetRequestId = null;
    const modal = document.getElementById("banModal");
    if (modal) modal.classList.add("hidden");
  }

  document.getElementById("cancelBanModal")?.addEventListener("click", closeBanModal);
  document.getElementById("banModal")?.addEventListener("click", (e) => {
    if (e.target.id === "banModal") closeBanModal();
  });

  // Clic sur une durée de ban
  document.getElementById("banModal")?.addEventListener("click", (e) => {
    const btn = e.target.closest("button[data-ban-duration]");
    if (!btn || !banTargetRequestId) return;
    const duration = parseInt(btn.dataset.banDuration, 10);
    socket.emit("ban-user", { eventId, requestId: banTargetRequestId, duration });
    closeBanModal();
  });

  function renderBannedUsers(bans) {
    const list  = document.getElementById("bannedList");
    const count = document.getElementById("bannedCount");
    if (count) count.textContent = bans.length;
    if (!list) return;
    if (bans.length === 0) {
      list.innerHTML = `<p class="text-xs" style="color:var(--text-muted)">Aucun invité bloqué</p>`;
      return;
    }
    list.innerHTML = bans.map((ban) => {
      const permanent  = ban.banned_until === null;
      const expireText = permanent
        ? "Toute la soirée"
        : `Jusqu'à ${new Date(ban.banned_until).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}`;
      return `
        <div class="flex items-center justify-between gap-2 py-2 rounded-lg px-2" style="background:var(--bg-elevated)">
          <div class="min-w-0">
            <p class="text-xs font-semibold truncate" style="color:var(--text-primary)">${ban.user_name || "Anonyme"}</p>
            <p class="text-xs" style="color:${permanent ? "var(--red)" : "var(--amber)"}">${expireText}</p>
          </div>
          <button class="btn btn-ghost btn-sm shrink-0 text-xs" style="color:var(--text-muted)"
                  data-unban-client="${ban.client_id}" title="Débloquer">
            Débloquer
          </button>
        </div>`;
    }).join("");
  }

  function renderRequestsFreezeBadge() {
    const badge = document.getElementById("requestsFreezeBadge");
    if (!badge) return;
    if (!requestsFrozenUntil || Date.now() >= Number(requestsFrozenUntil)) {
      badge.classList.add("hidden");
      return;
    }
    const remainingMs = Math.max(0, Number(requestsFrozenUntil) - Date.now());
    const mins = Math.max(1, Math.ceil(remainingMs / 60000));
    badge.textContent = `Demandes gelées (${mins} min)`;
    badge.classList.remove("hidden");
  }

  function renderLivePollState() {
    const box = document.getElementById("livePollSection") || document.getElementById("pollLiveState");
    const resBox = document.getElementById("livePollResults");
    if (!box) return;
    if (!livePollState?.isActive) {
      box.classList.add("hidden");
      return;
    }
    const options = livePollState.options || [];
    const percentages = livePollState.percentages || [];
    const counts = livePollState.counts || [];
    if (resBox) {
      resBox.innerHTML = `
        <p class="font-bold mb-1" style="color:var(--text-primary)">${livePollState.question || "Sondage actif"}</p>
        ${options.map((o, i) => `
          <div class="flex items-center justify-between gap-2 py-0.5">
            <span class="truncate">${o}</span>
            <span class="tabular-nums font-bold" style="color:var(--green)">${percentages[i] || 0}% (${counts[i] || 0})</span>
          </div>
        `).join("")}
        <p class="mt-1 text-[11px]" style="color:var(--text-muted)">Total votes: ${livePollState.totalVotes || 0}</p>
      `;
    }
    box.classList.remove("hidden");
  }

  // Débannir depuis la liste des blocages
  document.getElementById("bannedList")?.addEventListener("click", (e) => {
    const btn = e.target.closest("button[data-unban-client]");
    if (!btn) return;
    socket.emit("unban-user", { eventId, clientId: btn.dataset.unbanClient });
  });

  // Recevoir la liste mise à jour
  socket.on("banned-users-updated", (data) => {
    renderBannedUsers(data.bans || []);
  });

  // ── Lien modérateur ────────────────────────────────────────
  (function initModToken() {
    const btnGenerate = document.getElementById("btnGenerateModToken");
    const btnRevoke   = document.getElementById("btnRevokeModToken");
    const btnCopy     = document.getElementById("btnCopyModLink");
    const linkInput   = document.getElementById("modLinkInput");
    const linkBox     = document.getElementById("modLinkBox");
    const badge       = document.getElementById("modBadgeActive");

    function showModLink(url) {
      if (linkInput) linkInput.value = url;
      if (linkBox) linkBox.classList.remove("hidden");
      if (btnGenerate) btnGenerate.classList.add("hidden");
      if (badge) badge.classList.remove("hidden");
    }
    function hideModLink() {
      if (linkBox) linkBox.classList.add("hidden");
      if (btnGenerate) btnGenerate.classList.remove("hidden");
      if (badge) badge.classList.add("hidden");
      if (linkInput) linkInput.value = "";
    }

    btnGenerate?.addEventListener("click", async () => {
      try {
        const csrf = document.cookie.match(/XSRF-TOKEN=([^;]+)/)?.[1] || "";
        const res  = await fetch(`/api/events/${eventId}/generate-mod-token`, {
          method: "POST",
          headers: { "x-csrf-token": csrf },
        });
        const data = await res.json();
        if (data.modUrl) showModLink(data.modUrl);
      } catch (err) { console.error("Erreur génération mod token:", err); }
    });

    btnRevoke?.addEventListener("click", async () => {
      if (!confirm("Révoquer le lien modérateur ? Les modérateurs actifs seront déconnectés.")) return;
      try {
        const csrf = document.cookie.match(/XSRF-TOKEN=([^;]+)/)?.[1] || "";
        await fetch(`/api/events/${eventId}/revoke-mod-token`, {
          method: "POST",
          headers: { "x-csrf-token": csrf },
        });
        hideModLink();
      } catch (err) { console.error("Erreur révocation mod token:", err); }
    });

    btnCopy?.addEventListener("click", () => {
      if (!linkInput) return;
      navigator.clipboard.writeText(linkInput.value).then(() => {
        btnCopy.innerHTML = `<svg class="w-4 h-4" style="color:var(--green)" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>`;
        setTimeout(() => {
          btnCopy.innerHTML = `<svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>`;
        }, 2000);
      });
    });
  })();

  async function loadCoDjLinks() {
    try {
      const res = await fetch(`/api/events/${eventId}/co-dj-links`);
      const data = await res.json();
      const list = document.getElementById("coDjLinksList");
      const links = data.links || [];
      if (!links.length) {
        list.innerHTML = `<p style="color:var(--text-muted)">Aucun lien co-DJ</p>`;
        return;
      }
      list.innerHTML = links.map((l) => `
        <div class="flex items-center justify-between gap-2 p-2 rounded-lg" style="background:var(--bg-surface);border:1px solid var(--border)">
          <div class="min-w-0">
            <p class="truncate font-medium">${l.label || "Lien co-DJ"}</p>
            <p style="color:var(--text-muted)">${l.role}</p>
          </div>
          <button class="btn btn-ghost btn-sm" data-revoke-co-dj="${l.id}">Révoquer</button>
        </div>
      `).join("");
    } catch (err) {
      console.error("Erreur co-dj-links:", err);
    }
  }

  async function loadActionLogs() {
    try {
      const res = await fetch(`/api/events/${eventId}/action-logs`);
      const data = await res.json();
      const list = document.getElementById("actionLogsList");
      const logs = data.logs || [];
      if (!logs.length) {
        list.innerHTML = `<p style="color:var(--text-muted)">Aucune action récente</p>`;
        return;
      }
      list.innerHTML = logs.slice(0, 80).map((log) => `
        <div class="p-2 rounded-lg" style="background:var(--bg-surface);border:1px solid var(--border)">
          <p><strong>${log.actor_role || log.actor_type}</strong> · ${log.action_type}</p>
          <p style="color:var(--text-muted)">${new Date(log.created_at).toLocaleTimeString("fr-FR")}</p>
        </div>
      `).join("");
    } catch (err) {
      console.error("Erreur action-logs:", err);
    }
  }

  document.getElementById("btnGenerateCoDjLink")?.addEventListener("click", async () => {
    try {
      const role = document.getElementById("coDjRoleSelect").value;
      const csrf = document.cookie.match(/XSRF-TOKEN=([^;]+)/)?.[1] || "";
      const res = await fetch(`/api/events/${eventId}/generate-co-dj-link`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-csrf-token": csrf },
        body: JSON.stringify({ role }),
      });
      const data = await res.json();
      if (data.modUrl) {
        await navigator.clipboard.writeText(data.modUrl);
        showToast("Lien co-DJ généré et copié");
      }
      loadCoDjLinks();
    } catch (err) {
      console.error("Erreur génération co-dj:", err);
    }
  });

  document.getElementById("coDjLinksList")?.addEventListener("click", async (e) => {
    const btn = e.target.closest("button[data-revoke-co-dj]");
    if (!btn) return;
    try {
      const csrf = document.cookie.match(/XSRF-TOKEN=([^;]+)/)?.[1] || "";
      await fetch(`/api/events/${eventId}/revoke-co-dj-link`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-csrf-token": csrf },
        body: JSON.stringify({ linkId: btn.dataset.revokeCoDj }),
      });
      loadCoDjLinks();
    } catch (err) {
      console.error("Erreur révocation co-dj:", err);
    }
  });

  document.getElementById("btnRefreshActionLogs")?.addEventListener("click", loadActionLogs);

  // ── Réactions Public en Direct (Régie DJ) ─────────────────
  let djReactionTimer = null;
  let djReactionTotal = 0;
  socket.on("live-reaction-broadcast", (data) => {
    if (!data?.reaction) return;
    djReactionTotal += data.count || 1;
    const wrap = document.getElementById("djCrowdReactionsWrap");
    const emojiEl = document.getElementById("djCrowdReactionEmoji");
    const textEl = document.getElementById("djCrowdReactionText");
    if (wrap && emojiEl && textEl) {
      emojiEl.textContent = data.reaction;
      textEl.textContent = `${data.senderName ? data.senderName + " • " : ""}+${djReactionTotal}`;
      wrap.classList.remove("hidden");
      wrap.style.transform = "scale(1.15)";
      setTimeout(() => { wrap.style.transform = ""; }, 180);

      clearTimeout(djReactionTimer);
      djReactionTimer = setTimeout(() => {
        wrap.classList.add("hidden");
        djReactionTotal = 0;
      }, 4000);
    }
  });

  // ── Init ──
  // Rejoindre la room à chaque connexion/reconnexion Socket.IO
  socket.on("connect", () => {
    socket.emit("join-event", eventId);
    socket.emit("get-banned-users", { eventId });
    loadLiveHealth();
    // Après une reconnexion, resynchroniser l'état complet
    if (socket._reconnecting) {
      loadPendingRequests();
      loadQueue();
    }
  });
  // Variable pour détecter les reconnexions
  socket._reconnecting = false;
  socket.on("disconnect", () => {
    socket._reconnecting = true;
    pushClientError("Socket disconnected");
    loadLiveHealth();
  });
  socket.on("connect_error", (err) => {
    pushClientError(`Socket connect_error: ${err?.message || "unknown"}`);
    loadLiveHealth();
  });

  window.addEventListener("error", (e) => {
    pushClientError(e?.message || "Erreur JS");
    loadLiveHealth();
  });
  window.addEventListener("unhandledrejection", (e) => {
    pushClientError(e?.reason?.message || e?.reason || "Promise rejetée");
    loadLiveHealth();
  });

  // Appel immédiat si la socket est déjà connectée (cas fréquent au chargement)
  if (socket.connected) {
    socket.emit("join-event", eventId);
    socket.emit("get-banned-users", { eventId });
    loadLiveHealth();
  }

  const urlParams = new URLSearchParams(window.location.search);
  if (urlParams.get("spotify") === "connected") {
    window.history.replaceState({}, document.title, window.location.pathname);
    setTimeout(() => showToast("Spotify connecté avec succès !"), 500);
  }
  if (urlParams.get("error") === "spotify_auth_failed") {
    window.history.replaceState({}, document.title, window.location.pathname);
    showToast("Erreur lors de la connexion à Spotify", "error");
  }

  fetch(`/api/events/${eventId}`)
    .then((r) => r.json())
    .then((data) => {
      const setChecked = (id, val) => { const el = document.getElementById(id); if (el) el.checked = !!val; };
      const setValue   = (id, val) => { const el = document.getElementById(id); if (el) el.value = val; };
      const setText    = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };

      setText("eventName", data.name || "Soirée");
      queue             = data.queue || [];
      allowDuplicates   = data.allow_duplicates || false;
      votesEnabled      = data.votes_enabled !== false;
      autoAcceptEnabled = data.auto_accept_enabled || false;

      setChecked("votesToggle", votesEnabled);
      setChecked("duplicatesToggle", allowDuplicates);
      setChecked("autoAcceptToggle", autoAcceptEnabled);
      setChecked("filterExplicitToggle", data.filter_explicit);
      setValue("rateLimitMax", data.rate_limit_max || 3);
      setValue("rateLimitWindow", data.rate_limit_window_minutes || 15);
      setValue("repeatCooldownMinutes", data.repeat_cooldown_minutes != null ? data.repeat_cooldown_minutes : 0);

      projectionVisualsEnabled = !!data.projection_visuals_enabled;
      projectionVisualsMode = (data.projection_visuals_mode || "aurora").toLowerCase();
      projectionVisualsAutoPerTrack = !!data.projection_visuals_auto_per_track;
      requestsFrozenUntil = data.requests_frozen_until ? Number(data.requests_frozen_until) : null;

      setChecked("projectionVisualsToggle", projectionVisualsEnabled);
      setValue("projectionVisualsMode",
        ["aurora", "pulse", "strobe", "spectrum", "nebula", "laser", "vortex", "party", "dvd", "bpm-sync"].includes(projectionVisualsMode)
          ? projectionVisualsMode
          : "aurora"
      );
      setChecked("projectionVisualsAutoPerTrack", projectionVisualsAutoPerTrack);
      setValue("thankYouMessage", data.thank_you_message || "");

      const autoBanner = document.getElementById("autoAcceptBanner");
      if (autoBanner) {
        if (autoAcceptEnabled) autoBanner.classList.remove("hidden");
        else autoBanner.classList.add("hidden");
      }

      // Playlist de secours
      fallbackPlaylistUri = data.fallback_playlist_uri || null;
      setValue("fallbackPlaylistInput", fallbackPlaylistUri || "");
      updateFallbackPlaylistUI();
      loadFallbackPlaylistPreview();
      renderRequestsFreezeBadge();
      renderLivePollState();

      // Réglages de dons
      applyDonationSettings({
        enabled:  !!data.donation_enabled,
        required: !!data.donation_required,
        amount:   data.donation_amount  || 2,
        link:     data.donation_link    || "",
        message:  data.donation_message || "",
        goalAmount: Number(data.donation_goal_amount || 0),
        raisedTotal: Number(data.donations_raised_total || 0),
      });

      renderQueue();
      loadPendingRequests();
      loadCoDjLinks();
      loadActionLogs();
      // Démarrer le fallback si queue vide et player déjà prêt
      tryStartFallback();
    })
    .catch(console.error);

  checkSpotifyStatus();
  setInterval(renderRequestsFreezeBadge, 15000);

  // ── Functions ──

  async function loadPendingRequests() {
    try {
      const response = await fetch(`/api/events/${eventId}/pending`);
      const data     = await response.json();
      if (data.pending && data.pending.length > 0) { pendingRequests = data.pending; renderPending(); }
    } catch (error) { console.error("Erreur chargement pending:", error); }
  }

  async function loadQueue() {
    try {
      const response = await fetch(`/api/events/${eventId}`);
      const data     = await response.json();
      queue = data.queue || [];
      renderQueue();
    } catch (error) { console.error("Erreur chargement queue:", error); }
  }

  function toggleSettings(close = false) {
    const panel = document.getElementById("settingsPanel");
    if (close === true) panel.classList.add("hidden");
    else panel.classList.toggle("hidden");
  }

  async function checkSpotifyStatus() {
    try {
      const response = await fetch(`/api/spotify/status/${eventId}`);
      const data     = await response.json();
      if (data.connected) {
        document.getElementById("spotifyStatus")?.classList.remove("hidden");
        initSpotifyPlayer();
      }
      // Si non connecté, rien à faire — les tokens ont été copiés à la création de l'événement.
      // Si le token est expiré, il faudra se reconnecter via le dashboard Spotify (rafraîchissement futur).
    } catch (error) { console.error("Erreur vérification Spotify:", error); }
  }

  async function initSpotifyPlayer() {
    try {
      const response = await fetch(`/api/spotify/token/${eventId}`);
      const data     = await response.json();
      if (data.error) { console.error("Erreur token:", data.error); return; }
      spotifyToken = data.access_token;
      if (window.Spotify) window.onSpotifyWebPlaybackSDKReady();
    } catch (error) { console.error("Erreur init player:", error); }
  }

  async function seekToPosition(positionMs) {
    if (!spotifyPlayer || !deviceId) return;
    try {
      await spotifyPlayer.seek(positionMs);
      currentPosition = positionMs;
      updateProgress();
    } catch (error) { console.error("Erreur seek:", error); }
  }

  async function toggleVotes() {
    const newState = !votesEnabled;
    try {
      const response = await fetch(`/api/events/${eventId}/settings`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ votes_enabled: newState }),
      });
      if (response.ok) {
        votesEnabled = newState;
        socket.emit("update-event-settings", { eventId, votesEnabled: newState });
      }
    } catch (error) { console.error("Erreur toggle votes:", error); }
  }

  async function toggleDuplicates() {
    try {
      const response = await fetch(`/api/events/${eventId}/toggle-duplicates`, { method: "POST" });
      const data     = await response.json();
      allowDuplicates = data.allow_duplicates;
    } catch (error) { console.error("Erreur toggle duplicates:", error); }
  }

  async function toggleAutoAccept() {
    const enabled = document.getElementById("autoAcceptToggle").checked;
    try {
      const response = await fetch(`/api/events/${eventId}/toggle-auto-accept`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled }),
      });
      const data = await response.json();
      autoAcceptEnabled = data.autoAcceptEnabled;
      document.getElementById("autoAcceptBanner").classList.toggle("hidden", !autoAcceptEnabled);
    } catch (error) { console.error("Erreur toggle auto-accept:", error); }
  }

  async function updateRateLimit() {
    const max    = parseInt(document.getElementById("rateLimitMax").value);
    const window = parseInt(document.getElementById("rateLimitWindow").value);
    try {
      const response = await fetch(`/api/events/${eventId}/update-rate-limit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ max, window }),
      });
      const data = await response.json();
      if (data.success) showToast(`Rate limit: ${max} demandes / ${window} min`);
    } catch { showToast("Erreur lors de la mise à jour", "error"); }
  }

  function sortQueueByVotes() {
    const sorted = [...queue].sort((a, b) => ((b.upvotes||0)-(b.downvotes||0)) - ((a.upvotes||0)-(a.downvotes||0)));
    socket.emit("reorder-queue", { eventId, newQueue: sorted });
  }

  async function showQRCodePanel() {
    try {
      const response = await fetch(`/api/events/${eventId}/qrcode`);
      const data     = await response.json();
      document.getElementById("qrCodeImage").src            = data.qrCode;
      document.getElementById("userLinkInput").value        = data.userUrl;
      document.getElementById("publicDisplayLinkInput").value = `${window.location.origin}/event/${eventId}/qr`;
      document.getElementById("qrCodePanel").classList.remove("hidden");
    } catch { showToast("Erreur lors du chargement du QR code", "error"); }
  }

  function closeQRCodePanel() { document.getElementById("qrCodePanel").classList.add("hidden"); }

  function openPublicDisplay() {
    window.open(`/event/${eventId}/qr`, "_blank", "noopener,noreferrer");
    closeQRCodePanel();
  }

  function copyUserLink() {
    const input = document.getElementById("userLinkInput");
    input.select();
    document.execCommand("copy");
    showToast("Lien copié !");
  }

  function showAddSongPanel() {
    document.getElementById("addSongPanel").classList.remove("hidden");
    setTimeout(() => document.getElementById("djSearchInput").focus(), 50);
  }

  function closeAddSongPanel() {
    document.getElementById("addSongPanel").classList.add("hidden");
    document.getElementById("djSearchInput").value = "";
    document.getElementById("djSearchResults").innerHTML = "";
  }

  async function searchSpotifyForDJ(query) {
    try {
      const response = await fetch(`/api/spotify/search?q=${encodeURIComponent(query)}&eventId=${eventId}`);
      const data     = await response.json();
      if (data.error) {
        document.getElementById("djSearchResults").innerHTML = `<p class="text-xs text-center py-4" style="color:var(--red)">${data.error}</p>`;
        return;
      }
      displayDJSearchResults(data.tracks);
    } catch (error) { console.error("Erreur recherche DJ:", error); }
  }

  function displayDJSearchResults(tracks) {
    const container = document.getElementById("djSearchResults");
    if (!tracks || tracks.length === 0) {
      container.innerHTML = `<p class="text-xs text-center py-4" style="color:var(--text-muted)">Aucun résultat</p>`;
      return;
    }
    container.innerHTML = tracks.map((track) => {
      const trackJson = JSON.stringify(track).replace(/"/g, "&quot;");
      return `
      <div class="flex items-center gap-3 p-3 rounded-lg cursor-pointer transition hover:opacity-80" style="background:var(--bg-elevated);border:1px solid var(--border)" data-dj-track="${trackJson}">
        <img src="${track.image}" alt="" class="w-10 h-10 rounded-md shrink-0 object-cover" />
        <div class="flex-1 min-w-0">
          <p class="text-sm font-medium truncate" style="color:var(--text-primary)">${track.name}</p>
          <p class="text-xs truncate" style="color:var(--text-secondary)">${track.artist}</p>
        </div>
        <svg class="w-4 h-4 shrink-0" style="color:var(--accent)" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
      </div>`;
    }).join("");
  }

  async function addSongDirectlyToQueue(track) {
    try {
      const response = await fetch(`/api/events/${eventId}/add-song-dj`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ songData: track, userName: "DJ" }),
      });
      const data = await response.json();
      if (data.error) { showToast("Erreur: " + data.error, "error"); return; }
      closeAddSongPanel();
      showToast(`"${track.name}" ajoutée à la queue`);
    } catch { showToast("Erreur lors de l'ajout", "error"); }
  }

  function endEventConfirm() {
    if (confirm("Terminer la soirée ?\n\nCela va archiver l'événement, sauvegarder les statistiques et vous rediriger vers le dashboard.")) {
      endEvent();
    }
  }

  async function endEvent() {
    try {
      const response = await fetch(`/api/events/${eventId}/end`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      const data = await response.json();
      if (data.success) { showToast("Soirée terminée !"); setTimeout(() => { window.location.href = "/dashboard"; }, 1500); }
      else alert("Erreur: " + (data.error || "Erreur inconnue"));
    } catch { alert("Erreur lors de la fin de la soirée"); }
  }

  async function _startPlayback(uri) {
    const response = await fetch(`/api/spotify/play/${eventId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ uri, device_id: deviceId }),
    });
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      if (response.status === 404) {
        showSpotifyError("Aucun appareil Spotify actif — ouvre Spotify sur cet appareil et réessaie.");
      } else if (response.status === 403) {
        showSpotifyError("Compte Spotify Premium requis pour la lecture à distance.");
      } else if (response.status === 503 || response.status === 502) {
        showSpotifyError("Spotify temporairement indisponible — réessaie dans quelques secondes.");
      }
      throw new Error(data.error || `Erreur HTTP ${response.status}`);
    }
    hideSpotifyError();
  }

  // Attend que player_state_changed confirme le chargement d'un URI donné (max 3 s).
  function waitForTrackLoad(uri) {
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        spotifyPlayer.removeListener("player_state_changed", handler);
        resolve();
      }, 3000);
      function handler(state) {
        if (state?.track_window?.current_track?.uri === uri) {
          clearTimeout(timer);
          spotifyPlayer.removeListener("player_state_changed", handler);
          resolve();
        }
      }
      spotifyPlayer.addListener("player_state_changed", handler);
    });
  }

  async function performCrossfade(nextUri, nextRequestId) {
    isCrossfading    = true;
    isAutoPlayLocked = true; // Bloquer l'auto-play pendant toute la durée du crossfade

    // Lire le volume réel actuel
    let startVolume = currentVolume;
    try { startVolume = (await spotifyPlayer.getVolume()) ?? currentVolume; } catch { /* keep */ }

    const steps  = 20;
    const halfMs = (crossfadeDuration * 1000) / 2;
    const stepMs = halfMs / steps;
    const sleep  = (ms) => new Promise((r) => setTimeout(r, ms));

    showToast("Crossfade en cours…", "info");
    try {
      // ── Phase 1 : fade out du morceau en cours ──
      for (let i = steps; i >= 0; i--) {
        await spotifyPlayer.setVolume((i / steps) * startVolume);
        await sleep(stepMs);
      }

      // ── Phase 2 : démarrer le prochain morceau ──
      // On enregistre l'écouteur AVANT de lancer la lecture pour ne manquer aucun événement.
      const trackReady = waitForTrackLoad(nextUri);
      await _startPlayback(nextUri);

      // Attendre que le SDK confirme le changement de piste, puis forcer le volume à 0.
      // Cela compense un éventuel reset du volume par le SDK lors du chargement d'un nouveau morceau.
      await trackReady;
      await spotifyPlayer.setVolume(0);

      // ── Phase 3 : fade in du nouveau morceau ──
      for (let i = 0; i <= steps; i++) {
        await spotifyPlayer.setVolume((i / steps) * startVolume);
        await sleep(stepMs);
      }

      currentVolume = startVolume;
      socket.emit("mark-played", { eventId, requestId: nextRequestId });
    } catch (err) {
      console.error("Erreur crossfade:", err);
      try { await spotifyPlayer.setVolume(startVolume); } catch { /* ignore */ }
      try { await _startPlayback(nextUri); } catch { /* ignore */ }
      setTimeout(() => socket.emit("mark-played", { eventId, requestId: nextRequestId }), 2000);
    } finally {
      isCrossfading = false;
      // Garder le verrou actif 5 s après la fin du crossfade pour éviter tout double déclenchement
      setTimeout(() => { isAutoPlayLocked = false; }, 5000);
    }
  }

  async function playTrack(uri, requestId) {
    if (!deviceId) {
      showToast("🔄 Connexion au lecteur Spotify…", "info");
      await reconnectSpotifyPlayer(true);
      if (!deviceId) {
        showToast("⚠️ Lecteur Spotify non prêt — réessayez dans 2 secondes", "error");
        return;
      }
    }
    if (crossfadeDuration > 0 && isPlaying && spotifyPlayer && !isCrossfading) {
      if (currentPlayingRequestId && currentDuration > 0 && currentPosition / currentDuration < 0.85) {
        socket.emit("mark-skipped", { eventId, requestId: currentPlayingRequestId });
      }
      performCrossfade(uri, requestId);
      currentPlayingRequestId = requestId || null;
      currentPlayingUri = uri || null;
      return;
    }
    // Bloquer l'auto-play pendant le chargement du morceau pour éviter les doubles lectures.
    isAutoPlayLocked = true;
    setTimeout(() => { isAutoPlayLocked = false; }, 5000);
    try {
      await _startPlayback(uri);
      currentPlayingRequestId = requestId || null;
      currentPlayingUri = uri || null;
      setTimeout(() => socket.emit("mark-played", { eventId, requestId }), 2000);
    } catch (err) {
      console.warn("Erreur _startPlayback, tentative transfert actif:", err);
      try {
        await fetch(`/api/spotify/transfer/${eventId}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ device_id: deviceId, play: true }),
        });
        await _startPlayback(uri);
        currentPlayingRequestId = requestId || null;
        currentPlayingUri = uri || null;
        setTimeout(() => socket.emit("mark-played", { eventId, requestId }), 2000);
      } catch (retryErr) {
        showToast("Erreur lecture Spotify : " + retryErr.message, "error");
      }
    }
  }

  function playNextInQueue() {
    if (queue.length > 0) playTrack(queue[0].spotify_uri, queue[0].id);
  }

  async function saveThankYouMessage() {
    const message = document.getElementById("thankYouMessage").value.trim();
    try {
      const response = await fetch(`/api/events/${eventId}/thank-you-message`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message }),
      });
      const data = await response.json();
      if (data.success) showToast("Message enregistré");
      else showToast("Erreur lors de l'enregistrement", "error");
    } catch { showToast("Erreur serveur", "error"); }
  }

  function resetThankYouMessage() {
    document.getElementById("thankYouMessage").value = "Merci d'avoir participé !\nOn espère que vous avez passé un excellent moment.\nA très bientôt pour une nouvelle soirée !";
    showToast("Message réinitialisé");
  }

  function showToast(message, type = "success") {
    const toast = document.getElementById("toast");
    toast.textContent = message;
    toast.style.background = type === "error" ? "var(--red)" : type === "info" ? "var(--accent)" : "var(--green)";
    toast.classList.remove("hidden");
    setTimeout(() => toast.classList.add("hidden"), 3000);
  }

  // ── Polling de secours (rattrape les événements socket manqués) ──
  setInterval(async () => {
    try {
      const [pendingRes, queueRes] = await Promise.all([
        fetch(`/api/events/${eventId}/pending`),
        fetch(`/api/events/${eventId}`),
      ]);
      const pendingData = await pendingRes.json();
      const queueData   = await queueRes.json();

      // Fusion sans doublon pour les pending
      if (pendingData.pending) {
        let changed = false;
        pendingData.pending.forEach((r) => {
          if (!pendingRequests.some((p) => p.id === r.id)) {
            pendingRequests.push(r);
            changed = true;
          }
        });
        // Supprimer les pending qui ne sont plus en attente côté serveur
        const serverIds = new Set(pendingData.pending.map((r) => r.id));
        const before = pendingRequests.length;
        pendingRequests = pendingRequests.filter((r) => serverIds.has(r.id));
        if (changed || pendingRequests.length !== before) renderPending();
      }

      // Mise à jour silencieuse de la queue si elle a changé
      if (queueData.queue) {
        const serverQueue = queueData.queue;
        if (JSON.stringify(serverQueue.map((r) => r.id)) !== JSON.stringify(queue.map((r) => r.id))) {
          queue = serverQueue;
          renderQueue();
        }
      }
    } catch { /* polling silencieux */ }
  }, 10000);
  setInterval(loadLiveHealth, 15000);

  // ── Socket events ──
  socket.on("new-request", (request) => {
    if (pendingRequests.some((r) => r.id === request.id)) return;
    if (request.status === "pending") { pendingRequests.push(request); renderPending(); }
  });

  socket.on("request-accepted", (data) => {
    pendingRequests = pendingRequests.filter((r) => r.id !== data.requestId);
    loadQueue(); renderPending();
  });

  socket.on("request-rejected", (data) => {
    pendingRequests = pendingRequests.filter((r) => r.id !== data.requestId);
    renderPending();
  });

  socket.on("queue-updated", (data) => { queue = data.queue; renderQueue(); });

  socket.on("spectator-count", (data) => {
    const badge = document.getElementById("spectatorBadge");
    document.getElementById("spectatorCount").textContent = data.count;
    badge.classList.remove("hidden");
    badge.classList.add("inline-flex");
  });

  socket.on("vote-updated", (data) => {
    const req = queue.find((r) => r.id === data.requestId);
    if (req) { req.upvotes = data.upvotes; req.downvotes = data.downvotes; renderQueue(); }
    const pen = pendingRequests.find((r) => r.id === data.requestId);
    if (pen) { pen.upvotes = data.upvotes; pen.downvotes = data.downvotes; renderPending(); }
  });

  socket.on("votes-batch-updated", (data) => {
    if (!Array.isArray(data?.votes)) return;
    let needsQueue = false;
    let needsPending = false;
    for (const v of data.votes) {
      const req = queue.find((r) => r.id === v.requestId);
      if (req) { req.upvotes = v.upvotes; req.downvotes = v.downvotes; needsQueue = true; }
      const pen = pendingRequests.find((r) => r.id === v.requestId);
      if (pen) { pen.upvotes = v.upvotes; pen.downvotes = v.downvotes; needsPending = true; }
    }
    if (needsQueue) renderQueue();
    if (needsPending) renderPending();
  });

  socket.on("requests-freeze-updated", (data) => {
    requestsFrozenUntil = data?.frozen ? Number(data?.frozenUntil || 0) : null;
    renderRequestsFreezeBadge();
  });

  socket.on("live-poll-updated", (data) => {
    livePollState = data?.poll || null;
    renderLivePollState();
  });

  // ── Render ──

  // ── Playlist de secours ──

  function extractPlaylistId(input) {
    if (!input) return null;
    input = input.trim();
    if (input.startsWith("spotify:playlist:")) return input.split(":")[2];
    const m = input.match(/playlist\/([A-Za-z0-9]+)/);
    return m ? m[1] : null;
  }

  function updateFallbackPlaylistUI() {
    const badge = document.getElementById("fallbackPlaylistBadge");
    if (!badge) return;
    if (fallbackPlaylistUri) {
      const id = extractPlaylistId(fallbackPlaylistUri);
      badge.textContent = id ? "Playlist active" : "URL invalide";
      badge.style.background = id ? "var(--green-dim)" : "var(--red-dim)";
      badge.style.color       = id ? "var(--green)"     : "var(--red)";
      badge.style.display     = "inline-block";
    } else {
      badge.style.display = "none";
    }
  }

  function clearFallbackPlaylistPreview() {
    const wrap = document.getElementById("fallbackPlaylistPreview");
    const verified = document.getElementById("fallbackPlaylistVerifiedBadge");
    if (wrap) wrap.classList.add("hidden");
    if (verified) verified.classList.add("hidden");
    fallbackPlaylistPreviewKey = null;
  }

  async function loadFallbackPlaylistPreview() {
    const id = extractPlaylistId(fallbackPlaylistUri);
    if (!id) {
      clearFallbackPlaylistPreview();
      return;
    }
    if (fallbackPlaylistPreviewKey === id) return;

    try {
      const res = await fetch(`/api/spotify/playlist-info/${eventId}/${id}`);
      if (!res.ok) {
        clearFallbackPlaylistPreview();
        return;
      }
      const info = await res.json();
      const wrap = document.getElementById("fallbackPlaylistPreview");
      const img  = document.getElementById("fallbackPlaylistPreviewImg");
      const name = document.getElementById("fallbackPlaylistPreviewName");
      const meta = document.getElementById("fallbackPlaylistPreviewMeta");
      const link = document.getElementById("fallbackPlaylistPreviewLink");
      const verified = document.getElementById("fallbackPlaylistVerifiedBadge");
      if (!wrap || !img || !name || !meta || !link) return;

      img.src = info.image || "";
      img.style.display = info.image ? "block" : "none";
      name.textContent = info.name || "Playlist";
      const parts = [];
      if (info.owner) parts.push(info.owner);
      if (Number.isFinite(info.totalTracks)) parts.push(`${info.totalTracks} titres`);
      meta.textContent = parts.join(" · ");
      link.href = info.url || `https://open.spotify.com/playlist/${id}`;
      if (verified) verified.classList.remove("hidden");
      wrap.classList.remove("hidden");
      fallbackPlaylistPreviewKey = id;
    } catch (e) {
      console.error("Preview playlist fallback:", e);
      clearFallbackPlaylistPreview();
    }
  }

  async function saveFallbackPlaylist() {
    const input = document.getElementById("fallbackPlaylistInput");
    const val   = input.value.trim();
    const id    = val ? extractPlaylistId(val) : null;

    if (val && !id) {
      showToast("URL ou URI Spotify invalide", "error");
      return;
    }

    fallbackPlaylistUri = val || null;
    socket.emit("update-event-settings", { eventId, fallbackPlaylistUri });
    updateFallbackPlaylistUI();
    await loadFallbackPlaylistPreview();
    showToast(fallbackPlaylistUri ? "Playlist de secours enregistrée" : "Playlist de secours retirée");
  }

  function tryStartFallback() {
    if (autoPlayEnabled && queue.length === 0 && fallbackPlaylistUri && deviceId) {
      playFallbackTrack();
    }
  }

  async function playFallbackTrack() {
    if (!fallbackPlaylistUri || !deviceId || isFallbackFetching) return;
    const playlistId = extractPlaylistId(fallbackPlaylistUri);
    if (!playlistId) return;

    isFallbackFetching = true;
    isAutoPlayLocked   = true; // Bloquer l'auto-play pendant le chargement
    try {
      const res = await fetch(`/api/spotify/playlist/${eventId}/${playlistId}`);
      if (!res.ok) return;
      const track = await res.json();
      if (!track.uri) return;
      await _startPlayback(track.uri);
      try {
        const csrf = document.cookie.match(/XSRF-TOKEN=([^;]+)/)?.[1] || "";
        await fetch(`/api/events/${eventId}/fallback-played`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-csrf-token": csrf,
          },
          body: JSON.stringify({ track }),
        });
      } catch (traceErr) {
        console.warn("Trace fallback-played:", traceErr);
      }
      showToast(`Secours : ${track.name} — ${track.artist}`);
    } catch (e) {
      console.error("Erreur fallback playlist:", e);
    } finally {
      // Libérer les verrous après 8 s (délai de démarrage + stabilisation)
      setTimeout(() => { isFallbackFetching = false; isAutoPlayLocked = false; }, 8000);
    }
  }

  // ── Audio Features & Détection Harmonique (Camelot Wheel) ──

  const CAMELOT_MAJOR = { 0:"8B", 1:"3B", 2:"10B", 3:"5B", 4:"12B", 5:"7B", 6:"2B", 7:"9B", 8:"4B", 9:"11B", 10:"6B", 11:"1B" };
  const CAMELOT_MINOR = { 0:"5A", 1:"12A", 2:"7A", 3:"2A", 4:"9A", 5:"4A", 6:"11A", 7:"6A", 8:"1A", 9:"8A", 10:"3A", 11:"10A" };
  const MUSICAL_KEYS  = ["C","C#","D","D#","E","F","F#","G","G#","A","A#","B"];

  function getTrackId(spotifyUri) {
    return spotifyUri?.split(":")[2] || null;
  }

  function getCamelotInfo(key, mode) {
    if (key === -1 || key === undefined || key === null) return null;
    const isMajor = mode === 1;
    const camelot = isMajor ? CAMELOT_MAJOR[key] : CAMELOT_MINOR[key];
    const musical = (MUSICAL_KEYS[key] || "") + (isMajor ? "" : "m");
    return { camelot, musical, key, mode, isMajor };
  }

  function getHarmonicMatch(currentCamelot, candidateCamelot) {
    if (!currentCamelot || !candidateCamelot) return null;
    if (currentCamelot === candidateCamelot) {
      return { label: "✨ Mix Parfait", color: "#10b981", bg: "rgba(16,185,129,0.18)" };
    }
    const curNum = parseInt(currentCamelot.slice(0, -1), 10);
    const curLet = currentCamelot.slice(-1);
    const candNum = parseInt(candidateCamelot.slice(0, -1), 10);
    const candLet = candidateCamelot.slice(-1);

    // Relatif Majeur / Mineur (même numéro, lettre opposée : ex 8A <-> 8B)
    if (curNum === candNum && curLet !== candLet) {
      return { label: "🎶 Relatif", color: "#8b5cf6", bg: "rgba(139,92,246,0.18)" };
    }

    // Voisins harmoniques (+1 ou -1 modulo 12 sur même lettre, ex 8A <-> 7A ou 9A)
    const diff = (candNum - curNum + 12) % 12;
    if (curLet === candLet) {
      if (diff === 1 || diff === 11) {
        return { label: "🎶 Harmonique", color: "#06b6d4", bg: "rgba(6,182,212,0.18)" };
      }
      if (diff === 2) {
        return { label: "⚡ Boost +2", color: "#f59e0b", bg: "rgba(245,158,11,0.18)" };
      }
    }
    return null;
  }

  function energyStyle(e) {
    if (e >= 0.85) return { label: "Intense",  color: "#ef4444" };
    if (e >= 0.65) return { label: "Élevée",   color: "#f97316" };
    if (e >= 0.45) return { label: "Modérée",  color: "#eab308" };
    return               { label: "Calme",     color: "#22c55e" };
  }

  function renderAudioBadges(spotifyUri) {
    const trackId = getTrackId(spotifyUri);
    if (!trackId || !audioFeatures[trackId]) return "";
    const f   = audioFeatures[trackId];
    const keyInfo = getCamelotInfo(f.key, f.mode);
    const en  = energyStyle(f.energy);
    const hasBpm = f.bpm != null && f.bpm > 0;
    const mainBadge = hasBpm
      ? `<span class="text-xs font-bold px-1.5 py-0.5 rounded" style="background:rgba(124,92,252,0.15);color:var(--accent)">${f.bpm} BPM</span>`
      : `<span class="text-xs font-bold px-1.5 py-0.5 rounded" style="background:rgba(124,92,252,0.15);color:var(--accent)">&#9835; ${Math.round(f.energy * 100)}%</span>`;
    
    let keyBadge = "";
    if (keyInfo) {
      keyBadge = `<span class="text-xs font-bold px-1.5 py-0.5 rounded" style="background:rgba(6,182,212,0.12);color:#06b6d4" title="Clé Camelot / Tonalité">${keyInfo.camelot} / ${keyInfo.musical}</span>`;
    }

    let matchBadge = "";
    const curF = currentPlayingUri ? audioFeatures[getTrackId(currentPlayingUri)] : null;
    const curKeyInfo = curF ? getCamelotInfo(curF.key, curF.mode) : null;
    if (curKeyInfo && keyInfo && spotifyUri !== currentPlayingUri) {
      const match = getHarmonicMatch(curKeyInfo.camelot, keyInfo.camelot);
      if (match) {
        matchBadge = `<span class="text-xs font-bold px-1.5 py-0.5 rounded" style="background:${match.bg};color:${match.color}">${match.label}</span>`;
      }
    }

    return `<div class="flex flex-wrap gap-1 mt-1.5">
      ${mainBadge}${keyBadge}${matchBadge}
      <span class="text-xs px-1.5 py-0.5 rounded" style="background:${en.color}22;color:${en.color}">${en.label}</span>
    </div>`;
  }

  async function loadAudioFeatures(requests) {
    const ids = requests
      .filter((r) => r.spotify_uri)
      .map((r)   => getTrackId(r.spotify_uri))
      .filter((id) => id && !audioFeatures[id]);
    if (ids.length === 0) return;
    try {
      const res  = await fetch(`/api/spotify/audio-features/${eventId}?ids=${ids.join(",")}`);
      const data = await res.json();
      if (Object.keys(data).length > 0) {
        Object.assign(audioFeatures, data);
        renderPending();
        renderQueue();
      }
    } catch (e) { console.error("Audio features:", e); }
  }

  let bpmSortDesc = true;
  function sortPendingByBPM() {
    pendingRequests.sort((a, b) => {
      const fa = audioFeatures[getTrackId(a.spotify_uri)];
      const fb = audioFeatures[getTrackId(b.spotify_uri)];
      const valA = fa ? (fa.bpm != null && fa.bpm > 0 ? fa.bpm : Math.round(fa.energy * 100)) : 0;
      const valB = fb ? (fb.bpm != null && fb.bpm > 0 ? fb.bpm : Math.round(fb.energy * 100)) : 0;
      return bpmSortDesc ? valB - valA : valA - valB;
    });
    bpmSortDesc = !bpmSortDesc;
    renderPending();
  }

  let camelotSortDescPending = true;
  function sortPendingByCamelot() {
    pendingRequests.sort((a, b) => {
      const fa = audioFeatures[getTrackId(a.spotify_uri)];
      const fb = audioFeatures[getTrackId(b.spotify_uri)];
      const ka = fa ? (getCamelotInfo(fa.key, fa.mode)?.camelot || "") : "";
      const kb = fb ? (getCamelotInfo(fb.key, fb.mode)?.camelot || "") : "";
      return camelotSortDescPending ? ka.localeCompare(kb) : kb.localeCompare(ka);
    });
    camelotSortDescPending = !camelotSortDescPending;
    renderPending();
  }

  let camelotSortDescQueue = true;
  function sortQueueByCamelot() {
    queue.sort((a, b) => {
      const fa = audioFeatures[getTrackId(a.spotify_uri)];
      const fb = audioFeatures[getTrackId(b.spotify_uri)];
      const ka = fa ? (getCamelotInfo(fa.key, fa.mode)?.camelot || "") : "";
      const kb = fb ? (getCamelotInfo(fb.key, fb.mode)?.camelot || "") : "";
      return camelotSortDescQueue ? ka.localeCompare(kb) : kb.localeCompare(ka);
    });
    camelotSortDescQueue = !camelotSortDescQueue;
    renderQueue();
    socket.emit("reorder-queue", { eventId, newQueue: queue });
  }

  document.getElementById("sortByCamelotPending")?.addEventListener("click", sortPendingByCamelot);
  document.getElementById("sortByCamelotQueue")?.addEventListener("click", sortQueueByCamelot);

  function renderPending() {
    saveLocalDjCache();
    const container = document.getElementById("pendingRequests");
    document.getElementById("pendingCount").textContent = `${pendingRequests.length}`;
    if (pendingRequests.length === 0) {
      container.innerHTML = `<div class="px-5 py-12 text-center text-sm" style="color:var(--text-muted)">Aucune demande en attente</div>`;
      return;
    }
    const totalWaitMin = queue.length > 0
      ? Math.max(1, Math.ceil(queue.reduce((s, r) => s + window.TimeUtils.getDurationMs(r?.duration_ms), 0) / 60000))
      : 1;
    container.innerHTML = pendingRequests.map((request) => `
      <div class="p-4 hover:bg-white/[0.02] transition flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div class="flex items-center gap-3.5 min-w-0">
          ${request.image_url 
            ? `<img src="${request.image_url}" class="w-12 h-12 rounded-xl object-cover shrink-0 shadow-md">` 
            : `<div class="w-12 h-12 rounded-xl flex items-center justify-center shrink-0" style="background:var(--bg-elevated);border:1px solid var(--border)"><svg class="w-6 h-6 text-muted" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg></div>`
          }
          <div class="flex-1 min-w-0">
            <p class="text-sm font-extrabold truncate" style="color:var(--text-primary)">${request.song_name}</p>
            <p class="text-xs truncate font-medium mt-0.5" style="color:var(--text-secondary)">${request.artist}</p>
            <div class="flex flex-wrap items-center gap-2 mt-1">
              <span class="text-[11px] font-semibold" style="color:var(--text-muted)">Demandé par <span style="color:var(--text-secondary)">${request.user_name}</span></span>
              <span class="badge badge-accent text-[10px] font-mono">~${totalWaitMin} min</span>
            </div>
            ${renderAudioBadges(request.spotify_uri)}
          </div>
        </div>
        <div class="flex items-center gap-2 shrink-0 self-end sm:self-center">
          ${request.preview_url ? `
          <button data-action="preview" data-preview-url="${request.preview_url}"
                  data-track-name="${request.song_name}" data-artist="${request.artist}"
                  data-img="${request.image_url || ""}"
                  class="btn btn-ghost btn-sm" title="Écouter l'aperçu">
            <svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 18v-6a9 9 0 0 1 18 0v6"/><path d="M21 19a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3z"/><path d="M3 19a2 2 0 0 0 2 2h1a2 2 0 0 0 2-2v-3a2 2 0 0 0-2-2H3z"/></svg>
          </button>` : ""}
          <button data-action="accept" data-request-id="${request.id}" class="btn btn-success btn-sm font-bold shadow-sm">
            <svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
            Accepter
          </button>
          <button data-action="reject" data-request-id="${request.id}" class="btn btn-danger btn-sm font-bold shadow-sm">
            <svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            Refuser
          </button>
          <button data-action="ban" data-request-id="${request.id}" data-user-name="${request.user_name || 'Anonyme'}"
                  class="btn btn-ghost btn-sm shrink-0" title="Bloquer cet invité"
                  style="color:var(--red);border-color:var(--red-dim)">
            <svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/></svg>
          </button>
        </div>
      </div>`).join("");

    loadAudioFeatures(pendingRequests);
  }

  // ── Alerte file vide ──
  let _prevQueueLen = -1;
  function playAlertBeep() {
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain); gain.connect(ctx.destination);
      osc.frequency.value = 880;
      gain.gain.setValueAtTime(0.25, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4);
      osc.start(ctx.currentTime); osc.stop(ctx.currentTime + 0.4);
      setTimeout(() => ctx.close(), 600);
    } catch {}
  }
  function updateEmptyQueueAlert() {
    const alert   = document.getElementById("emptyQueueAlert");
    const alertTx = document.getElementById("emptyQueueAlertText");
    const wasLow  = _prevQueueLen >= 0 && _prevQueueLen > 1;
    if (queue.length === 0) {
      alertTx.textContent = "⚠ File vide — plus aucune chanson en attente !";
      alert.classList.remove("hidden");
      if (wasLow) playAlertBeep();
    } else if (queue.length === 1) {
      alertTx.textContent = "⚠ File presque vide — il ne reste plus qu'une chanson";
      alert.classList.remove("hidden");
      if (wasLow) playAlertBeep();
    } else {
      alert.classList.add("hidden");
    }
    _prevQueueLen = queue.length;
  }

  // ── Erreur Spotify ──
  function showSpotifyError(msg) {
    document.getElementById("spotifyErrorText").textContent = msg;
    document.getElementById("spotifyErrorBanner").classList.remove("hidden");
  }
  function hideSpotifyError() {
    document.getElementById("spotifyErrorBanner").classList.add("hidden");
  }

  function renderQueue() {
    saveLocalDjCache();
    const container = document.getElementById("queue");
    document.getElementById("queueCount").textContent = `${queue.length}`;
    updateEmptyQueueAlert();
    if (queue.length === 0) {
      container.innerHTML = `<div class="px-5 py-12 text-center text-sm" style="color:var(--text-muted)">Queue de lecture vide</div>`;
      return;
    }
    container.innerHTML = queue.map((request, index) => {
      const netVotes  = (request.upvotes||0) - (request.downvotes||0);
      const netColor  = netVotes > 0 ? "var(--green)" : netVotes < 0 ? "var(--red)" : "var(--text-muted)";
      const waitMin   = window.TimeUtils.estimateQueueWaitMinutes(queue, index);
      return `
      <div class="flex items-center gap-3 px-4 py-3.5 select-none hover:bg-white/[0.02] transition" data-id="${request.id}" style="border-bottom:1px solid var(--border)">
        <!-- Handle drag -->
        <div class="drag-handle shrink-0 flex flex-col gap-0.5 cursor-grab active:cursor-grabbing px-1.5 py-2 rounded-lg hover:bg-white/[0.05]" title="Glisser pour réordonner" style="color:var(--text-muted)">
          <span class="block w-3.5 h-0.5 rounded-full" style="background:currentColor"></span>
          <span class="block w-3.5 h-0.5 rounded-full" style="background:currentColor"></span>
          <span class="block w-3.5 h-0.5 rounded-full" style="background:currentColor"></span>
        </div>
        <div class="w-6 h-6 rounded-lg flex items-center justify-center text-xs font-black shrink-0" style="background:var(--accent-dim);color:var(--accent)">${index+1}</div>
        ${request.image_url ? `<img src="${request.image_url}" class="w-11 h-11 rounded-xl object-cover shrink-0 hidden sm:block shadow-sm">` : ""}
        <div class="flex-1 min-w-0">
          <p class="text-sm font-extrabold truncate" style="color:var(--text-primary)">${request.song_name}</p>
          <p class="text-xs truncate font-medium mt-0.5" style="color:var(--text-secondary)">${request.artist}</p>
          <div class="flex flex-wrap items-center gap-2 mt-1">
            <span class="text-[11px]" style="color:var(--text-muted)">Par <span style="color:var(--text-secondary)">${request.user_name}</span></span>
            <span class="badge badge-accent text-[10px] font-mono">~${waitMin} min</span>
            <span class="text-[11px] font-bold" style="color:${netColor}">Net: ${netVotes>0?"+":""}${netVotes}</span>
          </div>
          ${renderAudioBadges(request.spotify_uri)}
        </div>
        <div class="flex items-center gap-1.5 shrink-0">
          ${request.preview_url ? `
          <button data-action="preview" data-preview-url="${request.preview_url}"
                  data-track-name="${request.song_name}" data-artist="${request.artist}"
                  data-img="${request.image_url || ""}"
                  class="btn btn-ghost btn-sm" title="Écouter l'aperçu">
            <svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 18v-6a9 9 0 0 1 18 0v6"/><path d="M21 19a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3z"/><path d="M3 19a2 2 0 0 0 2 2h1a2 2 0 0 0 2-2v-3a2 2 0 0 0-2-2H3z"/></svg>
          </button>` : ""}
          ${request.spotify_uri ? `
          <button data-action="play" data-request-id="${request.id}" data-spotify-uri="${request.spotify_uri}" class="btn btn-success btn-sm font-bold shadow-sm">
            <svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>
            Jouer
          </button>` : ""}
          <button data-action="mark-played" data-request-id="${request.id}" class="btn btn-ghost btn-sm font-semibold" title="Marquer comme diffusé">
            <svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
            Fait
          </button>
        </div>
      </div>`;
    }).join("");

    // Détruire l'instance précédente avant d'en créer une nouvelle
    if (queueSortable) { queueSortable.destroy(); queueSortable = null; }
    queueSortable = new Sortable(container, {
      handle:     ".drag-handle",
      animation:  150,
      ghostClass: "opacity-40",
      dragClass:  "shadow-xl",
      onEnd: () => {
        const newQueue = Array.from(container.querySelectorAll("[data-id]"))
          .map((el) => queue.find((r) => r.id === el.getAttribute("data-id")))
          .filter(Boolean);
        queue = newQueue; // mise à jour locale immédiate (évite un flash)
        socket.emit("reorder-queue", { eventId, newQueue });
      },
    });

    loadAudioFeatures(queue);
  }

  // ── Actions ──
  function acceptRequest(requestId) { socket.emit("accept-request", { eventId, requestId }); }
  function rejectRequest(requestId) {
    socket.emit("reject-request", { eventId, requestId });
    undoRejectRequestId = requestId;
    document.getElementById("rejectUndoBar").classList.remove("hidden");
    clearTimeout(undoRejectTimer);
    undoRejectTimer = setTimeout(() => {
      document.getElementById("rejectUndoBar").classList.add("hidden");
      undoRejectRequestId = null;
    }, 5500);
  }
  function markPlayed(requestId)    { socket.emit("mark-played", { eventId, requestId }); }

  // ── Raccourcis Clavier Pro Régie DJ ──────────────────────
  function isInputFocused() {
    const el = document.activeElement;
    if (!el) return false;
    const tag = el.tagName.toLowerCase();
    return tag === "input" || tag === "textarea" || tag === "select" || el.isContentEditable;
  }

  document.addEventListener("keydown", (e) => {
    if (isInputFocused()) return;

    if (e.code === "Space") {
      e.preventDefault();
      togglePlayPause();
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (pendingRequests.length > 0) {
        acceptRequest(pendingRequests[0].id);
        showToast("Demande acceptée (Entrée)");
      }
    } else if (e.key === "Delete" || e.key === "Backspace") {
      e.preventDefault();
      if (pendingRequests.length > 0) {
        rejectRequest(pendingRequests[0].id);
        showToast("Demande refusée (Suppr)");
      }
    } else if (e.key === "ArrowRight" || e.key.toLowerCase() === "n") {
      e.preventDefault();
      document.getElementById("btnNext")?.click();
    } else if (e.key === "ArrowLeft" || e.key.toLowerCase() === "p") {
      e.preventDefault();
      document.getElementById("btnPrevious")?.click();
    } else if (e.key.toLowerCase() === "f") {
      e.preventDefault();
      // Gel d'urgence 5 min
      socket.emit("update-event-settings", { eventId, requestFreezeMinutes: 5 });
      showToast("❄️ Gel d'urgence 5 min activé (Touche F)");
    } else if (e.key.toLowerCase() === "s") {
      e.preventDefault();
      document.getElementById("showSettings")?.click();
    } else if (e.key.toLowerCase() === "m") {
      e.preventDefault();
      document.getElementById("showMessagePanel")?.click();
    } else if (e.key === "?" || e.key.toLowerCase() === "h") {
      e.preventDefault();
      document.getElementById("shortcutsHelpModal")?.classList.remove("hidden");
    } else if (e.key === "Escape") {
      document.getElementById("shortcutsHelpModal")?.classList.add("hidden");
      document.getElementById("settingsPanel")?.classList.add("hidden");
      document.getElementById("messagePanel")?.classList.add("hidden");
      document.getElementById("addSongPanel")?.classList.add("hidden");
    }
  });

  // Modale Raccourcis & MIDI
  document.getElementById("btnShortcutsHelp")?.addEventListener("click", () => {
    document.getElementById("shortcutsHelpModal")?.classList.remove("hidden");
  });
  document.getElementById("closeShortcutsHelp")?.addEventListener("click", () => {
    document.getElementById("shortcutsHelpModal")?.classList.add("hidden");
  });
  document.getElementById("shortcutsHelpModal")?.addEventListener("click", (e) => {
    if (e.target.id === "shortcutsHelpModal") {
      document.getElementById("shortcutsHelpModal")?.classList.add("hidden");
    }
  });

  // ── Support Contrôleur MIDI (Web MIDI API) ───────────────
  function initWebMIDI() {
    if (!navigator.requestMIDIAccess) return;
    navigator.requestMIDIAccess({ sysex: false }).then((midiAccess) => {
      function updateMidiStatus() {
        const inputs = Array.from(midiAccess.inputs.values());
        const statusEl = document.getElementById("djMidiStatus");
        const nameEl = document.getElementById("djMidiName");
        if (inputs.length > 0) {
          if (statusEl) statusEl.classList.remove("hidden");
          if (nameEl) nameEl.textContent = `🎛️ MIDI : ${inputs[0].name || "Connecté"}`;
        } else {
          if (statusEl) statusEl.classList.add("hidden");
        }
      }

      midiAccess.onstatechange = updateMidiStatus;
      updateMidiStatus();

      for (const input of midiAccess.inputs.values()) {
        input.onmidimessage = (msg) => {
          const [status, note, velocity] = msg.data;
          // NoteOn ou CC avec valeur positive
          const isNoteOn = (status & 0xf0) === 0x90 && velocity > 0;
          const isCC     = (status & 0xf0) === 0xb0 && velocity > 0;

          if (!isNoteOn && !isCC) return;

          // Mapping pads 1-8 (notes 36-43 ou 60-67 ou 0-7)
          let padIndex = -1;
          if (note >= 36 && note <= 43) padIndex = note - 36;
          else if (note >= 60 && note <= 67) padIndex = note - 60;
          else if (note >= 1 && note <= 8) padIndex = note - 1;
          else padIndex = note % 8;

          switch (padIndex) {
            case 0: // PAD 1: Play/Pause
              togglePlayPause();
              showToast("🎛️ MIDI PAD 1 : Play/Pause");
              break;
            case 1: // PAD 2: Accepter 1er
              if (pendingRequests.length > 0) {
                acceptRequest(pendingRequests[0].id);
                showToast("🎛️ MIDI PAD 2 : Demande acceptée");
              }
              break;
            case 2: // PAD 3: Refuser 1er
              if (pendingRequests.length > 0) {
                rejectRequest(pendingRequests[0].id);
                showToast("🎛️ MIDI PAD 3 : Demande refusée");
              }
              break;
            case 3: // PAD 4: Titre suivant
              document.getElementById("btnNext")?.click();
              showToast("🎛️ MIDI PAD 4 : Titre Suivant");
              break;
            case 4: // PAD 5: Titre précédent
              document.getElementById("btnPrevious")?.click();
              showToast("🎛️ MIDI PAD 5 : Titre Précédent");
              break;
            case 5: // PAD 6: Gel d'urgence 5 min
              socket.emit("update-event-settings", { eventId, requestFreezeMinutes: 5 });
              showToast("🎛️ MIDI PAD 6 : ❄️ Gel 5 min");
              break;
            case 6: // PAD 7: Ouvrir message
              document.getElementById("showMessagePanel")?.click();
              showToast("🎛️ MIDI PAD 7 : Message");
              break;
            case 7: // PAD 8: Tout accepter
              document.getElementById("btnAcceptAllPending")?.click();
              showToast("🎛️ MIDI PAD 8 : Tout accepter");
              break;
          }
        };
      }
    }).catch(() => {});
  }

  initWebMIDI();

  // ── Mode Hors-Ligne & Cache Local Régie DJ ──
  const CACHE_KEY = `ml_dj_cache_${eventId}`;

  function saveLocalDjCache() {
    try {
      localStorage.setItem(CACHE_KEY, JSON.stringify({
        queue,
        pendingRequests,
        ts: Date.now(),
      }));
    } catch {}
  }

  function loadLocalDjCache() {
    try {
      const raw = localStorage.getItem(CACHE_KEY);
      if (!raw) return false;
      const data = JSON.parse(raw);
      if (Array.isArray(data.queue) && queue.length === 0) {
        queue = data.queue;
        renderQueue();
      }
      if (Array.isArray(data.pendingRequests) && pendingRequests.length === 0) {
        pendingRequests = data.pendingRequests;
        renderPending();
      }
      return true;
    } catch {
      return false;
    }
  }

  function setNetworkBanner(state, message) {
    const banner = document.getElementById("djNetworkBanner");
    const text = document.getElementById("djNetworkBannerText");
    if (!banner || !text) return;
    if (state === "offline") {
      banner.style.background = "rgba(239, 68, 68, 0.25)";
      banner.style.color = "#fca5a5";
      text.textContent = message || "📶 Mode Hors-Ligne — Connexion perdue. Vos données locales sont actives sans freeze.";
      banner.classList.remove("hidden");
    } else if (state === "online") {
      banner.style.background = "rgba(16, 185, 129, 0.25)";
      banner.style.color = "#6ee7b7";
      text.textContent = message || "✨ Reconnecté au serveur ! Synchronisation en cours...";
      banner.classList.remove("hidden");
      setTimeout(() => banner.classList.add("hidden"), 3000);
    } else {
      banner.classList.add("hidden");
    }
  }

  window.addEventListener("offline", () => {
    setNetworkBanner("offline");
  });

  window.addEventListener("online", () => {
    setNetworkBanner("online");
    socket.emit("join-event", { eventId });
  });

  // Reconnexion intelligente lors du retour sur l'onglet
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") {
      if (spotifyPlayer) {
        spotifyPlayer.getCurrentState().then((state) => {
          if (!state && isPlaying) {
            console.log("Retour sur l'onglet : synchronisation du lecteur Spotify...");
            reconnectSpotifyPlayer(true);
          }
        }).catch(() => {
          reconnectSpotifyPlayer(true);
        });
      }
    }
  });

  loadLocalDjCache();

  window.addEventListener("beforeunload", stopProgressUpdate);