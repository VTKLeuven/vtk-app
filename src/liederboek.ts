/**
 * Het liederboek: de liedjes van codex.rondgezang.be (Rondgezang vzw), met
 * toestemming overgenomen in de app (november 2026), zodat ze ook zonder netwerk
 * open gaan op een cantus.
 *
 * De gegevens staan in `src/data/liederboek.json` en worden gemaakt met het
 * importscript (zie `docs/liederboek.md`). Per lied: de titel, de tekst per
 * strofe, de paginanummers in het Leuvens Liedboek (de nieuwste uitgave) en in
 * de KVHV Groene Codex van 2020, wie het schreef, en de YouTube-video als
 * rondgezang.be er een bij heeft.
 *
 * Het bestand is groot (honderden liedjes); het wordt pas ingelezen wanneer je
 * het liederboek opent, niet bij het opstarten van de app.
 */

/** Een stuk van een regel: gewone tekst, een herhaling, het aantal keer, een vervangregel of een tussenzin. */
export type SongSegment = ['t' | 'r' | 'n' | 's' | 'c', string];
export type SongLine = SongSegment[];
/** Een couplet (`v`) of een refrein (`c`). */
export type SongBlock = { k: 'v' | 'c'; l: SongLine[] };
/** Een genummerde strofe: een couplet, soms met het refrein erachter. */
export type SongStanza = SongBlock[];

export type Song = {
  id: number;
  /** Titel. */
  t: string;
  /** Strofen. */
  s: SongStanza[];
  /** Muziek, Tekst, Zelfde melodie. */
  cr?: Record<string, string>;
  /** Pagina in het Leuvens Liedboek. */
  lp?: string;
  /** Pagina in de KVHV Groene Codex (2020). */
  kp?: string;
  /** YouTube-id. */
  yt?: string;
  /** "Tekst verkregen via ...". */
  src?: string;
};

type Book = { source: string; songs: Song[] };

let cache: Book | null = null;

export function liederboek(): Book {
  if (!cache) cache = require('./data/liederboek.json') as Book;
  return cache;
}

export function songById(id: number): Song | null {
  return liederboek().songs.find((song) => song.id === id) ?? null;
}

/** Zonder accenten en hoofdletters, zodat "kerelslied" ook "Kérelslied" vindt. */
export function normalize(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/['’`]/g, '')
    .toLowerCase();
}

/** Een paginanummer als getal om op te sorteren; "15a" telt als 15. */
export function pageNumber(page: string | undefined): number {
  const value = parseInt(page ?? '', 10);
  return Number.isFinite(value) ? value : Number.MAX_SAFE_INTEGER;
}
