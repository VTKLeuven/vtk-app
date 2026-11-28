import { restartApp } from '../restart';
import { getPref, setPref } from '../storage';

/**
 * Licht of donker, zoals gekozen onder Meer.
 *
 * **Standaard licht, en niet de instelling van het toestel.** De app volgt de
 * site, en die is licht; het donkere thema is een keuze die je zelf maakt.
 *
 * Het thema ligt vast zodra de app start: `tokens.ts` leest het bij het laden,
 * en elke `StyleSheet.create` in de app neemt op dat moment zijn kleuren over.
 * Wisselen kan dus enkel door de app te herladen (`applyTheme`). Dat is een
 * bewuste ruil: de honderd stijlbladen omschrijven naar hooks om een knop zonder
 * herstart te laten werken, was het niet waard.
 */
export type ThemeMode = 'light' | 'dark';

const KEY = 'theme';

export const THEME: ThemeMode = getPref(KEY) === 'dark' ? 'dark' : 'light';
export const IS_DARK = THEME === 'dark';

/** Bewaart het thema en herlaadt de app, zodat elk scherm in de nieuwe kleuren opent. */
export async function applyTheme(next: ThemeMode): Promise<void> {
  if (next === THEME) return;
  setPref(KEY, next);
  await restartApp();
}
