import { getPref, setPref } from './storage';
import { restartApp } from './restart';

/**
 * De taal van de app: Nederlands of Engels.
 *
 * **Standaard Nederlands.** Bij de eerste start kies je (`LanguageChoice` in
 * `app/_layout.tsx`); later kan het onder Meer › je naam. De keuze stuurt twee
 * dingen: welke inhoud de server geeft (`?locale=`, via `useApp().locale`) en
 * welke tekst de app zelf toont (`t`).
 *
 * Net als het thema ligt de taal vast bij de start: `t` kiest bij elke oproep op
 * basis van `LANG`, ook in constanten die bij het laden van een bestand al
 * opgebouwd worden. Wisselen herstart de app dus (`applyLanguage`).
 *
 * **Elke tekst staat er in beide talen, naast elkaar**: `t('Terug', 'Back')`.
 * Geen sleutels en geen catalogus: wie een tekst wijzigt, ziet de andere taal
 * meteen staan en vergeet ze niet.
 */
export type Lang = 'nl' | 'en';

const KEY = 'locale';

const stored = getPref(KEY);

export const LANG: Lang = stored === 'en' ? 'en' : 'nl';
export const IS_EN = LANG === 'en';

/** Of er op dit toestel al een taal gekozen is; zo niet, dan vraagt de app het. */
export function languageChosen(): boolean {
  return stored === 'nl' || stored === 'en';
}

/** De tekst in de taal van de app. */
export function t(nl: string, en: string): string {
  return IS_EN ? en : nl;
}

/** Bewaart de taal; herstart enkel als ze verandert. */
export async function applyLanguage(next: Lang): Promise<void> {
  setPref(KEY, next);
  if (next !== LANG) await restartApp();
}
