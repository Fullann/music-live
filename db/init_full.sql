-- MySQL dump 10.13  Distrib 8.0.44, for Linux (aarch64)
--
-- Host: localhost    Database: dj_queue
-- ------------------------------------------------------
-- Server version	8.0.44

/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!50503 SET NAMES utf8mb4 */;
/*!40103 SET @OLD_TIME_ZONE=@@TIME_ZONE */;
/*!40103 SET TIME_ZONE='+00:00' */;
/*!40014 SET @OLD_UNIQUE_CHECKS=@@UNIQUE_CHECKS, UNIQUE_CHECKS=0 */;
/*!40014 SET @OLD_FOREIGN_KEY_CHECKS=@@FOREIGN_KEY_CHECKS, FOREIGN_KEY_CHECKS=0 */;
/*!40101 SET @OLD_SQL_MODE=@@SQL_MODE, SQL_MODE='NO_AUTO_VALUE_ON_ZERO' */;
/*!40111 SET @OLD_SQL_NOTES=@@SQL_NOTES, SQL_NOTES=0 */;

--
-- Table structure for table `djs`
--

DROP TABLE IF EXISTS `djs`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `djs` (
  `id` int NOT NULL AUTO_INCREMENT,
  `email` varchar(255) NOT NULL,
  `password` varchar(255) NOT NULL,
  `name` varchar(100) NOT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `email` (`email`),
  KEY `idx_email` (`email`)
) ENGINE=InnoDB AUTO_INCREMENT=2 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Temporary view structure for view `event_history`
--

DROP TABLE IF EXISTS `event_history`;
/*!50001 DROP VIEW IF EXISTS `event_history`*/;
SET @saved_cs_client     = @@character_set_client;
/*!50503 SET character_set_client = utf8mb4 */;
/*!50001 CREATE VIEW `event_history` AS SELECT 
 1 AS `id`,
 1 AS `name`,
 1 AS `created_at`,
 1 AS `ended_at`,
 1 AS `total_requests`,
 1 AS `played_count`,
 1 AS `rejected_count`*/;
SET character_set_client = @saved_cs_client;

--
-- Table structure for table `events`
--

