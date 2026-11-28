import { Check, ChevronDown, ChevronRight } from 'lucide-react-native';
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { shortDay } from '../../planning/grid';
import type { CourseRow, OverviewSession, SemesterView } from '../../planning/overview';
import type { PlanningHandle } from '../../planning/usePlanning';
import { COLORS, FONTS, PLANNING, RADIUS, SPACING, TYPE } from '../../theme/tokens';
import { CARD_SHADOW } from '../HomeSection';
import { IS_EN, t } from '../../i18n';

/**
 * De tabbladen "Per vak" en "Semester" van de planner van Burgieclan, op een
 * telefoon. Dezelfde getallen (zie `planning/overview.ts`), een andere vorm: op
 * een smal scherm wordt de lijst met daarnaast een detail een lijst die openklapt,
 * en het semesterraster schuift horizontaal met de vaknamen vast links.
 *
 * Afvinken hier is afvinken op Burgieclan, zoals in de week.
 */

const FILL = { lecture: PLANNING.lectureFill, practice: PLANNING.practiceFill, other: PLANNING.otherFill } as const;
const PALE = {
  lecture: { bg: PLANNING.lectureBg, border: PLANNING.lectureBorder },
  practice: { bg: PLANNING.practiceBg, border: PLANNING.practiceBorder },
  other: { bg: PLANNING.otherBg, border: PLANNING.otherBorder },
} as const;

const TYPE_PLURAL: Record<string, string> = {
  college: t('Hoorcolleges', 'Lectures'),
  practicum: t('Practica', 'Practicals'),
  oefenzitting: t('Oefenzittingen', 'Exercise sessions'),
  excursie: t('Excursies', 'Excursions'),
  opdracht: t('Opdrachten', 'Assignments'),
};
const TONE_PLURAL = {
  lecture: t('Hoorcolleges', 'Lectures'),
  practice: t('Practica en oefenzittingen', 'Practicals and exercise sessions'),
  other: t('Andere sessies', 'Other sessions'),
} as const;

const MONTHS = IS_EN
  ? ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  : ['jan', 'feb', 'mrt', 'apr', 'mei', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'dec'];
const dayMonth = (date: string) => `${Number(date.slice(8, 10))} ${MONTHS[Number(date.slice(5, 7)) - 1]}`;

// ── Totalen ─────────────────────────────────────────────────────────────────

/** Afgevinkt (donker) en in te halen (roze) als deel van alle lessen van een vak. */
function ProgressBar({ row }: { row: CourseRow }) {
  const total = row.sessions.length || 1;
  return (
    <View style={styles.bar} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <View style={{ width: `${(row.done / total) * 100}%`, backgroundColor: COLORS.strong }} />
      <View style={{ width: `${(row.missed / total) * 100}%`, backgroundColor: PLANNING.catchupFill }} />
    </View>
  );
}

const ratio = (row: CourseRow) => (row.past > 0 ? `${row.done}/${row.past}` : `vanaf ${dayMonth(row.sessions[0].session.date)}`);

// ── Per vak ─────────────────────────────────────────────────────────────────

export function CourseList({
  data,
  open,
  onToggle,
  handle,
  onSelect,
  onOpenCourse,
}: {
  data: SemesterView;
  /** Het vak dat openstaat. */
  open: string | null;
  onToggle: (key: string) => void;
  handle: PlanningHandle;
  onSelect: (uid: string) => void;
  /** Een vak uit de catalogus van Burgieclan: zijn pagina in de app. */
  onOpenCourse: (id: string) => void;
}) {
  return (
    <View style={styles.card}>
      {data.rows.map((row, index) => {
        const expanded = row.key === open;
        return (
          <View key={row.key} style={index > 0 && styles.cardLine}>
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ expanded }}
              accessibilityLabel={t(
                `${row.label}, ${row.done} van ${row.past} afgevinkt${row.missed > 0 ? `, ${row.missed} in te halen` : ''}`,
                `${row.label}, ${row.done} of ${row.past} checked off${row.missed > 0 ? `, ${row.missed} to catch up` : ''}`,
              )}
              onPress={() => onToggle(row.key)}
              style={({ pressed }) => [styles.course, expanded && styles.courseOpen, pressed && styles.pressed]}
            >
              <View style={styles.courseHead}>
                <Text style={styles.courseName}>{row.label}</Text>
                <Text style={styles.courseRatio}>{ratio(row)}</Text>
                {expanded ? (
                  <ChevronDown size={16} color={COLORS.muted} />
                ) : (
                  <ChevronRight size={16} color={COLORS.muted} />
                )}
              </View>
              <View style={styles.courseBarRow}>
                <ProgressBar row={row} />
                {row.missed > 0 ? <Text style={styles.catchup}>{row.missed} in te halen</Text> : null}
              </View>
            </Pressable>
            {expanded ? (
              <CourseDetail row={row} handle={handle} onSelect={onSelect} onOpenCourse={onOpenCourse} />
            ) : null}
          </View>
        );
      })}
    </View>
  );
}

