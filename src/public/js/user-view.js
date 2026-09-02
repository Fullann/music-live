  const eventId = window.location.pathname.split("/")[2];
  const socket  = io();

  let fullQueue        = [];
  let searchTimeout;
  let currentRateLimit = { count: 0, max: 3, remaining: 3 };
  let votesEnabled     = true;
  let activeTab        = "search";
  let pendingTrack     = null;   // Track sélectionné en attente de prénom
  let myRequestId      = null;
  let myRequestData    = {};
  let myVote           = null;
  const myVotesByRequest = new Map();

  // ── Identifiant persistant (survit au refresh) ──
  let clientId = localStorage.getItem("djq-client-id");
  if (!clientId) {
    clientId = "c_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
    localStorage.setItem("djq-client-id", clientId);
  }

  // ── Tab navigation ──
  function switchTab(tab) {
    activeTab = tab;
    document.getElementById("tab-search").classList.toggle("active", tab === "search");
    document.getElementById("tab-trends").classList.toggle("active", tab === "trends");
    document.getElementById("tab-queue").classList.toggle("active",  tab === "queue");
    const accentColor = "var(--accent)";
    const muteColor   = "var(--text-muted)";
    document.getElementById("navSearch").style.color = tab === "search" ? accentColor : muteColor;
    document.getElementById("navTrends").style.color = tab === "trends" ? accentColor : muteColor;
    document.getElementById("navQueue").style.color  = tab === "queue"  ? accentColor : muteColor;
    if (tab === "queue") document.getElementById("queueBadge").classList.add("hidden");
    if (tab === "trends") loadTrendsTab();
  }

  let trendsLoaded = false;
  async function loadTrendsTab() {
    if (trendsLoaded) return;
    try {
      const res = await fetch(`/api/events/${eventId}/trends`);
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      trendsLoaded = true;
      document.getElementById("trendsLoading").classList.add("hidden");
      document.getElementById("trendsBody").classList.remove("hidden");
      const artEl = document.getElementById("trendsArtists");
      const songEl = document.getElementById("trendsSongs");
      artEl.innerHTML = (data.topArtists || []).length
        ? data.topArtists.map((a) =>
            `<li><span class="font-medium">${escapeHtml(a.artist)}</span> <span style="color:var(--text-muted)">(${a.total})</span></li>`,
          ).join("")
        : `<li style="color:var(--text-muted)">Pas encore assez de demandes</li>`;
      songEl.innerHTML = (data.topSongs || []).length
        ? data.topSongs.map((s) =>
            `<li><span class="font-medium">${escapeHtml(s.song_name)}</span> <span style="color:var(--text-muted)">— ${escapeHtml(s.artist)} (${s.total})</span></li>`,
          ).join("")
        : `<li style="color:var(--text-muted)">Pas encore assez de demandes</li>`;
    } catch {
      document.getElementById("trendsLoading").textContent = "Impossible de charger les tendances";
    }
  }

  function escapeHtml(s) {
    const d = document.createElement("div");
    d.textContent = s == null ? "" : String(s);
    return d.innerHTML;
  }

  function guestStatusLabel(st) {
    const m = { pending: "En attente", accepted: "Acceptée", rejected: "Refusée", played: "Jouée" };
    return m[st] || st;
  }

  async function loadGuestHistory() {
    try {
      const res = await fetch(`/api/events/${eventId}/guest-history/${encodeURIComponent(clientId)}`);
      const data = await res.json();
      const list = data.requests || [];
      const wrap = document.getElementById("guestHistoryWrap");
      const ul   = document.getElementById("guestHistoryList");
      if (list.length === 0) {
        wrap.classList.add("hidden");
        return;
      }
      wrap.classList.remove("hidden");
      ul.innerHTML = list.map((r) =>
        `<li class="flex justify-between gap-2" style="color:var(--text-secondary)">
          <span class="truncate"><span class="font-medium" style="color:var(--text-primary)">${escapeHtml(r.song_name)}</span> — ${escapeHtml(r.artist)}</span>
          <span class="shrink-0 opacity-80">${guestStatusLabel(r.status)}</span>
        </li>`,
      ).join("");
    } catch { /* silencieux */ }
  }

  // ── Search ──
  const searchInput = document.getElementById("searchInput");
  const clearBtn    = document.getElementById("clearSearch");

  searchInput.addEventListener("input", (e) => {
    if (isBanned()) return; // bloqué
    const q = e.target.value.trim();
    clearBtn.classList.toggle("hidden", q.length === 0);
    clearTimeout(searchTimeout);
    if (q.length < 2) { showEmptyState(); return; }
    searchTimeout = setTimeout(() => searchSpotify(q), 400);
  });

  clearBtn.addEventListener("click", () => {
    searchInput.value = "";
    clearBtn.classList.add("hidden");
    showEmptyState();
    searchInput.focus();
  });

  // Fermer le clavier sur Enter (mobile)
  searchInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") searchInput.blur();
  });

  function showEmptyState() {
    const container = document.getElementById("searchResults");
    container.innerHTML = `
      <div id="searchEmptyState" class="flex-1 flex flex-col items-center justify-center gap-3 py-12">
        <div class="w-16 h-16 rounded-full flex items-center justify-center" style="background:var(--bg-elevated)">
          <svg class="w-8 h-8" style="color:var(--text-muted)" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
            <path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/>
          </svg>
        </div>
        <div class="text-center">
          <p class="text-sm font-medium" style="color:var(--text-secondary)">Cherche une chanson</p>
          <p class="text-xs mt-1" style="color:var(--text-muted)">Tape le titre ou l'artiste ci-dessus</p>
        </div>
      </div>`;
  }

  async function searchSpotify(query) {
    document.getElementById("searchResults").innerHTML = `
      <div class="flex items-center justify-center py-10 gap-2" style="color:var(--text-muted)">
        <svg class="w-5 h-5 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>
        <span class="text-sm">Recherche…</span>
      </div>`;
    try {
      const r    = await fetch(`/api/spotify/search?q=${encodeURIComponent(query)}&eventId=${eventId}`);
      const data = await r.json();
      if (data.error) { showError(data.error); showEmptyState(); return; }
      renderResults(data.tracks);
    } catch {
      showError("Erreur de recherche. Le DJ doit connecter Spotify.");
      showEmptyState();
    }
  }

  let filterExplicitEnabled = false;

  function renderResults(tracks) {
    const container = document.getElementById("searchResults");
    if (!tracks || tracks.length === 0) {
      container.innerHTML = `<p class="text-sm text-center py-8" style="color:var(--text-muted)">Aucun résultat</p>`;
      return;
    }
    container.innerHTML = tracks.map((t) => {
      const isExplicitBlocked = filterExplicitEnabled && t.explicit;
      const j = JSON.stringify(t).replace(/"/g, "&quot;");
      return `
        <div class="track-item flex items-center gap-3 px-1 py-2 rounded-2xl ${isExplicitBlocked ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'}" ${isExplicitBlocked ? 'data-blocked="1"' : `data-track="${j}"`}>
          <img src="${t.image}" alt="" class="w-14 h-14 rounded-xl object-cover shrink-0" loading="lazy" />
          <div class="flex-1 min-w-0">
            <div class="flex items-center gap-1.5 flex-wrap">
              <p class="text-sm font-semibold leading-snug" style="color:var(--text-primary)">${t.name}</p>
              ${t.explicit ? `<span class="badge text-[10px] font-bold px-1.5 py-0.2 rounded" style="background:rgba(239,68,68,0.15);color:#ef4444">18+ Explicite</span>` : ""}
            </div>
            <p class="text-xs mt-0.5 truncate" style="color:var(--text-secondary)">${t.artist}</p>
            <p class="text-xs mt-0.5" style="color:var(--text-muted)">${t.album || ""}</p>
          </div>
          ${isExplicitBlocked ? `
            <div class="shrink-0 text-xs font-bold text-red-400 px-2 py-1 rounded-lg" style="background:rgba(239,68,68,0.1)">Bloqué</div>
          ` : `
            <div class="shrink-0 w-8 h-8 rounded-full flex items-center justify-center" style="background:var(--accent)">
              <svg class="w-4 h-4 text-white" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            </div>
          `}
        </div>`;
    }).join("");
    container.querySelectorAll("[data-track]").forEach((el) => {
      el.addEventListener("click", () => openNameSheet(JSON.parse(el.dataset.track)));
    });
  }

  // ── Name bottom sheet ──
  // ── Système de ban côté invité ───────────────────────────────────────────
  let banState = null; // { message, until } — null = pas banni
  let requestsFreezeState = { frozen: false, frozenUntil: null, remainingMs: 0 };
  let currentLivePoll = null;

  function isBanned() {
    if (!banState) return false;
    if (banState.until === null) return true; // permanent
    if (Date.now() < banState.until) return true;
    banState = null; // expiré
    hideBanBanner();
    return false;
  }

  function applyBanState(message, remainingMs) {
    banState = { message, until: remainingMs ? Date.now() + remainingMs : null };
    if (navigator.vibrate) navigator.vibrate([200, 100, 200]);

    // Désactiver la recherche
    lockSearchForBan();

    // Afficher le bloc de ban dans la zone de recherche
    renderBanOverlay(message, remainingMs);

    // Nettoyer un éventuel timer précédent
    if (banState._timer) clearTimeout(banState._timer);
    if (remainingMs) {
      banState._timer = setTimeout(() => {
        banState = null;
        unlockSearchAfterBan();
      }, remainingMs);
    }
  }

  function lockSearchForBan() {
    searchInput.disabled    = true;
    searchInput.value       = "";
    searchInput.placeholder = "Recherche désactivée par le DJ";
    searchInput.style.borderColor  = "var(--red, #ef4444)";
    searchInput.style.opacity      = "0.5";
    searchInput.style.cursor       = "not-allowed";
    document.getElementById("clearSearch").classList.add("hidden");
  }

  function unlockSearchAfterBan() {
    searchInput.disabled    = false;
    searchInput.placeholder = "Rechercher une chanson…";
    searchInput.style.borderColor = "var(--border)";
    searchInput.style.opacity     = "1";
    searchInput.style.cursor      = "";
    // Retirer le bloc ban et remettre l'état vide
    renderBanOverlay(null, null);
    showEmptyState();
  }

  function renderBanOverlay(message, remainingMs) {
    const container = document.getElementById("searchResults");
    if (!message) {
      // Juste vider — showEmptyState s'en charge ensuite
      return;
    }
    const expiryText = remainingMs
      ? `Blocage levé dans ${Math.ceil(remainingMs / 60000)} minute${Math.ceil(remainingMs / 60000) > 1 ? "s" : ""}`
      : "Pour le reste de la soirée";
    container.innerHTML = `
      <div class="flex flex-col items-center gap-4 py-10 px-4">
        <div class="w-16 h-16 rounded-full flex items-center justify-center" style="background:var(--red-dim,rgba(239,68,68,.15));border:1.5px solid var(--red,#ef4444)">
          <svg class="w-8 h-8" style="color:var(--red,#ef4444)" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/></svg>
        </div>
        <div class="text-center">
          <p class="text-base font-bold mb-1" style="color:var(--red,#ef4444)">${message}</p>
          <p class="text-sm" style="color:var(--text-muted)">${expiryText}</p>
        </div>
      </div>`;
  }

  function hideBanBanner() {
    // Ancienne bannière flottante — plus utilisée, conservée pour compatibilité
    const banner = document.getElementById("banBanner");
    if (banner) banner.style.display = "none";
  }

  function openNameSheet(track) {
    // Vérifier si l'invité est banni
    if (isBanned()) {
      showError(banState?.message || "Tu es bloqué par le DJ.");
      showBanBanner(banState?.message || "Tu es bloqué par le DJ.", banState?.until ? banState.until - Date.now() : null);
      return;
    }
    if (requestsFreezeState.frozen) {
      const mins = Math.max(1, Math.ceil((requestsFreezeState.remainingMs || 0) / 60000));
      showError(`Le DJ a gelé les nouvelles demandes (${mins} min restantes).`);
      return;
    }
    if (currentRateLimit.allowed === false) {
      const mins = currentRateLimit.remainingMinutes || 1;
      showError(`Limite atteinte — réessaie dans ${mins} min`);
      return;
    }
    // Bloquer si don obligatoire non confirmé
    if (isDonationBlocked()) {
      document.getElementById("donationGate").classList.remove("hidden");
      return;
    }
    pendingTrack = track;
    document.getElementById("sheetTrackName").textContent   = track.name;
    document.getElementById("sheetTrackArtist").textContent = track.artist;
    document.getElementById("sheetTrackImg").src            = track.image;
    document.getElementById("nameInput").value = localStorage.getItem("djq-user-name") || "";
    const sheet = document.getElementById("nameSheet");
    sheet.classList.remove("closed");
    sheet.classList.add("open");
    setTimeout(() => document.getElementById("nameInput").focus(), 350);
  }

  function renderRequestsFreeze() {
    const card = document.getElementById("requestsFreezeCard");
    const txt = document.getElementById("requestsFreezeText");
    if (!card || !txt) return;
    if (!requestsFreezeState.frozen) {
      card.classList.add("hidden");
      return;
    }
    const mins = Math.max(1, Math.ceil((requestsFreezeState.remainingMs || 0) / 60000));
    txt.textContent = `Les nouvelles demandes sont temporairement gelées (${mins} min restantes). Les votes restent actifs.`;
    card.classList.remove("hidden");
  }

  function renderLivePoll() {
    const card = document.getElementById("livePollCard");
    const q = document.getElementById("livePollQuestion");
    const opts = document.getElementById("livePollOptions");
    const meta = document.getElementById("livePollMeta");
    if (!card || !q || !opts || !meta) return;

    if (!currentLivePoll || !currentLivePoll.isActive) {
      card.classList.add("hidden");
      return;
    }
    q.textContent = currentLivePoll.question || "Sondage";
    const totalVotes = Number(currentLivePoll.totalVotes || 0);
    const myVote = Number.isInteger(currentLivePoll.myVote) ? currentLivePoll.myVote : null;
    opts.innerHTML = (currentLivePoll.options || []).map((label, i) => {
      const pct = Number((currentLivePoll.percentages || [])[i] || 0);
      const count = Number((currentLivePoll.counts || [])[i] || 0);
      const voted = myVote === i;
      return `
        <button class="w-full text-left rounded-xl px-3 py-2.5" data-poll-option="${i}"
                style="background:${voted ? "var(--accent-dim)" : "var(--bg-elevated)"};border:1px solid var(--border)">
          <div class="flex items-center justify-between gap-2">
            <span class="text-xs font-semibold truncate" style="color:var(--text-primary)">${label}</span>
            <span class="text-xs tabular-nums" style="color:var(--text-secondary)">${pct}% · ${count}</span>
          </div>
        </button>`;
    }).join("");
    meta.textContent = `${totalVotes} vote${totalVotes > 1 ? "s" : ""}`;
    card.classList.remove("hidden");

    opts.querySelectorAll("[data-poll-option]").forEach((btn) => {
      btn.addEventListener("click", () => {
        if (!currentLivePoll?.id) return;
        const i = parseInt(btn.dataset.pollOption, 10);
        if (Number.isNaN(i)) return;
        currentLivePoll.myVote = i;
        renderLivePoll();
        socket.emit("vote-live-poll", { eventId, pollId: currentLivePoll.id, optionIndex: i });
      });
    });
  }

  function closeNameSheet() {
    const sheet = document.getElementById("nameSheet");
    sheet.classList.remove("open");
    sheet.classList.add("closed");
    pendingTrack = null;
  }

  function submitRequest() {
    if (!pendingTrack) return;
    if (requestsFreezeState.frozen) {
      const mins = Math.max(1, Math.ceil((requestsFreezeState.remainingMs || 0) / 60000));
      showError(`Le DJ a gelé les nouvelles demandes (${mins} min restantes).`);
      return;
    }
    const userName = document.getElementById("nameInput").value.trim() || "Anonyme";
    if (userName !== "Anonyme") localStorage.setItem("djq-user-name", userName);
    socket.emit("request-song", { eventId, songData: pendingTrack, userName, clientId });
    closeNameSheet();
  }

  // Submit on Enter in name input
  document.getElementById("nameInput").addEventListener("keydown", (e) => {
    if (e.key === "Enter") submitRequest();
  });

  // ── Partage du lien ──
  function shareEvent() {
    const eventName = document.getElementById("eventName")?.textContent || "Soirée DJ";
    const url = window.location.href;
    if (navigator.share) {
      navigator.share({ title: eventName, text: "Rejoins la soirée et propose tes musiques !", url }).catch(() => {});
    } else {
      navigator.clipboard.writeText(url).then(() => {
        const btn = document.getElementById("shareBtn");
        const orig = btn.innerHTML;
        btn.innerHTML = `<svg class="w-4 h-4" style="color:var(--green)" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>`;
        setTimeout(() => { btn.innerHTML = orig; }, 2000);
      }).catch(() => {
        prompt("Copie ce lien :", url);
      });
    }
  }

  // ── Rate limit display ──
  function updateRateLimitDisplay() {
    const zone  = document.getElementById("rateLimitZone");
    const dots  = document.getElementById("rateDots");
    const label = document.getElementById("rateLimitLabel");
    const max   = currentRateLimit.max || 3;
    zone.classList.remove("hidden");

    if (currentRateLimit.allowed === false) {
      const mins = currentRateLimit.remainingMinutes || 1;
      label.textContent = `Limite — ${mins} min`;
      label.style.color = "var(--red)";
      dots.innerHTML = Array.from({ length: max }, () =>
        `<div class="dot" style="background:rgba(239,68,68,0.35)"></div>`
      ).join("");
    } else {
      const left = currentRateLimit.remaining ?? (max - (currentRateLimit.count || 0));
      label.textContent = left === 1 ? "1 restante" : `${left} restantes`;
      label.style.color = left <= 1 ? "var(--amber)" : "var(--text-muted)";
      dots.innerHTML = Array.from({ length: max }, (_, i) => {
        const filled = i < left;
        const color  = left <= 1 ? "var(--amber)" : "var(--accent)";
        return `<div class="dot" style="background:${filled ? color : "var(--bg-elevated);border:1px solid var(--border)"}"></div>`;
      }).join("");
    }
  }

  // ── My request status card ──
  function updateMyRequestCard() {
    const card = document.getElementById("myRequestCard");
    if (!myRequestId || !myRequestData.status) { card.classList.add("hidden"); return; }

    card.classList.remove("hidden");
    card.classList.add("status-pulse");
    setTimeout(() => card.classList.remove("status-pulse"), 400);

    document.getElementById("myRequestName").textContent   = myRequestData.songName   || "";
    document.getElementById("myRequestArtist").textContent = myRequestData.artist      || "";
    const img = document.getElementById("myRequestImg");
    if (myRequestData.image) { img.src = myRequestData.image; img.classList.remove("hidden"); }

    const badge = document.getElementById("myRequestStatusBadge");
    const votesDiv = document.getElementById("myRequestVotes");

    const configs = {
      pending:  { text: "En attente du DJ", bg: "var(--amber-dim)", color: "var(--amber)", dot: "var(--amber)" },
      accepted: {
        text: myRequestData.position === 1
          ? "🎵 Prochaine chanson !"
          : `Acceptée — pos. ${myRequestData.position || "?"} (~${calcWait()} min)`,
        bg: myRequestData.position === 1 ? "var(--accent-dim, #4f46e533)" : "var(--green-dim)",
        color: myRequestData.position === 1 ? "var(--accent)" : "var(--green)",
        dot: myRequestData.position === 1 ? "var(--accent)" : "var(--green)"
      },
      rejected: { text: "Non retenue", bg: "var(--red-dim)", color: "var(--red)", dot: "var(--red)" },
      played:   { text: "Jouée — Merci !", bg: "var(--cyan-dim)", color: "var(--cyan)", dot: "var(--cyan)" },
    };
    const cfg = configs[myRequestData.status] || configs.pending;
    badge.innerHTML = `<span class="w-1.5 h-1.5 rounded-full shrink-0" style="background:${cfg.dot}"></span>${cfg.text}`;
    badge.style.background = cfg.bg;
    badge.style.color      = cfg.color;

    const showVotes = myRequestData.status === "accepted" && votesEnabled;
    votesDiv.classList.toggle("hidden", !showVotes);
    if (showVotes) {
      const up   = myRequestData.upvotes   || 0;
      const down = myRequestData.downvotes || 0;
      document.getElementById("voteUpCount").textContent   = up;
      document.getElementById("voteDownCount").textContent = down;
      const upBtn   = document.getElementById("btnVoteUp");
      const downBtn = document.getElementById("btnVoteDown");
      upBtn.style.background   = myVote === "up"   ? "var(--green)" : "var(--bg-elevated)";
      upBtn.style.color        = myVote === "up"   ? "#fff"          : "var(--text-secondary)";
      downBtn.style.background = myVote === "down" ? "var(--red)"   : "var(--bg-elevated)";
      downBtn.style.color      = myVote === "down" ? "#fff"          : "var(--text-secondary)";
    }
  }

  function calcWait() {
    if (!Array.isArray(fullQueue) || fullQueue.length === 0) return 1;
    const idx = fullQueue.findIndex((s) => s.id === myRequestId);
    if (idx <= 0) return 1;
    return window.TimeUtils.estimateQueueWaitMinutes(fullQueue, idx);
  }

  // Vote buttons in my request card
  document.getElementById("btnVoteUp").addEventListener("click", () => vote("up"));
  document.getElementById("btnVoteDown").addEventListener("click", () => vote("down"));

  function vote(type) {
    if (!votesEnabled)  { showError("Votes désactivés par le DJ"); return; }
    if (!myRequestId)   return;
    socket.emit("vote", { requestId: myRequestId, voteType: type });
    myVotesByRequest.set(myRequestId, type);
    myVote = type;
    updateMyRequestCard();
  }

  // ── Queue display ──
  function updateQueueDisplay() {
    const container = document.getElementById("queueList");
    const badge     = document.getElementById("queueBadge");

    badge.textContent = fullQueue.length || "";
    badge.classList.toggle("hidden", fullQueue.length === 0 || activeTab === "queue");

    if (fullQueue.length === 0) {
      container.innerHTML = `
        <div class="flex flex-col items-center justify-center gap-3 py-16 px-8 text-center">
          <div class="w-16 h-16 rounded-full flex items-center justify-center" style="background:var(--bg-elevated)">
            <svg class="w-8 h-8" style="color:var(--text-muted)" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
              <line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/>
              <line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/>
            </svg>
          </div>
          <div>
            <p class="text-sm font-medium" style="color:var(--text-secondary)">File vide</p>
            <p class="text-xs mt-1" style="color:var(--text-muted)">Aucune chanson pour l'instant</p>
          </div>
        </div>`;
      return;
    }

    container.innerHTML = fullQueue.map((song, index) => {
      const wait     = window.TimeUtils.estimateQueueWaitMinutes(fullQueue, index);
      const isMyTrack = song.id === myRequestId;
      const myVoteQ  = myVotesByRequest.get(song.id) ?? (isMyTrack ? myVote : null);
      return `
        <div class="flex items-center gap-3 px-4 py-3.5 ${isMyTrack ? "relative" : ""}" style="${isMyTrack ? "background:var(--accent-dim);border-left:3px solid var(--accent)" : ""}">
          <div class="w-8 h-8 rounded-full shrink-0 flex items-center justify-center text-xs font-bold" style="background:${isMyTrack ? "var(--accent)" : "var(--bg-elevated)"};color:${isMyTrack ? "#fff" : "var(--text-secondary)"}">
            ${index + 1}
          </div>
          ${song.image_url ? `<img src="${song.image_url}" alt="" class="w-12 h-12 rounded-xl object-cover shrink-0" loading="lazy" />` : ""}
          <div class="flex-1 min-w-0">
            <p class="text-sm font-semibold truncate leading-snug" style="color:var(--text-primary)">${song.song_name}</p>
            <p class="text-xs truncate mt-0.5" style="color:var(--text-secondary)">${song.artist}</p>
            <div class="flex items-center gap-2 mt-1 flex-wrap">
              <span class="text-xs" style="color:var(--text-muted)">${song.user_name}</span>
              ${index > 0 ? `<span class="text-xs" style="color:var(--accent)">~${wait} min</span>` : `<span class="text-xs font-semibold" style="color:var(--accent)">Suivant !</span>`}
            </div>
          </div>
          ${votesEnabled ? `
          <div class="shrink-0 flex flex-col items-center gap-1">
            <button data-vote-action="up" data-request-id="${song.id}" class="w-9 h-9 rounded-xl flex flex-col items-center justify-center" style="${myVoteQ==="up" ? "background:var(--green);color:#fff" : "background:var(--bg-elevated);color:var(--text-muted);border:1px solid var(--border)"}">
              <svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3z"/><path d="M7 22H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3"/></svg>
              <span class="text-xs font-bold" style="font-size:10px">${song.upvotes || 0}</span>
            </button>
            <button data-vote-action="down" data-request-id="${song.id}" class="w-9 h-9 rounded-xl flex flex-col items-center justify-center" style="${myVoteQ==="down" ? "background:var(--red);color:#fff" : "background:var(--bg-elevated);color:var(--text-muted);border:1px solid var(--border)"}">
              <svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 15v4a3 3 0 0 0 3 3l4-9V2H5.72a2 2 0 0 0-2 1.7l-1.38 9a2 2 0 0 0 2 2.3z"/><path d="M17 2h2.67A2.31 2.31 0 0 1 22 4v7a2.31 2.31 0 0 1-2.33 2H17"/></svg>
              <span class="text-xs font-bold" style="font-size:10px">${song.downvotes || 0}</span>
            </button>
          </div>` : ""}
        </div>`;
    }).join("");

    // Queue vote delegation (for other tracks, not my own — handled by socket separately)
    container.querySelectorAll("[data-vote-action]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const rid  = btn.dataset.requestId;
        const type = btn.dataset.voteAction;
        if (!votesEnabled) { showError("Votes désactivés par le DJ"); return; }
        socket.emit("vote", { requestId: rid, voteType: type });
        myVotesByRequest.set(rid, type);
        if (rid === myRequestId) {
          myVote = type;
          updateMyRequestCard();
        } else {
          updateQueueDisplay();
        }
      });
    });
  }

  // ── Error / toast ──
  function showError(msg) {
    const el = document.getElementById("errorBanner");
    document.getElementById("errorText").innerHTML = msg.replace(/\n/g, "<br>");
    el.classList.remove("hidden");
    clearTimeout(showError._t);
    showError._t = setTimeout(() => el.classList.add("hidden"), 6000);
  }

  function showToast(msg) {
    const t = document.getElementById("toast");
    t.textContent = msg;
    t.classList.remove("hidden");
    clearTimeout(showToast._t);
    showToast._t = setTimeout(() => t.classList.add("hidden"), 3000);
  }

  // ── Notifications ──
  const BASE_TITLE = document.title;
  let blinkInterval = null;

  // Demander la permission pour les notifications système (fait discrètement, sans popup intrusif)
  if ("Notification" in window && Notification.permission === "default") {
    // On attend une interaction utilisateur pour demander la permission
    document.addEventListener("click", function askOnce() {
      Notification.requestPermission();
      document.removeEventListener("click", askOnce);
    }, { once: true });
  }

  function notifyAccepted(songName) {
    // 1. Vibration (mobile) — double pulse
    if (navigator.vibrate) navigator.vibrate([80, 60, 120]);

    // 2. Titre clignotant (utile si l'onglet est en arrière-plan)
    stopTitleBlink();
    let blink = true;
    blinkInterval = setInterval(() => {
      document.title = blink ? `✓ Acceptée ! — ${songName}` : BASE_TITLE;
      blink = !blink;
    }, 900);
    // Arrêter après 20 s ou quand l'onglet redevient visible
    setTimeout(stopTitleBlink, 20000);

    // 3. Notification système si disponible et autorisée
    if ("Notification" in window && Notification.permission === "granted") {
      new Notification("Ta chanson est acceptée !", {
        body: songName,
        icon: "/favicon.ico",
        tag:  "dj-request-accepted",
        silent: true, // on a déjà la vibration
      });
    }
  }

  function notifyRejected() {
    if (navigator.vibrate) navigator.vibrate([40, 30, 40]);
    stopTitleBlink();
  }

  function notifyNext(songName) {
    // Vibration triple — distincte de "acceptée"
    if (navigator.vibrate) navigator.vibrate([60, 40, 60, 40, 200]);

    // Titre clignotant
    stopTitleBlink();
    let blink = true;
    blinkInterval = setInterval(() => {
      document.title = blink ? `🎵 C'est ton tour ! — ${songName}` : BASE_TITLE;
      blink = !blink;
    }, 700);
    setTimeout(stopTitleBlink, 15000);

    // Notification système
    if ("Notification" in window && Notification.permission === "granted") {
      new Notification("C'est bientôt ton tour !", {
        body: `"${songName}" est la prochaine chanson !`,
        icon: "/favicon.ico",
        tag:  "dj-request-next",
        silent: true,
      });
    }

    // Toast visuel persistant (disparaît en 6s)
    const t = document.getElementById("toast");
    t.innerHTML = `🎵 Ta chanson est la prochaine !`;
    t.style.background = "var(--accent)";
    t.classList.remove("hidden");
    clearTimeout(t._nextTimer);
    t._nextTimer = setTimeout(() => t.classList.add("hidden"), 6000);
  }

  function notifyPlayed(songName) {
    if (navigator.vibrate) navigator.vibrate([200]);
    stopTitleBlink();
    document.title = `♪ En train de jouer — ${songName}`;
    setTimeout(() => { document.title = BASE_TITLE; }, 5000);
  }

  function stopTitleBlink() {
    if (blinkInterval) { clearInterval(blinkInterval); blinkInterval = null; }
    document.title = BASE_TITLE;
  }

  // Remettre le titre normal si l'onglet redevient actif
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) stopTitleBlink();
  });

  // ── Socket ──
  let _wasDisconnected = false;

  socket.on("connect", () => {
    socket.emit("join-event", { eventId, clientId });
    // Après une coupure réseau : resynchroniser l'état complet
    if (_wasDisconnected) {
      _wasDisconnected = false;
      resyncState();
    }
  });
  socket.on("disconnect", () => { _wasDisconnected = true; });
  if (socket.connected) socket.emit("join-event", { eventId, clientId });

  async function resyncState() {
    try {
      const data = await fetch(`/api/events/${eventId}`).then((r) => r.json());
      if (data.error) return;
      votesEnabled = data.votes_enabled;
      fullQueue    = data.queue || [];
      // Mettre à jour le statut de la demande en cours si elle est dans la queue
      if (myRequestId && myRequestData.status === "accepted") {
        const pos = fullQueue.findIndex((r) => r.id === myRequestId) + 1;
        if (pos > 0) myRequestData.position = pos;
        else         myRequestData.status = "played";
        updateMyRequestCard();
      }
      updateQueueDisplay();
    } catch { /* silencieux — on réessaiera à la prochaine reconnexion */ }
  }

  socket.on("rate-limit-status", (status) => { currentRateLimit = status; updateRateLimitDisplay(); });
  socket.on("requests-freeze-updated", (data) => {
    requestsFreezeState = {
      frozen: !!data?.frozen,
      frozenUntil: data?.frozenUntil || null,
      remainingMs: Number(data?.remainingMs || 0),
    };
    renderRequestsFreeze();
  });
  socket.on("live-poll-updated", (data) => {
    const incoming = data?.poll || null;
    if (
      incoming &&
      incoming.id &&
      incoming.myVote == null &&
      currentLivePoll &&
      currentLivePoll.id === incoming.id &&
      Number.isInteger(currentLivePoll.myVote)
    ) {
      incoming.myVote = currentLivePoll.myVote;
    }
    currentLivePoll = incoming;
    renderLivePoll();
  });

  socket.on("request-created", (data) => {
    myRequestId   = data.requestId;
    myPrevPosition = null; // réinitialiser pour la nouvelle demande
    myRequestData = { status: "pending", songName: data.songName, artist: data.artist, image: data.image };
    if (data.rateLimitStatus) { currentRateLimit = data.rateLimitStatus; updateRateLimitDisplay(); }
    updateMyRequestCard();
    loadGuestHistory();
    showToast("Demande envoyée !");
    // Reset search
    searchInput.value = "";
    clearBtn.classList.add("hidden");
    showEmptyState();
  });

  socket.on("request-error", (error) => {
    showError(error.message);
    if (error.type === "rate-limit") {
      currentRateLimit = { ...currentRateLimit, allowed: false };
      updateRateLimitDisplay();
    } else if (error.type === "requests-frozen") {
      requestsFreezeState = {
        frozen: true,
        frozenUntil: error.remainingMs ? Date.now() + Number(error.remainingMs) : null,
        remainingMs: Number(error.remainingMs || 0),
      };
      renderRequestsFreeze();
    } else if (error.type === "banned") {
      applyBanState(error.message, error.remainingMs || null);
    }
  });

  socket.on("you-are-banned", (data) => {
    const mins = data.remainingMs ? Math.ceil(data.remainingMs / 60000) : null;
    const msg = data.permanent
      ? "Le DJ t'a bloqué pour le reste de la soirée."
      : `Le DJ t'a bloqué pendant ${mins} minute${mins > 1 ? "s" : ""}.`;

    applyBanState(msg, data.remainingMs);

    // Si la demande de cet utilisateur était en attente, la marquer comme rejetée localement
    if (myRequestId && myRequestData.status === "pending") {
      // Vérifier si notre demande est dans la liste des annulées
      const cancelled = data.cancelledRequestIds || [];
      if (cancelled.length === 0 || cancelled.includes(myRequestId)) {
        myRequestData.status = "rejected";
        myPrevPosition = null;
        updateMyRequestCard();
      }
    }
  });

  socket.on("you-are-unbanned", (data) => {
    if (banState?._timer) clearTimeout(banState._timer);
    banState = null;
    unlockSearchAfterBan();
    showToast(data?.message || "Tu as été débloqué.");
  });

  socket.on("your-request-accepted", (data) => {
    if (myRequestId === data.requestId) {
      myRequestData.status   = "accepted";
      myRequestData.position = data.position;
      updateMyRequestCard();
      loadGuestHistory();
      notifyAccepted(myRequestData.songName || "Ta chanson");
      showToast("Ta chanson a été acceptée !");
    }
  });

  socket.on("your-request-pending-again", (data) => {
    if (myRequestId === data.requestId) {
      myRequestData.status = "pending";
      myPrevPosition = null;
      updateMyRequestCard();
      loadGuestHistory();
      showToast("Ta demande est de nouveau en attente.");
    }
  });

  socket.on("your-request-rejected", (data) => {
    if (myRequestId === data.requestId) {
      myRequestData.status = "rejected";
      updateMyRequestCard();
      loadGuestHistory();
      notifyRejected();
      showToast("Ta demande n'a pas été retenue.");
    }
  });

  let myPrevPosition = null; // pour détecter le passage en position 1

  socket.on("queue-updated", (data) => {
    fullQueue = data.queue;
    const ids = new Set(fullQueue.map((r) => r.id));
    for (const key of myVotesByRequest.keys()) {
      if (!ids.has(key) && key !== myRequestId) myVotesByRequest.delete(key);
    }
    if (myRequestId && myRequestData.status === "accepted") {
      const idx = data.queue.findIndex((r) => r.id === myRequestId);
      const pos = idx + 1; // 0 si absent (jouée)
      if (pos > 0) {
        // Passage en position 1 : prochaine chanson !
        if (pos === 1 && myPrevPosition !== 1) {
          notifyNext(myRequestData.songName || "Ta chanson");
        }
        myPrevPosition        = pos;
        myRequestData.position = pos;
      } else {
        // Disparue de la queue = jouée
        myPrevPosition    = null;
        myRequestData.status = "played";
        notifyPlayed(myRequestData.songName || "Ta chanson");
        loadGuestHistory();
      }
      updateMyRequestCard();
    }
    updateQueueDisplay();
  });

  socket.on("vote-updated", (data) => {
    const item = fullQueue.find((r) => r.id === data.requestId);
    if (item) { item.upvotes = data.upvotes; item.downvotes = data.downvotes; updateQueueDisplay(); }
    if (data.requestId === myRequestId) {
      myRequestData.upvotes   = data.upvotes;
      myRequestData.downvotes = data.downvotes;
      updateMyRequestCard();
    }
  });

  socket.on("votes-batch-updated", (data) => {
    if (!Array.isArray(data?.votes)) return;
    let needsQueueUpdate = false;
    let needsMyRequestUpdate = false;
    for (const v of data.votes) {
      const item = fullQueue.find((r) => r.id === v.requestId);
      if (item) { item.upvotes = v.upvotes; item.downvotes = v.downvotes; needsQueueUpdate = true; }
      if (v.requestId === myRequestId) {
        myRequestData.upvotes   = v.upvotes;
        myRequestData.downvotes = v.downvotes;
        needsMyRequestUpdate = true;
      }
    }
    if (needsMyRequestUpdate) updateMyRequestCard();
    if (needsQueueUpdate) updateQueueDisplay();
  });

  socket.on("vote-confirmed", (data) => {
    const rid = data?.requestId;
    if (!rid) return;
    if (data.myVote == null) myVotesByRequest.delete(rid);
    else myVotesByRequest.set(rid, data.myVote);

    if (rid === myRequestId) {
      myVote = data.myVote ?? null;
      myRequestData.upvotes = Number(data.upvotes || myRequestData.upvotes || 0);
      myRequestData.downvotes = Number(data.downvotes || myRequestData.downvotes || 0);
      updateMyRequestCard();
    }
    updateQueueDisplay();
  });

  socket.on("vote-error", (data) => {
    showError(data?.message || "Erreur lors du vote");
  });

  socket.on("event-ended", (data) => {
    searchInput.disabled    = true;
    searchInput.placeholder = "Soirée terminée";
    showError(data.message || "La soirée est terminée !");
    setTimeout(() => { window.location.href = `/event/${eventId}/thank-you`; }, 2000);
  });

  // ── Now Playing ──
  let npRafId       = null;
  let npState       = null; // { durationMs, positionMs, isPlaying, timestamp }

  function npFormatTime(ms) {
    const s = Math.max(0, Math.floor(ms / 1000));
    return `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, "0")}`;
  }

  function npAnimateProgress() {
    if (!npState || !npState.isPlaying) return;
    const elapsed  = Date.now() - npState.timestamp;
    const pos      = Math.min(npState.positionMs + elapsed, npState.durationMs);
    const pct      = npState.durationMs > 0 ? (pos / npState.durationMs) * 100 : 0;
    const remaining = npState.durationMs - pos;
    document.getElementById("npProgressBar").style.width   = `${pct}%`;
    document.getElementById("npTimeRemaining").textContent = `-${npFormatTime(remaining)}`;
    npRafId = requestAnimationFrame(npAnimateProgress);
  }

  function npStartAnimation() {
    if (npRafId) cancelAnimationFrame(npRafId);
    npRafId = requestAnimationFrame(npAnimateProgress);
  }

  socket.on("now-playing", (data) => {
    const { track, positionMs, durationMs, isPlaying, timestamp } = data;
    if (!track) return;

    npState = { positionMs, durationMs: track.durationMs, isPlaying, timestamp };

    document.getElementById("npAlbumArt").src          = track.albumArt || "";
    document.getElementById("npTrackName").textContent = track.name    || "";
    document.getElementById("npArtist").textContent    = track.artist  || "";

    // Snap progress bar immediately (no transition) then let RAF animate
    const bar = document.getElementById("npProgressBar");
    bar.style.transition = "none";
    const pct = npState.durationMs > 0 ? (positionMs / npState.durationMs) * 100 : 0;
    bar.style.width = `${pct}%`;
    // Force reflow then re-enable transition
    bar.getBoundingClientRect();
    bar.style.transition = "";

    const strip = document.getElementById("nowPlayingStrip");
    strip.classList.remove("hidden-strip");
    strip.classList.add("visible-strip");

    if (isPlaying) {
      npStartAnimation();
    } else {
      if (npRafId) { cancelAnimationFrame(npRafId); npRafId = null; }
      const remaining = npState.durationMs - positionMs;
      document.getElementById("npTimeRemaining").textContent = `-${npFormatTime(remaining)}`;
    }
  });

  // ── DJ Message Banner ──
  let djBannerTimer = null;

  function showDjBanner(message) {
    const banner = document.getElementById("djBanner");
    document.getElementById("djBannerText").textContent = message;
    banner.classList.remove("hide");
    banner.classList.add("show");
    if (djBannerTimer) clearTimeout(djBannerTimer);
    djBannerTimer = setTimeout(hideDjBanner, 8000);
    // Vibration courte pour attirer l'attention
    if (navigator.vibrate) navigator.vibrate([30, 20, 30]);
  }

  function hideDjBanner() {
    const banner = document.getElementById("djBanner");
    banner.classList.remove("show");
    banner.classList.add("hide");
    if (djBannerTimer) { clearTimeout(djBannerTimer); djBannerTimer = null; }
  }

  document.getElementById("djBannerClose").addEventListener("click", hideDjBanner);

  socket.on("dj-message", (data) => {
    showDjBanner(data.message);
  });

  // ── Système de dons ──────────────────────────────────────────
  let donationCfg = { enabled: false, required: false, amount: 2, link: "", message: "" };
  let donationConfirmed = !!sessionStorage.getItem(`djq-donated-${eventId}`);

  function fmtAmount(n) {
    return Number(n).toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " €";
  }

  function applyDonationConfig(cfg) {
    donationCfg = { ...donationCfg, ...cfg };

    if (!donationCfg.enabled) {
      document.getElementById("donationGate").classList.add("hidden");
      document.getElementById("donationBanner").classList.add("hidden");
      return;
    }

    const msg = donationCfg.message || "Un petit don est apprécié pour soutenir le DJ.";

    if (donationCfg.required && !donationConfirmed) {
      // Gate obligatoire
      document.getElementById("donationGateMsg").textContent    = msg;
      document.getElementById("donationGateAmount").textContent = fmtAmount(donationCfg.amount);
      document.getElementById("donationPayBtn").href            = donationCfg.link || "#";
      document.getElementById("donationSkipBtn").classList.add("hidden");
      document.getElementById("donationGate").classList.remove("hidden");
    } else if (!donationCfg.required) {
      // Bannière optionnelle
      document.getElementById("donationBannerMsg").textContent = msg + " — " + fmtAmount(donationCfg.amount);
      document.getElementById("donationBannerBtn").href        = donationCfg.link || "#";
      document.getElementById("donationBanner").classList.remove("hidden");
    }
  }

  function confirmDonation() {
    donationConfirmed = true;
    sessionStorage.setItem(`djq-donated-${eventId}`, "1");
    document.getElementById("donationGate").classList.add("hidden");
  }

  // Bouton "Payer maintenant" → ouvre le lien + déclenche un compte à rebours
  document.getElementById("donationPayBtn").addEventListener("click", () => {
    const wrap  = document.getElementById("donationConfirmWrap");
    const timer = document.getElementById("donationTimer");
    const btn   = document.getElementById("donationConfirmBtn");
    wrap.classList.remove("hidden");
    btn.classList.add("hidden");
    let remaining = 15;
    timer.textContent = `Retour dans ${remaining}s…`;
    const iv = setInterval(() => {
      remaining--;
      if (remaining <= 0) {
        clearInterval(iv);
        timer.textContent = "Paiement effectué ?";
        btn.classList.remove("hidden");
      } else {
        timer.textContent = `Retour dans ${remaining}s…`;
      }
    }, 1000);
  });

  document.getElementById("donationConfirmBtn").addEventListener("click", confirmDonation);
  document.getElementById("donationSkipBtn").addEventListener("click", () => {
    document.getElementById("donationGate").classList.add("hidden");
  });
  document.getElementById("donationBannerClose").addEventListener("click", () => {
    document.getElementById("donationBanner").classList.add("hidden");
  });

  // Écouter les changements de settings en temps réel
  socket.on("event-settings-updated", (data) => {
    if (data.votesEnabled !== undefined) {
      votesEnabled = data.votesEnabled;
      updateMyRequestCard();
      updateQueueDisplay();
    }
    if (data.filterExplicit !== undefined) {
      filterExplicitEnabled = !!data.filterExplicit;
      if (lastTracks && lastTracks.length > 0) renderResults(lastTracks);
    }
    // Mise à jour des dons en live
    if (data.donationEnabled !== undefined || data.donationRequired !== undefined ||
        data.donationLink    !== undefined) {
      applyDonationConfig({
        enabled:  data.donationEnabled  ?? donationCfg.enabled,
        required: data.donationRequired ?? donationCfg.required,
        amount:   data.donationAmount   ?? donationCfg.amount,
        link:     data.donationLink     ?? donationCfg.link,
        message:  data.donationMessage  ?? donationCfg.message,
      });
    }

    // Mise à jour live de la limitation des demandes côté invité
    if (data.rateLimitMax !== undefined || data.rateLimitWindowMinutes !== undefined) {
      // Rejouer join-event force le serveur à renvoyer `rate-limit-status`
      socket.emit("join-event", { eventId, clientId });
    }
  });

  // Bloquer la recherche si don obligatoire non confirmé
  const _origHandleSearch = window._handleSearch; // guard (pas utilisé ici)
  function isDonationBlocked() {
    return donationCfg.enabled && donationCfg.required && !donationConfirmed;
  }

  // ── Init ──
  fetch(`/api/events/${eventId}`)
    .then((r) => r.json())
    .then((data) => {
      document.getElementById("eventName").textContent = data.name || "Soirée";
      votesEnabled = data.votes_enabled;
      filterExplicitEnabled = !!data.filter_explicit;
      fullQueue    = data.queue || [];
      const frozenUntil = data.requests_frozen_until ? Number(data.requests_frozen_until) : null;
      requestsFreezeState = {
        frozen: !!(frozenUntil && Date.now() < frozenUntil),
        frozenUntil,
        remainingMs: frozenUntil ? Math.max(0, frozenUntil - Date.now()) : 0,
      };
      renderRequestsFreeze();
      updateQueueDisplay();

      // Configurer les dons au chargement
      if (data.donation_enabled) {
        applyDonationConfig({
          enabled:  !!data.donation_enabled,
          required: !!data.donation_required,
          amount:   data.donation_amount  || 2,
          link:     data.donation_link    || "",
          message:  data.donation_message || "",
        });
      }
      loadGuestHistory();
    })
    .catch(() => showError("Impossible de charger l'événement"));

  // PWA : manifest dynamique + service worker minimal
  (function setupPwa() {
    const mf = document.createElement("link");
    mf.rel = "manifest";
    mf.href = `/manifest-user.json?e=${encodeURIComponent(eventId)}`;
    document.head.appendChild(mf);
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw-user.js").catch(() => {});
    }
  })();

  // Rafraîchir les compteurs temporaires (gel DJ)
  setInterval(() => {
    if (!requestsFreezeState.frozen || !requestsFreezeState.frozenUntil) return;
    const left = Math.max(0, Number(requestsFreezeState.frozenUntil) - Date.now());
    requestsFreezeState.remainingMs = left;
    if (left <= 0) {
      requestsFreezeState = { frozen: false, frozenUntil: null, remainingMs: 0 };
    }
    renderRequestsFreeze();
  }, 1000);

  // ── Moteur de Réactions Émojis en Direct ─────────────────
  const userReactionsLayer = document.getElementById("userFloatingReactionsLayer");
  function spawnUserFloatingReaction(emoji) {
    if (!userReactionsLayer) return;
    const el = document.createElement("div");
    el.className = "floating-reaction-item";
    const startX = Math.floor(Math.random() * (window.innerWidth * 0.7) + window.innerWidth * 0.15);
    const swayX  = Math.floor((Math.random() - 0.5) * 40) + "px";
    const rot1   = (Math.random() * 30 - 15) + "deg";
    const rot2   = (Math.random() * 30 - 15) + "deg";
    const dur    = (2.4 + Math.random() * 0.8).toFixed(2) + "s";
    el.style.setProperty("--start-x", `${startX}px`);
    el.style.setProperty("--sway-x", swayX);
    el.style.setProperty("--rot-1", rot1);
    el.style.setProperty("--rot-2", rot2);
    el.style.setProperty("--float-duration", dur);
    el.style.fontSize = "32px";
    el.style.left = "0px";
    el.style.top = "0px";
    el.innerHTML = `<span class="drop-shadow-lg">${emoji}</span>`;
    userReactionsLayer.appendChild(el);
    setTimeout(() => el.remove(), 3400);
  }

  document.getElementById("liveReactionsBar")?.addEventListener("click", (e) => {
    const btn = e.target.closest("button[data-reaction]");
    if (!btn) return;
    const emoji = btn.dataset.reaction;
    if (navigator.vibrate) {
      try { navigator.vibrate(15); } catch {}
    }
    btn.style.transform = "scale(1.35)";
    setTimeout(() => { btn.style.transform = ""; }, 200);
    spawnUserFloatingReaction(emoji);
    const senderName = localStorage.getItem("djq-user-name") || "";
    socket.emit("live-reaction", { eventId, reaction: emoji, senderName, count: 1 });
  });

  socket.on("live-reaction-broadcast", (data) => {
    if (data?.reaction) {
      spawnUserFloatingReaction(data.reaction);
    }
  });

  // ── Générateur de Story Instagram / TikTok 9:16 ───────────
  const storyModal = document.getElementById("storyShareModal");
  const storyCanvas = document.getElementById("storyCanvas");

  async function generateStoryCanvas(track) {
    if (!storyCanvas) return;
    const ctx = storyCanvas.getContext("2d");
    const W = 1080;
    const H = 1920;
    storyCanvas.width = W;
    storyCanvas.height = H;

    // 1. Fond dégradé sombre néon
    const bgGrad = ctx.createLinearGradient(0, 0, W, H);
    bgGrad.addColorStop(0, "#0a0a14");
    bgGrad.addColorStop(0.35, "#170f2b");
    bgGrad.addColorStop(0.7, "#0f172a");
    bgGrad.addColorStop(1, "#07070c");
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, W, H);

    // 2. Halos lumineux d'ambiance
    const radial1 = ctx.createRadialGradient(200, 400, 10, 200, 400, 500);
    radial1.addColorStop(0, "rgba(139, 92, 246, 0.45)");
    radial1.addColorStop(1, "rgba(139, 92, 246, 0)");
    ctx.fillStyle = radial1;
    ctx.fillRect(0, 0, W, H);

    const radial2 = ctx.createRadialGradient(880, 1400, 10, 880, 1400, 600);
    radial2.addColorStop(0, "rgba(236, 72, 153, 0.4)");
    radial2.addColorStop(1, "rgba(236, 72, 153, 0)");
    ctx.fillStyle = radial2;
    ctx.fillRect(0, 0, W, H);

    // 3. Top Header Capsule "MUSIC LIVE"
    ctx.save();
    ctx.fillStyle = "rgba(255, 255, 255, 0.08)";
    ctx.strokeStyle = "rgba(255, 255, 255, 0.15)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect(W / 2 - 200, 140, 400, 70, [35]);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 28px 'Plus Jakarta Sans', sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("🎵  MUSIC LIVE", W / 2, 175);
    ctx.restore();

    // 4. Titre de célébration
    ctx.fillStyle = "#ffffff";
    ctx.font = "800 52px 'Plus Jakarta Sans', sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("J'AI FAIT JOUER MA MUSIQUE !", W / 2, 290);

    const eventTitle = document.getElementById("eventName")?.textContent || "Soirée Live";
    ctx.fillStyle = "#a78bfa";
    ctx.font = "600 34px 'Plus Jakarta Sans', sans-serif";
    ctx.fillText(`Ce soir à la ${eventTitle} 🔥`, W / 2, 350);

    // 5. Pochette Album avec coins arrondis et ombre
    const artSize = 620;
    const artX = (W - artSize) / 2;
    const artY = 440;

    // Ombre portée
    ctx.save();
    ctx.shadowColor = "rgba(139, 92, 246, 0.55)";
    ctx.shadowBlur = 80;
    ctx.shadowOffsetY = 25;
    ctx.fillStyle = "#1e1b4b";
    ctx.beginPath();
    ctx.roundRect(artX, artY, artSize, artSize, [48]);
    ctx.fill();
    ctx.restore();

    // Charger l'image
    const imgUrl = track.image_url || track.albumArt || myRequestData.image_url || "";
    if (imgUrl) {
      try {
        const img = new Image();
        img.crossOrigin = "anonymous";
        await new Promise((resolve) => {
          img.onload = resolve;
          img.onerror = resolve; // Continue même si échec image
          img.src = imgUrl;
        });
        if (img.complete && img.naturalWidth > 0) {
          ctx.save();
          ctx.beginPath();
          ctx.roundRect(artX, artY, artSize, artSize, [48]);
          ctx.clip();
          ctx.drawImage(img, artX, artY, artSize, artSize);
          ctx.restore();
        }
      } catch {}
    }

    // Bordure néon de la pochette
    ctx.save();
    ctx.strokeStyle = "rgba(255, 255, 255, 0.25)";
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.roundRect(artX, artY, artSize, artSize, [48]);
    ctx.stroke();
    ctx.restore();

    // 6. Titre & Artiste du morceau
    const songTitle = track.song_name || track.name || myRequestData.song_name || "Morceau";
    const songArtist = track.artist || myRequestData.artist || "Artiste";

    ctx.fillStyle = "#ffffff";
    ctx.font = "800 54px 'Plus Jakarta Sans', sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(songTitle.length > 24 ? songTitle.slice(0, 22) + "…" : songTitle, W / 2, 1150);

    ctx.fillStyle = "rgba(255, 255, 255, 0.7)";
    ctx.font = "600 38px 'Plus Jakarta Sans', sans-serif";
    ctx.fillText(songArtist.length > 30 ? songArtist.slice(0, 28) + "…" : songArtist, W / 2, 1215);

    // 7. Badge "Demandé par [Nom]"
    const userName = myRequestData.user_name || localStorage.getItem("djq-user-name") || "Un invité";
    ctx.save();
    ctx.fillStyle = "rgba(16, 185, 129, 0.15)";
    ctx.strokeStyle = "rgba(16, 185, 129, 0.5)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect(W / 2 - 240, 1290, 480, 64, [32]);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = "#10b981";
    ctx.font = "bold 26px 'Plus Jakarta Sans', sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(`✨ Demandé par ${userName}`, W / 2, 1322);
    ctx.restore();

    // 8. Onde sonore égaliseur décorative
    ctx.save();
    const bars = 32;
    const totalBarW = 600;
    const barW = 10;
    const barGap = (totalBarW - bars * barW) / (bars - 1);
    const startBX = (W - totalBarW) / 2;
    const baseBY = 1480;

    for (let b = 0; b < bars; b++) {
      const h = 20 + Math.sin(b * 0.4) * 35 + Math.cos(b * 0.8) * 20;
      const gradB = ctx.createLinearGradient(0, baseBY - h, 0, baseBY + h);
      gradB.addColorStop(0, "#ec4899");
      gradB.addColorStop(1, "#8b5cf6");
      ctx.fillStyle = gradB;
      ctx.beginPath();
      ctx.roundRect(startBX + b * (barW + barGap), baseBY - h / 2, barW, h, [5]);
      ctx.fill();
    }
    ctx.restore();

    // 9. Footer CTA
    ctx.fillStyle = "rgba(255, 255, 255, 0.5)";
    ctx.font = "600 28px 'Plus Jakarta Sans', sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("Choisis tes sons en direct sur music-live.fullann.ch", W / 2, 1720);
  }

  function openStoryShareModal() {
    const track = {
      song_name: myRequestData.song_name || document.getElementById("myRequestName")?.textContent || "Morceau",
      artist: myRequestData.artist || document.getElementById("myRequestArtist")?.textContent || "Artiste",
      image_url: myRequestData.image_url || document.getElementById("myRequestImg")?.src || "",
    };
    generateStoryCanvas(track);
    if (storyModal) storyModal.classList.remove("hidden");
  }

  document.getElementById("btnOpenStoryShare")?.addEventListener("click", openStoryShareModal);
  document.getElementById("closeStoryModal")?.addEventListener("click", () => {
    if (storyModal) storyModal.classList.add("hidden");
  });

  document.getElementById("btnNativeShareStory")?.addEventListener("click", async () => {
    if (!storyCanvas) return;
    storyCanvas.toBlob(async (blob) => {
      if (!blob) return;
      const file = new File([blob], "music-live-story.png", { type: "image/png" });
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        try {
          await navigator.share({
            title: "Ma musique sur Music Live",
            text: "J'ai fait jouer ma musique ce soir sur Music Live ! 🎵",
            files: [file],
          });
          return;
        } catch {}
      }
      // Fallback direct download
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = "story-music-live.png";
      a.click();
      showToast("Image enregistrée pour ta Story !");
    }, "image/png");
  });

  document.getElementById("btnDownloadStory")?.addEventListener("click", () => {
    if (!storyCanvas) return;
    storyCanvas.toBlob((blob) => {
      if (!blob) return;
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = "story-music-live.png";
      a.click();
      showToast("Image téléchargée !");
    }, "image/png");
  });