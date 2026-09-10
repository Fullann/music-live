-- Réglages pour l'animation visualiseur audio (/qrspectre) et le mode Karaoké distant
ALTER TABLE events
  ADD COLUMN screen_visualizer_mode VARCHAR(32) NOT NULL DEFAULT 'cyber-spectrum'
    COMMENT 'Animation visualiseur: cyber-spectrum | nebula-3d | neon-waveform | bass-ripple | off',
  ADD COLUMN karaoke_mode_enabled TINYINT(1) NOT NULL DEFAULT 0
    COMMENT '1 = Activer les paroles karaoké en direct sur le grand écran',
  ADD COLUMN karaoke_auto_enabled TINYINT(1) NOT NULL DEFAULT 0
    COMMENT '1 = Déclencher automatiquement le karaoké si des paroles sont disponibles';

-- Option Karaoké sur les demandes d'invités (l'invité souhaite chanter au micro)
ALTER TABLE requests
  ADD COLUMN is_karaoke TINYINT(1) NOT NULL DEFAULT 0
    COMMENT '1 = L\'invité a demandé un micro pour chanter';
