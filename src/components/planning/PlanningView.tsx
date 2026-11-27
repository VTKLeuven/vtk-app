import { Image } from 'expo-image';
import { useFocusEffect } from 'expo-router';
import { AlertTriangle, CalendarPlus, Check, ChevronLeft, ChevronRight, Flag, GraduationCap, Settings2 } from 'lucide-react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Reanimated, { runOnJS, useAnimatedStyle, useSharedValue } from 'react-native-reanimated';
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  type FlatList,
  Pressable,
  RefreshControl,
  ScrollView,
  type ScrollViewInstance,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
  type LayoutChangeEvent,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';

import type { AppLocale, AppPlanningPersonal } from '../../api/contract';
import { messageFor } from '../../api/useResource';
import {
  contentByDay,
  dayNumber,
  dayRange,
  shortDay,
  place,
  weekdayOf,
  weekdayShort,
  type Block,
  type Chip,
  type DayContent,
  type Ref,
} from '../../planning/grid';
import { nowInLeuven } from '../../planning/now';
import { buildSemester, defaultSemester, semesterKeys, semesterName, type Totals } from '../../planning/overview';
import { usePlanning } from '../../planning/usePlanning';
import { getPref, setPref } from '../../storage';
import { useTrackView } from '../../usage';
import { COLORS, FONTS, PLANNING, RADIUS, SPACING, TYPE } from '../../theme/tokens';
import { Empty, ErrorState, Loading, StaleNotice } from '../ui';
import { DetailSheet, ExportSheet, selectionOf, SettingsSheet, SetupForm, Sheet, type Selection } from './PlanningSheets';
import { CARD_SHADOW } from '../HomeSection';
import { BlokView } from './BlokView';
import { PersonalSheet, type ItemDraft, type PersonalTarget } from './PersonalSheet';
import { CourseList, SemesterGrid } from './OverviewViews';
import { ModeBar, PLANNING_MODES, ToolbarButton, type PlanningMode } from './ViewPicker';
import { YellowRoundButton } from '../YellowHead';

const GUTTER = 44;
const HOUR = 52;
const DAY_HEIGHT = 24 * HOUR;
const VISIBLE_DAYS = 3;
/** Aantal dagen voor en na het zichtbare venster waarvoor dagkoppen gemount blijven. */
const HEAD_BUFFER = 14;
const CHIP_ROW = 20;
const EMPTY_BLOCKS: Block[] = [];
const EMPTY_CHIPS: Chip[] = [];
/** De marge links en rechts van de witte kaart rond het raster. */
const GRID_MARGIN = 12;
const SHOW_HIDDEN_KEY = 'planning-verborgen';
/** Hoe lang je drukt voor er een nieuw blok verschijnt, hoe lang dat blok is, en per hoeveel minuten het verschuift. */
const LONG_PRESS_MS = 350;
const DRAFT_MINUTES = 60;
const SNAP = 15;
/** De weergave die iemand het laatst koos; in de blok wil je niet elke keer opnieuw naar Blok. */
const MODE_KEY = 'planning-weergave';

function storedMode(): PlanningMode | null {
  const value = getPref(MODE_KEY);
  return value && (PLANNING_MODES as readonly string[]).includes(value) ? (value as PlanningMode) : null;
}

const BLOCK_STYLE = {
  lecture: { backgroundColor: PLANNING.lectureBg, borderColor: PLANNING.lectureBorder, color: PLANNING.lectureText },
  practice: { backgroundColor: PLANNING.practiceBg, borderColor: PLANNING.practiceBorder, color: PLANNING.practiceText },
  other: { backgroundColor: PLANNING.otherBg, borderColor: PLANNING.otherBorder, color: PLANNING.otherText },
  // VTK: lichtgeel met een gele rand en het logo, als een vierde soort naast de lessen
  // (voorstel B van november 2026). Geen gekleurde rail aan één kant.
  vtk: { backgroundColor: COLORS.lowBg, borderColor: COLORS.yellowDeep, color: COLORS.lowInk },
  // Je eigen privé items: papier met een stippelrand, want geel is sinds dan van VTK.
  personal: { backgroundColor: COLORS.paper, borderColor: COLORS.controlBorder, color: COLORS.body },
} as const;

/**
 * De planning van Burgieclan in de kalender: drie dagen naast elkaar, verticaal
 * door alle uren van de dag, horizontaal per dag verder. Bovenaan elke dag een
 * strook voor wat geen uur heeft (deadlines, iets dat de hele dag duurt).
 *
 * **Dit is de planning van Burgieclan, niet een kopie ervan.** Alles wat hier
 * gebeurt, gaat via de site naar Burgieclan (`usePlanning`); afvinken in de app
 * is afvinken op burgieclan.be. Een VTK-evenement zet je erin vanaf zijn eigen
 * scherm ("In mijn planning").
 *
 * Waarom drie dagen en geen week: zeven kolommen op een telefoon zijn elk 50
 * punten breed, en daarin past geen vaknaam. Drie is wat je vandaag en morgen
 * nodig hebt, en vegen brengt je verder.
 */
