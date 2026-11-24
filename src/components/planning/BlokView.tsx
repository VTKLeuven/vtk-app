import * as WebBrowser from 'expo-web-browser';
import {
  ArrowRight,
  BookOpen,
  Check,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  GraduationCap,
  Pencil,
  Timer,
  Trash2,
  X,
} from 'lucide-react-native';
import { useEffect, useMemo, useState } from 'react';
import { Alert, Pressable, StyleSheet, Switch, Text, TextInput, View } from 'react-native';

import type { AppPlanningExam, AppPlanningTask } from '../../api/contract';
import { searchBurgieclanCourses } from '../../api/endpoints';
import { buildBlok, dayDistance, monthWeeks, shiftMonth, type BlokView as Blok } from '../../planning/blok';
import { shortDay, weekdayOf } from '../../planning/grid';
import type { PlanningHandle } from '../../planning/usePlanning';
import { useApp } from '../../state/app';
import { COLORS, COURSE_COLORS, FONTS, PLANNING, RADIUS, SPACING, TYPE } from '../../theme/tokens';
import { CARD_SHADOW } from '../HomeSection';
import { Button } from '../ui';
import { Sheet } from './PlanningSheets';

/** De bibplaatsen van KU Leuven reserveer je in KURT. */
export const KURT_URL = 'https://kurt3.ghum.kuleuven.be/';

const WEEKDAYS = ['ma', 'di', 'wo', 'do', 'vr', 'za', 'zo'];
const WEEKDAYS_LONG = ['maandag', 'dinsdag', 'woensdag', 'donderdag', 'vrijdag', 'zaterdag', 'zondag'];
const MONTHS_LONG = [
  'januari', 'februari', 'maart', 'april', 'mei', 'juni',
  'juli', 'augustus', 'september', 'oktober', 'november', 'december',
];

const longDay = (date: string) =>
  `${WEEKDAYS_LONG[weekdayOf(date)]} ${Number(date.slice(8, 10))} ${MONTHS_LONG[Number(date.slice(5, 7)) - 1]}`;
const monthTitle = (month: string) => `${MONTHS_LONG[Number(month.slice(5, 7)) - 1]} ${month.slice(0, 4)}`;
const colourOf = (index: number) => COURSE_COLORS[index % COURSE_COLORS.length];

/**
 * Het tabblad Blok van de planner van Burgieclan: een kalender die je zelf
 * invult. Je examens op hun dag, per dag wat je wil doen voor welk vak
 * (afvinken als het gedaan is), en vrije dagen. Er wordt niets voor je gepland,
 * en het werkt ook zonder lessenrooster.
 *
 * De studietimer van Burgieclan staat hier niet: in de app is dat Samen blokken
 * (Studies), en een kaart verwijst ernaar. Een bibplaats reserveer je in KURT van
 * KU Leuven; dat is een andere site en opent dus in de browser.
 */