function CourseDetail({
  row,
  handle,
  onSelect,
  onOpenCourse,
}: {
  row: CourseRow;
  handle: PlanningHandle;
  onSelect: (uid: string) => void;
  onOpenCourse: (id: string) => void;
}) {
  const sections = (['lecture', 'practice', 'other'] as const)
    .map((tone) => {
      const sessions = row.sessions.filter((s) => s.tone === tone);
      const types = [...new Set(sessions.map((s) => s.session.type))];
      const title = types.length === 1 && TYPE_PLURAL[types[0]] ? TYPE_PLURAL[types[0]] : TONE_PLURAL[tone];
      const past = sessions.filter((s) => s.past);
      return { tone, title, sessions, past: past.length, done: past.filter((s) => s.session.done).length };
    })
    .filter((s) => s.sessions.length > 0);
  const catalogue = /^course:(\d+)$/.exec(row.key);

  return (
    <View style={styles.detail}>
      <View style={styles.badges}>
        <Text style={[styles.badge, styles.badgeMuted]}>
          {row.done} van {row.past} voorbije afgevinkt
        </Text>
        {row.missed > 0 ? <Text style={[styles.badge, styles.badgeCatchup]}>{row.missed} in te halen</Text> : null}
        <Text style={[styles.badge, styles.badgeMuted]}>{row.upcoming} nog te komen</Text>
        {catalogue ? (
          <Pressable accessibilityRole="link" onPress={() => onOpenCourse(catalogue[1])} hitSlop={4}>
            <Text style={[styles.badge, styles.badgeLink]}>{t('Vak openen', 'Open course')}</Text>
          </Pressable>
        ) : null}
      </View>
      {sections.map((section) => (
        <View key={section.tone} style={styles.section}>
          <View style={styles.sectionHead}>
            <Text style={styles.sectionTitle}>
              {section.title} <Text style={styles.sectionCount}>· {section.sessions.length}</Text>
            </Text>
            <Text style={styles.sectionMeta}>
              {section.past > 0
                ? t(`${section.done} van ${section.past} afgevinkt`, `${section.done} of ${section.past} checked off`)
                : t('nog geen voorbij', 'none past yet')}
            </Text>
          </View>
          {section.sessions.map((s) => (
            <SessionRow
              key={s.session.uid}
              s={s}
              isNext={row.next?.session.uid === s.session.uid}
              handle={handle}
              onSelect={onSelect}
            />
          ))}
        </View>
      ))}
      <Text style={styles.hint}>
        {t('Vink een les af zodra je ze gevolgd of ingehaald hebt. Tik op een datum voor de details, om een les te verbergen of als verplicht aan te duiden.', 'Check off a class once you attended or caught up on it. Tap a date for the details, to hide a class or to mark it as mandatory.')}
      </Text>
    </View>
  );
}

