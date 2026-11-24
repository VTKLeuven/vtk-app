import { useFocusEffect } from 'expo-router';
import { AlertTriangle, CalendarPlus, Check, ChevronLeft, ChevronRight, Flag, GraduationCap, Settings2 } from 'lucide-react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Reanimated, {
  runOnJS,
  useAnimatedReaction,
  useAnimatedStyle,
  useSharedValue,
  type SharedValue,
} from 'react-native-reanimated';
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
} from 'react-native';

import type { AppLocale } from '../../api/contract';
import { messageFor } from '../../api/useResource';
import {
  contentByDay,
  dayNumber,
  dayRange,
  isoWeek,
  shortDay,
  monthSpan,
  place,
  weekdayOf,
  weekdayShort,
  type Block,
  type Chip,
  type DayContent,
  type Ref,
} from '../../planning/grid';
import { nowInLeuven } from '../../planning/now';
import { buildSemester, defaultSemester, semesterKeys, semesterName } from '../../planning/overview';
import { usePlanning } from '../../planning/usePlanning';
import { getPref, setPref } from '../../storage';
import { useTrackView } from '../../usage';
import { COLORS, FONTS, PLANNING, RADIUS, SPACING, TYPE } from '../../theme/tokens';
import { Empty, ErrorState, Loading, StaleNotice } from '../ui';
import { DetailSheet, ExportSheet, selectionOf, SettingsSheet, SetupForm, Sheet, type Selection } from './PlanningSheets';
import { CARD_SHADOW } from '../HomeSection';
import { BlokView } from './BlokView';
import { ItemSheet, type ItemDraft } from './ItemSheet';
import { CourseList, SemesterGrid, TotalsRow } from './OverviewViews';
import {
  PLANNING_MODES,
  PlanningToolbar,
  ToolbarButton,
  ViewSheet,
  ViewTitle,
  type PlanningMode,
} from './ViewPicker';

const GUTTER = 44;
const HOUR = 52;
const DAY_HEIGHT = 24 * HOUR;
const VISIBLE_DAYS = 3;
const CHIP_ROW = 20;
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

/** "november 2026" wordt "nov 2026", zodat de week erbij past. */
const shortMonth = (label: string) => label.replace(/^([a-z]{3})[a-z]+ /, '$1 ');

