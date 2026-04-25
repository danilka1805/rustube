// ======================================================
//  CACHE + SEEDER
//  Хранит видео в IndexedDB, раздаёт до 7 дней,
//  потом удаляет автоматически.
// ======================================================

const CACHE_DB_NAME = 'p2pvideo_cache';
const CACHE_STORE = 'videos';
const KEEP_DAYS = 7;

let cacheDB = null;

async function openCacheDB() {
  if (cacheDB) return cacheDB;
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(CACHE_DB_NAME, 1);
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(CACHE_STORE)) {
        const store = db.createObjectStore(CACHE_STORE, { keyPath: 'magnetLink' });
        store.createIndex('cachedAt', 'cachedAt', { unique: false });
      }
    };
    req.onsuccess = (e) => { cacheDB = e.target.result; resolve(cacheDB); };
    req.onerror = (e) => reject(e.target.error);
  });
}

// Сохранить видео в кэш (вызывается после полной загрузки)
async function cacheVideo(magnetLink, fileName, buffer) {
  try {
    const db = await openCacheDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(CACHE_STORE, 'readwrite');
      tx.objectStore(CACHE_STORE).put({
        magnetLink,
        fileName,
        buffer,           // ArrayBuffer с видеоданными
        cachedAt: Date.now(),
        sizeBytes: buffer.byteLength,
      });
      tx.oncomplete = resolve;
      tx.onerror = (e) => reject(e.target.error);
    });
  } catch (err) {
    console.warn('Не удалось кэшировать видео:', err);
  }
}

// Загрузить все записи из кэша
async function getAllCached() {
  try {
    const db = await openCacheDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(CACHE_STORE, 'readonly');
      const req = tx.objectStore(CACHE_STORE).getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = (e) => reject(e.target.error);
    });
  } catch {
    return [];
  }
}

// Удалить одну запись
async function deleteCached(magnetLink) {
  try {
    const db = await openCacheDB();
    return new Promise((resolve) => {
      const tx = db.transaction(CACHE_STORE, 'readwrite');
      tx.objectStore(CACHE_STORE).delete(magnetLink);
      tx.oncomplete = resolve;
    });
  } catch {}
}

// Проверить, кэшировано ли это видео
async function isCached(magnetLink) {
  try {
    const db = await openCacheDB();
    return new Promise((resolve) => {
      const tx = db.transaction(CACHE_STORE, 'readonly');
      const req = tx.objectStore(CACHE_STORE).get(magnetLink);
      req.onsuccess = () => resolve(!!req.result);
      req.onerror = () => resolve(false);
    });
  } catch {
    return false;
  }
}

// ======================================================
//  SEEDER: при каждой загрузке страницы —
//  1) удаляет устаревшие (>7 дней)
//  2) раздаёт оставшиеся через WebTorrent
// ======================================================

const _seedingClients = {};  // magnetLink → WebTorrent client

async function startBackgroundSeeding(wtClient) {
  const all = await getAllCached();
  const now = Date.now();
  const maxAge = KEEP_DAYS * 24 * 3600 * 1000;
  let seeded = 0;

  for (const entry of all) {
    const age = now - (entry.cachedAt || 0);

    // Удаляем просроченные
    if (age > maxAge) {
      await deleteCached(entry.magnetLink);
      continue;
    }

    // Раздаём
    try {
      const file = new File([entry.buffer], entry.fileName || 'video.mp4');
      wtClient.seed(file, { announce: WS_TRACKERS }, (torrent) => {
        _seedingClients[entry.magnetLink] = torrent;
        console.log(`🌱 Раздача: ${entry.fileName} (${Math.round(entry.sizeBytes / 1024 / 1024)} МБ)`);
      });
      seeded++;
    } catch (err) {
      console.warn('Ошибка раздачи:', err);
    }
  }

  if (seeded > 0) {
    console.log(`✅ Фоновая раздача запущена для ${seeded} видео`);
  }
  return seeded;
}

// Получить список для UI (страница настроек/кэша)
async function getCacheInfo() {
  const all = await getAllCached();
  const now = Date.now();
  return all.map(e => ({
    magnetLink: e.magnetLink,
    fileName: e.fileName,
    sizeBytes: e.sizeBytes,
    cachedAt: e.cachedAt,
    expiresIn: Math.max(0, KEEP_DAYS - Math.floor((now - e.cachedAt) / 86400000)),
  }));
}

function formatSize(bytes) {
  if (bytes > 1024 * 1024 * 1024) return (bytes / 1024 / 1024 / 1024).toFixed(1) + ' ГБ';
  if (bytes > 1024 * 1024) return (bytes / 1024 / 1024).toFixed(1) + ' МБ';
  return (bytes / 1024).toFixed(0) + ' КБ';
}

function formatDate(ts) {
  return new Date(ts).toLocaleDateString('ru-RU');
}