export const PlanningView = memo(function PlanningView({
  locale,
  renderHead,
  onOpenEvent,
  onOpenCourse,
  onOpenStudies,
}: {
  locale: AppLocale;
  /**
   * De gele kop van Kalender, met wat deze weergave erin zet: de dagen die je ziet
   * in de week, de voortgang per vak. De planning tekent hem zelf, omdat de week
   * hem vast boven het raster wil en de andere weergaven hem laten meeschuiven.
   */
  renderHead: (extra: React.ReactNode) => React.ReactNode;
  onOpenEvent: (id: string) => void;
  /** Een vak uit de catalogus van Burgieclan (`/vak/<id>`). */
  onOpenCourse: (id: string) => void;
  /** Studies › Samen blokken, voor de studietimer. */
  onOpenStudies: () => void;
}) {
  const handle = usePlanning(locale);
  const { resource, data } = handle;
  const [chosenMode, setChosenMode] = useState<PlanningMode | null>(storedMode);
  // Een eigen item om in te vullen: een nieuw blok dat iemand in de week neerzette door
  // lang te drukken, of een bestaand item waarop getikt werd.
  const [personal, setPersonal] = useState<PersonalTarget | null>(null);
  const draft = personal?.kind === 'new' ? personal.draft : null;
  const [semesterChoice, setSemesterChoice] = useState<string | null>(null);
  const [openCourse, setOpenCourse] = useState<string | null>(null);
  const handleSelect = useCallback(
    (ref: Ref) =>
      ref.kind === 'personal' ? setPersonal({ kind: 'edit', item: ref.item }) : setSelection(selectionOf(ref)),
    [],
  );
  // Zonder lessenrooster maar met iets in de blokkalender: dat is wat er te zien is.
  const hasBlok = data?.block ? data.block.exams.length + data.block.tasks.length > 0 : false;
  const mode: PlanningMode = chosenMode ?? (data && !data.subscribed && hasBlok ? 'blok' : 'week');
  const setMode = (next: PlanningMode) => {
    setPref(MODE_KEY, next);
    setChosenMode(next);
  };
  useTrackView(data ? `kalender:planning${mode === 'week' ? '' : `:${mode}`}` : null);
  const [selection, setSelection] = useState<Selection>(null);
  const [exporting, setExporting] = useState(false);
  const [settings, setSettings] = useState(false);
  const [relinking, setRelinking] = useState(false);
  const [showHidden, setShowHiddenState] = useState(() => getPref(SHOW_HIDDEN_KEY) === '1');

  // Terug op dit scherm (na een evenement in je planning gezet te hebben): opnieuw.
  const reload = resource.reload;
  const focusedOnce = useRef(false);
  useFocusEffect(
    useCallback(() => {
      if (focusedOnce.current) void reload();
      focusedOnce.current = true;
    }, [reload]),
  );

  const days = useMemo(() => (data ? dayRange(data) : []), [data]);
  const content = useMemo(() => (data ? contentByDay(data, showHidden) : new Map<string, DayContent>()), [data, showHidden]);
  const keys = useMemo(() => (data ? semesterKeys(data) : []), [data]);
  const fallbackSemester = data ? defaultSemester(data, keys) : null;
  const semester = semesterChoice && keys.includes(semesterChoice) ? semesterChoice : fallbackSemester;
  const overview = useMemo(() => {
    if (!data || !semester) return null;
    const now = nowInLeuven();
    return buildSemester(data, semester, data.today === now.date ? now.minutes : data.now);
  }, [data, semester]);

  const modeBar = (right?: React.ReactNode) => (
    <ModeBar mode={mode} onChange={setMode}>
      {right}
    </ModeBar>
  );
  const settingsButton = data?.subscribed ? (
    <ToolbarButton label="Instellingen van de planning" onPress={() => setSettings(true)}>
      <Settings2 size={19} color={COLORS.ink} />
    </ToolbarButton>
  ) : null;
  const sheets = data ? (
    <>
      {data.subscribed && personal ? (
        <PersonalSheet
          key={personal.kind === 'new' ? `${personal.draft.date}-${personal.draft.startMin}` : personal.item.id}
          target={personal}
          handle={handle}
          onClose={() => setPersonal(null)}
        />
      ) : null}
      <DetailSheet handle={handle} selection={selection} onClose={() => setSelection(null)} onOpenEvent={onOpenEvent} />
      <ExportSheet visible={exporting} handle={handle} onClose={() => setExporting(false)} />
      <SettingsSheet
        visible={settings}
        handle={handle}
        showHidden={showHidden}
        onToggleHidden={() => {
          setPref(SHOW_HIDDEN_KEY, showHidden ? '0' : '1');
          setShowHiddenState(!showHidden);
        }}
        onChangeLink={() => {
          setSettings(false);
          setRelinking(true);
        }}
        onClose={() => setSettings(false)}
      />
      <Sheet visible={relinking} title="Ander lessenrooster koppelen" onClose={() => setRelinking(false)}>
        <Text style={styles.setupText}>
          Met een andere link begint een nieuw rooster: wat je bij lessen aanduidde, gaat weg. Je
          wekelijkse regels, je deadlines en je VTK-evenementen blijven.
        </Text>
        <SetupForm handle={handle} initial={data.icsUrl} onDone={() => setRelinking(false)} />
      </Sheet>
    </>
  ) : null;

  if (resource.loading && !data) {
    return (
      <View style={styles.root}>
        {renderHead(null)}
        <Loading label="Planning ophalen" />
      </View>
    );
  }
  if (!data) {
    return (
      <View style={styles.root}>
        {renderHead(null)}
        <ErrorState message={messageFor(resource.error)} onRetry={() => void resource.refresh()} />
      </View>
    );
  }

  if (!data.available) {
    return (
      <View style={styles.root}>
        {renderHead(null)}
        <View style={styles.padded}>
          <Empty
            title="Planning nog niet beschikbaar"
            hint="De koppeling met Burgieclan staat op deze server nog niet aan."
          />
        </View>
      </View>
    );
  }

  const refresh = <RefreshControl refreshing={resource.refreshing} onRefresh={() => void resource.refresh()} />;

  if (mode === 'blok') {
    return (
      <View style={styles.root}>
        <ScrollView style={styles.root} keyboardShouldPersistTaps="handled" refreshControl={refresh}>
          <View style={styles.overscroll} />
          <BlokView
            handle={handle}
            onOpenStudies={onOpenStudies}
            header={
              <>
                {renderHead(null)}
                {resource.stale ? <StaleNotice onRetry={() => void resource.refresh()} /> : null}
                {modeBar(settingsButton)}
              </>
            }
          />
        </ScrollView>
        {sheets}
      </View>
    );
  }

  if (!data.subscribed) {
    return (
      <View style={styles.root}>
      <ScrollView keyboardShouldPersistTaps="handled" refreshControl={refresh}>
        <View style={styles.overscroll} />
        {renderHead(null)}
        {modeBar()}
        <View style={styles.padded}>
        <Pressable
          accessibilityRole="button"
          onPress={() => setMode('blok')}
          style={({ pressed }) => [styles.blokHint, pressed && styles.pressed]}
        >
          <GraduationCap size={18} color={COLORS.ink} />
          <Text style={styles.blokHintText}>
            Enkel je examens plannen? De blokkalender werkt ook zonder lessenrooster.
          </Text>
          <ChevronRight size={18} color={COLORS.muted} />
        </Pressable>
        <Text style={styles.setupTitle}>Je lessenrooster en VTK in één agenda</Text>
        <Text style={styles.setupText}>
          Koppel je KU Leuven-lessenrooster één keer. Je planning is dezelfde als die op Burgieclan:
          vink lessen af, verberg de groepen waar je niet naartoe gaat, zet VTK-evenementen erbij, en
          abonneer je agenda-app op het geheel.
        </Text>
        <SetupForm handle={handle} />
        </View>
      </ScrollView>
      {sheets}
      </View>
    );
  }

  if (mode === 'vak' || mode === 'semester') {
    const index = semester ? keys.indexOf(semester) : -1;
    const eyebrow = overview
      ? overview.current
        ? `${semesterName(overview.key)} · week ${overview.current} van ${overview.totalWeeks}`
        : `${semesterName(overview.key)} · ${shortDay(overview.firstDate)} - ${shortDay(overview.lastDate)}`
      : null;
    return (
      <View style={styles.root}>
        <ScrollView style={styles.root} refreshControl={refresh}>
          <View style={styles.overscroll} />
          {renderHead(
            overview ? (
              <Progress
                eyebrow={eyebrow}
                totals={overview.totals}
                previous={keys.length > 1 ? { disabled: index <= 0, onPress: () => setSemesterChoice(keys[index - 1]) } : null}
                next={
                  keys.length > 1
                    ? { disabled: index < 0 || index >= keys.length - 1, onPress: () => setSemesterChoice(keys[index + 1]) }
                    : null
                }
              />
            ) : null,
          )}
          {resource.stale ? <StaleNotice onRetry={() => void resource.refresh()} /> : null}
          {modeBar(settingsButton)}
          <View style={styles.overview}>
            {!overview ? (
              <Empty
                title="Nog geen lessen"
                hint="Zodra je lessenrooster lessen bevat, zie je hier per vak wat je afvinkte en wat je nog moet inhalen."
              />
            ) : mode === 'vak' ? (
              <CourseList
                data={overview}
                open={openCourse}
                onToggle={(key) => setOpenCourse(openCourse === key ? null : key)}
                handle={handle}
                onSelect={(uid) => setSelection({ kind: 'session', id: uid })}
                onOpenCourse={onOpenCourse}
              />
            ) : (
              <SemesterGrid
                data={overview}
                onCourse={(key) => {
                  setOpenCourse(key);
                  setMode('vak');
                }}
              />
            )}
          </View>
        </ScrollView>
        {sheets}
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <Grid
        notice={
          data.syncError ? (
            <Pressable style={styles.warning} onPress={() => setSettings(true)} accessibilityRole="button">
              <AlertTriangle size={16} color={COLORS.ink} />
              <Text style={styles.warningText}>
                Je lessenrooster kon niet bijgewerkt worden: {data.syncError} Tik om opnieuw te proberen of
                een andere link te koppelen.
              </Text>
            </Pressable>
          ) : null
        }
        key={data.today}
        planningToday={data.today}
        content={content}
        days={days}
        refreshing={resource.refreshing}
        onRefresh={() => void resource.refresh()}
        onSelect={handleSelect}
        renderHead={(extra) => (
          <>
            {renderHead(extra)}
            {resource.stale ? <StaleNotice onRetry={() => void resource.refresh()} /> : null}
          </>
        )}
        modeBar={modeBar}
        draft={draft}
        onDraft={(next) => setPersonal({ kind: 'new', draft: next })}
        onMovePersonal={(item, date, startMin, endMin) =>
          void handle.run({
            op: 'updatePersonal',
            id: item.id,
            item: {
              title: item.title,
              location: item.location,
              note: item.note,
              date,
              allDay: false,
              start: clock(startMin),
              end: endMin >= 24 * 60 ? '24:00' : clock(endMin),
            },
          })
        }
        toolbarRight={
          <>
            <ToolbarButton label="Exporteren naar je agenda" onPress={() => setExporting(true)}>
              <CalendarPlus size={19} color={COLORS.ink} />
            </ToolbarButton>
            <ToolbarButton label="Instellingen van de planning" onPress={() => setSettings(true)}>
              <Settings2 size={19} color={COLORS.ink} />
            </ToolbarButton>
          </>
        }
      />

      {sheets}
    </View>
  );
});

function Grid({
  planningToday,
  days,
  content,
  refreshing,
  onRefresh,
  onSelect,
  renderHead,
  modeBar,
  notice,
  draft,
  onDraft,
  onMovePersonal,
  toolbarRight,
}: {
  /** De gele kop, met de dagen die je ziet en de knoppen om te bladeren erin. */
  renderHead: (extra: React.ReactNode) => React.ReactNode;
  modeBar: (right?: React.ReactNode) => React.ReactNode;
  notice: React.ReactNode;
  draft: ItemDraft | null;
  onDraft: (draft: ItemDraft) => void;
  onMovePersonal: (item: AppPlanningPersonal, date: string, startMin: number, endMin: number) => void;
  planningToday: string;
  days: string[];
  content: Map<string, DayContent>;
  refreshing: boolean;
  onRefresh: () => void;
  onSelect: (ref: Ref) => void;
  toolbarRight: React.ReactNode;
}) {
  const { width } = useWindowDimensions();
  // Het raster staat in een witte kaart met een marge links en rechts.
  const column = (width - GRID_MARGIN * 2 - GUTTER) / VISIBLE_DAYS;
  const todayIndex = Math.max(0, days.indexOf(planningToday));
  const [first, setFirst] = useState(todayIndex);
  const [now, setNow] = useState(nowInLeuven);
  const [scrollX] = useState(() => new Animated.Value(todayIndex * column));
  const list = useRef<FlatList<string>>(null);
  const vertical = useRef<ScrollViewInstance>(null);

  useEffect(() => {
    const id = setInterval(() => setNow(nowInLeuven()), 60_000);
    return () => clearInterval(id);
  }, []);

  // Open op het uur dat ertoe doet: een uur voor nu, of 's ochtends om half acht.
  const initialY = useMemo(() => {
    const start = Math.min(Math.max(nowInLeuven().minutes - 60, 7.5 * 60), 17 * 60);
    return (start / 60) * HOUR;
  }, []);
  useEffect(() => {
    const id = requestAnimationFrame(() => vertical.current?.scrollTo({ y: initialY, animated: false }));
    return () => cancelAnimationFrame(id);
  }, [initialY]);

  const drag = useDragToPlace({
    days,
    content,
    column,
    initialX: todayIndex * column,
    initialY,
    list,
    vertical,
    onDraft,
    onMovePersonal,
    onFirst: setFirst,
  });

  const chipRows = useMemo(() => {
    let most = 0;
    for (const day of content.values()) most = Math.max(most, day.chips.length);
    return Math.min(most, 2);
  }, [content]);

  const headStart = Math.max(0, first - HEAD_BUFFER);
  const headEnd = Math.min(days.length, first + VISIBLE_DAYS + HEAD_BUFFER);
  const headDays = days.slice(headStart, headEnd);


  const onSettle = (x: number) => setFirst(Math.max(0, Math.min(days.length - 1, Math.round(x / column))));

  return (
    <View style={styles.root}>
      {/* Geen rij met "Week 48 · nov 2026" en pijlen meer (november 2026): je veegt
          zelf door de dagen, en die hoogte gaat nu naar de agenda. */}
      {renderHead(null)}
      {notice}
      {modeBar(toolbarRight)}

      <View style={styles.grid}>
      {/* De dagkoppen schuiven mee met het raster eronder, op de native thread. */}
      <View style={styles.headRow}>
        <View style={{ width: GUTTER }} />
        <View style={styles.headClip}>
          <Animated.View
            style={{
              flexDirection: 'row',
              width: column * days.length,
              paddingLeft: headStart * column,
              transform: [{ translateX: Animated.multiply(scrollX, -1) }],
            }}
          >
            {headDays.map((date) => (
              <DayHead
                key={date}
                date={date}
                width={column}
                today={date === now.date}
                chips={content.get(date)?.chips ?? EMPTY_CHIPS}
                chipRows={chipRows}
                onSelect={onSelect}
              />
            ))}
          </Animated.View>
        </View>
      </View>

      <ScrollView
        ref={vertical}
        scrollEnabled={!drag.active}
        style={styles.root}
        contentOffset={{ x: 0, y: initialY }}
        scrollEventThrottle={16}
        onScroll={drag.onVerticalScroll}
        onLayout={drag.onVerticalLayout}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        <View style={styles.body}>
          <View style={styles.gutter}>
            {Array.from({ length: 23 }, (_, i) => i + 1).map((h) => (
              <Text key={h} style={[styles.hour, { top: h * HOUR - 7 }]}>
                {String(h).padStart(2, '0')}:00
              </Text>
            ))}
          </View>
          <GestureDetector gesture={drag.gesture}>
          <View style={styles.columns}>
            {Array.from({ length: 23 }, (_, i) => i + 1).map((h) => (
              <View key={h} pointerEvents="none" style={[styles.hourLine, { top: h * HOUR }]} />
            ))}
            <Animated.FlatList
              ref={list}
              horizontal
              data={days}
              keyExtractor={(date) => date}
              getItemLayout={(_, index) => ({ length: column, offset: column * index, index })}
              initialScrollIndex={todayIndex}
              scrollEnabled={!drag.active}
              snapToInterval={column}
              decelerationRate="fast"
              showsHorizontalScrollIndicator={false}
              initialNumToRender={VISIBLE_DAYS + 4}
              maxToRenderPerBatch={6}
              windowSize={7}
              scrollEventThrottle={16}
              onScroll={Animated.event([{ nativeEvent: { contentOffset: { x: scrollX } } }], {
                useNativeDriver: true,
                listener: drag.onHorizontalScroll,
              })}
              onMomentumScrollEnd={(e) => onSettle(e.nativeEvent.contentOffset.x)}
              onScrollEndDrag={(e) => onSettle(e.nativeEvent.contentOffset.x)}
              extraData={`${now.date}:${now.minutes}:${content.size}:${drag.movingKey ?? ''}:${draft?.date ?? ''}:${draft?.startMin ?? ''}`}
              renderItem={({ item }) => (
                <DayColumn
                  date={item}
                  width={column}
                  blocks={content.get(item)?.blocks ?? EMPTY_BLOCKS}
                  nowMinutes={item === now.date ? now.minutes : null}
                  onSelect={onSelect}
                  movingKey={drag.movingKey}
                  draft={draft?.date === item ? draft : null}
                />
              )}
            />
            <DragBlock state={drag.overlay} width={column} />
          </View>
          </GestureDetector>
        </View>
      </ScrollView>
      </View>
    </View>
  );
}

/**
 * Lang drukken in de week en slepen, zoals in Agenda op iOS.
 *
 * - Op een lege plek zet lang drukken een blok van een uur neer, met je vinger in
 *   het midden; op een eigen item neem je dat item op.
 * - Zonder los te laten sleep je het naar elk uur (per kwartier) en **elke dag**.
 *   Tegen de linker- of rechterrand schuift de week een dag mee, tegen de boven-
 *   of onderrand de dag, zodat je ook bij dagen en uren buiten beeld komt.
 * - Loslaten opent bij een nieuw blok het blad om het in te vullen; een bestaand
 *   item staat meteen op zijn nieuwe plek.
 *
 * Eén gebaar over alle dagen samen en niet één per dag: enkel zo kan een blok
 * van de ene dag naar de andere. Het gebaar begint pas na het lang drukken, dus
 * een gewone veeg blijft scrollen en een tik op een les blijft een tik. Terwijl
 * je sleept, staat scrollen met de hand stil en schuift de app zelf.
 */
function useDragToPlace({
  days,
  content,
  column,
  initialX,
  initialY,
  list,
  vertical,
  onDraft,
  onMovePersonal,
  onFirst,
}: {
  days: string[];
  content: Map<string, DayContent>;
  column: number;
  initialX: number;
  initialY: number;
  list: React.RefObject<FlatList<string> | null>;
  vertical: React.RefObject<ScrollViewInstance | null>;
  onDraft: (draft: ItemDraft) => void;
  onMovePersonal: (item: AppPlanningPersonal, date: string, startMin: number, endMin: number) => void;
  onFirst: (index: number) => void;
}) {
  const [active, setActive] = useState(false);
  const [movingKey, setMovingKey] = useState<string | null>(null);
  const hOffset = useRef(initialX);
  const vOffset = useRef(initialY);
  const viewportHeight = useRef(400);
  const scrollShared = useSharedValue(initialX);
  const overlay = {
    day: useSharedValue(0),
    start: useSharedValue(0),
    duration: useSharedValue(DRAFT_MINUTES),
    visible: useSharedValue(0),
    scroll: scrollShared,
    title: useRef('Nieuw'),
    setLabel: useRef<((label: string) => void) | null>(null),
  };
  const state = useRef({
    active: false,
    item: null as AppPlanningPersonal | null,
    duration: DRAFT_MINUTES,
    grab: DRAFT_MINUTES / 2,
    x: 0,
    vy: 0,
    day: 0,
    start: 0,
    lastHorizontal: 0,
    timer: null as ReturnType<typeof setInterval> | null,
  });

  // Alles wat de callbacks lezen, via een ref: het gebaar wordt niet opnieuw opgebouwd bij elke render.
  const latest = useRef({ days, content, column, onDraft, onMovePersonal, onFirst });
  useEffect(() => {
    latest.current = { days, content, column, onDraft, onMovePersonal, onFirst };
  });

  const place = useCallback(() => {
    const d = state.current;
    const { days: list_, column: col } = latest.current;
    const contentY = d.vy + vOffset.current;
    const minute = (contentY / HOUR) * 60 - d.grab;
    d.start = Math.min(Math.max(Math.round(minute / SNAP) * SNAP, 0), 24 * 60 - d.duration);
    d.day = Math.min(Math.max(Math.floor((d.x + hOffset.current) / col), 0), list_.length - 1);
    overlay.day.value = d.day;
    overlay.start.value = d.start;
    overlay.setLabel.current?.(`${clock(d.start)} - ${clock(d.start + d.duration)}`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const tick = useCallback(() => {
    const d = state.current;
    if (!d.active) return;
    const { days: list_, column: col, onFirst: first } = latest.current;
    const edgeX = 28;
    const width = col * VISIBLE_DAYS;
    const nowMs = Date.now();
    if ((d.x < edgeX || d.x > width - edgeX) && nowMs - d.lastHorizontal > 550) {
      const index = Math.round(hOffset.current / col) + (d.x < edgeX ? -1 : 1);
      const target = Math.min(Math.max(index, 0), Math.max(0, list_.length - VISIBLE_DAYS));
      if (target * col !== hOffset.current) {
        list.current?.scrollToOffset({ offset: target * col, animated: true });
        hOffset.current = target * col;
        scrollShared.value = target * col;
        first(target);
        d.lastHorizontal = nowMs;
      }
    }
    const edgeY = 40;
    const max = Math.max(0, DAY_HEIGHT - viewportHeight.current);
    let next = vOffset.current;
    if (d.vy < edgeY) next = Math.max(0, next - 12);
    else if (d.vy > viewportHeight.current - edgeY) next = Math.min(max, next + 12);
    if (next !== vOffset.current) {
      vertical.current?.scrollTo({ y: next, animated: false });
      vOffset.current = next;
    }
    place();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [place]);

  const begin = useCallback(
    (x: number, y: number) => {
      const d = state.current;
      const { days: list_, content: map, column: col } = latest.current;
      const dayIndex = Math.min(Math.max(Math.floor((x + hOffset.current) / col), 0), list_.length - 1);
      const minute = (y / HOUR) * 60;
      const hit = (map.get(list_[dayIndex])?.blocks ?? []).find(
        (block) => block.ref.kind === 'personal' && minute >= block.startMin && minute <= block.endMin,
      );
      if (hit && hit.ref.kind === 'personal') {
        d.item = hit.ref.item;
        d.duration = hit.endMin - hit.startMin;
        d.grab = minute - hit.startMin;
        overlay.title.current = hit.title;
        setMovingKey(hit.key);
      } else {
        d.item = null;
        d.duration = DRAFT_MINUTES;
        d.grab = DRAFT_MINUTES / 2;
        overlay.title.current = 'Nieuw';
      }
      d.active = true;
      d.x = x;
      d.vy = y - vOffset.current;
      overlay.duration.value = d.duration;
      place();
      overlay.visible.value = 1;
      setActive(true);
      d.timer = setInterval(tick, 40);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [place, tick],
  );

  const move = useCallback(
    (x: number, y: number) => {
      const d = state.current;
      if (!d.active) return;
      d.x = x;
      d.vy = y - vOffset.current;
      place();
    },
    [place],
  );

  const finish = useCallback(
    (commit: boolean) => {
      const d = state.current;
      if (!d.active) return;
      d.active = false;
      if (d.timer) clearInterval(d.timer);
      d.timer = null;
      overlay.visible.value = 0;
      setActive(false);
      setMovingKey(null);
      if (!commit) return;
      const { days: list_, onDraft: draftCb, onMovePersonal: moveCb } = latest.current;
      const date = list_[d.day];
      if (d.item) {
        if (date !== d.item.date || d.start !== d.item.startMin) moveCb(d.item, date, d.start, d.start + d.duration);
      } else {
        draftCb({ date, startMin: d.start, endMin: Math.min(d.start + d.duration, 24 * 60) });
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  useEffect(
    () => () => {
      if (state.current.timer) clearInterval(state.current.timer);
    },
    [],
  );

  // De callbacks lezen refs, maar pas wanneer het gebaar loopt, nooit tijdens de
  // render; de regel ziet het verschil niet.
  /* eslint-disable react-hooks/refs */
  const gesture = Gesture.Pan()
    .activateAfterLongPress(LONG_PRESS_MS)
    .onStart((event) => {
      runOnJS(begin)(event.x, event.y);
    })
    .onUpdate((event) => {
      runOnJS(move)(event.x, event.y);
    })
    .onEnd(() => {
      runOnJS(finish)(true);
    })
    .onFinalize(() => {
      runOnJS(finish)(false);
    });
  /* eslint-enable react-hooks/refs */

  return {
    gesture,
    active,
    movingKey,
    overlay,
    onHorizontalScroll: (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      hOffset.current = event.nativeEvent.contentOffset.x;
      scrollShared.value = event.nativeEvent.contentOffset.x;
    },
    onVerticalScroll: (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      if (!state.current.active) vOffset.current = event.nativeEvent.contentOffset.y;
    },
    onVerticalLayout: (event: LayoutChangeEvent) => {
      viewportHeight.current = event.nativeEvent.layout.height;
    },
  };
}

type DragOverlay = ReturnType<typeof useDragToPlace>['overlay'];

/** Het blok onder je vinger: zweeft boven het raster en volgt dag en kwartier. */
function DragBlock({ state, width }: { state: DragOverlay; width: number }) {
  const [label, setLabel] = useState('');
  useEffect(() => {
    state.setLabel.current = setLabel;
    return () => {
      state.setLabel.current = null;
    };
  }, [state.setLabel]);
  const animated = useAnimatedStyle(() => ({
    opacity: state.visible.value,
    top: (state.start.value / 60) * HOUR + 1,
    height: (state.duration.value / 60) * HOUR - 2,
    left: state.day.value * width - state.scroll.value + 2,
  }));
  return (
    <Reanimated.View pointerEvents="none" style={[styles.draft, styles.draftLifted, { width: width - 4 }, animated]}>
      <Text style={styles.draftTime}>{label}</Text>
      <Text style={styles.draftTitle} numberOfLines={2}>
        {state.title.current}
      </Text>
    </Reanimated.View>
  );
}

const DayHead = memo(function DayHead({
  date,
  width,
  today,
  chips,
  chipRows,
  onSelect,
}: {
  date: string;
  width: number;
  today: boolean;
  chips: Chip[];
  chipRows: number;
  onSelect: (ref: Ref) => void;
}) {
  const shown = chips.length > chipRows ? chips.slice(0, Math.max(chipRows - 1, 0)) : chips;
  const more = chips.length - shown.length;
  const weekend = weekdayOf(date) >= 5;
  return (
    <View style={[styles.dayHead, { width }]}>
      <View style={styles.dayLabel}>
        <Text style={[styles.dayName, weekend && styles.muted]}>{weekdayShort(date)}</Text>
        <View style={[styles.dayNumber, today && styles.dayNumberToday]}>
          <Text style={[styles.dayNumberText, today && styles.dayNumberTextToday]}>{dayNumber(date)}</Text>
        </View>
      </View>
      {chipRows > 0 ? (
        <View style={{ height: chipRows * CHIP_ROW + 2, gap: 2 }}>
          {shown.map((chip) => (
            <Pressable
              key={chip.key}
              accessibilityRole="button"
              accessibilityLabel={chip.label}
              onPress={() => onSelect(chip.ref)}
              style={[styles.chip, chip.vtk && styles.chipVtk, chip.done && styles.done]}
            >
              <Text numberOfLines={1} style={[styles.chipText, chip.done && styles.struck]}>
                {chip.label}
              </Text>
            </Pressable>
          ))}
          {more > 0 ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Nog ${more} op deze dag`}
              onPress={() => onSelect(chips[shown.length].ref)}
              style={styles.chip}
            >
              <Text numberOfLines={1} style={styles.chipText}>
                +{more} meer
              </Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}
    </View>
  );
});

const DayColumn = memo(function DayColumn({
  date,
  width,
  blocks,
  nowMinutes,
  onSelect,
  movingKey,
  draft,
}: {
  date: string;
  width: number;
  blocks: Block[];
  nowMinutes: number | null;
  onSelect: (ref: Ref) => void;
  /** Het item dat je aan het verslepen bent; het staat hier nog, maar vaag. */
  movingKey: string | null;
  /** Het neergezette blok op deze dag, terwijl het blad openstaat. */
  draft: ItemDraft | null;
}) {
  const placed = useMemo(() => place(blocks), [blocks]);
  const weekend = weekdayOf(date) >= 5;
  return (
    <View style={[styles.column, { width }, weekend && styles.weekend]}>
      {placed.map((block) => {
        const top = (block.startMin / 60) * HOUR + 1;
        const height = Math.max(24, ((block.endMin - block.startMin) / 60) * HOUR - 2);
        const look = BLOCK_STYLE[block.tone];
        const laneWidth = width / block.lanes;
        const lines = Math.max(1, Math.floor((height - 18) / 15));
        return (
          <Pressable
            key={block.key}
            accessibilityRole="button"
            accessibilityLabel={[
              block.title,
              block.time,
              block.place,
              block.mandatory ? 'verplicht' : null,
              block.done ? 'afgevinkt' : null,
              block.hidden ? 'verborgen' : null,
            ]
              .filter(Boolean)
              .join(', ')}
            onPress={() => onSelect(block.ref)}
            style={({ pressed }) => [
              styles.block,
              {
                top,
                height,
                left: block.lane * laneWidth + 2,
                width: laneWidth - 4,
                backgroundColor: look.backgroundColor,
                borderColor: look.borderColor,
              },
              block.tone === 'vtk' && styles.blockVtk,
              block.tone === 'personal' && styles.blockPersonal,
              block.mandatory && styles.blockMandatory,
              block.done && styles.done,
              block.hidden && styles.blockHidden,
              block.key === movingKey && styles.blockMoving,
              pressed && styles.pressed,
            ]}
          >
            <View style={styles.blockTop}>
              {block.tone === 'vtk' ? (
                <Image
                  source={require('../../../assets/vtk-logo.png')}
                  style={styles.blockLogo}
                  contentFit="contain"
                  tintColor={COLORS.navy}
                  accessible={false}
                />
              ) : null}
              {block.time ? <Text style={[styles.blockTime, { color: look.color }]}>{block.time}</Text> : null}
              {block.mandatory ? <Flag size={10} color={PLANNING.danger} /> : null}
              {block.done ? <Check size={11} color={look.color} /> : null}
            </View>
            <Text numberOfLines={lines} style={[styles.blockTitle, block.done && styles.struck]}>
              {block.title}
            </Text>
            {height > 70 && block.place ? (
              <Text numberOfLines={1} style={[styles.blockPlace, { color: look.color }]}>
                {block.place}
              </Text>
            ) : null}
          </Pressable>
        );
      })}
      {nowMinutes !== null ? (
        <View pointerEvents="none" style={[styles.nowLine, { top: (nowMinutes / 60) * HOUR }]}>
          <View style={styles.nowDot} />
        </View>
      ) : null}
      {draft ? (
        <View
          pointerEvents="none"
          style={[
            styles.draft,
            { top: (draft.startMin / 60) * HOUR + 1, height: ((draft.endMin - draft.startMin) / 60) * HOUR - 2 },
          ]}
        >
          <Text style={styles.draftTime}>{clock(draft.startMin)}</Text>
          <Text style={styles.draftTitle}>Nieuw</Text>
        </View>
      ) : null}
    </View>
  );
});

/**
 * Hoe ver je staat dit semester, in de gele kop boven Per vak en Semester
 * (voorstel P1 van november 2026): de week, hoeveel lessen je afvinkte, en één
 * balk met afgevinkt in navy en in te halen in roze. Tot dan stonden er vier
 * tegels met cijfers.
 */
function Progress({
  eyebrow,
  totals,
  previous,
  next,
}: {
  eyebrow: string | null;
  totals: Totals;
  previous: { disabled: boolean; onPress: () => void } | null;
  next: { disabled: boolean; onPress: () => void } | null;
}) {
  const total = totals.past + totals.upcoming;
  const share = (n: number) => (total > 0 ? `${(n / total) * 100}%` : '0%') as `${number}%`;
  return (
    <View style={styles.progress}>
      {eyebrow || previous || next ? (
        <View style={styles.progressTop}>
          <Text style={styles.progressEyebrow} numberOfLines={1}>
            {eyebrow}
          </Text>
          {previous && next ? (
            <View style={styles.navButtons}>
              <YellowRoundButton label="Vorig semester" disabled={previous.disabled} onPress={previous.onPress}>
                <ChevronLeft size={17} color={COLORS.navy} strokeWidth={2.4} />
              </YellowRoundButton>
              <YellowRoundButton label="Volgend semester" disabled={next.disabled} onPress={next.onPress}>
                <ChevronRight size={17} color={COLORS.navy} strokeWidth={2.4} />
              </YellowRoundButton>
            </View>
          ) : null}
        </View>
      ) : null}
      <Text style={styles.progressTitle}>
        {totals.done} van {total} lessen afgevinkt
      </Text>
      <View
        style={styles.progressBar}
        accessible
        accessibilityLabel={`${totals.done} van ${total} lessen afgevinkt, ${totals.missed} in te halen`}
      >
        <View style={{ width: share(totals.done), backgroundColor: COLORS.navy }} />
        <View style={{ width: share(totals.missed), backgroundColor: PLANNING.catchupFill }} />
      </View>
      <View style={styles.legend}>
        <View style={styles.legendItem}>
          <View style={[styles.legendSwatch, { backgroundColor: COLORS.navy }]} />
          <Text style={styles.legendLabel}>Afgevinkt</Text>
        </View>
        {totals.missed > 0 ? (
          <View style={styles.legendItem}>
            <View style={[styles.legendSwatch, { backgroundColor: PLANNING.catchupFill }]} />
            <Text style={styles.legendLabel}>{totals.missed} in te halen</Text>
          </View>
        ) : null}
        {totals.mandatoryLeft > 0 ? (
          <Text style={styles.legendLabel}>
            {totals.mandatoryLeft} verplicht{totals.mandatoryLeft === 1 ? 'e les' : 'e lessen'} nog te komen
          </Text>
        ) : null}
      </View>
    </View>
  );
}

const clock = (minutes: number) => {
  'worklet';
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${h < 10 ? '0' : ''}${h}:${m < 10 ? '0' : ''}${m}`;
};

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.paper },
  padded: { padding: SPACING.xl - 4, gap: SPACING.md },
  pressed: { opacity: 0.7 },
  muted: { color: COLORS.muted },

  setupTitle: { ...TYPE.heading, color: COLORS.ink },
  overview: { paddingHorizontal: SPACING.lg, gap: SPACING.md, paddingBottom: SPACING.xxl },
  blokHint: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    padding: SPACING.md,
    borderRadius: 16,
    backgroundColor: COLORS.surface,
    ...CARD_SHADOW,
  },
  blokHintText: { ...TYPE.small, color: COLORS.ink, flex: 1 },
  setupText: { ...TYPE.body, color: COLORS.body },

  warning: {
    flexDirection: 'row',
    gap: SPACING.sm,
    alignItems: 'flex-start',
    marginHorizontal: SPACING.md,
    marginTop: SPACING.sm,
    padding: SPACING.md,
    borderRadius: RADIUS.sm,
    backgroundColor: COLORS.surface,
    ...CARD_SHADOW,
  },
  warningText: { ...TYPE.small, color: COLORS.ink, flex: 1 },

  // De dagen die je ziet, in de gele kop, met bladeren en Vandaag.
  navButtons: { flexDirection: 'row', alignItems: 'center', gap: 6 },

  // De voortgang per vak en per semester, in de gele kop (voorstel P1).
  progress: { gap: SPACING.sm },
  progressTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: SPACING.sm },
  progressEyebrow: { flexShrink: 1, fontFamily: FONTS.semibold, fontSize: 13, color: COLORS.navy },
  progressTitle: { fontFamily: FONTS.bold, fontSize: 17, letterSpacing: -0.3, color: COLORS.navy },
  progressBar: {
    flexDirection: 'row',
    height: 14,
    borderRadius: 7,
    overflow: 'hidden',
    backgroundColor: 'rgba(14, 26, 54, 0.12)',
  },
  legend: { flexDirection: 'row', flexWrap: 'wrap', gap: 14 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  legendSwatch: { width: 8, height: 8, borderRadius: 2 },
  legendLabel: { fontFamily: FONTS.semibold, fontSize: 12, color: COLORS.navy },

  // Trekt de gele kop door wanneer je op iOS omlaag trekt.
  overscroll: {
    position: 'absolute',
    top: -1000,
    left: 0,
    right: 0,
    height: 1000,
    backgroundColor: COLORS.yellow,
  },

  // Het raster als één witte kaart, zoals op het voorstel; onderaan loopt hij onder de tabbalk door.
  grid: {
    flex: 1,
    marginHorizontal: GRID_MARGIN,
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    backgroundColor: COLORS.surface,
    overflow: 'hidden',
  },
  headRow: {
    flexDirection: 'row',
    paddingTop: SPACING.sm,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.line,
    backgroundColor: COLORS.surface,
  },
  headClip: { flex: 1, overflow: 'hidden' },
  dayHead: { paddingHorizontal: 3, paddingBottom: 8, gap: 4 },
  dayLabel: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, paddingTop: 2 },
  dayName: { ...TYPE.small, fontFamily: FONTS.medium, color: COLORS.body },
  dayNumber: { minWidth: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  dayNumberToday: { backgroundColor: COLORS.yellow },
  dayNumberText: { fontFamily: FONTS.semibold, fontSize: 15, color: COLORS.ink, fontVariant: ['tabular-nums'] },
  dayNumberTextToday: { color: COLORS.ink },
  chip: {
    height: CHIP_ROW - 2,
    justifyContent: 'center',
    paddingHorizontal: 5,
    borderRadius: 5,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.line2,
  },
  chipVtk: { backgroundColor: COLORS.lowBg, borderColor: COLORS.yellowDeep },
  chipText: { fontFamily: FONTS.medium, fontSize: 11, color: COLORS.ink },

  body: { flexDirection: 'row', height: DAY_HEIGHT },
  gutter: { width: GUTTER },
  hour: {
    position: 'absolute',
    right: 6,
    fontFamily: FONTS.regular,
    fontSize: 11,
    color: COLORS.muted,
    fontVariant: ['tabular-nums'],
  },
  columns: { flex: 1 },
  hourLine: { position: 'absolute', left: 0, right: 0, height: 1, backgroundColor: COLORS.line },
  column: { height: DAY_HEIGHT, borderLeftWidth: 1, borderLeftColor: COLORS.line },
  weekend: { backgroundColor: 'rgba(14, 26, 54, 0.03)' },

  // Getinte blokken met een rand van 1 px in de kleur van de soort, zodat een les
  // ook op de witte kaart duidelijk afsteekt; de kleur zegt de soort.
  block: {
    position: 'absolute',
    overflow: 'hidden',
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 6,
    paddingVertical: 4,
  },
  blockVtk: { borderWidth: 1.5 },
  blockPersonal: { borderWidth: 1.5, borderStyle: 'dashed' },
  blockLogo: { width: 18, height: 10 },
  blockMandatory: { borderLeftWidth: 3, borderLeftColor: PLANNING.danger },
  blockHidden: { borderStyle: 'dashed', opacity: 0.5 },
  blockMoving: { opacity: 0.3 },
  blockTop: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  blockTime: { fontFamily: FONTS.semibold, fontSize: 10.5, fontVariant: ['tabular-nums'] },
  blockTitle: { fontFamily: FONTS.semibold, fontSize: 12, lineHeight: 15, color: COLORS.ink },
  blockPlace: { fontFamily: FONTS.regular, fontSize: 10.5, marginTop: 1 },
  done: { opacity: 0.55 },
  struck: { textDecorationLine: 'line-through' },

  // Het nieuwe blok: in het geel van een actie, met een stippelrand tot het bewaard is.
  draft: {
    position: 'absolute',
    left: 2,
    right: 2,
    borderRadius: 10,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: COLORS.ink,
    backgroundColor: COLORS.yellow,
    paddingHorizontal: 6,
    paddingVertical: 4,
  },
  draftLifted: {
    shadowColor: COLORS.navy,
    shadowOpacity: 0.25,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 6 },
    elevation: 6,
  },
  draftTime: { fontFamily: FONTS.semibold, fontSize: 10.5, color: COLORS.ink, fontVariant: ['tabular-nums'] },
  draftTitle: { fontFamily: FONTS.semibold, fontSize: 12, color: COLORS.ink },
  nowLine: { position: 'absolute', left: 0, right: 0, height: 2, backgroundColor: PLANNING.danger },
  nowDot: {
    position: 'absolute',
    left: -4,
    top: -3,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: PLANNING.danger,
  },
});

