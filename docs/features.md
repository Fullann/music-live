# Guide fonctionnel

Description complète de toutes les fonctionnalités de Music Live.

---

## Pages et interfaces

| Page | URL | Public | Description |
|------|-----|--------|-------------|
| Accueil | `/` | Oui | Présentation + lien connexion Spotify |
| Connexion DJ | `/login` | Oui | Bouton "Se connecter avec Spotify" |
| Dashboard | `/dashboard` | DJ | Gestion des soirées actives |
| Profil DJ | `/profile` | DJ | Nom affiché, stats globales, déconnexion Spotify |
| Interface DJ | `/dj/:eventId` | DJ | Contrôle temps réel de la soirée |
| Interface modérateur | `/mod/:eventId?token=...` | Modérateur (lien) | Gestion des demandes déléguée |
| Page invité | `/user/:eventId` | Invité | Proposer des chansons, option micro, voter |
| Écran grand format | `/event/:eventId/qr` ou `/qrspectre` | Public | Affichage TV/projecteur (visualiseur audio, karaoké, QR) |
| Statistiques | `/event/:eventId/stats` | DJ | Stats live et post-événement |
| Historique | `/history` | DJ | Soirées terminées |
| Erreur | `/error?code=...` | Tous | Page d'erreur branded |

---

## Dashboard DJ

**URL :** `/dashboard`

### Fonctionnalités

- **Liste des soirées actives** : nom, date, nombre de demandes, demandes en attente
- **Création d'une soirée** : saisir un nom → génération automatique du **QR brandé** (nom de la soirée sur l’image ; logo optionnel : fichier `src/public/images/qr-logo.png`) et des liens
- **Accès rapide** : boutons "Ouvrir DJ", "QR Code", "Stats" pour chaque soirée
- **Lien invité** : URL à partager ou QR code à projeter
- **Fin de soirée** : bouton "Terminer" qui clôt la soirée et notifie les invités
- **Mise à jour en temps réel** : une nouvelle soirée apparaît immédiatement sans rafraîchissement
- **Lien Profil** : accès à `/profile` depuis la barre latérale (desktop) et le menu mobile

---

## Profil DJ

**URL :** `/profile`

- Modifier le **nom d’affiché** (`PATCH /api/auth/me`)
- Voir des **statistiques globales** : nombre de soirées, soirées encore actives, total de demandes (`GET /api/auth/stats`)
- **Déconnecter Spotify** : efface les jetons sur la ligne `djs` (`POST /api/auth/spotify/disconnect`) — les soirées en cours peuvent nécessiter une nouvelle liaison Spotify pour la lecture
- **Déconnexion session** : comme sur le dashboard

---

## Interface DJ

**URL :** `/dj/:eventId`

### Mini Monitor Grand Écran

Widget interactif temps réel situé au-dessus des decks DJ :
- **Statut de l'écran en direct** : *"Mode QR Standard"* ou *"🎤 Karaoké En Direct"* avec badge et pulsation
- **Animation active** : *"Spectre Cyber"*, *"Halo Circulaire"*, *"Nébuleuse 3D"*, etc.
- **Compteur de spectateurs** : nombre d'écrans et invités connectés en ligne (`spectator-count`)
- **Raccourcis rapides** : bascule directe du karaoké, cycle des animations visualiseur, ouverture de l'écran

### Queue de lecture