export function BlokView({
  handle,
  header,
  onOpenStudies,
}: {
  handle: PlanningHandle;
  /** De werkbalk, die meeschuift met de rest. */
  header: React.ReactNode;
  onOpenStudies: () => void;
}) {
  const data = handle.data!;
  const view = useMemo(() => buildBlok(data), [data]);
  const [selected, setSelected] = useState(view.today);
  const [month, setMonth] = useState(view.today.slice(0, 7));
  const [examSheet, setExamSheet] = useState<{ date: string; exam: AppPlanningExam | null } | null>(null);
  const nextLabel = view.next ? (view.course(view.next.exam.subject)?.label ?? view.next.exam.subjectLabel) : '';

  const select = (date: string) => {
    setSelected(date);
    setMonth(date.slice(0, 7));
  };

  return (
    <View style={styles.gap}>
      {header}
      <View style={styles.content}>
        <View style={styles.hero}>
          <Text style={styles.heroTitle}>
            {view.next
              ? view.next.days === 0
                ? `Vandaag: examen ${nextLabel}`
                : view.next.days === 1
                  ? 'Morgen je volgende examen'
                  : `Nog ${view.next.days} dagen tot je volgende examen`
              : 'Je blok'}
          </Text>
          <Text style={styles.heroText}>
            {view.next && view.next.days > 0
              ? `Volgende: ${nextLabel}, ${shortDay(view.next.exam.date)}${view.next.exam.time ? ` om ${view.next.exam.time}` : ''}.`
              : 'Zet je examens in de kalender en plan per dag wat je wil doen. Tik op een dag om te beginnen.'}
          </Text>
        </View>

        {view.missed.length > 0 ? (
          <View style={styles.catchup}>
            <Text style={styles.catchupText}>
              <Text style={styles.catchupStrong}>
                {view.missed.length === 1 ? '1 taak is' : `${view.missed.length} taken zijn`} voorbij en niet afgevinkt.
              </Text>{' '}
              Zet ze op vandaag, of open de dag om ze ergens anders te zetten.
            </Text>
            <Pressable
              accessibilityRole="button"
              disabled={handle.busy}
              onPress={() => void handle.run({ op: 'catchUp', date: view.today }).then((ok) => ok && select(view.today))}
              style={({ pressed }) => [styles.catchupButton, pressed && styles.pressed]}
            >
              <ArrowRight size={15} color={COLORS.surface} />
              <Text style={styles.catchupButtonText}>Naar vandaag</Text>
            </Pressable>
          </View>
        ) : null}

        <MonthCalendar view={view} month={month} selected={selected} onMonth={setMonth} onSelect={setSelected} />

        <View style={styles.courses}>
          {view.courses.map((c) => (
            <Pressable
              key={c.key}
              accessibilityRole="button"
              disabled={!c.exam}
              onPress={() => c.exam && select(c.exam.date)}
              style={({ pressed }) => [styles.courseChip, pressed && styles.pressed]}
            >
              <View style={[styles.swatch, { backgroundColor: colourOf(c.colour) }]} />
              <View style={styles.flexShrink}>
                <Text style={styles.courseChipLabel} numberOfLines={1}>
                  {c.label}
                </Text>
                <Text style={styles.courseChipMeta} numberOfLines={1}>
                  {c.exam
                    ? `${shortDay(c.exam.date)}${c.exam.date >= view.today ? `, ${dayDistance(c.exam.date, view.today)}` : ''}`
                    : 'Geen examen ingevuld'}
                  {c.tasks > 0 ? ` · ${c.done}/${c.tasks} gedaan` : ''}
                </Text>
                {c.missed > 0 ? (
                  <Text style={styles.missedSmall}>{c.missed === 1 ? '1 taak' : `${c.missed} taken`} in te halen</Text>
                ) : null}
              </View>
            </Pressable>
          ))}
          <Pressable
            accessibilityRole="button"
            onPress={() => setExamSheet({ date: selected, exam: null })}
            style={({ pressed }) => [styles.courseChip, styles.addChip, pressed && styles.pressed]}
          >
            <GraduationCap size={16} color={COLORS.ink} />
            <Text style={styles.courseChipLabel}>Examen toevoegen</Text>
          </Pressable>
        </View>

        <DayDetails
          key={selected}
          date={selected}
          view={view}
          handle={handle}
          onAddExam={() => setExamSheet({ date: selected, exam: null })}
          onEditExam={(exam) => setExamSheet({ date: exam.date, exam })}
          onToday={selected !== view.today ? () => select(view.today) : undefined}
        />

        <LinkCard
          icon={BookOpen}
          title="Een bibplaats nodig?"
          text="Reserveer een plaats in een bib van KU Leuven via KURT."
          external
          onPress={() => void WebBrowser.openBrowserAsync(KURT_URL)}
        />
        <LinkCard
          icon={Timer}
          title="Samen blokken"
          text="Zet de studietimer aan en zie wie van je studiegroep nu ook zit."
          onPress={onOpenStudies}
        />
      </View>

      {examSheet ? (
        <ExamSheet
          key={examSheet.exam?.id ?? `nieuw-${examSheet.date}`}
          view={view}
          handle={handle}
          date={examSheet.date}
          exam={examSheet.exam}
          onDone={(date) => {
            setExamSheet(null);
            if (date) select(date);
          }}
        />
      ) : null}
    </View>
  );
}

function LinkCard({
  icon: Icon,
  title,
  text,
  external,
  onPress,
}: {
  icon: typeof BookOpen;
  title: string;
  text: string;
  external?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole={external ? 'link' : 'button'}
      accessibilityHint={external ? 'Opent in de browser' : undefined}
      onPress={onPress}
      style={({ pressed }) => [styles.linkCard, pressed && styles.pressed]}
    >
      <View style={styles.linkIcon}>
        <Icon size={19} color={COLORS.ink} />
      </View>
      <View style={styles.flex}>
        <Text style={styles.linkTitle}>{title}</Text>
        <Text style={styles.linkText}>{text}</Text>
      </View>
      {external ? <ExternalLink size={17} color={COLORS.muted} /> : <ChevronRight size={18} color={COLORS.muted} />}
    </Pressable>
  );
}

