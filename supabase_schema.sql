-- ============================================================
--  P2PVideo — SQL схема для Supabase
--  Выполните в разделе SQL Editor вашего проекта
-- ============================================================

-- 1. ТАБЛИЦА ВИДЕО
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS videos (
  id                UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  title             TEXT        NOT NULL,
  description       TEXT,
  magnet_link       TEXT        NOT NULL,
  thumbnail_url     TEXT,
  file_size         BIGINT      DEFAULT 0,
  duration          INTEGER     DEFAULT 0,
  views             INTEGER     DEFAULT 0,
  server_id         TEXT,                         -- ID файла на NUC
  server_expires_at TIMESTAMPTZ,                  -- Когда удалится с сервера
  created_at        TIMESTAMPTZ DEFAULT NOW()
);

-- Политики доступа (RLS)
ALTER TABLE videos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Читать может любой"
  ON videos FOR SELECT USING (true);

CREATE POLICY "Добавлять может любой"
  ON videos FOR INSERT WITH CHECK (true);

CREATE POLICY "Обновлять может любой"
  ON videos FOR UPDATE USING (true);


-- 2. ТАБЛИЦА ЛАЙКОВ
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS likes (
  id               UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  video_id         UUID        REFERENCES videos(id) ON DELETE CASCADE,
  user_fingerprint TEXT        NOT NULL,    -- случайный ID из localStorage
  created_at       TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (video_id, user_fingerprint)       -- один лайк с устройства
);

ALTER TABLE likes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Лайки: читать всем"
  ON likes FOR SELECT USING (true);

CREATE POLICY "Лайки: добавлять всем"
  ON likes FOR INSERT WITH CHECK (true);

CREATE POLICY "Лайки: удалять всем"
  ON likes FOR DELETE USING (true);


-- 3. ТАБЛИЦА КОММЕНТАРИЕВ
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS comments (
  id          UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  video_id    UUID        REFERENCES videos(id) ON DELETE CASCADE,
  author_name TEXT        NOT NULL DEFAULT 'Аноним',
  text        TEXT        NOT NULL,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE comments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Комментарии: читать всем"
  ON comments FOR SELECT USING (true);

CREATE POLICY "Комментарии: добавлять всем"
  ON comments FOR INSERT WITH CHECK (true);


-- 4. ИНДЕКСЫ (ускоряют загрузку)
-- ─────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_videos_created    ON videos  (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_likes_video       ON likes   (video_id);
CREATE INDEX IF NOT EXISTS idx_comments_video    ON comments(video_id, created_at);


-- ============================================================
--  Supabase Storage: создайте bucket "thumbnails" вручную
--  в разделе Storage → New bucket → Name: thumbnails → Public ✅
-- ============================================================
