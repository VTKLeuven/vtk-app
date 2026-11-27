import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { AppLocale } from '../api/contract';
import { weekdayLabels } from '../monthGrid';
import { addDays } from '../planning/grid';
import { COLORS, FONTS } from '../theme/tokens';

/** Zoveel weken toont de agenda: één terug, deze, en twee verder. */
export const AGENDA_WEEKS = 4;

/**
 * De agenda onder Evenementen, in de gele kop: vier weken als vierkantjes, zoals
 * de dagen op Home. Tot november 2026 was dit een maandrooster van zes weken; vier
 * weken (één terug, twee verder) is wat je bij het plannen nodig hebt en neemt een
 * derde minder plaats.
 *
 * Een dag met evenementen heeft een navy waas en een bolletje per evenement (tot
 * drie). Wat voorbij is, is vager. De gekozen dag is navy; vandaag heeft een rand
 * zolang er een andere dag gekozen is.
 */
export function AgendaGrid({
  start,
  today,
  selected,
  counts,
  locale,
  onSelect,
}: {
  /** De maandag van de eerste week, `YYYY-MM-DD`. */
  start: string;
  today: string;
  selected: string;
  counts: Map<string, number>;
  locale: AppLocale;
  onSelect: (day: string) => void;
}) {
  const days = Array.from({ length: AGENDA_WEEKS * 7 }, (_, i) => addDays(start, i));
  return (
    <View style={styles.wrap}>
      <View style={styles.row}>
        {weekdayLabels(locale).map((label) => (
          <Text key={label} style={styles.weekday}>
            {label.replace('.', '').slice(0, 2).toUpperCase()}
          </Text>
        ))}
      </View>
      {Array.from({ length: AGENDA_WEEKS }, (_, week) => (
        <View key={week} style={styles.row}>
          {days.slice(week * 7, week * 7 + 7).map((day) => {
            const count = counts.get(day) ?? 0;
            const active = day === selected;
            const isToday = day === today;
            const past = day < today;
            return (
              <Pressable
                key={day}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
                accessibilityLabel={`${isToday ? 'Vandaag, ' : ''}${Number(day.slice(8))} ${day.slice(5, 7)}, ${
                  count === 0 ? 'geen evenementen' : count === 1 ? '1 evenement' : `${count} evenementen`
                }`}
                onPress={() => onSelect(day)}
                style={({ pressed }) => [
                  styles.day,
                  count > 0 && styles.busy,
                  isToday && !active && styles.today,
                  active && styles.active,
                  past && !active && styles.past,
                  pressed && styles.pressed,
                ]}
              >
                <Text style={[styles.number, active && styles.numberActive]}>{Number(day.slice(8))}</Text>
                <View style={styles.dots}>
                  {Array.from({ length: Math.min(count, 3) }, (_, i) => (
                    <View key={i} style={[styles.dot, active && styles.dotActive]} />
                  ))}
                </View>
              </Pressable>
            );
          })}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 6 },
  row: { flexDirection: 'row', gap: 6 },
  weekday: {
    flex: 1,
    textAlign: 'center',
    fontFamily: FONTS.bold,
    fontSize: 10,
    color: COLORS.strong,
    opacity: 0.7,
  },
  day: {
    flex: 1,
    aspectRatio: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
    borderRadius: 12,
  },
  busy: { backgroundColor: COLORS.wash },
  today: { borderWidth: 2, borderColor: COLORS.strong },
  active: { backgroundColor: COLORS.selected },
  past: { opacity: 0.55 },
  pressed: { opacity: 0.7 },
  number: { fontFamily: FONTS.bold, fontSize: 15, color: COLORS.strong, fontVariant: ['tabular-nums'] },
  numberActive: { color: COLORS.onSelected },
  dots: { flexDirection: 'row', gap: 2, height: 4 },
  dot: { width: 4, height: 4, borderRadius: 2, backgroundColor: COLORS.strong },
  dotActive: { backgroundColor: COLORS.onSelectedAccent },
});