// ── De maand ────────────────────────────────────────────────────────────────

function MonthCalendar({
  view,
  month,
  selected,
  onMonth,
  onSelect,
}: {
  view: Blok;
  month: string;
  selected: string;
  onMonth: (month: string) => void;
  onSelect: (date: string) => void;
}) {
  const weeks = monthWeeks(month);
  return (
    <View style={styles.card}>
      <View style={styles.monthHead}>
        <Text style={styles.monthTitle}>{monthTitle(month)}</Text>
        <Pressable accessibilityRole="button" accessibilityLabel="Vorige maand" hitSlop={8} onPress={() => onMonth(shiftMonth(month, -1))} style={styles.monthNav}>
          <ChevronLeft size={20} color={COLORS.ink} />
        </Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel="Volgende maand" hitSlop={8} onPress={() => onMonth(shiftMonth(month, 1))} style={styles.monthNav}>
          <ChevronRight size={20} color={COLORS.ink} />
        </Pressable>
      </View>
      <View style={styles.weekRow}>
        {WEEKDAYS.map((day) => (
          <Text key={day} style={styles.weekday}>
            {day}
          </Text>
        ))}
      </View>
      {weeks.map((week) => (
        <View key={week[0]} style={styles.weekRow}>
          {week.map((date) => {
            const day = view.day(date);
            const inMonth = date.slice(0, 7) === month;
            const isToday = date === view.today;
            const isSelected = date === selected;
            const label = [
              longDay(date),
              day.free ? 'vrije dag' : null,
              ...day.exams.map((e) => `examen ${view.course(e.subject)?.label ?? e.subjectLabel}`),
              day.tasks.length > 0 ? `${day.tasks.length} ${day.tasks.length === 1 ? 'taak' : 'taken'}` : null,
            ]
              .filter(Boolean)
              .join(', ');
            return (
              <Pressable
                key={date}
                accessibilityRole="button"
                accessibilityState={{ selected: isSelected }}
                accessibilityLabel={label}
                onPress={() => onSelect(date)}
                style={[styles.cell, day.free && styles.cellFree, isSelected && styles.cellSelected]}
              >
                <View style={[styles.dayNumber, isToday && styles.dayToday]}>
                  <Text style={[styles.dayText, !inMonth && styles.dayOutside, isToday && styles.dayTextToday]}>
                    {Number(date.slice(8, 10))}
                  </Text>
                </View>
                {day.exams.slice(0, 2).map((exam) => (
                  <View
                    key={exam.id}
                    style={[styles.examBar, { backgroundColor: colourOf(view.course(exam.subject)?.colour ?? 0) }]}
                  />
                ))}
                {day.tasks.length > 0 ? (
                  <View style={styles.dots}>
                    {day.tasks.slice(0, 4).map((task) => {
                      const missed = !task.done && task.date < view.today;
                      const course = view.course(task.subject);
                      return (
                        <View
                          key={task.id}
                          style={[
                            styles.dot,
                            {
                              backgroundColor: task.done
                                ? COLORS.line2
                                : missed
                                  ? PLANNING.catchupFill
                                  : course
                                    ? colourOf(course.colour)
                                    : COLORS.muted,
                            },
                          ]}
                        />
                      );
                    })}
                  </View>
                ) : day.free ? (
                  <Text style={styles.freeLabel}>vrij</Text>
                ) : null}
              </Pressable>
            );
          })}
        </View>
      ))}
    </View>
  );
}

// ── Eén dag ─────────────────────────────────────────────────────────────────

