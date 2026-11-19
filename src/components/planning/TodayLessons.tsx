import { ChevronRight, Flag } from 'lucide-react-native';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { AppLocale, AppPlanningSession } from '../../api/contract';
import { fetchPlanning } from '../../api/endpoints';
import { useResource } from '../../api/useResource';
import { TYPE_LABELS } from '../../planning/grid';
import { nowInLeuven } from '../../planning/now';
import { COLORS, FONTS, PLANNING, SPACING, TYPE } from '../../theme/tokens';
import { SectionHeading } from '../ui';

/**
 * Je lessen van vandaag, op Home.
 *
 * Home beantwoordt "wat wacht er op mij", en voor wie een lessenrooster koppelde
 * is dat in de eerste plaats waar je vandaag moet zitten. Het is een register in
 * de vorm van "Voor jou": uur, vak, lokaal, met haarlijnen en geen kaart per les.
 * Een tik opent de planning onder Kalender, waar je afvinkt of verbergt; hier
 * wordt enkel gelezen.
 *
 * Dezelfde gegevens als de planning en dezelfde sleutel in de leescache
 * (`planning:<locale>`), dus wat Kalender ophaalde, staat hier meteen en omgekeerd.
 * Verborgen lessen staan er niet bij, net zoals in de planning standaard. Is er
 * vandaag niets (een weekend, geen rooster gekoppeld, de server zonder
 * Burgieclan), dan toont dit niets: een lege band op Home is ruis.
 *
 * Wat voorbij is, staat er nog, maar gedempt; wat nu bezig is, krijgt de gele
 * rail. Het uur wordt bij elke render opnieuw gelezen, en Home rendert opnieuw
 * bij elke verversing; tot op de minuut hoeft het niet te kloppen.
 */
export function TodayLessons({ locale, onOpen }: { locale: AppLocale; onOpen: () => void }) {
  const resource = useResource('planning', () => fetchPlanning(locale), locale);
  const planning = resource.data;
  if (!planning?.available || !planning.subscribed) return null;

  // De klok van nu en niet `planning.today`: wat in de leescache staat, kan van
  // gisteren zijn.
  const now = nowInLeuven();
  const today = now.date;
  const lessons = planning.sessions
    .filter((session) => session.date === today && session.hidden === null)
    .sort((a, b) => a.startMin - b.startMin);
  if (lessons.length === 0) return null;

  return (
    <View style={styles.section}>
      <View style={styles.pad}>
        <SectionHeading
          right={
            <Pressable accessibilityRole="link" accessibilityLabel="Naar je planning" onPress={onOpen} hitSlop={8}>
              <Text style={styles.link}>Planning →</Text>
            </Pressable>
          }
        >
          Lessen vandaag
        </SectionHeading>
      </View>
      <View style={styles.register}>
        {lessons.map((session) => (
          <Lesson key={session.uid} session={session} now={now.minutes} onPress={onOpen} />
        ))}
      </View>
    </View>
  );
}

function Lesson({ session, now, onPress }: { session: AppPlanningSession; now: number; onPress: () => void }) {
  const over = session.endMin <= now;
  const current = session.startMin <= now && now < session.endMin;
  const type = TYPE_LABELS[session.type] ?? TYPE_LABELS.other;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={[
        `${session.start}${session.end ? ` tot ${session.end}` : ''}`,
        session.course,
        session.location,
        current ? 'nu bezig' : null,
        session.done ? 'afgevinkt' : null,
      ]
        .filter(Boolean)
        .join(', ')}
      onPress={onPress}
      style={({ pressed }) => [
        styles.row,
        current && styles.current,
        (over || session.done) && styles.over,
        pressed && styles.pressed,
      ]}
    >
      <View style={styles.time}>
        <Text style={styles.start}>{session.start}</Text>
        {session.end ? <Text style={styles.end}>{session.end}</Text> : null}
      </View>
      <View style={styles.text}>
        <Text style={[styles.title, session.done && styles.struck]} numberOfLines={2}>
          {session.course}
        </Text>
        <Text style={styles.detail} numberOfLines={1}>
          {[current ? 'Nu' : null, type, session.location].filter(Boolean).join(', ')}
        </Text>
      </View>
      {session.mandatory ? <Flag color={PLANNING.danger} size={15} /> : null}
      <ChevronRight color={COLORS.muted} size={18} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  section: { marginTop: SPACING.xl, gap: SPACING.md },
  pad: { paddingHorizontal: SPACING.xl - 4 },
  link: { ...TYPE.small, fontFamily: FONTS.semibold, color: COLORS.navy },
  register: { borderTopWidth: 1, borderTopColor: COLORS.line },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.xl - 4,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.line,
  },
  // Wat nu bezig is, krijgt de gele rail, zoals een dringende taak in "Voor jou".
  current: { borderLeftWidth: 3, borderLeftColor: COLORS.yellow, paddingLeft: SPACING.xl - 7 },
  over: { opacity: 0.5 },
  pressed: { backgroundColor: COLORS.paper2 },
  time: { width: 44 },
  start: { fontFamily: FONTS.semibold, fontSize: 14, color: COLORS.ink, fontVariant: ['tabular-nums'] },
  end: { ...TYPE.small, fontSize: 12, color: COLORS.muted, fontVariant: ['tabular-nums'] },
  text: { flex: 1, gap: 2 },
  title: { ...TYPE.cardTitle, fontSize: 15, color: COLORS.ink },
  struck: { textDecorationLine: 'line-through' },
  detail: { ...TYPE.small, color: COLORS.muted },
});
