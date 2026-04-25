# P2PVideo — Видеохостинг

Бесплатный хостинг: первые 3 дня с NUC через Cloudflare Tunnel, потом только P2P.

## Быстрый старт

### 1. Supabase
- supabase.com → новый проект
- SQL Editor → выполнить `supabase_schema.sql`
- Storage → bucket `thumbnails` (Public ✅)
- Settings → API → скопировать URL и anon key

### 2. NUC сервер
```bash
sudo apt install ffmpeg nodejs npm
cd server && npm install && node index.js

# Открыть для интернета:
cloudflared tunnel --url http://localhost:3000
# Скопировать URL вида https://xxx.trycloudflare.com
```

### 3. Настройка
Открыть `js/config.js`, вставить:
- SUPABASE_URL + SUPABASE_ANON_KEY
- VIDEO_SERVER_URL (из cloudflared)

### 4. Деплой
Папку (без server/) → перетащить на netlify.com

## Ёмкость NUC (50 ГБ)
| Видео     | Размер    | Кол-во |
|-----------|-----------|--------|
| 10 минут  | ~150 МБ   | ~330   |
| 1 час     | ~900 МБ   | ~55    |

Старые файлы удаляются каждый час автоматически.