function SessionRow({
  s,
  isNext,
  handle,
  onSelect,
}: {
  s: OverviewSession;
  isNext: boolean;
  handle: PlanningHandle;
  onSelect: (uid: string) => void;
}) {
  const e = s.session;
  const today = handle.data?.today ?? '';
  const canTick = e.date <= today;
  const done = e.done;
  return (
    <View style={[styles.session, s.missed && styles.sessionMissed]}>
      <Pressable
        accessibilityRole="checkbox"
        accessibilityState={{ checked: done, disabled: !canTick }}
        accessibilityLabel={`${shortDay(e.date)}, ${e.start}: ${done ? t('afgevinkt', 'checked off') : s.past ? t('niet afgevinkt', 'not checked off') : t('nog te komen', 'upcoming')}`}
        disabled={!canTick || handle.busy}
        onPress={() => void handle.run({ op: 'done', uid: e.uid, value: !done })}
        hitSlop={8}
        style={styles.checkHit}
      >
        <View
          style={[
            styles.check,
            done
              ? { backgroundColor: FILL[s.tone], borderColor: FILL[s.tone] }
              : s.missed
                ? { borderColor: PLANNING.catchupFill, borderWidth: 2 }
                : styles.checkUpcoming,
          ]}
        >
          {done ? <Check size={13} color={COLORS.plate} strokeWidth={3} /> : null}
        </View>
      </Pressable>
      <Pressable
        accessibilityRole="button"
        accessibilityHint={t('Opent de details van deze les', 'Opens the details of this class')}
        onPress={() => onSelect(e.uid)}
        style={({ pressed }) => [styles.sessionBody, pressed && styles.pressed]}
      >
        <View style={styles.sessionTop}>
          <Text style={styles.week}>W{s.week}</Text>
          <Text style={styles.sessionDay}>{shortDay(e.date)}</Text>
          <Text style={styles.sessionTime}>
            {e.start}
            {e.end ? ` - ${e.end}` : ''}
          </Text>
        </View>
        <View style={styles.sessionBottom}>
          {e.location ? (
            <Text style={styles.sessionPlace} numberOfLines={1}>
              {e.location}
            </Text>
          ) : (
            <View style={{ flex: 1 }} />
          )}
          {isNext ? <Text style={[styles.tag, styles.tagInfo]}>{t('Volgende', 'Next')}</Text> : e.date === today ? <Text style={[styles.tag, styles.tagInfo]}>{t('Vandaag', 'Today')}</Text> : null}
          {s.mandatory ? <Text style={[styles.tag, styles.tagDanger]}>{t('Verplicht', 'Mandatory')}</Text> : null}
          {s.missed ? <Text style={styles.missedText}>{t('Niet afgevinkt', 'Not checked off')}</Text> : null}
        </View>
      </Pressable>
    </View>
  );
}

// ── Semester ────────────────────────────────────────────────────────────────

const NAME_WIDTH = 128;
const WEEK_WIDTH = 38;
const RATIO_WIDTH = 92;
const ROW_HEIGHT = 58;

function squareStyle(s: OverviewSession) {
  const base = s.past
    ? s.missed
      ? { backgroundColor: COLORS.surface, borderWidth: 2, borderColor: PLANNING.catchupFill }
      : { backgroundColor: FILL[s.tone] }
    : { backgroundColor: PALE[s.tone].bg, borderWidth: 1, borderColor: PALE[s.tone].border };
  return s.mandatory ? [base, styles.squareMandatory] : base;
}

