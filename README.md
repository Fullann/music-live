# 🎵 Music Live App

Une application web temps réel permettant aux participants d'une soirée de proposer des musiques au DJ via QR code, avec système de votes et lecture automatique Spotify.

![Version](https://img.shields.io/badge/version-2.2.0-blue.svg)
![Node](https://img.shields.io/badge/node-%3E%3D18.0.0-green.svg)
![Tests](https://img.shields.io/badge/tests-69%20passing-brightgreen.svg)
![License](https://img.shields.io/badge/license-MIT-orange.svg)

## ✨ Fonctionnalités

### 👥 Pour les Participants
- 📱 **Accès QR Code** : Scan et accès instantané sans compte
- 🎤 **Option Karaoké ("Je veux chanter au micro ! 🎤")** : Demande spéciale alertant le DJ pour préparer un micro sur scène
- ⚡ **Mini Blind-Test Flash (15s)** : Interface de quiz interactive tactile avec 4 choix colorés, chronomètre animé, feedback immédiat et célébration sur le podium
- 🔍 **Recherche Spotify** : Recherche de musiques en temps réel
- 📊 **Système de Votes** : Vote pour/contre les musiques proposées
- ⏱️ **Suivi Temps Réel** : Statut des demandes (en attente/accepté/refusé)
- 📜 **Historique de la soirée** : Liste des demandes déjà faites sur cet appareil
- 📈 **Onglet Tendances** : Top artistes et titres les plus demandés (`/api/events/:id/trends`)
- 📲 **PWA** : Manifest dynamique + service worker (`/manifest-user.json?e=…`, `/sw-user.js`) pour « Ajouter à l’écran d’accueil »
- 🎯 **Timer Prédictif** : Estimation du temps avant lecture
- 🎧 **Preview Audio** : Écoute d'extraits des morceaux

### 🎧 Pour les DJs
- 🎛️ **Dashboard & Console Live** : Vue d'ensemble et contrôle en temps réel des événements
- 🖥️ **Mini Monitor Grand Écran** : Aperçu en direct du statut de projection (animation, mode QR vs Karaoké, spectateurs en ligne)
- ⚡ **Mini Blind-Test Flash Régie** : Déclenchement en 1 clic d'un quiz musical de transition (15s) avec sélection automatique de 3 leurres cohérents et podium en direct
- ✨ **Suggestions Roue de Camelot & BPM** : Surlignage émeraude et badges explicatifs (`Mix Parfait`, `Relatif`, `Voisins`, `Energy Boost`) sur les morceaux de la queue compatibles pour des transitions sans dissonance
- 🖥️ **Régie Multi-Display** : Raccourcis directs vers les profils d'écrans dédiés (`/screen/bar`, `/screen/stage`, `/qr`)
- 🎤 **Indicateur Paroles LRCLIB** : Petite icône 🎤 violette pour les titres disposant de paroles synchronisées prêtes pour le karaoké
- 🎙️ **Badge Demande Micro** : Signalement immédiat des invités souhaitant chanter sur scène
- 🎮 **Contrôle Écran Distant** : Bascule du mode Karaoké et changement des animations du visualiseur audio en un clic ou raccourci clavier (<kbd>K</kbd>, <kbd>V</kbd>)
- 👤 **Page Profil** (`/profile`) : Nom d’affichage, stats globales, déconnexion Spotify
- ✅ **Gestion Queue** : Acceptation/refus des demandes
- ⚡ **Actions en masse** : Tout accepter / tout refuser les demandes en attente
- ↩️ **Annuler un refus** : Barre « Annuler » quelques secondes après un refus (socket `undo-reject-request`)
- 🔄 **Réorganisation** : Drag & drop pour modifier l'ordre
- 🔁 **Anti-répétition** : Délai configurable avant de reproposer un morceau déjà joué (`repeat_cooldown_minutes`, basé sur `played_at`)
- 📈 **Statistiques Live** : Nombre de demandes, votes, taux d'acceptation
- 🛡️ **Anti-abus intelligent** : Score par invité (spam/doublons/refus), throttle progressif et quota dynamique
- 📊 **Analytics live avancées** : Heatmap horaire, top tempos, taux de skip, engagement votes + export CSV
- 🎵 **Lecture Automatique** : Intégration Spotify Player
- 📊 **Historique Détaillé** : Stats complètes des événements passés
- 🖼️ **QR personnalisé** : SVG avec nom de soirée + logo optionnel (`src/public/images/qr-logo.png`)
- ⚙️ **Paramètres Avancés** : 
  - Auto-accept des demandes
  - Activation/désactivation des votes
  - Gestion des doublons
  - Rate limiting configurable
  - Animations visualiseur audio et options de paroles grand écran

### 🌐 Pour le Grand Écran & Projection (`/event/:id/qr`, `/qrspectre`, `/screen/bar`, `/screen/stage`)
- ⏱️ **Décompte d'Intro Visuel Karaoké (3... 2... 1... CHANTEZ !)** : Anneau radial SVG dégressif à 5s et flash dynamique calé sur le 1er timestamp LRCLIB
- 🔥 **Jauge d'Énergie Live (Hype Meter) & Pyrotechnie** : Accumulateur de réactions de la salle avec décroissance naturelle et feux d'artifice de 150 particules multicolores et dorées à 100% ("Ambiance en fusion")
- 🎧 **Affichage Grand Écran Blind-Test Flash** : Disque vinyle mystère en rotation rapide, compte à rebours géant 15s et podium animé des 3 plus rapides
- 🖥️ **Profils Multi-Display Dédiés** :
  - `/screen/bar` : Grand QR Code agrandi (280-320px) et mise en avant de la file d'attente pour inciter aux commandes
  - `/screen/stage` : Visualiseur 3D haute saturation et paroles karaoké en immersion totale plein écran
- 🌌 **Visualiseur Audio Canvas 60 FPS** : Modes Spectre Cyber, Halo Circulaire Néon, Nébuleuse 3D, Onde Néon, etc.
- 🎙️ **Mode Entrée Ligne / Micro Réel** : Réactivité aux basses et à l'ambiance sonore réelle de la salle via Web Audio API
- 🎤 **Mode Karaoké Grand Format** : Paroles synchronisées LRCLIB avec défilement cinétique amorti (`cubic-bezier`) sans saccades
- 📱 **Mini QR Code Incrusté** : QR de participation discret en bas à droite pour continuer à recevoir des morceaux pendant le chant
- 📶 **Reconnexion Transparente Wi-Fi** : Pilule douce sans rechargement brutal de page et resynchronisation d'état immédiate
- 🔒 **Anti-Veille Écran** : Screen Wake Lock API pour maintenir le projecteur/TV allumé en continu
- 🖥️ **Plein Écran Natif** : Bouton dédié, double-clic ou touche <kbd>F</kbd>

## 🚀 Technologies

### Backend
- **Node.js** + **Express** : Serveur HTTP et API REST
- **Socket.IO** : Communication temps réel bidirectionnelle
- **MySQL** : Base de données relationnelle
- **Redis** : Session store (production)

### Sécurité
- **Helmet** : Protection contre les vulnérabilités web
- **Bcrypt** : Hachage sécurisé des mots de passe
- **Express Rate Limit** : Protection DDoS et brute force
- **Express Validator** : Validation des entrées
- **Sanitize HTML** : Protection XSS

### Intégrations
- **Spotify Web API** : Recherche et métadonnées
- **Spotify Web Playback SDK** : Lecture dans le navigateur
- **QRCode** : Génération de QR codes (SVG brandé : titre + logo optionnel)

## 📋 Prérequis

- Node.js >= 18.0.0
- MySQL >= 8.0
- Redis >= 6.0 (optionnel, recommandé en production)
- Compte Spotify Developer (pour API)

## 🛠️ Installation

### 1. Cloner le repository
```bash
git clone https://github.com/Fullann/music-live.git
cd music-live
```

### 2. Installer les dépendances
```bash
npm install
```

### 3. Configuration de la base de données
```bash
# Se connecter à MySQL
mysql -u root -p

# Créer la base de données
CREATE DATABASE music_live CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER 'djuser'@'localhost' IDENTIFIED BY 'votre_mot_de_passe';
GRANT ALL PRIVILEGES ON music_live.* TO 'djuser'@'localhost';
FLUSH PRIVILEGES;

# Importer le schéma
mysql -u djuser -p music_live < db/db.sql
```

### 4. Configuration Spotify
1. Aller sur [Spotify Developer Dashboard](https://developer.spotify.com/dashboard)
2. Créer une nouvelle application
3. Ajouter `http://localhost:3000/callback` aux Redirect URIs
4. Noter le Client ID et Client Secret

### 5. Variables d'environnement
```bash
cp .env.example .env
# Éditer .env avec vos valeurs
```

```env
SPOTIFY_CLIENT_ID=
SPOTIFY_CLIENT_SECRET=
SPOTIFY_REDIRECT_URI=
PORT=3000

# Configuration MySQL
DB_HOST=localhost
DB_PORT=3306
DB_USER=user
DB_PASSWORD=password
DB_NAME=

# Rate Limiting
RATE_LIMIT_MAX_REQUESTS=3
RATE_LIMIT_WINDOW_MINUTES=15

SESSION_SECRET=4ac8819610014adfe9fbdc35e1872ff5e7c5d33278d98a3d3402b459588256d3

# Redis
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=
```

### 6. Lancer l'application
```bash
# Développement (avec nodemon)
npm run dev

# Production
npm start
```

L'application sera accessible sur `http://localhost:3000`

## 📁 Structure du Projet

```
music-live/
├── src/
│   ├── config/          # Configuration (DB, Redis, Session)
│   ├── controllers/     # Logique métier
│   ├── middlewares/     # Auth, Sécurité, Validation
│   ├── routes/          # Routes API
│   ├── services/        # Services métier (Queue, RateLimit)
│   ├── sockets/         # Gestion WebSocket
│   ├── validators/      # Schémas de validation
│   ├── views/           # Pages HTML
│   ├── public/          # CSS, JS, SW PWA (`sw-user.js`)
│   └── server.js        # Point d'entrée
├── db/                  # Schéma + migrations SQL
├── .env                 # Variables d'environnement
├── .env.example         # Template .env
└── package.json
```

## 🔐 API Endpoints

### Authentification
```
GET    /api/auth/spotify/login   - OAuth Spotify (connexion DJ)
POST   /api/auth/logout          - Déconnexion session
GET    /api/auth/me              - Profil DJ connecté
PATCH  /api/auth/me              - Mettre à jour le nom d’affichage
GET    /api/auth/stats           - Stats globales (soirées, demandes)
POST   /api/auth/spotify/disconnect - Révoquer les jetons Spotify stockés (table djs)
```

### Événements
```
POST   /api/events                          - Créer événement
GET    /api/events/:eventId                 - Info événement (+ queue)
GET    /api/events/:eventId/trends          - Tendances publiques (top artistes / titres)
GET    /api/events/:eventId/guest-history/:clientId - Historique des demandes d’un invité
PATCH  /api/events/:eventId/settings       - Réglages (votes, anti-répétition…) — DJ propriétaire
GET    /api/events/:eventId/qrcode          - QR Code (data URL SVG brandé)
GET    /api/events/:eventId/stats           - Statistiques
GET    /api/events/:eventId/live-stats      - Stats live (propriétaire)
GET    /api/events/:eventId/live-stats.csv  - Export CSV des stats live (propriétaire)
POST   /api/events/:eventId/end             - Terminer événement
POST   /api/events/:eventId/toggle-votes    - Activer/désactiver votes
POST   /api/events/:eventId/toggle-duplicates - Autoriser doublons
POST   /api/events/:eventId/toggle-auto-accept - Auto-accept
```

### Monitoring & PWA (hors `/api`)
```
GET    /health                   - Santé app : { status, uptime, db, redis }
GET    /manifest-user.json?e=<UUID> - Manifest Web App (page invité)
GET    /sw-user.js               - Service worker minimal (enregistré par la page invité)
```

### Dashboard DJ
```
GET    /api/dj/dashboard                    - Events actifs + stats
GET    /api/dj/history                      - Events terminés
GET    /api/dj/:eventId/detailed-stats      - Stats détaillées
```

### Spotify
```
GET    /api/spotify/search                  - Recherche musiques
GET    /api/spotify/status/:eventId         - Statut connexion
GET    /api/spotify/login/:eventId          - URL auth Spotify
GET    /api/spotify/token/:eventId          - Token pour player
POST   /api/spotify/play/:eventId           - Lire musique
```

## 🔌 WebSocket Events

### Client → Server
```javascript
'join-event'             // Rejoindre un événement
'request-song'           // Demander une musique (avec option isKaraoke)
'vote'                   // Voter (up/down)
'accept-request'         // (DJ) Accepter une demande
'reject-request'         // (DJ) Refuser une demande
'undo-reject-request'    // (DJ) Annuler un refus récent → repasse en pending
'accept-all-pending'     // (DJ) Accepter toutes les demandes en attente
'reject-all-pending'     // (DJ) Refuser toutes les demandes en attente
'reorder-queue'          // (DJ) Réorganiser queue
'mark-played'            // (DJ) Marquer comme jouée
'mark-skipped'           // (DJ) Marquer un skip (next avant ~85%)
'update-event-settings'  // (DJ) Incl. repeatCooldownMinutes (anti-répétition)
'set-screen-visualizer'  // (DJ) Changer l'effet visuel grand écran à distance
'set-karaoke-mode'       // (DJ) Activer / configurer le karaoké grand écran
'start-blind-test'       // (DJ) Lancer un mini Blind-Test Flash (15s)
'submit-blind-test-answer' // (Invité) Soumettre une réponse au Blind-Test
'end-blind-test'         // (DJ) Clôturer manuellement le Blind-Test
```

### Server → Client
```javascript
'queue-updated'               // Queue mise à jour
'new-request'               // Nouvelle demande (ou retour pending après undo)
'request-accepted'          // Demande acceptée
'request-rejected'          // Demande refusée
'reject-undone'             // Refus annulé côté room
'your-request-pending-again'// Invité : sa demande est à nouveau en attente
'request-error'             // Erreur demande (incl. repeat-cooldown / abuse-throttle)
'vote-updated'              // Votes mis à jour
'event-ended'               // Événement terminé
'screen-visualizer-updated' // Mode d'animation grand écran synchronisé
'karaoke-mode-updated'      // État et taille des paroles karaoké synchronisés
'blind-test-started'        // Session Blind-Test démarrée (options diffusées aux invités)
'blind-test-dj-started'     // Confirmation au DJ avec bonne réponse
'blind-test-answer-ack'     // Accusé de réception de réponse invité
'blind-test-activity'       // Compteur de réponses live
'blind-test-results'        // Révélation du morceau et podium des gagnants
```

## 🎨 Interface Utilisateur

### Pages Publiques
- `/login` - Connexion DJ
- `/register` - Inscription DJ
- `/user/:eventId` - Interface participant (scan QR)
- `/thank-you` - Page de fin d'événement

### Pages DJ (authentifiées)
- `/dashboard` - Liste événements actifs
- `/profile` - Profil DJ (nom, stats, Spotify)
- `/dj/:eventId` - Console DJ (gestion queue, blind-test, monitor d'écrans)
- `/event/:eventId/qr` - Affichage Grand Écran Standard
- `/event/:eventId/screen/bar` - Affichage Grand Écran Profil Bar (Grand QR & queue)
- `/event/:eventId/screen/stage` - Affichage Grand Écran Profil Scène (Visualiseur 3D & Karaoké)
- `/history` - Historique événements
- `/event/:eventId/stats` - Statistiques détaillées

## 🔒 Sécurité

- ✅ Hachage bcrypt avec 12 rounds
- ✅ Helmet avec CSP configuré
- ✅ Rate limiting multi-niveaux
- ✅ Sanitization des inputs
- ✅ Validation stricte des données
- ✅ Sessions sécurisées (httpOnly, sameSite)
- ✅ Protection CSRF (double-submit cookie + vérification serveur)
- ✅ Requêtes SQL préparées
- ✅ HTTPS obligatoire en production

## 📊 Rate Limiting

| Type | Limite | Fenêtre | Routes |
|------|--------|---------|--------|
| Global | 500 req | 15 min | Toutes (prod) — `GET /health` exclu |
| Auth | 10 req | 15 min | Login/Register |
| API | 60 req | 1 min | /api/* |
| User Requests | 3 req | 15 min | Demandes musique (configurable) |

## 🚀 Déploiement

### Avec Docker (recommandé)
```bash
# TODO: Créer docker-compose.yml
docker-compose up -d
```

### Manuel
1. Configurer MySQL + Redis sur le serveur
2. Cloner et installer dépendances
3. Configurer `.env` pour production
4. Build (si applicable)
5. Utiliser PM2 pour process management
```bash
npm install -g pm2
pm2 start src/server.js --name music-live
pm2 startup
pm2 save
```

### Déploiement automatique (GitHub Actions + o2switch FTPS)

Le workflow est fourni dans `.github/workflows/deploy-o2switch.yml`.

Il déploie automatiquement sur push `main` (et manuellement via `workflow_dispatch`) via FTPS.

#### 1) Secrets GitHub à créer

Dans `Settings > Secrets and variables > Actions`, ajoute:
- `SFTP_HOST` : hôte FTP/FTPS o2switch
- `SFTP_PORT` : port FTP/FTPS (souvent `21`)
- `SFTP_USER` : utilisateur FTP
- `SFTP_PASSWORD` : mot de passe FTP
- `SFTP_TARGET_DIR` : dossier cible (ex: `/www/`)

#### 2) Préparer le serveur o2switch

```bash
# Créer le .env en production (non versionné)
nano /chemin/vers/votre/app/.env

# Installer PM2 (si pas déjà fait)
npm install -g pm2
```

#### 3) Premier lancement PM2 (une seule fois)

```bash
cd /chemin/vers/votre/app
npm ci --omit=dev
pm2 start src/server.js --name music-live
pm2 save
```

Ensuite, chaque push sur `main` déclenche le déploiement automatique.

### Variables d'environnement Production
- `NODE_ENV=production`
- `BASE_URL=https://votre-domaine.com`
- Cookie `secure: true` automatique
- Redis obligatoire
- HTTPS requis

### Monitoring
- Sonde HTTP recommandée : `GET https://votre-domaine.com/health`
- Réponse typique : `{ "status": "ok", "uptime": 12345, "db": "ok", "redis": "ok" | "skipped" }`
- Code **503** si MySQL ou Redis (production) est en erreur

## 🧪 Tests

La suite de tests automatisée utilise le runner natif `node:test` et `node:assert/strict` :

```bash
# Lancer tous les tests unitaires
npm test
```

Actuellement **69 tests unitaires passent avec 100% de succès** :
- Pénalités et seuils du service anti-abus
- Batching haute concurrence des votes et réactions
- Détection harmonique et Roue de Camelot (`getCamelotInfo`, `getHarmonicMatch`)
- Analyseur de paroles LRCLIB
- Génération de QR codes brandés SVG
- Assainissement et middlewares de sécurité
- Décompte d'intro visuel Karaoké (3-2-1 Chantez)
- Jauge d'énergie Hype Meter et pyrotechnie
- Moteur de Blind-Test Flash et classement au centième de seconde
- Résolution des profils d'affichage multi-écrans (`bar`, `stage`, `standard`)
- Utilitaires temporels et validateurs Express

## 📈 Roadmap

- [x] Endpoint `/health` pour monitoring externe (UptimeRobot, Better Stack…)
- [x] Tests unitaires complets (69 tests unitaires natifs `node:test`)
- [x] CI/CD automatique FTPS vers o2switch avec GitHub Actions
- [x] Roue de Camelot & suggestions harmoniques en queue DJ
- [x] Mode Karaoké distant avec décompte d'intro et scroll cinétique
- [x] Jauge d'Énergie Live (Hype Meter) & feux d'artifice 100%
- [x] Mini Blind-Test Flash de transition (15s)
- [x] Profils d'Écrans Multiples (`/screen/bar` vs `/screen/stage`)
- [ ] Docker Compose complet
- [ ] Monitoring avec Sentry
- [ ] Mode playlist automatique
- [ ] Support multi-langues
- [ ] Application mobile (React Native)
- [ ] Intégration YouTube Music
- [ ] Thèmes personnalisables

## 🤝 Contribution

Les contributions sont les bienvenues !

1. Fork le projet
2. Créer une branche (`git checkout -b feature/amazing-feature`)
3. Commit les changements (`git commit -m 'Add amazing feature'`)
4. Push (`git push origin feature/amazing-feature`)
5. Ouvrir une Pull Request

## 📝 License

MIT License - voir [LICENSE](LICENSE)

## 👨‍💻 Auteur

Créé pour gérer les demandes musicales lors des soirées de la société de gym.

## 🙏 Remerciements

- Spotify Web API
- Socket.IO
- Express.js
- Toute la communauté open source

---

⭐ Si ce projet t'aide, n'hésite pas à lui donner une étoile sur GitHub !