const BLOCK_STYLE = {
  lecture: { backgroundColor: PLANNING.lectureBg, borderColor: PLANNING.lectureBorder, color: PLANNING.lectureText },
  practice: { backgroundColor: PLANNING.practiceBg, borderColor: PLANNING.practiceBorder, color: PLANNING.practiceText },
  other: { backgroundColor: PLANNING.otherBg, borderColor: PLANNING.otherBorder, color: PLANNING.otherText },
  vtk: { backgroundColor: COLORS.surface, borderColor: COLORS.line2, color: COLORS.navy },
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
export function PlanningView({
  locale,
  onOpenEvent,
  onOpenCourse,
  onOpenStudies,
}: {
  locale: AppLocale;
  onOpenEvent: (id: string) => void;
  /** Een vak uit de catalogus van Burgieclan (`/vak/<id>`). */
  onOpenCourse: (id: string) => void;
  /** Studies › Samen blokken, voor de studietimer. */
  onOpenStudies: () => void;
}) {
  const handle = usePlanning(locale);
  const { resource, data } = handle;
  const [chosenMode, setChosenMode] = useState<PlanningMode | null>(storedMode);
  const [picking, setPicking] = useState(false);
  // Een nieuw blok dat iemand in de week neerzette door lang te drukken; het blad vult de rest in.
  const [draft, setDraft] = useState<ItemDraft | null>(null);
  const [semesterChoice, setSemesterChoice] = useState<string | null>(null);
  const [openCourse, setOpenCourse] = useState<string | null>(null);
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

  const title = (subtitle: string | null) => (
    <ViewTitle mode={mode} subtitle={subtitle} onPress={() => setPicking(true)} />
  );
  const settingsButton = data?.subscribed ? (
    <ToolbarButton label="Instellingen van de planning" onPress={() => setSettings(true)}>
      <Settings2 size={19} color={COLORS.ink} />
    </ToolbarButton>
  ) : null;
  const sheets = data ? (
    <>
      <ViewSheet visible={picking} mode={mode} onChange={setMode} onClose={() => setPicking(false)} />
      {data.subscribed && draft ? (
        <ItemSheet key={`${draft.date}-${draft.startMin}`} draft={draft} handle={handle} onClose={() => setDraft(null)} />
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

  if (resource.loading && !data) return <Loading label="Planning ophalen" />;
  if (!data) {
    return <ErrorState message={messageFor(resource.error)} onRetry={() => void resource.refresh()} />;
  }

  if (!data.available) {
    return (
      <View style={styles.padded}>
        <Empty
          title="Planning nog niet beschikbaar"
          hint="De koppeling met Burgieclan staat op deze server nog niet aan."
        />
      </View>
    );
  }

  const refresh = <RefreshControl refreshing={resource.refreshing} onRefresh={() => void resource.refresh()} />;

  if (mode === 'blok') {
    return (
      <View style={styles.root}>
        <ScrollView style={styles.root} keyboardShouldPersistTaps="handled" refreshControl={refresh}>
          {resource.stale ? <StaleNotice onRetry={() => void resource.refresh()} /> : null}
          <BlokView
            handle={handle}
            onOpenStudies={onOpenStudies}
            header={<PlanningToolbar left={title('Examens en wat je per dag wil doen')}>{settingsButton}</PlanningToolbar>}
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
        <PlanningToolbar left={title(null)} />
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
          {resource.stale ? <StaleNotice onRetry={() => void resource.refresh()} /> : null}
          <PlanningToolbar left={title(eyebrow)}>
            {keys.length > 1 ? (
              <>
                <ToolbarButton label="Vorig semester" disabled={index <= 0} onPress={() => setSemesterChoice(keys[index - 1])}>
                  <ChevronLeft size={20} color={COLORS.ink} />
                </ToolbarButton>
                <ToolbarButton
                  label="Volgend semester"
                  disabled={index < 0 || index >= keys.length - 1}
                  onPress={() => setSemesterChoice(keys[index + 1])}
                >
                  <ChevronRight size={20} color={COLORS.ink} />
                </ToolbarButton>
              </>
            ) : null}
            {settingsButton}
          </PlanningToolbar>
          <View style={styles.overview}>
            {!overview ? (
              <Empty
                title="Nog geen lessen"
                hint="Zodra je lessenrooster lessen bevat, zie je hier per vak wat je afvinkte en wat je nog moet inhalen."
              />
            ) : (
              <>
                <TotalsRow totals={overview.totals} />
                {mode === 'vak' ? (
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
              </>
            )}
          </View>
        </ScrollView>
        {sheets}
      </View>
    );
  }

  return (
    <View style={styles.root}>
      {resource.stale ? <StaleNotice onRetry={() => void resource.refresh()} /> : null}
      {data.syncError ? (
        <Pressable style={styles.warning} onPress={() => setSettings(true)} accessibilityRole="button">
          <AlertTriangle size={16} color={COLORS.ink} />
          <Text style={styles.warningText}>
            Je lessenrooster kon niet bijgewerkt worden: {data.syncError} Tik om opnieuw te proberen of
            een andere link te koppelen.
          </Text>
        </Pressable>
      ) : null}

      <Grid
        key={data.today}
        planningToday={data.today}
        content={content}
        days={days}
        refreshing={resource.refreshing}
        onRefresh={() => void resource.refresh()}
        onSelect={(ref) => setSelection(selectionOf(ref))}
        renderTitle={(subtitle) => title(subtitle)}
        draft={draft}
        onDraft={setDraft}
        toolbarRight={
          <>
            <IconButton label="Exporteren naar je agenda" onPress={() => setExporting(true)}>
              <CalendarPlus size={19} color={COLORS.ink} />
            </IconButton>
            <IconButton label="Instellingen van de planning" onPress={() => setSettings(true)}>
              <Settings2 size={19} color={COLORS.ink} />
            </IconButton>
          </>
        }
      />

      {sheets}
    </View>
  );
}

function IconButton({ label, onPress, children }: { label: string; onPress: () => void; children: React.ReactNode }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      hitSlop={6}
      style={({ pressed }) => [styles.iconButton, pressed && styles.pressed]}
    >
      {children}
    </Pressable>
  );
}

function Grid({
  planningToday,
  days,
  content,
  refreshing,
  onRefresh,
  onSelect,
  renderTitle,
  draft,
  onDraft,
  toolbarRight,
}: {
  renderTitle: (subtitle: string) => React.ReactNode;
  draft: ItemDraft | null;
  onDraft: (draft: ItemDraft) => void;
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
  // Het blok dat je aan het neerzetten bent: waar het nu staat, in minuten.
  const draftStart = useSharedValue(0);
  const [placing, setPlacing] = useState<string | null>(null);
  const startPlacing = useCallback((date: string) => setPlacing(date), []);
  const finishPlacing = useCallback(
    (date: string, startMin: number) => {
      setPlacing(null);
      onDraft({ date, startMin, endMin: Math.min(startMin + DRAFT_MINUTES, 24 * 60) });
    },
    [onDraft],
  );

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

  const chipRows = useMemo(() => {
    let most = 0;
    for (const day of content.values()) most = Math.max(most, day.chips.length);
    return Math.min(most, 2);
  }, [content]);

  const visible = days.slice(first, first + VISIBLE_DAYS);
  const label = visible.length > 0 ? monthSpan(visible[0], visible[visible.length - 1]) : '';

  const goToday = () => {
    list.current?.scrollToIndex({ index: todayIndex, animated: true });
    setFirst(todayIndex);
  };

  const onSettle = (x: number) => setFirst(Math.max(0, Math.min(days.length - 1, Math.round(x / column))));

  return (
    <View style={styles.root}>
      <View style={styles.toolbar}>
        <View style={styles.toolbarLabel}>
          {renderTitle(visible[0] ? `${shortMonth(label)} · week ${isoWeek(visible[0])}` : label)}
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ disabled: first === todayIndex }}
          onPress={goToday}
          style={({ pressed }) => [styles.todayButton, pressed && styles.pressed]}
        >
          <Text style={styles.todayLabel}>Vandaag</Text>
        </Pressable>
        {toolbarRight}
      </View>

      <View style={styles.grid}>
      {/* De dagkoppen schuiven mee met het raster eronder, op de native thread. */}
      <View style={styles.headRow}>
        <View style={{ width: GUTTER }} />
        <View style={styles.headClip}>
          <Animated.View
            style={{
              flexDirection: 'row',
              width: column * days.length,
              transform: [{ translateX: Animated.multiply(scrollX, -1) }],
            }}
          >
            {days.map((date) => (
              <DayHead
                key={date}
                date={date}
                width={column}
                today={date === now.date}
                chips={content.get(date)?.chips ?? []}
                chipRows={chipRows}
                onSelect={onSelect}
              />
            ))}
          </Animated.View>
        </View>
      </View>

      <ScrollView
        ref={vertical}
        scrollEnabled={placing === null}
        style={styles.root}
        contentOffset={{ x: 0, y: initialY }}
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
              scrollEnabled={placing === null}
              snapToInterval={column}
              decelerationRate="fast"
              showsHorizontalScrollIndicator={false}
              initialNumToRender={VISIBLE_DAYS + 4}
              maxToRenderPerBatch={6}
              windowSize={7}
              scrollEventThrottle={16}
              onScroll={Animated.event([{ nativeEvent: { contentOffset: { x: scrollX } } }], { useNativeDriver: true })}
              onMomentumScrollEnd={(e) => onSettle(e.nativeEvent.contentOffset.x)}
              onScrollEndDrag={(e) => onSettle(e.nativeEvent.contentOffset.x)}
              extraData={`${now.date}:${now.minutes}:${content.size}:${placing ?? ''}:${draft?.date ?? ''}:${draft?.startMin ?? ''}`}
              renderItem={({ item }) => (
                <DayColumn
                  date={item}
                  width={column}
                  blocks={content.get(item)?.blocks ?? []}
                  nowMinutes={item === now.date ? now.minutes : null}
                  onSelect={onSelect}
                  draftStart={draftStart}
                  placing={placing === item}
                  draft={draft?.date === item ? draft : null}
                  onPlaceStart={startPlacing}
                  onPlaceEnd={finishPlacing}
                />
              )}
            />
          </View>
        </View>
      </ScrollView>
      </View>
    </View>
  );
}

function DayHead({
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
}

const DayColumn = memo(function DayColumn({
  date,
  width,
  blocks,
  nowMinutes,
  onSelect,
  draftStart,
  placing,
  draft,
  onPlaceStart,
  onPlaceEnd,
}: {
  date: string;
  width: number;
  blocks: Block[];
  nowMinutes: number | null;
  onSelect: (ref: Ref) => void;
  draftStart: SharedValue<number>;
  /** Wordt er op deze dag net een blok neergezet (de vinger is nog niet los)? */
  placing: boolean;
  /** Het neergezette blok op deze dag, terwijl het blad openstaat. */
  draft: ItemDraft | null;
  onPlaceStart: (date: string) => void;
  onPlaceEnd: (date: string, startMin: number) => void;
}) {
  const placed = useMemo(() => place(blocks), [blocks]);
  const weekend = weekdayOf(date) >= 5;
  const grabStart = useSharedValue(0);

  /**
   * Lang indrukken zet een blok van een uur neer, met je vinger in het midden;
   * zonder los te laten schuif je het per kwartier, en loslaten opent het blad om
   * het in te vullen. Zoals een nieuw evenement in Agenda op iOS.
   *
   * Een `Pan` die pas na het lang indrukken begint: een gewone veeg (scrollen,
   * naar de volgende dagen) beweegt te vroeg en laat hem mislukken, en een tik op
   * een les blijft een tik.
   */
  const gesture = Gesture.Pan()
    .activateAfterLongPress(LONG_PRESS_MS)
    .onStart((event) => {
      const minute = (event.y / HOUR) * 60 - DRAFT_MINUTES / 2;
      const start = Math.min(Math.max(Math.round(minute / SNAP) * SNAP, 0), 24 * 60 - DRAFT_MINUTES);
      grabStart.value = start;
      draftStart.value = start;
      runOnJS(onPlaceStart)(date);
    })
    .onUpdate((event) => {
      const minute = grabStart.value + (event.translationY / HOUR) * 60;
      draftStart.value = Math.min(Math.max(Math.round(minute / SNAP) * SNAP, 0), 24 * 60 - DRAFT_MINUTES);
    })
    .onEnd(() => {
      runOnJS(onPlaceEnd)(date, draftStart.value);
    });

  return (
    <GestureDetector gesture={gesture}>
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
              block.mandatory && styles.blockMandatory,
              block.done && styles.done,
              block.hidden && styles.blockHidden,
              pressed && styles.pressed,
            ]}
          >
            <View style={styles.blockTop}>
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
      {placing ? (
        <DraftBlock start={draftStart} />
      ) : draft ? (
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
    </GestureDetector>
  );
});

/** Het blok onder je vinger terwijl je het neerzet, met het beginuur erin. */
function DraftBlock({ start }: { start: SharedValue<number> }) {
  const animated = useAnimatedStyle(() => ({ top: (start.value / 60) * HOUR + 1 }));
  const [label, setLabel] = useState('');
  // Het uur in de tekst volgt het blok; enkel bij een nieuw kwartier, dus zelden.
  useAnimatedReactionLabel(start, setLabel);
  return (
    <Reanimated.View pointerEvents="none" style={[styles.draft, styles.draftLifted, { height: (DRAFT_MINUTES / 60) * HOUR - 2 }, animated]}>
      <Text style={styles.draftTime}>{label}</Text>
      <Text style={styles.draftTitle}>Nieuw</Text>
    </Reanimated.View>
  );
}

function useAnimatedReactionLabel(start: SharedValue<number>, onChange: (label: string) => void) {
  useAnimatedReaction(
    () => start.value,
    (value, previous) => {
      if (value !== previous) runOnJS(onChange)(clock(value));
    },
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
    borderWidth: 1,
    borderColor: COLORS.line2,
    borderLeftWidth: 3,
    borderLeftColor: COLORS.yellow,
  },
  warningText: { ...TYPE.small, color: COLORS.ink, flex: 1 },

  toolbar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    paddingLeft: SPACING.xl - 4,
    paddingRight: SPACING.lg,
    paddingTop: SPACING.sm,
    paddingBottom: SPACING.md,
  },
  toolbarLabel: { flex: 1 },
  month: { fontFamily: FONTS.bold, fontSize: 18, letterSpacing: -0.4, color: COLORS.ink },
  week: { ...TYPE.small, color: COLORS.muted, fontVariant: ['tabular-nums'] },
  todayButton: {
    height: 44,
    justifyContent: 'center',
    paddingHorizontal: SPACING.lg,
    borderRadius: RADIUS.pill,
    backgroundColor: COLORS.surface,
    ...CARD_SHADOW,
  },
  todayLabel: { fontFamily: FONTS.semibold, fontSize: 14, color: COLORS.ink },
  iconButton: {
    width: 44,
    height: 44,
    borderRadius: RADIUS.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.surface,
    ...CARD_SHADOW,
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
  chipVtk: { borderLeftWidth: 3, borderLeftColor: COLORS.yellow },
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
  blockVtk: { borderLeftWidth: 4, borderLeftColor: COLORS.yellow },
  blockMandatory: { borderLeftWidth: 3, borderLeftColor: PLANNING.danger },
  blockHidden: { borderStyle: 'dashed', opacity: 0.5 },
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

