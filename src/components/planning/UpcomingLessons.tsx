import { Flag } from 'lucide-react-native';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { AppLocale, AppPlanning, AppPlanningSession } from '../../api/contract';
import { fetchPlanning } from '../../api/endpoints';
import { useResource, type Resource } from '../../api/useResource';
import { addDays, shortDay, toneOf, TYPE_LABELS } from '../../planning/grid';
import { nowInLeuven } from '../../planning/now';
import { COLORS, FONTS, PLANNING, RADIUS, SPACING, TYPE } from '../../theme/tokens';
import { CARD_SHADOW, HomeSection } from '../HomeSection';
import { t } from '../../i18n';

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
 * De lessen uit `useUpcomingLessons` op Home: één witte kaart met per les het uur,
 * een streepje in de kleur van de soort (dezelfde als in de planning en bij
 * Burgieclan), het vak, en "Nu" voor wat bezig is. Een tik opent de planning onder
 * Kalender, waar je afvinkt of verbergt; hier wordt enkel gelezen.
 */
export function UpcomingLessonsList({
  upcoming,
  onOpen,
}: {
  upcoming: UpcomingLessons;
  /** Zonder `uid` de week; met, meteen het venster van die les. */
  onOpen: (uid?: string) => void;
}) {
  const { lessons, today, now } = upcoming;
  if (lessons.length === 0) return null;

  return (
    <HomeSection
      title={lessons.every((session) => session.date === today) ? t('Je lessen vandaag', 'Your classes today') : t('Je volgende lessen', 'Your next classes')}
      link={{ label: 'Planning', accessibilityLabel: t('Naar je planning', 'To your planning'), onPress: () => onOpen() }}
    >
      <View style={styles.card}>
        {lessons.map((session, index) => (
          <Lesson
            key={session.uid}
            session={session}
            current={session.date === today && session.startMin <= now}
            day={session.date === today ? null : dayLabel(session.date, today)}
            last={index === lessons.length - 1}
            onPress={() => onOpen(session.uid)}
          />
        ))}
      </View>
    </HomeSection>
  );
}

/** "Morgen", of "Di 24 nov". */
function dayLabel(date: string, today: string): string {
  if (date === addDays(today, 1)) return t('Morgen', 'Tomorrow');
  const label = shortDay(date);
  return label.charAt(0).toUpperCase() + label.slice(1);
}

const RAIL = {
  lecture: PLANNING.lectureBorder,
  practice: PLANNING.practiceBorder,
  other: PLANNING.otherBorder,
} as const;

function Lesson({
  session,
  current,
  day,
  last,
  onPress,
}: {
  session: AppPlanningSession;
  current: boolean;
  /** `null` voor vandaag. */
  day: string | null;
  last: boolean;
  onPress: () => void;
}) {
  const type = TYPE_LABELS[session.type] ?? TYPE_LABELS.other;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={[
        current ? t('Nu', 'Now') : (day ?? t('Vandaag', 'Today')),
        `${session.start}${session.end ? t(` tot ${session.end}`, ` to ${session.end}`) : ''}`,
        session.course,
        type,
        session.location,
        session.mandatory ? 'verplicht' : null,
        session.done ? 'afgevinkt' : null,
      ]
        .filter(Boolean)
        .join(', ')}
      onPress={onPress}
      style={({ pressed }) => [
        styles.row,
        !last && styles.divider,
        session.done && styles.over,
        pressed && styles.pressed,
      ]}
    >
      <View style={styles.time}>
        <Text style={styles.start}>{session.start}</Text>
        {session.end ? <Text style={styles.end}>{session.end}</Text> : null}
      </View>
      <View style={[styles.rail, { backgroundColor: RAIL[toneOf(session.type)] }]} />
      <View style={styles.text}>
        <Text style={[styles.title, session.done && styles.struck]} numberOfLines={2}>
          {session.course}
        </Text>
        <View style={styles.metaRow}>
          {current ? (
            <View style={styles.now}>
              <Text style={styles.nowText}>{t('NU', 'NOW')}</Text>
            </View>
          ) : null}
          <Text style={styles.detail} numberOfLines={1}>
            {[day, type, session.location].filter(Boolean).join(', ')}
          </Text>
        </View>
      </View>
      {session.mandatory ? <Flag color={PLANNING.danger} size={15} /> : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: COLORS.surface, borderRadius: 20, ...CARD_SHADOW },
  row: {
    flexDirection: 'row',
    alignItems: 'stretch',
    gap: SPACING.md,
    paddingVertical: 14,
    paddingHorizontal: SPACING.lg,
  },
  divider: { borderBottomWidth: 1, borderBottomColor: COLORS.line },
  over: { opacity: 0.5 },
  pressed: { backgroundColor: COLORS.paper2 },
  time: { width: 44, paddingTop: 1 },
  start: { fontFamily: FONTS.semibold, fontSize: 14, color: COLORS.ink, fontVariant: ['tabular-nums'] },
  end: { ...TYPE.small, fontSize: 13, color: COLORS.muted, fontVariant: ['tabular-nums'] },
  rail: { width: 4, borderRadius: 2 },
  text: { flex: 1, gap: 4 },
  title: { ...TYPE.cardTitle, fontSize: 15, lineHeight: 20, color: COLORS.ink },
  struck: { textDecorationLine: 'line-through' },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm },
  now: { paddingHorizontal: 7, paddingVertical: 2, borderRadius: RADIUS.pill, backgroundColor: COLORS.band },
  nowText: { fontFamily: FONTS.bold, fontSize: 11, color: COLORS.yellow },
  detail: { ...TYPE.small, flexShrink: 1, color: COLORS.muted },
});
