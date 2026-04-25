ALTER TABLE videos ADD COLUMN IF NOT EXISTS category TEXT DEFAULT 'other';
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS username TEXT;

CREATE INDEX IF NOT EXISTS idx_videos_category ON videos(category);
CREATE INDEX IF NOT EXISTS idx_videos_user_id ON videos(user_id);