export function SemesterGrid({ data, onCourse }: { data: SemesterView; onCourse: (key: string) => void }) {
  const [width, setWidth] = useState(0);
  const weeks = data.mondays.length;
  const currentIndex = data.current === null ? null : data.current - data.firstWeek;
  // Open op de huidige week, met een paar weken ervoor in beeld.
  const initialX = useMemo(
    () => (currentIndex === null ? 0 : Math.max(0, (currentIndex - 2) * WEEK_WIDTH)),
    [currentIndex],
  );

  return (
    <View style={styles.gap}>
      <Text style={styles.intro}>
        {t('Elk vierkantje is een les. Vol is afgevinkt, een roze rand is voorbij en niet afgevinkt, licht is nog te komen. Tik op een vak voor zijn lessen.', 'Each square is a class. Filled is checked off, a pink border is past and not checked off, light is upcoming. Tap a course for its classes.')}
      </Text>
      <View style={styles.legend}>
        <Legend style={{ backgroundColor: PLANNING.lectureFill }} label={t('Hoorcollege', 'Lecture')} />
        <Legend style={{ backgroundColor: PLANNING.practiceFill }} label={t('Practicum', 'Practical')} />
        <Legend style={{ backgroundColor: PLANNING.otherFill }} label={t('Andere', 'Other')} />
        <Legend style={{ borderWidth: 2, borderColor: PLANNING.catchupFill }} label={t('In te halen', 'To catch up')} />
        <Legend style={[{ backgroundColor: PLANNING.practiceBg, borderWidth: 1, borderColor: PLANNING.practiceBorder }, styles.squareMandatory]} label={t('Verplicht', 'Mandatory')} />
      </View>

      <View style={[styles.card, styles.gridCard]} onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
        <View style={{ width: NAME_WIDTH }}>
          <View style={[styles.gridHead, styles.nameCell]}>
            <Text style={styles.gridHeadText}>{t('Vak', 'Course')}</Text>
          </View>
          {data.rows.map((row) => (
            <Pressable
              key={row.key}
              accessibilityRole="button"
              accessibilityLabel={t(`${row.label}: lessen bekijken`, `${row.label}: view classes`)}
              onPress={() => onCourse(row.key)}
              style={({ pressed }) => [styles.nameCell, styles.gridRow, pressed && styles.pressed]}
            >
              <Text style={styles.gridName} numberOfLines={3}>
                {row.label}
              </Text>
            </Pressable>
          ))}
        </View>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentOffset={{ x: initialX, y: 0 }}
          style={{ width: Math.max(0, width - NAME_WIDTH) }}
        >
          <View>
            <View style={[styles.gridHead, styles.flexRow]}>
              {data.mondays.map((monday, i) => {
                const now = currentIndex === i;
                return (
                  <View key={monday} style={[styles.weekHead, now && styles.weekNow]}>
                    <Text style={[styles.weekLabel, now && styles.weekLabelNow]}>W{data.firstWeek + i}</Text>
                    <Text style={styles.weekDate}>{dayMonth(monday)}</Text>
                  </View>
                );
              })}
              <View style={[styles.ratioCell, styles.ratioHead]}>
                <Text style={styles.gridHeadText}>{t('Afgevinkt', 'Checked off')}</Text>
              </View>
            </View>
            {data.rows.map((row) => (
              <View key={row.key} style={[styles.flexRow, styles.gridRow]}>
                {Array.from({ length: weeks }, (_, i) => {
                  const sessions = row.sessions.filter((s) => s.week === data.firstWeek + i);
                  return (
                    <View key={i} style={[styles.weekCell, currentIndex === i && styles.weekNow]}>
                      {sessions.map((s) => (
                        <View key={s.session.uid} style={[styles.square, squareStyle(s)]} />
                      ))}
                    </View>
                  );
                })}
                <View style={styles.ratioCell}>
                  <Text style={styles.ratioNumber}>{row.past > 0 ? `${row.done} / ${row.past}` : '0'}</Text>
                  <Text
                    style={[
                      styles.ratioNote,
                      row.past === 0 ? null : row.missed > 0 ? { color: PLANNING.catchupText } : { color: COLORS.okInk },
                    ]}
                    numberOfLines={2}
                  >
                    {row.past === 0
                      ? t(`start ${dayMonth(row.sessions[0].session.date)}`, `starts ${dayMonth(row.sessions[0].session.date)}`)
                      : row.missed > 0
                        ? t(`${row.missed} in te halen`, `${row.missed} to catch up`)
                        : t('alles afgevinkt', 'all checked off')}
                  </Text>
                </View>
              </View>
            ))}
          </View>
        </ScrollView>
      </View>
      {weeks > 6 ? <Text style={styles.hint}>{t('Veeg opzij voor de andere weken.', 'Swipe sideways for the other weeks.')}</Text> : null}
    </View>
  );
}

