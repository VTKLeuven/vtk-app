import { StyleSheet, Text, View } from 'react-native';

import type { AppLocale } from '../api/contract';
import { COLORS, FONTS } from '../theme/tokens';
import { CARD_SHADOW } from './HomeSection';

const TZ = 'Europe/Brussels';

/**
 * De gele datumpin van de site (`.ev-card-pin`): weekdag boven, het getal groot,
 * de maand eronder, zoals een kalenderblad. Geel en niet navy: navy verdween in
 * elke donkere affiche, en geel is de enige kleur die niet uit de foto kan komen.
 *
 * `quiet` is de lichtblauwe variant voor een dag zonder iets, en `active` de
 * gele in een rij keuzes (de verkoopdagen van het Theokot), waar de rest wit is.
 */
export function DatePin({
  iso,
  locale,
  size = 'md',
  tone = 'yellow',
  month = true,
  shadow = false,
}: {
  iso: string;
  locale: AppLocale;
  size?: 'sm' | 'md';
  tone?: 'yellow' | 'quiet' | 'plain' | 'ink';
  /** De maand eronder; in een lijst per week is die overbodig. */
  month?: boolean;
  /** De schaduw van een pin die over een affiche hangt. */
  shadow?: boolean;
}) {
  const date = new Date(iso);
  const tag = locale === 'en' ? 'en-GB' : 'nl-BE';
  const weekday = date
    .toLocaleDateString(tag, { timeZone: TZ, weekday: 'short' })
    .replace('.', '');
  const day = date.toLocaleDateString(tag, { timeZone: TZ, day: 'numeric' });
  const monthLabel = date
    .toLocaleDateString(tag, { timeZone: TZ, month: 'short' })
    .replace('.', '');

  const box = size === 'sm' ? styles.sm : styles.md;
  return (
    <View
      style={[
        styles.pin,
        box,
        tone === 'quiet' && styles.quiet,
        tone === 'plain' && styles.plain,
        tone === 'ink' && styles.ink,
        shadow && styles.shadow,
      ]}
    >
      <Text style={[styles.small, tone === 'ink' && styles.smallInk]}>{weekday}</Text>
      <Text style={[styles.day, size === 'sm' && styles.daySm, tone === 'ink' && styles.dayInk]}>{day}</Text>
      {month ? <Text style={[styles.small, tone === 'ink' && styles.smallInk]}>{monthLabel}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  pin: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.yellow,
  },
  md: { width: 54, height: 54, borderRadius: 14 },
  sm: { width: 44, height: 44, borderRadius: 12 },
  quiet: { backgroundColor: COLORS.paper2 },
  // Een dag om te kiezen, zoals bij de broodjes: wit met de zachte schaduw van een kaart.
  plain: { backgroundColor: COLORS.surface, ...CARD_SHADOW },
  // De gekozen dag: inkt, met de weekdag in het geel.
  ink: { backgroundColor: COLORS.ink },
  smallInk: { color: COLORS.yellow },
  dayInk: { color: COLORS.paper },
  shadow: {
    shadowColor: '#080D1C',
    shadowOpacity: 0.45,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 8 },
    elevation: 6,
  },
  small: {
    fontFamily: FONTS.medium,
    fontSize: 9,
    lineHeight: 11,
    letterSpacing: 1.1,
    textTransform: 'uppercase',
    color: 'rgba(10,15,31,0.62)',
  },
  day: {
    fontFamily: FONTS.semibold,
    fontSize: 19,
    lineHeight: 22,
    color: COLORS.ink,
    fontVariant: ['tabular-nums'],
  },
  daySm: { fontSize: 16, lineHeight: 19 },
});
