/**
 * dashboard.js — Logique métier et affichage de la console DJ Music Live
 * Gère les métriques audio pro, les soirées en direct, les soirées passées et l'accès direct aux statistiques.
 */

let djData = null;
let currentTab = "all"; // "all" | "active" | "past" | "top"

// ── Navigation Mobile Sidebar ──
function openMobileSidebar() {
  document.getElementById("mobileSidebar")?.classList.remove("hidden");
  document.getElementById("mobileSidebarOverlay")?.classList.remove("hidden");
}
function closeMobileSidebar() {
  document.getElementById("mobileSidebar")?.classList.add("hidden");
  document.getElementById("mobileSidebarOverlay")?.classList.add("hidden");
}

// ── Modale Création Soirée ──
function openCreateEventModal() {
  document.getElementById("createEventModal")?.classList.remove("hidden");
  setTimeout(() => document.getElementById("eventName")?.focus(), 50);
}
function closeModal() {
  document.getElementById("createEventModal")?.classList.add("hidden");
}

// ── Modale QR Code ──
async function showQRCode(eventId, eventName) {
  try {
    const response = await fetch(`/api/events/${eventId}/qrcode`);
    const data = await response.json();
    const img = document.getElementById("qrModalImage");
    const link = document.getElementById("qrModalLink");
    const title = document.getElementById("qrModalTitle");
    if (img) img.src = data.qrCode;
    if (link) link.value = data.userUrl;
    if (title && eventName) title.textContent = `QR Code — ${eventName}`;
    document.getElementById("qrModal")?.classList.remove("hidden");
  } catch {
    window.location.href = `/event/${eventId}/qr`;
  }
}

// ── Navigation vers la Régie DJ ──
function goToDJ(eventId) {
  window.location.href = `/dj/${eventId}`;
}

// ── Clôturer une soirée ──
async function endEvent(eventId, eventName) {
  if (!confirm(`Terminer la soirée "${eventName}" ?\n\nCela va archiver la soirée et sauvegarder l'historique et les statistiques complètes.`)) return;
  try {
    const response = await fetch(`/api/events/${eventId}/end`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      cache: "no-cache",
    });
    const data = await response.json();
    if (data.success) {
      await loadDashboard();
    } else {
      alert("Erreur: " + (data.error || "Erreur inconnue"));
    }
  } catch {
    alert("Erreur lors de la fin de la soirée");
  }
}

// ── Rouvrir une soirée passée ──
async function reopenEvent(eventId, name) {
  if (!confirm(`Rouvrir la soirée "${name}" ?\n\nLa soirée redeviendra active et vous pourrez reprendre les demandes en direct.`)) return;
  try {
    const res = await fetch(`/api/events/${eventId}/reopen`, { method: "POST" });
    const data = await res.json();
    if (data.success) {
      window.location.href = `/dj/${eventId}`;
    } else {
      alert("Erreur : " + (data.error || "Impossible de rouvrir"));
    }
  } catch {
    alert("Erreur réseau lors de la réouverture");
  }
}

// ── Création de soirée (Form Submit) ──
async function handleCreateEvent(e) {
  e.preventDefault();
  const name = document.getElementById("eventName").value.trim();
  const scheduleToggle = document.getElementById("scheduleToggle");
  const startsAtInput = document.getElementById("startsAt");
  const starts_at = scheduleToggle?.checked && startsAtInput?.value
    ? new Date(startsAtInput.value).toISOString()
    : null;

  try {
    const response = await fetch("/api/events", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, starts_at }),
    });
    const data = await response.json();
    if (response.ok) {
      closeModal();
      document.getElementById("eventName").value = "";
      await loadDashboard();
      showQRCode(data.eventId, name);
    } else {
      alert(data.error || "Erreur création soirée");
    }
  } catch {
    alert("Erreur réseau lors de la création");
  }
}

