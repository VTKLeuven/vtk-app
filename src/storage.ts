import * as SQLite from 'expo-sqlite';

/**
 * Wat de app op het toestel bewaart.
 *
 * Twee dingen, en niet meer: **voorkeuren** (de basis-URL, de taal, of push
 * gevraagd is) en een **leescache**. Er staat geen wachtrij in en geen
 * schrijfweg, anders dan bij de scanner: die staat aan een deur in een kelder en
 * moet offline door kunnen scannen, deze app niet. Iets bestellen of kopen vraagt
 * hier gewoon netwerk.
 *
 * De leescache bestaat om één reden: een scherm dat je gisteren al gezien hebt,
 * hoort niet als een leeg vak te openen terwijl de verbinding traag is. Wat er in
 * staat is altijd verouderd tot het tegendeel bewezen is, en de app zegt dat ook
 * wanneer een verversing mislukt.
 *
 * SQLite en niet AsyncStorage, om dezelfde reden als in de scanner: de
 * Android-implementatie daarvan heeft een grootte-limiet waar een fotolijst
 * moeiteloos tegenaan loopt.
 */

const db = SQLite.openDatabaseSync('vtk_app.db');

db.execSync(`
  PRAGMA journal_mode = WAL;
  CREATE TABLE IF NOT EXISTS prefs (
    key TEXT PRIMARY KEY NOT NULL,
    value TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS cache (
    key TEXT PRIMARY KEY NOT NULL,
    payload TEXT NOT NULL,
    saved_at INTEGER NOT NULL
  );
`);

// ── Voorkeuren ──────────────────────────────────────────────────────────────

export function getPref(key: string): string | null {
  try {
    const row = db.getFirstSync<{ value: string }>('SELECT value FROM prefs WHERE key = ?', key);
    return row?.value ?? null;
  } catch {
    return null;
  }
}

export function setPref(key: string, value: string): void {
  try {
    db.runSync('INSERT OR REPLACE INTO prefs (key, value) VALUES (?, ?)', key, value);
  } catch (error) {
    console.error('Voorkeur bewaren mislukt', error);
  }
}

export function clearPref(key: string): void {
  try {
    db.runSync('DELETE FROM prefs WHERE key = ?', key);
  } catch {
    // Niets aan te doen, en niets dat hierdoor stuk gaat.
  }
}

// ── Leescache ───────────────────────────────────────────────────────────────

export type CachedValue<T> = {
  value: T;
  /** Wanneer dit opgehaald is, zodat een scherm "bijgewerkt om ..." kan tonen. */
  savedAt: number;
};

const memoryCache = new Map<string, CachedValue<unknown>>();
let cacheEpoch = 0;

export function readCache<T>(key: string): CachedValue<T> | null {
  const hit = memoryCache.get(key);
  if (hit) return hit as CachedValue<T>;
  try {
    const row = db.getFirstSync<{ payload: string; saved_at: number }>(
      'SELECT payload, saved_at FROM cache WHERE key = ?',
      key,
    );
    if (!row) return null;
    const entry: CachedValue<T> = { value: JSON.parse(row.payload) as T, savedAt: row.saved_at };
    memoryCache.set(key, entry);
    return entry;
  } catch {
    return null;
  }
}

export function writeCache(key: string, value: unknown): void {
  const savedAt = Date.now();
  const epoch = cacheEpoch;
  memoryCache.set(key, { value, savedAt });

  let payload: string;
  try {
    payload = JSON.stringify(value);
  } catch (error) {
    console.error('Cache bewaren mislukt', error);
    return;
  }

  void db
    .runAsync(
      'INSERT OR REPLACE INTO cache (key, payload, saved_at) VALUES (?, ?, ?)',
      key,
      payload,
      savedAt,
    )
    .then(() => {
      if (epoch !== cacheEpoch) {
        void db.runAsync('DELETE FROM cache WHERE key = ? AND saved_at = ?', key, savedAt).catch(() => {});
      }
    })
    .catch((error) => {
      // Een vol toestel mag geen scherm breken; zonder cache haalt hij gewoon op.
      console.error('Cache bewaren mislukt', error);
    });
}

/**
 * De hele cache weg. Gebeurt bij uitloggen en bij het wisselen van server: wat
 * er in staat hoort bij één account op één site, en dat door elkaar laten lopen
 * levert schermen op die iets tonen dat niet meer van jou is.
 */
export function clearCache(): void {
  cacheEpoch += 1;
  memoryCache.clear();
  try {
    db.runSync('DELETE FROM cache');
  } catch {
    // Zie boven.
  }
}