function DayDetails({
  date,
  view,
  handle,
  onAddExam,
  onEditExam,
  onToday,
}: {
  date: string;
  view: Blok;
  handle: PlanningHandle;
  onAddExam: () => void;
  onEditExam: (exam: AppPlanningExam) => void;
  onToday?: () => void;
}) {
  const day = view.day(date);
  const isToday = date === view.today;
  const [editing, setEditing] = useState<string | null>(null);

  const deleteExam = (exam: AppPlanningExam) => {
    const name = view.course(exam.subject)?.label ?? exam.subjectLabel;
    Alert.alert('Examen verwijderen?', `${name} op ${shortDay(exam.date)} gaat uit je blokkalender. Je taken voor dit vak blijven staan.`, [
      { text: 'Behouden', style: 'cancel' },
      { text: 'Verwijderen', style: 'destructive', onPress: () => void handle.run({ op: 'deleteExam', id: exam.id }) },
    ]);
  };

  return (
    <View style={[styles.card, styles.dayCard]}>
      <View>
        {isToday ? <Text style={styles.kicker}>Vandaag</Text> : null}
        <Text style={styles.dayTitle}>{longDay(date).replace(/^./, (c) => c.toUpperCase())}</Text>
      </View>
      <View style={styles.freeRow}>
        <Text style={styles.freeText}>Vrije dag</Text>
        <Switch
          value={day.free}
          disabled={handle.busy}
          onValueChange={(value) => void handle.run({ op: 'freeDay', date, value })}
          trackColor={{ true: COLORS.ink, false: COLORS.line2 }}
          accessibilityLabel="Vrije dag"
        />
      </View>

      {day.exams.length > 0 ? (
        <View style={styles.stack}>
          <Text style={styles.label}>Examens</Text>
          {day.exams.map((exam) => (
            <View key={exam.id} style={[styles.exam, { backgroundColor: colourOf(view.course(exam.subject)?.colour ?? 0) }]}>
              <GraduationCap size={17} color={COLORS.surface} />
              <Text style={styles.examText} numberOfLines={2}>
                {view.course(exam.subject)?.label ?? exam.subjectLabel}
                {exam.time ? <Text style={styles.examTime}>  {exam.time}</Text> : null}
              </Text>
              <Pressable accessibilityRole="button" accessibilityLabel="Examen wijzigen" hitSlop={8} onPress={() => onEditExam(exam)} style={styles.examAction}>
                <Pencil size={15} color={COLORS.surface} />
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Examen verwijderen"
                hitSlop={8}
                disabled={handle.busy}
                onPress={() => deleteExam(exam)}
                style={styles.examAction}
              >
                <Trash2 size={15} color={COLORS.surface} />
              </Pressable>
            </View>
          ))}
        </View>
      ) : null}

      <View style={styles.stack}>
        <Text style={styles.label}>Wat wil je doen?</Text>
        {day.tasks.length === 0 ? (
          <Text style={styles.muted}>{day.free ? (isToday ? 'Vandaag is een vrije dag. Geniet ervan.' : 'Een vrije dag.') : 'Nog niets gepland.'}</Text>
        ) : (
          day.tasks.map((task) =>
            editing === task.id ? (
              <TaskForm
                key={task.id}
                view={view}
                date={task.date}
                task={task}
                busy={handle.busy}
                onSubmit={async (input) => {
                  const ok = await handle.run({ op: 'updateTask', id: task.id, task: input });
                  if (ok) setEditing(null);
                  return ok;
                }}
                onCancel={() => setEditing(null)}
              />
            ) : (
              <TaskRow key={task.id} task={task} view={view} handle={handle} onEdit={() => setEditing(task.id)} />
            ),
          )
        )}
        <View style={styles.divider} />
        <TaskForm
          view={view}
          date={date}
          busy={handle.busy}
          onSubmit={(input) => handle.run({ op: 'addTask', task: input })}
        />
      </View>

      <View style={styles.dayActions}>
        <Pressable accessibilityRole="button" onPress={onAddExam} style={({ pressed }) => [styles.smallButton, pressed && styles.pressed]}>
          <GraduationCap size={15} color={COLORS.ink} />
          <Text style={styles.smallButtonText}>Examen op deze dag</Text>
        </Pressable>
        {onToday ? (
          <Pressable accessibilityRole="button" onPress={onToday} hitSlop={6}>
            <Text style={styles.link}>Terug naar vandaag</Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

function TaskRow({ task, view, handle, onEdit }: { task: AppPlanningTask; view: Blok; handle: PlanningHandle; onEdit: () => void }) {
  const course = view.course(task.subject);
  const missed = !task.done && task.date < view.today;
  const showTitle = !course || task.title !== course.label;
  const label = course && showTitle ? `${course.label}: ${task.title}` : task.title;
  return (
    <View style={[styles.task, missed && styles.taskMissed]}>
      <Pressable
        accessibilityRole="checkbox"
        accessibilityState={{ checked: task.done }}
        accessibilityLabel={label}
        disabled={handle.busy}
        onPress={() => void handle.run({ op: 'taskDone', id: task.id, value: !task.done })}
        hitSlop={8}
        style={styles.taskCheckHit}
      >
        <View style={[styles.taskCheck, task.done && styles.taskCheckDone, missed && { borderColor: PLANNING.catchupFill }]}>
          {task.done ? <Check size={13} color={COLORS.surface} strokeWidth={3} /> : null}
        </View>
      </Pressable>
      <View style={styles.flex}>
        {course ? (
          <View style={styles.taskCourse}>
            <View style={[styles.swatchSmall, { backgroundColor: colourOf(course.colour) }]} />
            <Text style={styles.taskCourseText} numberOfLines={1}>
              {course.label}
            </Text>
          </View>
        ) : null}
        {showTitle ? <Text style={[styles.taskTitle, task.done && styles.struck]}>{task.title}</Text> : null}
        {missed ? <Text style={styles.missedSmall}>in te halen</Text> : null}
      </View>
      <Pressable accessibilityRole="button" accessibilityLabel={`${label} wijzigen`} hitSlop={6} onPress={onEdit} style={styles.iconHit}>
        <Pencil size={15} color={COLORS.muted} />
      </Pressable>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${label} verwijderen`}
        hitSlop={6}
        disabled={handle.busy}
        onPress={() => void handle.run({ op: 'deleteTask', id: task.id })}
        style={styles.iconHit}
      >
        <Trash2 size={15} color={COLORS.muted} />
      </Pressable>
    </View>
  );
}

// ── Formulieren ─────────────────────────────────────────────────────────────

type Picked = { key: string; label: string };

/**
 * Een vak kiezen: een van je eigen vakken (examens, taken, lessenrooster), een
 * vak uit de catalogus van Burgieclan, of gewoon een naam die je intypt. Zoals
 * de keuzelijst op Burgieclan, maar in de lijst eronder in plaats van in een
 * zwevend menu.
 */
function CoursePicker({
  view,
  value,
  onChange,
  placeholder,
}: {
  view: Blok;
  value: Picked | null;
  onChange: (course: Picked | null) => void;
  placeholder: string;
}) {
  const { locale } = useApp();
  const [query, setQuery] = useState('');
  const [focused, setFocused] = useState(false);
  // Wat de catalogus antwoordde, samen met de vraag: een antwoord op een oudere vraag telt niet.
  const [result, setResult] = useState<{ query: string; courses: Picked[] }>({ query: '', courses: [] });
  const typed = query.trim().replace(/\s+/g, ' ');
  const found = result.query === typed ? result.courses : [];

  useEffect(() => {
    if (typed.length < 2) return;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      searchBurgieclanCourses(locale, typed, controller.signal)
        .then((answer) =>
          setResult({ query: typed, courses: answer.courses.slice(0, 5).map((c) => ({ key: `course:${c.id}`, label: c.name })) }),
        )
        .catch(() => undefined);
    }, 300);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [typed, locale]);

  if (value) {
    const own = view.course(value.key);
    return (
      <View style={styles.picked}>
        <View style={[styles.swatchSmall, { backgroundColor: own ? colourOf(own.colour) : COLORS.line2 }]} />
        <Text style={styles.pickedText} numberOfLines={2}>
          {value.label}
        </Text>
        <Pressable accessibilityRole="button" accessibilityLabel={`${value.label} wissen`} hitSlop={8} onPress={() => onChange(null)}>
          <X size={16} color={COLORS.muted} />
        </Pressable>
      </View>
    );
  }

  const needle = typed.toLowerCase();
  const own = view.options.filter((o) => !needle || o.label.toLowerCase().includes(needle)).slice(0, needle ? 5 : 8);
  const catalogue = found.filter((c) => !own.some((o) => o.key === c.key));
  const exact = [...own, ...catalogue].some((o) => o.label.toLowerCase() === needle);
  const open = focused || typed.length > 0;

  return (
    <View>
      <TextInput
        value={query}
        onChangeText={setQuery}
        onFocus={() => setFocused(true)}
        onBlur={() => setTimeout(() => setFocused(false), 150)}
        placeholder={placeholder}
        placeholderTextColor={COLORS.muted}
        autoCorrect={false}
        style={styles.input}
        accessibilityLabel="Vak"
      />
      {open && (own.length > 0 || catalogue.length > 0 || typed) ? (
        <View style={styles.suggestions}>
          {own.map((o) => (
            <Suggestion key={o.key} label={o.label} colour={view.course(o.key) ? colourOf(view.course(o.key)!.colour) : COLORS.line2} onPress={() => onChange(o)} />
          ))}
          {catalogue.map((o) => (
            <Suggestion key={o.key} label={o.label} onPress={() => onChange(o)} />
          ))}
          {typed && !exact ? (
            <Suggestion label={`‘${typed}’ als eigen vak`} onPress={() => onChange({ key: `name:${typed}`, label: typed })} />
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

function Suggestion({ label, colour, onPress }: { label: string; colour?: string; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => [styles.suggestion, pressed && styles.pressed]}>
      <View style={[styles.swatchSmall, { backgroundColor: colour ?? COLORS.line2 }]} />
      <Text style={styles.suggestionText} numberOfLines={2}>
        {label}
      </Text>
    </Pressable>
  );
}

function TaskForm({
  view,
  date,
  task,
  busy,
  onSubmit,
  onCancel,
}: {
  view: Blok;
  date: string;
  task?: AppPlanningTask;
  busy: boolean;
  onSubmit: (input: { date: string; subject: string | null; title: string }) => Promise<boolean>;
  onCancel?: () => void;
}) {
  const [course, setCourse] = useState<Picked | null>(
    task?.subject ? { key: task.subject, label: view.course(task.subject)?.label ?? task.subjectLabel ?? task.subject } : null,
  );
  const [title, setTitle] = useState(task && (!task.subject || task.title !== task.subjectLabel) ? task.title : '');
  const ready = Boolean(title.trim() || course);

  const submit = async () => {
    if (!ready) return;
    // Een vak zonder titel is ook een plan; Burgieclan neemt dan de naam van het vak.
    const sameAsCourse = course && title.trim() === course.label;
    const ok = await onSubmit({ date: task?.date ?? date, subject: course?.key ?? null, title: sameAsCourse ? '' : title.trim() });
    if (ok && !task) {
      setTitle('');
      setCourse(null);
    }
  };

  return (
    <View style={styles.form}>
      <CoursePicker view={view} value={course} onChange={setCourse} placeholder="Vak (optioneel)" />
      <TextInput
        value={title}
        onChangeText={setTitle}
        placeholder="bv. H1 - H3, lesvideo 1 - 2"
        placeholderTextColor={COLORS.muted}
        style={styles.input}
        returnKeyType="done"
        onSubmitEditing={() => void submit()}
        accessibilityLabel="Wat wil je doen?"
      />
      <View style={styles.formActions}>
        {onCancel ? (
          <Pressable accessibilityRole="button" onPress={onCancel} hitSlop={6}>
            <Text style={styles.link}>Annuleren</Text>
          </Pressable>
        ) : null}
        <Pressable
          accessibilityRole="button"
          disabled={!ready || busy}
          onPress={() => void submit()}
          style={({ pressed }) => [styles.addButton, (!ready || busy) && styles.disabled, pressed && styles.pressed]}
        >
          <Text style={styles.addButtonText}>{task ? 'Opslaan' : 'Toevoegen'}</Text>
        </Pressable>
      </View>
    </View>
  );
}

const TIME = /^([01]?\d|2[0-3])[:.u]([0-5]\d)$/;

function ExamSheet({
  view,
  handle,
  date,
  exam,
  onDone,
}: {
  view: Blok;
  handle: PlanningHandle;
  date: string;
  exam: AppPlanningExam | null;
  onDone: (date: string | null) => void;
}) {
  const [course, setCourse] = useState<Picked | null>(
    exam ? { key: exam.subject, label: view.course(exam.subject)?.label ?? exam.subjectLabel } : null,
  );
  const [time, setTime] = useState(exam?.time ?? '');
  const trimmed = time.trim();
  const match = TIME.exec(trimmed);
  const timeValue = match ? `${match[1].padStart(2, '0')}:${match[2]}` : null;
  const timeInvalid = trimmed !== '' && !timeValue;

  const save = async () => {
    if (!course || timeInvalid) return;
    const input = { subject: course.key, date, time: timeValue };
    const ok = await handle.run(exam ? { op: 'updateExam', id: exam.id, exam: input } : { op: 'addExam', exam: input });
    if (ok) onDone(date);
  };

  return (
    <Sheet visible title={exam ? 'Examen wijzigen' : `Examen op ${shortDay(date)}`} onClose={() => onDone(null)}>
      <Text style={styles.muted}>
        {exam
          ? 'Een andere dag kies je door het examen hier te verwijderen en op die dag opnieuw toe te voegen.'
          : `Dit examen komt op ${longDay(date)}. Een andere dag? Sluit dit blad en tik eerst die dag aan in de kalender.`}
      </Text>
      <Text style={styles.label}>Vak</Text>
      <CoursePicker view={view} value={course} onChange={setCourse} placeholder="Zoek een vak of typ een naam" />
      <Text style={styles.label}>Uur (optioneel)</Text>
      <TextInput
        value={time}
        onChangeText={setTime}
        placeholder="09:00"
        placeholderTextColor={COLORS.muted}
        keyboardType="numbers-and-punctuation"
        style={[styles.input, timeInvalid && styles.inputInvalid]}
        accessibilityLabel="Uur van het examen"
      />
      {timeInvalid ? <Text style={styles.error}>Schrijf het uur als 09:00.</Text> : null}
      <Button label={exam ? 'Opslaan' : 'Examen toevoegen'} busy={handle.busy} disabled={!course || timeInvalid} onPress={() => void save()} />
    </Sheet>
  );
}

const styles = StyleSheet.create({
  gap: { gap: 0 },
  content: { paddingHorizontal: SPACING.lg, gap: SPACING.md, paddingBottom: SPACING.xxl },
  flex: { flex: 1 },
  flexShrink: { flexShrink: 1 },
  pressed: { opacity: 0.65 },
  disabled: { opacity: 0.4 },
  muted: { ...TYPE.small, color: COLORS.muted },
  label: { fontFamily: FONTS.semibold, fontSize: 12, letterSpacing: 0.6, textTransform: 'uppercase', color: COLORS.muted },
  kicker: { fontFamily: FONTS.semibold, fontSize: 11, letterSpacing: 1, textTransform: 'uppercase', color: PLANNING.lectureText },
  link: { ...TYPE.small, fontFamily: FONTS.semibold, color: COLORS.ink, textDecorationLine: 'underline' },
  error: { ...TYPE.small, color: COLORS.dangerInk },
  struck: { textDecorationLine: 'line-through', color: COLORS.muted },
  stack: { gap: SPACING.sm },
  divider: { height: 1, backgroundColor: COLORS.line, marginVertical: 2 },

  card: { backgroundColor: COLORS.surface, borderRadius: 20, ...CARD_SHADOW },

  hero: { paddingHorizontal: SPACING.xs, gap: 2 },
  heroTitle: { ...TYPE.heading, color: COLORS.ink },
  heroText: { ...TYPE.body, color: COLORS.body },

  catchup: {
    gap: SPACING.sm,
    padding: SPACING.md,
    borderRadius: 16,
    backgroundColor: PLANNING.catchupBg,
    borderWidth: 1,
    borderColor: PLANNING.catchupBorder,
  },
  catchupText: { ...TYPE.small, color: PLANNING.catchupText },
  catchupStrong: { fontFamily: FONTS.semibold },
  catchupButton: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    minHeight: 40,
    paddingHorizontal: SPACING.md,
    borderRadius: RADIUS.pill,
    backgroundColor: PLANNING.catchupText,
  },
  catchupButtonText: { fontFamily: FONTS.semibold, fontSize: 13, color: COLORS.surface },

  monthHead: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: SPACING.md, paddingTop: SPACING.md, paddingBottom: SPACING.xs },
  monthTitle: { fontFamily: FONTS.bold, fontSize: 17, color: COLORS.ink, flex: 1, textTransform: 'capitalize' },
  monthNav: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  weekRow: { flexDirection: 'row', paddingHorizontal: 6 },
  weekday: { flex: 1, textAlign: 'center', ...TYPE.small, fontSize: 11.5, color: COLORS.muted, paddingVertical: 4 },
  cell: {
    flex: 1,
    height: 58,
    alignItems: 'center',
    paddingTop: 4,
    gap: 2,
    borderRadius: 12,
    marginVertical: 1,
    borderWidth: 1.5,
    borderColor: 'transparent',
  },
  cellFree: { backgroundColor: COLORS.paper2 },
  cellSelected: { borderColor: COLORS.ink },
  dayNumber: { minWidth: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  dayToday: { backgroundColor: COLORS.yellow },
  dayText: { fontFamily: FONTS.semibold, fontSize: 13.5, color: COLORS.ink, fontVariant: ['tabular-nums'] },
  dayTextToday: { color: COLORS.ink },
  dayOutside: { color: COLORS.line2 },
  examBar: { width: '72%', height: 5, borderRadius: 3 },
  dots: { flexDirection: 'row', gap: 3 },
  dot: { width: 6, height: 6, borderRadius: 3 },
  freeLabel: { fontFamily: FONTS.medium, fontSize: 9.5, color: COLORS.muted },

  courses: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.sm },
  courseChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    maxWidth: '100%',
    paddingHorizontal: SPACING.md,
    paddingVertical: 8,
    borderRadius: 16,
    backgroundColor: COLORS.surface,
    ...CARD_SHADOW,
  },
  addChip: { borderWidth: 1, borderStyle: 'dashed', borderColor: COLORS.line2, shadowOpacity: 0, elevation: 0 },
  swatch: { width: 12, height: 12, borderRadius: 4 },
  swatchSmall: { width: 10, height: 10, borderRadius: 3 },
  courseChipLabel: { fontFamily: FONTS.semibold, fontSize: 13.5, color: COLORS.ink },
  courseChipMeta: { ...TYPE.small, fontSize: 12, color: COLORS.muted },
  missedSmall: { fontFamily: FONTS.medium, fontSize: 12, color: PLANNING.catchupText },

  dayCard: { padding: SPACING.lg, gap: SPACING.md },
  dayTitle: { ...TYPE.heading, color: COLORS.ink },
  freeRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  freeText: { ...TYPE.body, color: COLORS.body },
  exam: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, paddingHorizontal: SPACING.md, paddingVertical: 10, borderRadius: 12 },
  examText: { flex: 1, fontFamily: FONTS.semibold, fontSize: 14.5, color: COLORS.surface },
  examTime: { fontFamily: FONTS.regular, opacity: 0.85 },
  examAction: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },

  task: { flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: 10, paddingRight: 2 },
  taskMissed: { backgroundColor: PLANNING.catchupBg },
  taskCheckHit: { width: 40, height: 44, alignItems: 'center', justifyContent: 'center' },
  taskCheck: {
    width: 22,
    height: 22,
    borderRadius: 7,
    borderWidth: 1.5,
    borderColor: COLORS.controlBorder,
    alignItems: 'center',
    justifyContent: 'center',
  },
  taskCheckDone: { backgroundColor: COLORS.ink, borderColor: COLORS.ink },
  taskCourse: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  taskCourseText: { fontFamily: FONTS.semibold, fontSize: 14, color: COLORS.ink, flexShrink: 1 },
  taskTitle: { ...TYPE.body, color: COLORS.ink },
  iconHit: { width: 34, height: 40, alignItems: 'center', justifyContent: 'center' },

  form: { gap: SPACING.sm },
  formActions: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: SPACING.lg },
  input: {
    minHeight: 44,
    paddingHorizontal: SPACING.md,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.controlBorder,
    backgroundColor: COLORS.surface,
    ...TYPE.body,
    color: COLORS.ink,
  },
  inputInvalid: { borderColor: COLORS.dangerLine },
  picked: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    minHeight: 44,
    paddingHorizontal: SPACING.md,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.controlBorder,
    backgroundColor: COLORS.surface,
  },
  pickedText: { ...TYPE.body, color: COLORS.ink, flex: 1 },
  suggestions: {
    marginTop: 4,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.line2,
    backgroundColor: COLORS.surface,
    overflow: 'hidden',
  },
  suggestion: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, paddingHorizontal: SPACING.md, minHeight: 42, borderTopWidth: 1, borderTopColor: COLORS.line },
  suggestionText: { ...TYPE.small, fontSize: 14, color: COLORS.ink, flex: 1 },
  addButton: {
    minHeight: 40,
    justifyContent: 'center',
    paddingHorizontal: SPACING.lg,
    borderRadius: RADIUS.pill,
    backgroundColor: COLORS.ink,
  },
  addButtonText: { fontFamily: FONTS.semibold, fontSize: 14, color: COLORS.paper },

  dayActions: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: SPACING.md, flexWrap: 'wrap' },
  smallButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    minHeight: 40,
    paddingHorizontal: SPACING.md,
    borderRadius: RADIUS.pill,
    borderWidth: 1,
    borderColor: COLORS.line2,
  },
  smallButtonText: { fontFamily: FONTS.semibold, fontSize: 13, color: COLORS.ink },

  linkCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
    padding: SPACING.md,
    borderRadius: 18,
    backgroundColor: COLORS.surface,
    ...CARD_SHADOW,
  },
  linkIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.yellow,
  },
  linkTitle: { fontFamily: FONTS.semibold, fontSize: 15, color: COLORS.ink },
  linkText: { ...TYPE.small, color: COLORS.muted },
});