// ── Déconnexion ──
async function logout() {
  try { await fetch("/api/auth/logout", { method: "POST" }); } catch {}
  window.location.href = "/login";
}

// ── Formatage des durées (Minutes -> Xh YYmin) ──
function formatDuration(minutes) {
  if (!minutes || minutes <= 0) return "< 1 min";
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m} min`;
  return `${h}h ${m.toString().padStart(2, "0")}min`;
}

// ── Filtrage par onglet ──
function setDashboardTab(tab) {
  currentTab = tab;
  document.querySelectorAll(".dash-tab-btn").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.tab === tab);
  });

  const secActive = document.getElementById("sectionActiveEvents");
  const secPast = document.getElementById("sectionPastEvents");
  const secTop = document.getElementById("sectionTopSongs");

  if (tab === "all") {
    secActive?.classList.remove("hidden");
    secPast?.classList.remove("hidden");
    secTop?.classList.remove("hidden");
  } else if (tab === "active") {
    secActive?.classList.remove("hidden");
    secPast?.classList.add("hidden");
    secTop?.classList.add("hidden");
  } else if (tab === "past") {
    secActive?.classList.add("hidden");
    secPast?.classList.remove("hidden");
    secTop?.classList.add("hidden");
  } else if (tab === "top") {
    secActive?.classList.add("hidden");
    secPast?.classList.add("hidden");
    secTop?.classList.remove("hidden");
  }
}

// ── Rendu des soirées actives (Live Decks) ──
function renderActiveEvents(events) {
  const container = document.getElementById("activeEventsList");
  const badgeCount = document.getElementById("activeBadgeCount");
  if (badgeCount) badgeCount.textContent = (events || []).length;

  if (!events || events.length === 0) {
    container.innerHTML = `
      <div class="px-6 py-12 text-center flex flex-col items-center justify-center gap-3">
        <div class="w-14 h-14 rounded-2xl flex items-center justify-center" style="background:var(--bg-elevated);border:1px solid var(--border)">
          <svg class="w-7 h-7" style="color:var(--text-muted)" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
            <path d="M3 18v-6a9 9 0 0 1 18 0v6"/><path d="M21 19a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3z"/><path d="M3 19a2 2 0 0 0 2 2h1a2 2 0 0 0 2-2v-3a2 2 0 0 0-2-2H3z"/>
          </svg>
        </div>
        <div>
          <p class="text-sm font-semibold" style="color:var(--text-primary)">Aucune soirée en direct actuellement</p>
          <p class="text-xs mt-1 max-w-sm mx-auto" style="color:var(--text-muted)">Lancez une nouvelle soirée pour générer un QR code interactif et permettre à votre public de voter pour les prochains sons.</p>
        </div>
        <button onclick="openCreateEventModal()" class="btn btn-primary btn-sm mt-2">
          <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          Lancer une soirée maintenant
        </button>
      </div>`;
    return;
  }

  container.innerHTML = events.map((event) => {
    const isScheduled = event.starts_at && new Date(event.starts_at) > new Date();
    const dateFormatted = new Date(event.created_at).toLocaleDateString("fr-FR", {
      day: "numeric", month: "short", hour: "2-digit", minute: "2-digit",
    });
    const escapedName = event.name.replace(/'/g, "\\'");
    const acceptedCount = event.accepted_count || 0;
    const playedSongs = event.played_songs || 0;
    const rejectedSongs = event.rejected_songs || 0;
    const totalSongs = event.total_songs || 0;

    if (!isScheduled) {
      // Carte LIVE active (Glow Deck)
      return `
      <div class="p-5 sm:p-6 live-glow-card rounded-2xl mb-4 transition-all">
        <div class="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-4" style="border-bottom:1px solid rgba(255,255,255,0.08)">
          <div class="space-y-1.5">
            <div class="flex flex-wrap items-center gap-2.5">
              <span class="live-indicator-badge">
                <span class="live-pulse-dot"></span>
                En direct
              </span>
              <span class="text-xs px-2.5 py-1 rounded-full font-mono" style="background:var(--bg-elevated);color:var(--text-muted)">
                Débutée le ${dateFormatted}
              </span>
            </div>
            <h3 class="text-xl font-bold tracking-tight mt-1" style="color:var(--text-primary)">${event.name}</h3>
          </div>
          <div class="flex items-center gap-2 self-start lg:self-center">
            <div class="equalizer-bar" title="Activité audio en cours">
              <span></span><span></span><span></span><span></span>
            </div>
            <span class="text-xs font-semibold" style="color:var(--green)">Session active</span>
          </div>
        </div>

        <!-- Compteurs métriques du set -->
        <div class="grid grid-cols-2 sm:grid-cols-4 gap-3 my-4">
          <div class="p-3 rounded-xl" style="background:var(--bg-elevated);border:1px solid var(--border)">
            <p class="text-xs" style="color:var(--text-muted)">Jouées au public</p>
            <p class="text-lg font-extrabold mt-1" style="color:var(--green)">${playedSongs}</p>
          </div>
          <div class="p-3 rounded-xl" style="background:var(--bg-elevated);border:1px solid var(--border)">
            <p class="text-xs" style="color:var(--text-muted)">En attente régie</p>
            <p class="text-lg font-extrabold mt-1" style="color:var(--amber)">${acceptedCount}</p>
          </div>
          <div class="p-3 rounded-xl" style="background:var(--bg-elevated);border:1px solid var(--border)">
            <p class="text-xs" style="color:var(--text-muted)">Refusées</p>
            <p class="text-lg font-extrabold mt-1" style="color:var(--red)">${rejectedSongs}</p>
          </div>
          <div class="p-3 rounded-xl" style="background:var(--bg-elevated);border:1px solid var(--border)">
            <p class="text-xs" style="color:var(--text-muted)">Total demandes</p>
            <p class="text-lg font-extrabold mt-1" style="color:var(--text-primary)">${totalSongs}</p>
          </div>
        </div>

        <!-- Barre d'action complète -->
        <div class="flex flex-wrap items-center justify-between gap-2.5 pt-2">
          <div class="flex flex-wrap items-center gap-2">
            <button onclick="goToDJ('${event.id}')" class="btn btn-primary btn-sm font-semibold shadow-lg shadow-purple-500/20">
              <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M3 18v-6a9 9 0 0 1 18 0v6"/><path d="M21 19a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3z"/><path d="M3 19a2 2 0 0 0 2 2h1a2 2 0 0 0 2-2v-3a2 2 0 0 0-2-2H3z"/>
              </svg>
              Régie DJ Live
            </button>
            <a href="/event/${event.id}/qr" target="_blank" class="btn btn-ghost btn-sm" style="color:var(--cyan);border-color:rgba(6,182,212,0.3)">
              <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <rect x="2" y="3" width="20" height="14" rx="2" ry="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/>
              </svg>
              Mode Écran Géant
            </a>
            <button onclick="showQRCode('${event.id}', '${escapedName}')" class="btn btn-ghost btn-sm">
              <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="3" height="3"/>
              </svg>
              QR Code
            </button>
            <a href="/event/${event.id}/stats" class="btn btn-ghost btn-sm" style="color:var(--accent)">
              <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/>
              </svg>
              Stats en direct
            </a>
          </div>
          <button onclick="endEvent('${event.id}', '${escapedName}')" class="btn btn-danger btn-sm">
            <svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"/><rect x="9" y="9" width="6" height="6"/></svg>
            Clôturer
          </button>
        </div>
      </div>`;
    } else {
      // Carte Planifiée
      const scheduledOpen = new Date(event.starts_at).toLocaleString("fr-FR", {
        day: "numeric", month: "long", hour: "2-digit", minute: "2-digit",
      });
      return `
      <div class="p-5 rounded-2xl mb-4 transition-all" style="background:var(--bg-surface);border:1px solid rgba(245,158,11,0.3)">
        <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <div class="flex items-center gap-2 mb-1">
              <span class="badge shrink-0" style="background:rgba(245,158,11,0.15);color:var(--amber);border:1px solid rgba(245,158,11,0.3)">
                🟡 Planifiée
              </span>
              <h3 class="font-bold text-base truncate" style="color:var(--text-primary)">${event.name}</h3>
            </div>
            <p class="text-xs" style="color:var(--amber)">Ouverture programmée : ${scheduledOpen}</p>
          </div>
          <div class="flex flex-wrap items-center gap-2">
            <button onclick="showQRCode('${event.id}', '${escapedName}')" class="btn btn-ghost btn-sm">
              <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="3" height="3"/></svg>
              QR Code
            </button>
            <button onclick="goToDJ('${event.id}')" class="btn btn-primary btn-sm">
              Préparer la régie
            </button>
            <button onclick="endEvent('${event.id}', '${escapedName}')" class="btn btn-ghost btn-sm text-red-400">
              Annuler
            </button>
          </div>
        </div>
      </div>`;
    }
  }).join("");
}

// ── Rendu des soirées passées avec accès direct aux statistiques ──
function renderPastEvents(events) {
  const container = document.getElementById("pastEventsList");
  const badgeCount = document.getElementById("pastBadgeCount");
  if (badgeCount) badgeCount.textContent = (events || []).length;

  if (!events || events.length === 0) {
    container.innerHTML = `
      <div class="px-5 py-10 text-center text-sm" style="color:var(--text-muted)">
        Aucune soirée passée enregistrée pour le moment.
      </div>`;
    return;
  }

  container.innerHTML = `
    <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
      ${events.map((event) => {
        const startDate = new Date(event.created_at);
        const endDate = new Date(event.ended_at);
        const dateStr = startDate.toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" });
        const durationMinutes = event.duration_minutes || Math.max(1, Math.floor((endDate - startDate) / (1000 * 60)));
        const playedCount = event.played_songs || 0;
        const totalCount = event.total_songs || 0;
        const successRate = totalCount > 0 ? Math.round((playedCount / totalCount) * 100) : 0;
        const escapedName = event.name.replace(/'/g, "\\'");

        return `
        <div class="p-5 rounded-2xl dash-card flex flex-col justify-between transition hover:-translate-y-0.5">
          <div>
            <div class="flex items-center justify-between gap-2 mb-2">
              <h3 class="font-bold text-base truncate" style="color:var(--text-primary)">${event.name}</h3>
              <span class="badge shrink-0 text-xs" style="background:var(--bg-elevated);color:var(--text-secondary)">
                ${formatDuration(durationMinutes)}
              </span>
            </div>
            <p class="text-xs mb-4" style="color:var(--text-muted)">Mixé le ${dateStr}</p>
            
            <!-- Statistiques résumées de la soirée -->
            <div class="grid grid-cols-3 gap-2 p-3 rounded-xl mb-4" style="background:var(--bg-elevated)">
              <div class="text-center">
                <p class="text-[10px] uppercase font-bold tracking-wider" style="color:var(--text-muted)">Diffusées</p>
                <p class="text-sm font-extrabold mt-0.5" style="color:var(--green)">${playedCount}</p>
              </div>
              <div class="text-center">
                <p class="text-[10px] uppercase font-bold tracking-wider" style="color:var(--text-muted)">Demandes</p>
                <p class="text-sm font-extrabold mt-0.5" style="color:var(--text-primary)">${totalCount}</p>
              </div>
              <div class="text-center">
                <p class="text-[10px] uppercase font-bold tracking-wider" style="color:var(--text-muted)">Satisfaction</p>
                <p class="text-sm font-extrabold mt-0.5" style="color:var(--accent)">${successRate}%</p>
              </div>
            </div>
          </div>

          <!-- Boutons d'action : Accès direct aux stats détaillées -->
          <div class="flex items-center justify-between gap-2 pt-2 border-t" style="border-color:var(--border)">
            <button onclick="reopenEvent('${event.id}', '${escapedName}')" class="btn btn-ghost btn-sm text-xs" title="Reprendre cette session">
              <svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 .49-4.95"/></svg>
              Rouvrir
            </button>
            <a href="/event/${event.id}/stats" class="btn btn-ghost btn-sm text-xs font-semibold" style="color:var(--accent);background:var(--accent-dim)">
              <svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/>
              </svg>
              Voir les Statistiques
            </a>
          </div>
        </div>`;
      }).join("")}
    </div>`;
}

// ── Rendu du Top Morceaux ──
function renderTopSongs(songs) {
  const container = document.getElementById("topSongsList");
  if (!songs || songs.length === 0) {
    container.innerHTML = `<div class="px-5 py-10 text-center text-sm" style="color:var(--text-muted)">Aucun morceau joué pour le moment</div>`;
    return;
  }

  container.innerHTML = `
    <div class="overflow-x-auto">
      <table class="w-full text-left text-sm">
        <thead>
          <tr class="text-xs uppercase tracking-wider font-semibold" style="color:var(--text-muted);border-bottom:1px solid var(--border)">
            <th class="py-3 px-4 w-12 text-center">Rang</th>
            <th class="py-3 px-4">Titre</th>
            <th class="py-3 px-4">Artiste</th>
            <th class="py-3 px-4 text-center">Diffusions</th>
            <th class="py-3 px-4 text-center">Votes Moyens</th>
          </tr>
        </thead>
        <tbody class="divide-y" style="border-color:var(--border)">
          ${songs.slice(0, 10).map((song, i) => {
            const medal = i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : `#${i + 1}`;
            return `
            <tr class="hover:bg-[var(--bg-elevated)] transition">
              <td class="py-3.5 px-4 text-center font-bold text-base">${medal}</td>
              <td class="py-3.5 px-4 font-semibold" style="color:var(--text-primary)">${song.song_name}</td>
              <td class="py-3.5 px-4" style="color:var(--text-secondary)">${song.artist}</td>
              <td class="py-3.5 px-4 text-center font-bold" style="color:var(--green)">${song.play_count}</td>
              <td class="py-3.5 px-4 text-center font-semibold" style="color:var(--accent)">
                ★ ${(parseFloat(song.avg_upvotes) || 0).toFixed(1)}
              </td>
            </tr>`;
          }).join("")}
        </tbody>
      </table>
    </div>`;
}

// ── Chargement principal des données ──
async function loadDashboard() {
  try {
    const response = await fetch("/api/dj/dashboard");
    if (response.status === 401) {
      window.location.href = "/login";
      return;
    }
    if (!response.ok) throw new Error("Erreur chargement dashboard");
    djData = await response.json();

    // Textes DJ
    const djName = djData.dj?.name || "DJ";
    document.querySelectorAll(".dj-name-text").forEach(el => el.textContent = djName);
    const welcomeEl = document.getElementById("welcomeDjTitle");
    if (welcomeEl) welcomeEl.textContent = `Bienvenue, ${djName}`;

    // Métriques globales
    const totalEvents = parseInt(djData.stats?.totalEvents) || 0;
    const totalSongs = parseInt(djData.stats?.totalSongs) || 0;
    const avgVotes = (parseFloat(djData.stats?.avgVotes) || 0).toFixed(1);
    const acceptRate = djData.stats?.acceptRate || "0%";

    const elEvents = document.getElementById("statTotalEvents");
    const elSongs = document.getElementById("statTotalSongs");
    const elVotes = document.getElementById("statAvgVotes");
    const elRate = document.getElementById("statAcceptRate");

    if (elEvents) elEvents.textContent = totalEvents;
    if (elSongs) elSongs.textContent = totalSongs;
    if (elVotes) elVotes.textContent = avgVotes;
    if (elRate) elRate.textContent = acceptRate;

    // Événements actifs & passés
    const activeEvents = (djData.events || []).filter((e) => !e.ended_at);
    const pastEvents = djData.pastEvents || [];

    // Indicateur Live dans le header
    const liveHeaderPill = document.getElementById("liveStatusPill");
    if (liveHeaderPill) {
      if (activeEvents.length > 0) {
        liveHeaderPill.innerHTML = `
          <span class="live-indicator-badge cursor-pointer" onclick="goToDJ('${activeEvents[0].id}')">
            <span class="live-pulse-dot"></span>
            ${activeEvents.length} En Direct
          </span>`;
      } else {
        liveHeaderPill.innerHTML = `
          <span class="text-xs px-3 py-1 rounded-full font-medium" style="background:var(--bg-elevated);color:var(--text-muted)">
            Studio Prêt
          </span>`;
      }
    }

    renderActiveEvents(activeEvents);
    renderPastEvents(pastEvents);
    renderTopSongs(djData.topSongs || []);
  } catch (error) {
    console.error("Erreur dashboard:", error);
    const container = document.getElementById("activeEventsList");
    if (container) {
      container.innerHTML = `<div class="px-5 py-8 text-center text-sm" style="color:var(--red)">Erreur de chargement des données. Veuillez rafraîchir la page.</div>`;
    }
  }
}

// ── Initialisation des événements au DOMContentLoaded ──
document.addEventListener("DOMContentLoaded", () => {
  // Mobile sidebar
  document.getElementById("mobileSidebarBtn")?.addEventListener("click", openMobileSidebar);
  document.getElementById("mobileSidebarCloseBtn")?.addEventListener("click", closeMobileSidebar);
  document.getElementById("mobileSidebarOverlay")?.addEventListener("click", closeMobileSidebar);

  // Boutons modale création
  document.getElementById("btnCreateEvent")?.addEventListener("click", openCreateEventModal);
  document.getElementById("btnCreateEventHero")?.addEventListener("click", openCreateEventModal);
  document.getElementById("btnCancelModal")?.addEventListener("click", closeModal);
  document.getElementById("btnCancelModal2")?.addEventListener("click", closeModal);
  document.getElementById("createEventModal")?.addEventListener("click", (e) => {
    if (e.target.id === "createEventModal") closeModal();
  });
  document.getElementById("createEventForm")?.addEventListener("submit", handleCreateEvent);

  // Toggle planification
  document.getElementById("scheduleToggle")?.addEventListener("change", (e) => {
    document.getElementById("scheduleFields")?.classList.toggle("hidden", !e.target.checked);
  });

  // Déconnexions
  document.getElementById("btnLogout")?.addEventListener("click", logout);
  document.getElementById("btnLogoutMobile")?.addEventListener("click", logout);
  document.getElementById("btnLogoutMobile2")?.addEventListener("click", logout);

  // Modale QR Code
  document.getElementById("qrModalClose")?.addEventListener("click", () => {
    document.getElementById("qrModal")?.classList.add("hidden");
  });
  document.getElementById("qrModalCopy")?.addEventListener("click", () => {
    const input = document.getElementById("qrModalLink");
    if (input) {
      input.select();
      navigator.clipboard?.writeText(input.value).catch(() => {
        document.execCommand("copy");
      });
      const btn = document.getElementById("qrModalCopy");
      if (btn) {
        btn.textContent = "Copié !";
        setTimeout(() => btn.textContent = "Copier", 2000);
      }
    }
  });

  // Raccourci Échap
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      closeModal();
      document.getElementById("qrModal")?.classList.add("hidden");
      closeMobileSidebar();
    }
  });

  // Filtres d'onglets
  document.querySelectorAll(".dash-tab-btn").forEach((btn) => {
    btn.addEventListener("click", () => setDashboardTab(btn.dataset.tab));
  });

  // Chargement initial
  loadDashboard();
});