function Legend({ style, label }: { style: object; label: string }) {
  return (
    <View style={styles.legendItem}>
      <View style={[styles.legendSwatch, style]} />
      <Text style={styles.legendLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pressed: { opacity: 0.65 },
  gap: { gap: SPACING.md },
  flexRow: { flexDirection: 'row' },
  hint: { ...TYPE.small, color: COLORS.muted },
  intro: { ...TYPE.small, color: COLORS.body },


  card: { backgroundColor: COLORS.surface, borderRadius: 20, overflow: 'hidden', ...CARD_SHADOW },
  cardLine: { borderTopWidth: 1, borderTopColor: COLORS.line },

  course: { paddingHorizontal: SPACING.lg, paddingVertical: SPACING.md, gap: 8 },
  courseOpen: { backgroundColor: COLORS.paper2 },
  courseHead: { flexDirection: 'row', alignItems: 'flex-start', gap: SPACING.sm },
  courseName: { fontFamily: FONTS.semibold, fontSize: 15, lineHeight: 20, color: COLORS.ink, flex: 1 },
  courseRatio: { ...TYPE.small, fontFamily: FONTS.medium, color: COLORS.muted, fontVariant: ['tabular-nums'] },
  courseBarRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm },
  bar: { flex: 1, height: 6, borderRadius: 3, overflow: 'hidden', flexDirection: 'row', backgroundColor: COLORS.paper2 },
  catchup: { fontFamily: FONTS.medium, fontSize: 12, color: PLANNING.catchupText },

  detail: { paddingHorizontal: SPACING.md, paddingBottom: SPACING.lg, gap: SPACING.md, backgroundColor: COLORS.paper2 },
  badges: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, paddingHorizontal: SPACING.xs },
  badge: {
    fontFamily: FONTS.medium,
    fontSize: 12,
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: RADIUS.pill,
    overflow: 'hidden',
    borderWidth: 1,
  },
  badgeMuted: { color: COLORS.body, borderColor: COLORS.line2, backgroundColor: COLORS.surface },
  badgeCatchup: { color: PLANNING.catchupText, borderColor: PLANNING.catchupBorder, backgroundColor: PLANNING.catchupBg },
  badgeLink: { color: PLANNING.lectureText, borderColor: PLANNING.lectureBorder, backgroundColor: PLANNING.lectureBg },

  section: { backgroundColor: COLORS.surface, borderRadius: 14, paddingHorizontal: SPACING.sm, paddingBottom: 4 },
  sectionHead: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: 4,
    paddingHorizontal: SPACING.xs,
    paddingTop: SPACING.md,
    paddingBottom: SPACING.sm,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.line,
  },
  sectionTitle: { fontFamily: FONTS.semibold, fontSize: 14, color: COLORS.ink },
  sectionCount: { fontFamily: FONTS.regular, color: COLORS.muted },
  sectionMeta: { ...TYPE.small, color: COLORS.muted },

  session: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 10,
    marginTop: 4,
  },
  sessionMissed: { backgroundColor: PLANNING.catchupBg },
  checkHit: { width: 44, height: 48, alignItems: 'center', justifyContent: 'center' },
  check: {
    width: 22,
    height: 22,
    borderRadius: 7,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: 'transparent',
    backgroundColor: COLORS.surface,
  },
  checkUpcoming: { borderStyle: 'dashed', borderColor: COLORS.line2 },
  sessionBody: { flex: 1, paddingVertical: 8, paddingRight: SPACING.sm, gap: 2 },
  sessionTop: { flexDirection: 'row', alignItems: 'baseline', gap: 8 },
  week: { fontFamily: FONTS.regular, fontSize: 11, color: COLORS.muted, fontVariant: ['tabular-nums'] },
  sessionDay: { fontFamily: FONTS.semibold, fontSize: 14, color: COLORS.ink },
  sessionTime: { ...TYPE.small, color: COLORS.body, fontVariant: ['tabular-nums'] },
  sessionBottom: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  sessionPlace: { ...TYPE.small, color: COLORS.muted, flex: 1 },
  tag: {
    fontFamily: FONTS.semibold,
    fontSize: 10.5,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    overflow: 'hidden',
  },
  tagInfo: { color: PLANNING.lectureText, backgroundColor: PLANNING.lectureBg },
  tagDanger: { color: PLANNING.dangerText, backgroundColor: COLORS.dangerBg },
  missedText: { fontFamily: FONTS.medium, fontSize: 12, color: PLANNING.catchupText },

  legend: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.md },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  legendSwatch: { width: 12, height: 12, borderRadius: 3 },
  legendLabel: { ...TYPE.small, color: COLORS.muted },

  gridCard: { flexDirection: 'row' },
  gridHead: { height: 44, borderBottomWidth: 1, borderBottomColor: COLORS.line, backgroundColor: COLORS.paper2 },
  gridHeadText: { fontFamily: FONTS.medium, fontSize: 12, color: COLORS.muted },
  nameCell: { justifyContent: 'center', paddingHorizontal: SPACING.md },
  gridRow: { height: ROW_HEIGHT, borderBottomWidth: 1, borderBottomColor: COLORS.line },
  gridName: { fontFamily: FONTS.medium, fontSize: 12.5, lineHeight: 16, color: COLORS.ink },
  weekHead: { width: WEEK_WIDTH, alignItems: 'center', justifyContent: 'center' },
  weekNow: { backgroundColor: COLORS.paper2 },
  weekLabel: { fontFamily: FONTS.medium, fontSize: 11, color: COLORS.muted },
  weekLabelNow: { fontFamily: FONTS.bold, color: COLORS.ink, borderBottomWidth: 2, borderBottomColor: COLORS.yellow },
  weekDate: { fontFamily: FONTS.regular, fontSize: 9.5, color: COLORS.muted },
  weekCell: {
    width: WEEK_WIDTH,
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignContent: 'center',
    justifyContent: 'center',
    gap: 3,
    paddingHorizontal: 2,
  },
  square: { width: 11, height: 11, borderRadius: 3 },
  squareMandatory: { outlineColor: PLANNING.danger, outlineWidth: 1.5, outlineOffset: 1, outlineStyle: 'solid' },
  ratioCell: { width: RATIO_WIDTH, alignItems: 'flex-end', justifyContent: 'center', paddingHorizontal: SPACING.md },
  ratioHead: { height: 44 },
  ratioNumber: { fontFamily: FONTS.semibold, fontSize: 13, color: COLORS.ink, fontVariant: ['tabular-nums'] },
  ratioNote: { fontFamily: FONTS.medium, fontSize: 10.5, color: COLORS.muted, textAlign: 'right' },
});