DROP TABLE IF EXISTS `events`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `events` (
  `id` varchar(36) NOT NULL,
  `name` varchar(255) NOT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `allow_duplicates` tinyint(1) DEFAULT '0',
  `ended_at` timestamp NULL DEFAULT NULL,
  `thank_you_message` text,
  `votes_enabled` tinyint(1) DEFAULT '1',
  `auto_accept_enabled` tinyint(1) DEFAULT '0',
  `rate_limit_max` int DEFAULT '3',
  `rate_limit_window_minutes` int DEFAULT '15',
  `dj_id` int DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `fk_dj` (`dj_id`),
  CONSTRAINT `fk_dj` FOREIGN KEY (`dj_id`) REFERENCES `djs` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `rate_limits`
--

DROP TABLE IF EXISTS `rate_limits`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `rate_limits` (
  `socket_id` varchar(100) NOT NULL,
  `request_count` int DEFAULT '0',
  `reset_at` bigint NOT NULL,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`socket_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Temporary view structure for view `request_stats`
--

DROP TABLE IF EXISTS `request_stats`;
/*!50001 DROP VIEW IF EXISTS `request_stats`*/;
SET @saved_cs_client     = @@character_set_client;
/*!50503 SET character_set_client = utf8mb4 */;
/*!50001 CREATE VIEW `request_stats` AS SELECT 
 1 AS `id`,
 1 AS `event_id`,
 1 AS `song_name`,
 1 AS `artist`,
 1 AS `status`,
 1 AS `upvotes`,
 1 AS `downvotes`,
 1 AS `net_votes`*/;
SET character_set_client = @saved_cs_client;

--
-- Table structure for table `requests`
--

DROP TABLE IF EXISTS `requests`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `requests` (
  `id` varchar(36) NOT NULL,
  `event_id` varchar(36) NOT NULL,
  `song_name` varchar(255) NOT NULL,
  `artist` varchar(255) DEFAULT NULL,
  `album` varchar(255) DEFAULT NULL,
  `image_url` text,
  `preview_url` text,
  `spotify_uri` varchar(255) DEFAULT NULL,
  `duration_ms` int DEFAULT NULL,
  `user_name` varchar(100) DEFAULT 'Anonyme',
  `socket_id` varchar(100) DEFAULT NULL,
  `status` enum('pending','accepted','rejected','played') DEFAULT 'pending',
  `queue_position` int DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `played_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_event_status` (`event_id`,`status`),
  KEY `idx_queue_position` (`event_id`,`queue_position`),
  CONSTRAINT `requests_ibfk_1` FOREIGN KEY (`event_id`) REFERENCES `events` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `spotify_tokens`
--

DROP TABLE IF EXISTS `spotify_tokens`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `spotify_tokens` (
  `event_id` varchar(36) NOT NULL,
  `access_token` text NOT NULL,
  `refresh_token` text,
  `expires_at` bigint NOT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`event_id`),
  CONSTRAINT `spotify_tokens_ibfk_1` FOREIGN KEY (`event_id`) REFERENCES `events` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `votes`
--

DROP TABLE IF EXISTS `votes`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `votes` (
  `id` int NOT NULL AUTO_INCREMENT,
  `request_id` varchar(36) NOT NULL,
  `socket_id` varchar(100) NOT NULL,
  `vote_type` enum('up','down') NOT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `unique_vote` (`request_id`,`socket_id`),
  KEY `idx_request_votes` (`request_id`),
  CONSTRAINT `votes_ibfk_1` FOREIGN KEY (`request_id`) REFERENCES `requests` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=15 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Final view structure for view `event_history`
--

/*!50001 DROP VIEW IF EXISTS `event_history`*/;
/*!50001 SET @saved_cs_client          = @@character_set_client */;
/*!50001 SET @saved_cs_results         = @@character_set_results */;
/*!50001 SET @saved_col_connection     = @@collation_connection */;
/*!50001 SET character_set_client      = latin1 */;
/*!50001 SET character_set_results     = latin1 */;
/*!50001 SET collation_connection      = latin1_swedish_ci */;
/*!50001 CREATE ALGORITHM=UNDEFINED */
/*!50001 VIEW `event_history` AS select `e`.`id` AS `id`,`e`.`name` AS `name`,`e`.`created_at` AS `created_at`,`e`.`ended_at` AS `ended_at`,count(distinct `r`.`id`) AS `total_requests`,count(distinct (case when (`r`.`status` = 'played') then `r`.`id` end)) AS `played_count`,count(distinct (case when (`r`.`status` = 'rejected') then `r`.`id` end)) AS `rejected_count` from (`events` `e` left join `requests` `r` on((`e`.`id` = `r`.`event_id`))) group by `e`.`id`,`e`.`name`,`e`.`created_at`,`e`.`ended_at` */;
/*!50001 SET character_set_client      = @saved_cs_client */;
/*!50001 SET character_set_results     = @saved_cs_results */;
/*!50001 SET collation_connection      = @saved_col_connection */;

--
-- Final view structure for view `request_stats`
--

/*!50001 DROP VIEW IF EXISTS `request_stats`*/;
/*!50001 SET @saved_cs_client          = @@character_set_client */;
/*!50001 SET @saved_cs_results         = @@character_set_results */;
/*!50001 SET @saved_col_connection     = @@collation_connection */;
/*!50001 SET character_set_client      = latin1 */;
/*!50001 SET character_set_results     = latin1 */;
/*!50001 SET collation_connection      = latin1_swedish_ci */;
/*!50001 CREATE ALGORITHM=UNDEFINED */
/*!50001 VIEW `request_stats` AS select `r`.`id` AS `id`,`r`.`event_id` AS `event_id`,`r`.`song_name` AS `song_name`,`r`.`artist` AS `artist`,`r`.`status` AS `status`,count(distinct (case when (`v`.`vote_type` = 'up') then `v`.`id` end)) AS `upvotes`,count(distinct (case when (`v`.`vote_type` = 'down') then `v`.`id` end)) AS `downvotes`,(count(distinct (case when (`v`.`vote_type` = 'up') then `v`.`id` end)) - count(distinct (case when (`v`.`vote_type` = 'down') then `v`.`id` end))) AS `net_votes` from (`requests` `r` left join `votes` `v` on((`r`.`id` = `v`.`request_id`))) group by `r`.`id`,`r`.`event_id`,`r`.`song_name`,`r`.`artist`,`r`.`status` */;
/*!50001 SET character_set_client      = @saved_cs_client */;
/*!50001 SET character_set_results     = @saved_cs_results */;
/*!50001 SET collation_connection      = @saved_col_connection */;
/*!40103 SET TIME_ZONE=@OLD_TIME_ZONE */;

/*!40101 SET SQL_MODE=@OLD_SQL_MODE */;
/*!40014 SET FOREIGN_KEY_CHECKS=@OLD_FOREIGN_KEY_CHECKS */;
/*!40014 SET UNIQUE_CHECKS=@OLD_UNIQUE_CHECKS */;
/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
/*!40111 SET SQL_NOTES=@OLD_SQL_NOTES */;

-- Dump completed on 2026-02-27 16:17:13


-- Migration: authentification via Spotify (remplacement email/password)
-- Exécuter ce script UNE seule fois sur la base de données existante.

ALTER TABLE `djs`
  ADD COLUMN `spotify_id`     VARCHAR(255) NULL UNIQUE AFTER `id`,
  ADD COLUMN `spotify_avatar` TEXT         NULL AFTER `name`,
  MODIFY COLUMN `email`    VARCHAR(255) NULL DEFAULT NULL,
  MODIFY COLUMN `password` VARCHAR(255) NULL DEFAULT NULL;

-- Supprimer l'index unique sur email (email peut maintenant être NULL pour les nouveaux comptes)
-- Note: MySQL ne permet pas plusieurs NULL dans un UNIQUE index selon la version
ALTER TABLE `djs` DROP INDEX `email`;



-- Migration: stocker les tokens Spotify du DJ directement sur le compte (pas seulement par événement)
-- Exécuter ce script UNE seule fois.

ALTER TABLE `djs`
  ADD COLUMN `sp_access_token`   TEXT   NULL AFTER `spotify_avatar`,
  ADD COLUMN `sp_refresh_token`  TEXT   NULL AFTER `sp_access_token`,
  ADD COLUMN `sp_token_expires_at` BIGINT NULL AFTER `sp_refresh_token`;


-- Migration: playlist Spotify de secours par événement
ALTER TABLE `events`
  ADD COLUMN `fallback_playlist_uri` VARCHAR(255) NULL DEFAULT NULL;


-- Migration : système de dons par événement
ALTER TABLE events
  ADD COLUMN donation_enabled    TINYINT(1)     NOT NULL DEFAULT 0    AFTER fallback_playlist_uri,
  ADD COLUMN donation_required   TINYINT(1)     NOT NULL DEFAULT 0    AFTER donation_enabled,
  ADD COLUMN donation_amount     DECIMAL(10,2)  NOT NULL DEFAULT 2.00 AFTER donation_required,
  ADD COLUMN donation_link       VARCHAR(500)   NULL                  AFTER donation_amount,
  ADD COLUMN donation_message    VARCHAR(500)   NULL                  AFTER donation_link;


-- Migration : système de modération par événement
-- Le DJ peut générer un token pour inviter des modérateurs
ALTER TABLE events
  ADD COLUMN mod_token VARCHAR(64) NULL DEFAULT NULL AFTER donation_message;


-- Anti-répétition : délai minimum (minutes) avant de redemander une piste déjà jouée (0 = désactivé)
ALTER TABLE events
  ADD COLUMN repeat_cooldown_minutes INT UNSIGNED NOT NULL DEFAULT 0
  COMMENT '0 = off ; même URI non reproposable avant X min après played_at';


-- Migration : planification des soirées (date/heure d'ouverture des demandes)
ALTER TABLE events
  ADD COLUMN starts_at DATETIME NULL DEFAULT NULL AFTER created_at;


-- Migration : stocker le clientId persistant sur chaque demande (pour le système de ban)
ALTER TABLE requests
  ADD COLUMN client_id VARCHAR(255) NULL AFTER socket_id;

CREATE INDEX idx_requests_client_id ON requests(client_id);


-- Migration : système de blocage d'invités par événement
--
-- Si vous obtenez l'erreur #150 (Foreign key incorrectly formed) en production :
-- 1) Vérifiez que la table `events` est bien InnoDB :
--      SHOW TABLE STATUS WHERE Name = 'events';
-- 2) Affichez le collationnement exact de `events.id` :
--      SHOW FULL COLUMNS FROM events WHERE Field = 'id';
-- 3) La colonne `event_id` ci-dessous DOIT avoir le même charset + collation que `events.id`.
--    Sur beaucoup d'hébergeurs (MariaDB, cPanel), c'est utf8mb4_unicode_ci :
--    utilisez alors migration_user_bans_o2switch_unicode.sql à la place de ce fichier.
--
CREATE TABLE IF NOT EXISTS user_bans (
  id           INT AUTO_INCREMENT PRIMARY KEY,
  event_id     VARCHAR(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL,
  client_id    VARCHAR(255) NOT NULL,
  user_name    VARCHAR(255) NULL,
  banned_until BIGINT       NULL COMMENT 'timestamp ms, NULL = permanent pour toute la soirée',
  created_at   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_event_client (event_id, client_id),
  CONSTRAINT fk_bans_event FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;


-- Anti-abus progressif + analytics audio/skip

CREATE TABLE IF NOT EXISTS abuse_scores (
  event_id        VARCHAR(36)  NOT NULL,
  client_id       VARCHAR(255) NOT NULL,
  score           DECIMAL(8,2) NOT NULL DEFAULT 0,
  throttle_until  BIGINT       NULL,
  updated_at      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (event_id, client_id),
  KEY idx_abuse_event_id (event_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS track_audio_cache (
  track_id      VARCHAR(64) PRIMARY KEY,
  bpm           INT NULL,
  energy        DECIMAL(5,2) NULL,
  popularity    INT NULL,
  updated_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

ALTER TABLE requests
  ADD COLUMN play_started_at DATETIME NULL AFTER played_at,
  ADD COLUMN skipped_at DATETIME NULL AFTER play_started_at;



-- Différencier les morceaux joués via playlist de secours
ALTER TABLE requests
  ADD COLUMN is_fallback_source TINYINT(1) NOT NULL DEFAULT 0 AFTER skipped_at;



-- Objectif de dons visuel + co-DJ rôles + journal d'actions

ALTER TABLE events
  ADD COLUMN donation_goal_amount DECIMAL(10,2) NOT NULL DEFAULT 0
    COMMENT 'Objectif visuel de dons pour la soirée (0 = off)',
  ADD COLUMN donations_raised_total DECIMAL(10,2) NOT NULL DEFAULT 0
    COMMENT 'Montant collecté affiché (manuel/indicatif)';

CREATE TABLE IF NOT EXISTS co_dj_tokens (
  id           VARCHAR(36) PRIMARY KEY,
  event_id     VARCHAR(36) NOT NULL,
  role         VARCHAR(24) NOT NULL,
  token        VARCHAR(64) NOT NULL,
  label        VARCHAR(120) NULL,
  created_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  revoked_at   DATETIME NULL,
  UNIQUE KEY uq_co_dj_token (token),
  KEY idx_co_dj_event (event_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS event_action_logs (
  id           BIGINT AUTO_INCREMENT PRIMARY KEY,
  event_id     VARCHAR(36) NOT NULL,
  actor_type   VARCHAR(24) NOT NULL,
  actor_name   VARCHAR(120) NULL,
  actor_role   VARCHAR(24) NULL,
  action_type  VARCHAR(48) NOT NULL,
  target_id    VARCHAR(80) NULL,
  meta_json    JSON NULL,
  created_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_action_logs_event (event_id, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;



-- Mode urgence DJ + sondages live

ALTER TABLE events
  ADD COLUMN requests_frozen_until BIGINT NULL
    COMMENT 'timestamp ms ; si > NOW alors nouvelles demandes gelées';

CREATE TABLE IF NOT EXISTS event_live_polls (
  id            VARCHAR(36) PRIMARY KEY,
  event_id      VARCHAR(36) NOT NULL,
  question       VARCHAR(255) NOT NULL,
  options_json   JSON NOT NULL,
  is_active      TINYINT(1) NOT NULL DEFAULT 1,
  created_at     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ended_at       DATETIME NULL,
  KEY idx_live_polls_event_active (event_id, is_active)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS event_live_poll_votes (
  poll_id       VARCHAR(36) NOT NULL,
  client_id     VARCHAR(255) NOT NULL,
  option_index  INT NOT NULL,
  created_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (poll_id, client_id),
  KEY idx_poll_votes_poll (poll_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;



-- Réglages visuels pour l'écran de projection (QR display)
ALTER TABLE events
  ADD COLUMN projection_visuals_enabled TINYINT(1) NOT NULL DEFAULT 0
    COMMENT 'Active les effets colorés sur /event/:eventId/qr',
  ADD COLUMN projection_visuals_mode VARCHAR(24) NOT NULL DEFAULT 'aurora'
    COMMENT 'Mode visuel: aurora | pulse | strobe';


-- Option: changer automatiquement d'effet visuel à chaque nouvelle musique
ALTER TABLE events
  ADD COLUMN projection_visuals_auto_per_track TINYINT(1) NOT NULL DEFAULT 0
    COMMENT '1 = alterner/randomiser les effets à chaque nouveau morceau projeté';



