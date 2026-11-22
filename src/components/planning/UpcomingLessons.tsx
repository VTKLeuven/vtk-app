import { ChevronRight, Flag } from 'lucide-react-native';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { AppLocale, AppPlanning, AppPlanningSession } from '../../api/contract';
import { fetchPlanning } from '../../api/endpoints';
import { useResource, type Resource } from '../../api/useResource';
import { addDays, shortDay, TYPE_LABELS } from '../../planning/grid';
import { nowInLeuven } from '../../planning/now';
import { COLORS, FONTS, PLANNING, SPACING, TYPE } from '../../theme/tokens';
import { SectionHeading } from '../ui';

/** Hoeveel lessen Home vooruit kijkt. */
const COUNT = 3;

export type UpcomingLessons = {
  lessons: AppPlanningSession[];
  /** Vandaag in Leuven, zoals `nowInLeuven` het las. */
  today: string;
  now: number;
  resource: Resource<AppPlanning>;
};

/**
 * Je volgende drie lessen, voor Home.
 *
 * Een hook en geen component, zodat Home weet of er iets komt: staat er niets
 * tussen de kop en de aankomende evenementen, dan sluit die band zonder witte
 * strook aan op de kop.
 *
 * Dezelfde gegevens als de planning en dezelfde sleutel in de leescache
 * (`planning:<locale>`), dus wat Kalender ophaalde, staat hier meteen en omgekeerd.
 * Verborgen lessen staan er niet bij, net zoals in de planning standaard. Wat
 * vandaag al voorbij is, telt niet meer; wat nu bezig is, wel. Is er vandaag
 * niets, dan zijn het die van morgen of later. Pas zonder enige komende les (geen
 * rooster gekoppeld, het semester voorbij, de server zonder Burgieclan) blijft de
 * lijst leeg.
 *
 * De klok van nu en niet `planning.today`: wat in de leescache staat, kan van
 * gisteren zijn. Het uur wordt bij elke render opnieuw gelezen, en Home rendert
 * opnieuw bij elke verversing; tot op de minuut hoeft het niet te kloppen.
 */
export function useUpcomingLessons(locale: AppLocale, enabled: boolean): UpcomingLessons {
  const resource = useResource('planning', () => fetchPlanning(locale), locale, enabled);
  const { date: today, minutes: now } = nowInLeuven();
  const planning = resource.data;
  if (!enabled || !planning?.available || !planning.subscribed) {
    return { lessons: [], today, now, resource };
  }

  const lessons = planning.sessions
    .filter(
      (session) =>
        session.hidden === null &&
        (session.date > today || (session.date === today && session.endMin > now)),
    )
    .sort((a, b) => (a.date === b.date ? a.startMin - b.startMin : a.date < b.date ? -1 : 1))
    .slice(0, COUNT);
  return { lessons, today, now, resource };
}

/**
 * De lessen uit `useUpcomingLessons`, als register in de vorm van "Voor jou":
 * uur, vak, dag en lokaal, met haarlijnen en geen kaart per les. Een tik opent de
 * planning onder Kalender, waar je afvinkt of verbergt; hier wordt enkel gelezen.
 * Wat nu bezig is, krijgt de gele rail.
 */
export function UpcomingLessonsList({
  upcoming,
  onOpen,
}: {
  upcoming: UpcomingLessons;
  onOpen: () => void;
}) {
  const { lessons, today, now } = upcoming;
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
          {lessons.every((session) => session.date === today) ? 'Lessen vandaag' : 'Komende lessen'}
        </SectionHeading>
      </View>
      <View style={styles.register}>
        {lessons.map((session) => (
          <Lesson
            key={session.uid}
            session={session}
            current={session.date === today && session.startMin <= now}
            day={dayLabel(session.date, today)}
            onPress={onOpen}
          />
        ))}
      </View>
    </View>
  );
}

/** "Vandaag", "Morgen", of "di 24 nov". */
function dayLabel(date: string, today: string): string {
  if (date === today) return 'Vandaag';
  if (date === addDays(today, 1)) return 'Morgen';
  const label = shortDay(date);
  return label.charAt(0).toUpperCase() + label.slice(1);
}

function Lesson({
  session,
  current,
  day,
  onPress,
}: {
  session: AppPlanningSession;
  current: boolean;
  day: string;
  onPress: () => void;
}) {
  const type = TYPE_LABELS[session.type] ?? TYPE_LABELS.other;
  const when = current ? 'Nu' : day;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={[
        when,
        `${session.start}${session.end ? ` tot ${session.end}` : ''}`,
        session.course,
        session.location,
        session.done ? 'afgevinkt' : null,
      ]
        .filter(Boolean)
        .join(', ')}
      onPress={onPress}
      style={({ pressed }) => [
        styles.row,
        current && styles.current,
        session.done && styles.over,
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
          {[when, type, session.location].filter(Boolean).join(', ')}
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
