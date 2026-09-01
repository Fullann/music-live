-- Migration d'optimisation des performances pour Music Live
-- 1. Index pour la détection rapide des doublons (checkDuplicate)
CREATE INDEX idx_requests_event_spotify ON requests (event_id, spotify_uri, status);

-- 2. Index pour le cooldown anti-répétition (repeat_cooldown_minutes)
CREATE INDEX idx_requests_played_cooldown ON requests (event_id, spotify_uri, status, played_at);

-- 3. Index composite pour l'agrégation ultra-rapide des votes
CREATE INDEX idx_votes_request_type ON votes (request_id, vote_type);