La queue affiche les chansons acceptées dans leur ordre de lecture. Chaque carte contient :
- Pochette, titre, artiste
- **Indicateur paroles disponibles** : petite icône 🎤 violette si des paroles synchronisées existent sur LRCLIB
- **Badge Demande Karaoké** : mention spéciale si l'invité a demandé à chanter au micro
- Métadonnées musicales : BPM (ou popularité si BPM indisponible), tonalité, énergie
- Durée formatée
- Bouton **Play** (lecture immédiate)
- Bouton **Preview** (écoute 30s sur sortie séparée, voir [Preview](#preview-30-secondes))
- Poignée de drag & drop pour réorganiser l'ordre

### Trier la queue

Bouton "Trier" : trie les chansons acceptées par BPM décroissant (ou popularité si BPM non disponible), facilitant les transitions harmonieuses.

### Demandes en attente

Liste des demandes `pending` avec :
- Infos chanson + invité
- **Indicateur paroles LRCLIB** (🎤 violette) et **badge demande micro**
- Boutons **Accepter** / **Refuser**
- **Tout accepter** / **Tout refuser** : traite toutes les demandes en attente d’un coup (socket `accept-all-pending` / `reject-all-pending`)
- Après un **refus unitaire**, une barre **Annuler** permet de remettre la demande en `pending` pendant quelques secondes (`undo-reject-request`)
- Bouton **Preview** (écouter avant de décider)
- Votes (upvotes / downvotes) si les votes sont activés

### Contrôles Distants Visualiseur & Karaoké

- Bouton rapide **🎤 Karaoké [ON/OFF]** (touche clavier <kbd>K</kbd>) : déclenche ou ferme instantanément les paroles sur le grand écran
- Bouton rapide **Animation** : fait défiler les animations du visualiseur grand écran
- Panneau de configuration avancée dans la modale de réglages (taille des paroles normal/large/xl, auto-karaoké par morceau)

### Crossfade automatique

Lorsque `crossfadeEnabled` est actif dans les réglages :
- 20 secondes avant la fin de la chanson en cours, la suivante commence à monter progressivement
- Le volume de la chanson en cours descend de 100% à 0% en 15 secondes
- La chanson suivante monte de 0% à 100% en 15 secondes
- Implémenté via l'API `setVolume()` du Spotify Web Playback SDK

### Playlist de secours

Configuration d'une playlist Spotify à jouer automatiquement quand la queue est vide :
- Coller l'URI Spotify de la playlist (`spotify:playlist:...`)
- Une chanson aléatoire est choisie dans la playlist
- S'active aussi au chargement de la page si la queue est vide
- Drapeaux `isFallbackFetching` et `isAutoPlayLocked` empêchent les lectures multiples simultanées

### Panneau de réglages

Accessible via le bouton "Réglages" (icône engrenage) :

| Réglage | Type | Description |
|---------|------|-------------|
| Votes invités | Toggle | Activer/désactiver le système de vote |
| Acceptation auto | Toggle | Accepter automatiquement toutes les demandes |
| Chansons en double | Toggle | Autoriser la même chanson plusieurs fois |
| Max demandes / invité | Nombre | Nombre max de demandes par fenêtre |
| Fenêtre (minutes) | Nombre | Durée de la fenêtre de rate limit |
| Anti-répétition (minutes) | Nombre | Délai minimum avant de reproposer un morceau déjà **joué** (0 = désactivé). Basé sur `played_at` + même `spotify_uri`. |
| Anti-abus intelligent | Auto | Score invité (spam, doublons, refus répétés) avec throttle progressif et quota dynamique |
| Playlist de secours | Texte | URI de la playlist Spotify de secours |
| Crossfade | Toggle | Activer le fondu enchaîné |
| Système de dons | Section | Voir [Dons](#système-de-dons) |
| Lien modérateur | Section | Générer/révoquer un lien de modération déléguée |

### Message DJ → invités

Champ texte en haut de l'interface DJ pour envoyer un message instantané à tous les invités connectés :
- Apparaît comme une bannière animée sur les téléphones des invités
- Déclenche une vibration `[30, 20, 30]`
- Disparaît automatiquement après 8 secondes (ou fermeture manuelle)

### Statistiques live

Bouton "Stats" : ouvre `/event/:eventId/stats` qui affiche :
- KPIs en temps réel (total demandes, jouées, en attente, personnes connectées)
- Top 5 artistes les plus demandés
- Top 5 chansons les plus demandées
- Chanson la plus votée en attente
- Timeline des demandes par tranche de 15 minutes
- Heatmap des demandes par heure (`00h` → `23h`)
- Top tempos (buckets BPM)
- Taux de skip (morceaux passés rapidement)
- Engagement votes (votes totaux, votants uniques, votes/demande)
- Bouton **Export CSV** (fin de soirée ou live) : téléchargement des données détaillées

---

## Preview 30 secondes

**Fonctionnalité DJ uniquement**

Permet au DJ d'écouter un extrait 30s d'une chanson sur une **sortie audio séparée** avant de l'accepter ou de la jouer.

### Utilisation

1. Cliquer sur l'icône casque 🎧 sur une carte (demande en attente ou queue)
2. Un mini-player apparaît en bas de l'écran avec :
   - Pochette + titre + artiste
   - Barre de progression
   - Bouton Play/Pause
   - Sélecteur de sortie audio (utilise l'API `setSinkId()`)
3. Sélectionner la sortie audio souhaitée (ex: casque DJ vs enceintes salle)

### Prérequis

- La piste doit avoir une `preview_url` (30s Spotify). Certains titres n'en ont pas.
- `setSinkId()` nécessite le flag `audiooutput` dans les permissions du navigateur.

---

## Interface invité (mobile-first)

**URL :** `/user/:eventId`

Conçue pour une utilisation sur smartphone.

### Recherche et proposition

1. Saisir un titre ou un artiste dans la barre de recherche
2. Les résultats Spotify s'affichent (pochette, titre, artiste, durée)
3. Appuyer sur une chanson → bottom sheet apparaît pour saisir son prénom
4. **Option Karaoké ("Je veux chanter au micro ! 🎤")** : case à cocher facultative pour prévenir le DJ de préparer un micro sur scène
5. Si un don est requis → voir [Dons](#système-de-dons) d'abord
6. Appuyer sur "Proposer cette chanson" → confirmation affichée

### Statut de la demande

Après proposition, la carte "Mon statut" affiche en temps réel :
- ⏳ **En attente** : la demande attend la validation du DJ
- ✅ **Acceptée** : position dans la queue
- ❌ **Refusée**
- 🎵 **En lecture** : la chanson est jouée !

Si le DJ **annule** un refus rapidement, l’invité repasse en **En attente** (événement socket `your-request-pending-again`).

### Onglet Tendances

- **Top artistes** et **top titres** les plus demandés sur la soirée (données `GET /api/events/:eventId/trends`)
- Pas besoin d’être connecté en tant que DJ

### Historique des demandes

Bloc **« Tes demandes ce soir »** : liste des dernières propositions de **cet appareil** (`clientId` persistant), avec statut (en attente, acceptée, refusée, jouée). Alimenté par `GET /api/events/:eventId/guest-history/:clientId`.

### PWA (Ajouter à l’écran d’accueil)

- Lien manifest injecté : `/manifest-user.json?e=<eventId>`
- Enregistrement du service worker `/sw-user.js` (cache minimal, installation)
- Métas `apple-mobile-web-app-*` déjà présentes pour iOS

### Notifications

À chaque changement de statut :
- **Vibration** du téléphone (`navigator.vibrate`)
- **Titre de la page** clignote (`document.title` alterne entre le statut et "Music Live")
- **Notification système** (si permission accordée)

### Indicateur de rate limit

Jauge visuelle en bas de la page affichant :
- Nombre de demandes restantes dans la fenêtre
- Temps avant réinitialisation (si limite atteinte)
- Barre de progression colorée (vert → orange → rouge)

### Musique en cours

Bande "En cours" fixée sous le header, affichant :
- Pochette de l'album
- Titre + artiste
- Barre de progression animée (interpolée en temps réel)

### Votes

Si les votes sont activés, les invités voient la queue et peuvent voter ↑ ou ↓ pour influencer l'ordre de lecture.

### Reconnexion transparente

Si la connexion réseau est coupée, à la reconnexion :
- `join-event` est ré-émis automatiquement
- `resyncState()` recharge l'état complet depuis l'API (`/api/events/:eventId` + `/api/events/:eventId/pending`)

---

## Système de dons

Le DJ peut activer un système de dons pour demander une contribution financière aux invités avant qu'ils puissent proposer des chansons.

### Configuration DJ (panneau réglages)

| Paramètre | Description |
|-----------|-------------|
| Activer les dons | Affiche la bannière/modal de don |
| Don obligatoire | Bloque les demandes tant que le don n'est pas confirmé |
| Montant suggéré | Montant affiché (0.50€ à 50.00€) |
| Lien de paiement | URL HTTPS (PayPal, Lydia, Sumeria, etc.) |
| Message personnalisé | Texte affiché aux invités (ex: "Aidez-moi à couvrir mes frais !") |

### Expérience invité

**Don optionnel :**
- Bannière en bas de l'écran avec le message, le montant et un bouton "Payer"
- L'invité peut fermer la bannière et proposer quand même

**Don obligatoire :**
- Modal plein écran bloquant
- Bouton "Payer maintenant" ouvre le lien de paiement dans un nouvel onglet
- Après 15 secondes, un bouton "J'ai payé" apparaît
- Cliquer "J'ai payé" confirme le don et débloque les propositions
- La confirmation est sauvegardée en `sessionStorage` (dure jusqu'à fermeture de l'onglet)

### Sécurité

Le don est déclaratif côté client — il n'y a pas de vérification automatique du paiement. Le système repose sur la bonne foi des invités et le lien vers un service de paiement externe.

---

## Écran grand format & Visualiseur (QR Display)

**URL :** `/event/:eventId/qr` ou `/event/:eventId/qrspectre`

Conçu pour être projeté sur un écran TV ou vidéoprojecteur dans la salle.

### Informations affichées

- **Chanson en cours** : grande pochette, titre, artiste, barre de progression dynamique
- **File d'attente** : prochaines chansons (jusqu'à 5)
- **Chansons récemment jouées**
- **QR Code d'invitation principal** : pour scanner et proposer des sons

### Visualiseur Audio Canvas 60 FPS

L'écran intègre un visualiseur audio en temps réel avec plusieurs modes :
- `cyber-spectrum` : Barres spectrales dynamiques réactives
- `radial-spectrum` : Spectre circulaire néon avec pulsation centrale
- `nebula-3d` : Particules stellaires 3D en orbite
- `neon-waveform` : Oscilloscope néon sinusoïdal
- `bass-ripple` : Ondes circulaires de basses fréquences
- `off` : Visualiseur désactivé pour économiser les ressources CPU/batterie

**Réactivité Audio Réelle :** Un bouton micro permet de brancher l'analyseur sur l'entrée ligne ou le microphone de la machine via la Web Audio API pour réagir à l'acoustique ambiante de la salle.

### Mode Karaoké Grand Format

- **Paroles synchronisées LRCLIB** : chargement instantané dès le début de la lecture
- **Défilement cinétique amorti (Smooth Lyric Scrolling)** : transition `cubic-bezier(0.22, 1, 0.36, 1)` avec accélération GPU `translate3d` pour éviter les sauts brusques sur les tempos rapides
- **Mini QR Code incrusté** : affiché discrètement en bas à droite (`#karaokeMiniQrCard`) pour continuer à récolter des propositions même pendant les chants
- **Taille de police ajustable** : normal / large / xl, synchronisée depuis la console DJ
- **Raccourci clavier** : touche <kbd>K</kbd> ou bouton tactile

### Reconnexion Transparente Wi-Fi

- En cas de coupure Wi-Fi ou réseau, une pilule douce `#screenOfflinePill` apparaît sans rechargement brutal de la page (zéro F5)
- Dès que la connexion est rétablie, l'écran réémet immédiatement `join-event` et resynchronise l'intégralité de l'état (queue, lecture, paramètres) avec un flash vert discret

### Anti-Veille Écran & Plein Écran

- **Screen Wake Lock API** : empêche la mise en veille automatique ou l'économiseur de la TV/projecteur
- **Mode Plein Écran natif** : bouton dédié, touche <kbd>F</kbd> ou double-clic sur le fond de l'écran

### Scène visuelle pilotée par BPM

- Le mode `bpm-sync` adapte la vitesse des pulsations à partir du BPM de la piste en cours (quand disponible).
- Le BPM provient des métadonnées Spotify (cache `track_audio_cache`), avec fallback silencieux si non disponible.

### Mode DVD personnalisé

- Paramètres URL supportés sur `/event/:eventId/qr` :
  - `dvd=logo&dvdLogo=https://...`
  - `dvd=text&dvdText=...`
  - `dvd=event`
- Quand un paramètre `dvd=...` est présent, le mode DVD est **verrouillé** (pas d’override aléatoire par auto-switch par track).

---

## Statistiques

**URL :** `/event/:eventId/stats`

### En cours de soirée (statistiques live)

- Nombre de personnes ayant scanné le QR / connectées
- Total des demandes, jouées, refusées, en attente
- Top artistes demandés + taux de lecture
- Top chansons + pochette
- Chanson la plus votée encore en attente
- Timeline des demandes par tranche de 15 min (pic d'activité)

### Après la soirée (statistiques post-événement)

Mêmes données mais sans les indicateurs live (connexions actives, demandes en attente).

---

## Thème dark / light

Un bouton dans le header de toutes les pages permet de basculer entre le mode sombre (défaut) et le mode clair.

Le choix est persisté dans `localStorage` et appliqué immédiatement via des classes CSS (`dark` / `light` sur `document.body`).

Implémenté dans `src/public/js/theme.js`, chargé sur toutes les pages.

---

## Page d'erreur branded

**URL :** `/error?code=404&title=...&message=...`

La page affiche un message d'erreur personnalisé basé sur les paramètres URL :

| Paramètre | Exemple | Description |
|-----------|---------|-------------|
| `code` | `404` | Code HTTP à afficher |
| `title` | `Soirée introuvable` | Titre de l'erreur |
| `message` | `Cette soirée n'existe pas.` | Description |

Des boutons contextuels apparaissent selon le code :
- `404` → "Retour à l'accueil"
- `403` → "Se connecter"
- `ended` → "Voir les statistiques"

---

## Système de modération déléguée

**URL :** `/mod/:eventId?token=...`

Le DJ peut déléguer une partie de la gestion de la soirée à un ou plusieurs modérateurs (ami, assistant, manager) sans leur donner accès à son compte Spotify.

### Générer un lien modérateur (DJ)

Dans le panneau de réglages, section "Lien modérateur" :
1. Cliquer sur **"Générer un lien modérateur"** → un token unique (64 car. hex) est stocké dans `events.mod_token`
2. Le lien complet est affiché et copiable
3. Le DJ peut **révoquer** le lien à tout moment (le token est effacé, les sessions mod actives perdent l'accès à la prochaine action)

### Connexion du modérateur

Le modérateur ouvre le lien partagé. Le serveur :
1. Vérifie que `mod_token` correspond à l'événement en cours (non terminé)
2. Crée une session `req.session.modAccess = { eventId, eventName }`
3. Sert la page `mod.html`

À partir de ce moment, le modérateur est authentifié pour cet événement uniquement, sans compte Spotify.

### Ce que le modérateur peut faire

| Action | Disponible |
|--------|-----------|
| Accepter / refuser les demandes | ✅ |
| Réorganiser la queue (drag & drop) | ✅ |
| Bloquer / débloquer un invité | ✅ |
| Envoyer un message aux invités | ✅ |
| Modifier votes, auto-accept, doublons, rate limit | ✅ |

### Ce que le modérateur ne peut pas faire

| Action | Raison |
|--------|--------|
| Lancer / contrôler la musique Spotify | Nécessite un compte Premium Spotify |
| Terminer la soirée | Action irréversible, réservée au DJ |
| Configurer les dons | Paramètre financier, réservé au DJ |
| Modifier la playlist de secours | Nécessite l'accès Spotify |
| Générer un autre lien modérateur | Réservé au DJ |

### Sécurité

- Le token est un `crypto.randomBytes(32).toString("hex")` (256 bits d'entropie)
- Stocké en clair en base mais invalide dès révocation ou fin de soirée
- La session modérateur est indépendante de la session DJ (pas de `djId`)
- Les handlers Socket.IO vérifient la session via `verifyEventAccess()` qui accepte DJ **ou** modérateur

---

## 🎤 Décompte d'Intro Visuel Karaoké (3... 2... 1... CHANTEZ !)

Afin d'éliminer le stress de l'invité qui s'apprête à chanter au micro, le grand écran affiche automatiquement un compte à rebours dynamique basé sur le timestamp de la première parole issue de LRCLIB :
- **Seuil d'activation** : Activé automatiquement si l'introduction instrumentale dure plus de 3.5 secondes.
- **5 secondes avant les paroles** : Apparition d'un disque central avec anneau radial lumineux dégressif et mention `"READY"`.
- **3... 2... 1...** : Chiffres géants animés calés à la seconde près.
- **Top départ** : Flash lumineux `"CHANTEZ ! 🎤 - C'est à vous !"` dès la première mesure chantée, puis transition fluide vers les paroles défilantes.

---

## 🔥 Jauge d'Énergie Live (Hype Meter) & Pyrotechnie Visuelle

Transforme la participation de la salle en émulation collective :
- **Agrégation temps réel** : Chaque réaction envoyée par les invités (`🔥`, `⚡`, `❤️`, `🎉`, etc.) incrémente la jauge d'énergie de +4% à +16% selon l'intensité des salves.
- **Décroissance naturelle (Decay)** : En l'absence de réactions, la jauge redescend doucement de ~1.8% par seconde.
- **Seuil 100% (Ambiance en Fusion)** : Déclenchement d'un feu d'artifice de particules multicolores et dorées sur le canvas à triple point d'impact, accompagné d'une bannière de célébration `"🔥 AMBIANCE EN FUSION 100% ! 🎉"`.

---

## ⚡ Mini Blind-Test Flash de transition

Permet au DJ de lancer en 1 clic un mini quiz musical interactif express de 15 secondes entre deux séries de morceaux :
- **Côté DJ** : Clic sur `⚡ Blind-Test` dans la barre d'outils, sélection automatique ou manuelle d'un titre, tirage de 3 leurres cohérents et diffusion instantanée.
- **Côté Invités** : Surgissement d'une interface de jeu tactile avec 4 propositions de titres/artistes colorées et chronomètre 15s. Les réponses sont horodatées à la milliseconde près.
- **Côté Grand Écran** : Disque vinyle mystère animé, compte à rebours 15s et compteur de réponses en direct.
- **Podium des Vainqueurs** : Dès la fin du chronomètre, affichage des médailles d'or 🥇, argent 🥈 et bronze 🥉 avec temps de réaction exacts sur le grand écran et sur les smartphones des gagnants.

---

## 🎛️ Suggestions Automatiques par Roue de Camelot & BPM

Optimise les transitions musicales en régie DJ grâce à la détection harmonique automatique :
- **Analyse temps réel** : Comparaison permanente entre le morceau en cours de lecture (`currentPlayingUri`) et tous les morceaux de la file d'attente.
- **Compatibilités détectées** : Mix Parfait (même clé, ex: 8B ➔ 8B), Voisins Harmoniques (8A ➔ 9A ou 7A), Relatif Majeur/Mineur (8A ➔ 8B), ou Energy Boost (+2).
- **Filtre de tempo** : Validation que l'écart de tempo $\Delta \text{BPM} \le 8$.
- **Surlignage visuel** : Les cartes de queue compatibles s'illuminent d'une bordure et d'un fond émeraude néon avec badge explicatif `✨ Transition Idéale (Mix Parfait · Δ2 BPM)`.

---

## 🖥️ Profils d'Écrans Multiples (Multi-Display)

Permet d'alimenter plusieurs téléviseurs et projecteurs avec des présentations adaptées au lieu :
- **`/event/:eventId/screen/bar`** : Profil Bar / Entrée avec QR Code géant prioritaire au centre (260-320px) et file d'attente élargie pour inciter aux commandes.
- **`/event/:eventId/screen/stage`** : Profil Scène / Dancefloor avec visualiseur audio 3D haute saturation et karaoké en immersion plein écran.
- **`/event/:eventId/qr` ou `/qrspectre`** : Profil Standard équilibré.
- Des boutons d'accès rapide sont directement intégrés dans la fenêtre QR Code de la console DJ.

---

## CI/CD et déploiement automatique

Tout push sur `main` déclenche automatiquement :
1. Archivage du code (sans `.git`, `node_modules`, `.env`)
2. Upload FTP sécurisé (FTPS) vers o2switch
3. L'app est mise à jour en production

Voir [deployment.md](./deployment.md) pour les détails.

