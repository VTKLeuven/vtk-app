import { useFocusEffect, useScrollToTop } from 'expo-router';

import { Check, ChevronDown, ChevronRight, Pause, Pencil, Play, Plus, Settings2, Square, Trash2, Users } from 'lucide-react-native';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View, type ScrollViewInstance } from 'react-native';
import { Image } from 'expo-image';

import type { AppStudyGroup, AppStudyMemberState, AppStudyOverview } from '../../api/contract';
import {
  fetchStudyOverview,
  setStudySubjects,
  startStudySession,
  stopStudySession,
  updateStudySession,
} from '../../api/endpoints';
import { messageFor, useResource } from '../../api/useResource';
import { YellowHead, YellowHeadButton } from '../../components/YellowHead';
import { Sheet } from '../../components/planning/PlanningSheets';
import {
  Skyline,
  buildingFor,
  relativeBuildings,
  type Building,
} from '../../components/Skyline';
import { Button, Card, ErrorState, Loading, StaleNotice } from '../../components/ui';
import { formatClock, formatSpan } from '../../format';
import { useApp } from '../../state/app';
import { useTabRouter } from '../../navigation';
import { COLORS, FONTS, RADIUS, SPACING, TYPE } from '../../theme/tokens';
import type { StudiesTabs } from './tabs';

/**
 * Samen blokken.
 *
 * **De groep staat vooraan, niet je eigen cijfer.** Dat is de hele keuze achter
 * dit scherm. Een ranglijst motiveert de eerste drie; een lege plaats naast je
 * vrienden motiveert iedereen, en het is meteen het enige wat een app kan en een
 * website niet. Je eigen getallen staan er wel, maar onderaan.
 *
 * **De klok loopt hier lokaal en de waarheid staat op de server.** De app telt elke
 * seconde door vanaf wat ze kreeg, en meldt zich elke minuut opnieuw. Blijft dat
 * levensteken weg, dan telt de server de sessie tot het laatste moment waarop hij
 * wist dat ze liep; zie `lib/app-api/study.ts` aan de andere kant.
 *
 * **De teller loopt door buiten de app** (sinds november 2026; tot dan was weg
 * uit de app pauze). Wie studeert, legt zijn telefoon weg. Pauzeren doe je met de
 * knop. Blijft de app langer dan drie uur dicht, dan sluit de server de sessie
 * drie uur na het laatste levensteken (`STUDY_AWAY_SECONDS` op de site), zodat
 * een vergeten teller geen nacht oplevert.
 */

/** Hoe vaak de app zich meldt terwijl er een sessie loopt. */
const HEARTBEAT_MS = 60_000;
/** Hoe vaak de zaal ververst wanneer er geen sessie loopt maar het scherm openstaat. */
const ROOM_REFRESH_MS = 45_000;
/** De hoogte van het skylinepaneel; bepaalt hoeveel verdiepingen er passen. */
const SKYLINE_HEIGHT = 126;

/**
 * Samen blokken, het eerste tabblad van Studies (`src/screens/tab-studies.tsx`).
 * `tabs` zijn de pillen van de gele kop (`YellowHead`); elk tabblad tekent zijn
 * eigen kop zodat de regel eronder bij de inhoud past.
 *
 * **De groep kies je bij de zaal, niet in de kop.** Tot november 2026 stonden je
 * groepen als pillen onder de tabbladen, en dan lezen ze als nog een rij
 * tabbladen. Nu is de naam van de groep de kop boven "wie zit er nu", met een
 * pijltje dat een blad met je groepen opent (`GroupSheet`).
 */
export function BlokkenView({ tabs }: { tabs: StudiesTabs }) {
  // Een tik op de tab waar je al staat, scrolt naar boven.
  const topRef = useRef<ScrollViewInstance>(null);
  useScrollToTop(topRef);
  const router = useTabRouter();
  const { viewer } = useApp();

  const resource = useResource(
    'studeren',
    () => (viewer ? fetchStudyOverview() : Promise.resolve(null)),
    viewer?.id ?? 'anon',
  );

  const [overview, setOverview] = useState<AppStudyOverview | null>(null);
  const [activeGroupId, setActiveGroupId] = useState<string | null>(null);
  const [pickingGroup, setPickingGroup] = useState(false);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  // De klok telt lokaal door vanaf wat de server zei. `setTick` heeft geen waarde
  // die iemand leest; het enige doel is opnieuw tekenen, één keer per seconde.
  const [, setTick] = useState(0);
  const anchor = useRef<{ seconds: number; at: number } | null>(null);

  const applyOverview = useCallback((next: AppStudyOverview) => {
    setOverview(next);
    anchor.current = next.session ? { seconds: next.session.seconds, at: Date.now() } : null;
    setTick((value) => value + 1);
  }, []);

  useEffect(() => {
    if (resource.data) applyOverview(resource.data);
  }, [resource.data, applyOverview]);

  const session = overview?.session ?? null;
  const groups = overview?.groups ?? [];
  const group = groups.find((item) => item.id === activeGroupId) ?? groups[0] ?? null;

  /** De klok tikt enkel wanneer er iets te tikken valt. */
  useEffect(() => {
    if (!session || session.paused) return;
    const timer = setInterval(() => setTick((value) => value + 1), 1000);
    return () => clearInterval(timer);
  }, [session]);

  const liveSeconds = (() => {
    if (!session) return 0;
    if (session.paused || !anchor.current) return session.seconds;
    return session.seconds + Math.floor((Date.now() - anchor.current.at) / 1000);
  })();

  const call = useCallback(
    async (action: () => Promise<AppStudyOverview>) => {
      setBusy(true);
      setProblem(null);
      try {
        applyOverview(await action());
      } catch (error) {
        setProblem(messageFor(error instanceof Error ? error : null));
      } finally {
        setBusy(false);
      }
    },
    [applyOverview],
  );

  /**
   * Het levensteken, en meteen de verversing van de zaal.
   *
   * Eén tijdklok voor allebei: het antwoord op een levensteken is het volledige
   * overzicht, dus wie zit er nu en hoelang al komt er gratis bij. Een tweede
   * timer die hetzelfde ophaalt, zou enkel dubbel werk zijn.
   */
  useEffect(() => {
    if (!viewer) return;
    const period = session ? HEARTBEAT_MS : ROOM_REFRESH_MS;
    const timer = setInterval(() => {
      if (AppState.currentState !== 'active') return;
      if (session) {
        void updateStudySession({ action: 'heartbeat' }).then(applyOverview).catch(() => {});
      } else {
        void fetchStudyOverview().then(applyOverview).catch(() => {});
      }
    }, period);
    return () => clearInterval(timer);
  }, [viewer, session, applyOverview]);

  /**
   * Terug in de app: meteen een levensteken, zodat de klok en de zaal kloppen
   * met wat de server telde terwijl de telefoon weg lag. Weggaan pauzeert niet:
   * de teller loopt door (zie boven).
   */
  useEffect(() => {
    if (!session) return;
    const subscription = AppState.addEventListener('change', (state) => {
      if (state !== 'active') return;
      void updateStudySession({ action: 'heartbeat' }).then(applyOverview).catch(() => {});
    });
    return () => subscription.remove();
  }, [session, applyOverview]);

  // Terugkomen van het groepsscherm hoort de lijst bij te werken; daar kan net
  // een groep bijgekomen of verdwenen zijn. De eerste keer haalt `useResource` zelf op.
  const focusedOnce = useRef(false);
  useFocusEffect(
    useCallback(() => {
      if (focusedOnce.current && viewer) void resource.reload();
      focusedOnce.current = true;
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [viewer?.id]),
  );

  if (!viewer) {
    return (
      <ScrollView style={styles.root} contentContainerStyle={styles.scroll}>
        <View style={styles.overscroll} />
        <YellowHead title="Studies" tabs={tabs}>
          <Text style={styles.headLine}>Blok samen met je vrienden</Text>
        </YellowHead>
        <View style={styles.content}>
          <Card>
            <Text style={styles.cardTitle}>Log eerst in</Text>
            <Text style={styles.body}>
              Je studietijd en je groepen hangen aan je account.
            </Text>
            <Button label="Inloggen" onPress={() => router.push('/inloggen')} />
          </Card>
        </View>
      </ScrollView>
    );
  }

  if (resource.loading && !overview) {
    return (
      <View style={styles.root}>
        <YellowHead title="Studies" tabs={tabs}>
          <Text style={styles.headLine}>Blok samen met je vrienden</Text>
        </YellowHead>
        <Loading label="Studeren ophalen" />
      </View>
    );
  }
  if (!overview) {
    return (
      <View style={styles.root}>
        <YellowHead title="Studies" tabs={tabs}>
          <Text style={styles.headLine}>Blok samen met je vrienden</Text>
        </YellowHead>
        <ErrorState message={messageFor(resource.error)} onRetry={() => void resource.refresh()} />
      </View>
    );
  }

  const yours = group?.members.find((member) => member.isYou) ?? null;

  return (
    <ScrollView ref={topRef}
      style={styles.root}
      contentContainerStyle={styles.scroll}
      refreshControl={
        <RefreshControl refreshing={resource.refreshing} tintColor={COLORS.navy} onRefresh={() => void resource.refresh()} />
      }
    >
      <View style={styles.overscroll} />
      <YellowHead
        title="Studies"
        tabs={tabs}
        right={
          group ? (
            <YellowHeadButton
              label={`Instellingen van ${group.name}`}
              onPress={() => router.push(`/studiegroep/${group.id}`)}
            >
              <Settings2 color={COLORS.yellow} size={19} />
            </YellowHeadButton>
          ) : undefined
        }
      >
        <Text style={styles.headLine}>{roomLine(group, overview)}</Text>
      </YellowHead>

      <View style={styles.content}>
        {resource.stale ? <StaleNotice onRetry={() => void resource.refresh()} /> : null}

        <SessionPanel
          overview={overview}
          group={group}
          seconds={liveSeconds}
          busy={busy}
          onStart={(subject) => call(() => startStudySession({ subject }))}
          onPause={() =>
            call(() => updateStudySession({ action: session?.paused ? 'resume' : 'pause' }))
          }
          onStop={() => call(async () => (await stopStudySession()).overview)}
          onSaveSubjects={(subjects) => call(() => setStudySubjects(subjects))}
        />

        {problem ? <Text style={styles.problem}>{problem}</Text> : null}

        {group ? (
          <View style={styles.section}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Groep: ${group.name}. Tik om van groep te wisselen of een groep te maken`}
              onPress={() => setPickingGroup(true)}
              hitSlop={6}
              style={({ pressed }) => [styles.groupTitle, pressed && styles.rowPressed]}
            >
              <Text style={styles.sectionTitle} numberOfLines={1}>
                {group.name}
              </Text>
              <View style={styles.groupTitleChevron}>
                <ChevronDown color={COLORS.navy} size={16} strokeWidth={2.4} />
              </View>
            </Pressable>
            <Room group={group} onOpen={() => router.push(`/studiegroep/${group.id}`)} />
          </View>
        ) : (
          <NoGroups onNew={() => router.push('/studiegroep/nieuw')} />
        )}

        {group?.weeklyGoalMinutes ? <GroupGoal group={group} /> : null}
        {group ? <Leaderboard group={group} /> : null}

        <YourWeek overview={overview} yours={yours} />
      </View>

      <GroupSheet
        visible={pickingGroup}
        groups={groups}
        activeId={group?.id ?? null}
        onPick={(id) => {
          setActiveGroupId(id);
          setPickingGroup(false);
        }}
        onNew={() => {
          setPickingGroup(false);
          router.push('/studiegroep/nieuw');
        }}
        onClose={() => setPickingGroup(false)}
      />
    </ScrollView>
  );
}

function roomLine(group: AppStudyGroup | null, overview: AppStudyOverview): string {
  if (!group) return 'Maak een groep en deel de code met je vrienden';
  if (group.liveCount === 0) {
    return overview.session ? 'Je bent de eerste die zit' : 'Niemand studeert nu';
  }
  return `${group.liveCount} van de ${group.memberCount} ${group.liveCount === 1 ? 'is' : 'zijn'} nu bezig`;
}

// ── De sessie ───────────────────────────────────────────────────────────────

function SessionPanel({
  overview,
  group,
  seconds,
  busy,
  onStart,
  onPause,
  onStop,
  onSaveSubjects,
}: {
  overview: AppStudyOverview;
  group: AppStudyGroup | null;
  seconds: number;
  busy: boolean;
  onStart: (subject?: string) => void;
  onPause: () => void;
  onStop: () => void;
  onSaveSubjects: (subjects: string[]) => Promise<void>;
}) {
  const [subject, setSubject] = useState('');
  const session = overview.session;

  if (!session) {
    return (
      <View style={styles.panel}>
        <Skyline buildings={idleSkyline(overview, group)} height={SKYLINE_HEIGHT} moon />
        <View style={styles.panelBody}>
          <Text style={styles.panelTitle}>Kom erbij</Text>
          <Text style={styles.panelHint}>
            Elke tien minuten komt er een verdieping bij. Leg je telefoon gerust weg:
            de teller loopt door tot je stopt.
          </Text>

          <SubjectRow
            value={subject}
            onChange={setSubject}
            suggestions={overview.subjects}
            onSave={onSaveSubjects}
          />

          <Button
            label={busy ? 'Bezig' : 'Beginnen'}
            variant="accent"
            onPress={() => onStart(subject.trim() || undefined)}
          />
        </View>
      </View>
    );
  }

  return (
    <View style={styles.panel}>
      <Skyline
        buildings={[buildingFor('jij', seconds, !session.paused)]}
        height={SKYLINE_HEIGHT}
        moon
      />
      <View style={styles.panelBody}>
        <Text style={styles.clock}>{formatClock(seconds)}</Text>
        <Text style={styles.panelHint}>
          {session.paused
            ? 'Gepauzeerd. De bouw ligt stil.'
            : session.subject
              ? `Bezig met ${session.subject}`
              : 'Bezig'}
        </Text>

        <View style={styles.controls}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={session.paused ? 'Hervatten' : 'Pauzeren'}
            disabled={busy}
            onPress={onPause}
            style={({ pressed }) => [styles.control, pressed && styles.controlPressed]}
          >
            {session.paused ? (
              <Play color={COLORS.onDark} size={17} />
            ) : (
              <Pause color={COLORS.onDark} size={17} />
            )}
            <Text style={styles.controlLabel}>{session.paused ? 'Hervatten' : 'Pauze'}</Text>
          </Pressable>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Sessie stoppen"
            disabled={busy}
            onPress={onStop}
            style={({ pressed }) => [
              styles.control,
              styles.controlStop,
              pressed && styles.controlPressed,
            ]}
          >
            <Square color={COLORS.ink} size={15} />
            <Text style={[styles.controlLabel, styles.controlStopLabel]}>Stoppen</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

/**
 * De skyline zonder lopende sessie: wat je groep vandaag deed, of anders je eigen
 * week. Een leeg stuk grond zou zeggen dat er niets is, terwijl je vanochtend
 * misschien vier uur zat.
 *
 * Hier telt de **onderlinge** verhouding en niet de absolute tijd: de langste zit
 * staat op volle hoogte en de rest daaronder. In de sessie zelf is dat net
 * omgekeerd, want daar is tien minuten per verdieping juist de beloning.
 */
function idleSkyline(overview: AppStudyOverview, group: AppStudyGroup | null): Building[] {
  if (group && group.members.length > 1) {
    return relativeBuildings(
      group.members.slice(0, 8).map((member) => ({
        key: member.userId,
        seconds: member.todaySeconds,
        active: member.studying,
      })),
      SKYLINE_HEIGHT,
    );
  }
  return relativeBuildings(
    overview.week.map((day) => ({ key: day.date, seconds: day.seconds })),
    SKYLINE_HEIGHT,
  );
}

function SubjectRow({
  value,
  onChange,
  suggestions,
  onSave,
}: {
  value: string;
  onChange: (value: string) => void;
  suggestions: string[];
  onSave: (subjects: string[]) => Promise<void>;
}) {
  const [managing, setManaging] = useState(false);

  return (
    <View style={styles.subject}>
      <TextInput
        value={value}
        onChangeText={onChange}
        placeholder="Waaraan werk je? (mag leeg blijven)"
        placeholderTextColor={COLORS.onDarkMuted}
        style={styles.subjectInput}
        maxLength={60}
        returnKeyType="done"
      />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipRow}>
        {suggestions.map((item) => (
          <Pressable
            key={item}
            accessibilityRole="button"
            accessibilityLabel={item}
            onPress={() => onChange(item)}
            style={[styles.chip, value === item && styles.chipOn]}
          >
            <Text style={[styles.chipText, value === item && styles.chipTextOn]}>{item}</Text>
          </Pressable>
        ))}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Vakken beheren"
          onPress={() => setManaging(true)}
          style={[styles.chip, styles.chipManage]}
        >
          {suggestions.length > 0 ? <Pencil color={COLORS.onDarkMuted} size={13} /> : <Plus color={COLORS.onDarkMuted} size={14} />}
          <Text style={styles.chipText}>{suggestions.length > 0 ? 'Beheren' : 'Vakken toevoegen'}</Text>
        </Pressable>
      </ScrollView>
      {/* Pas getekend wanneer het open gaat, zodat het telkens begint van de lijst zoals ze nu is. */}
      {managing ? (
        <SubjectsSheet
          subjects={suggestions}
          onClose={() => setManaging(false)}
          onSave={async (next) => {
            await onSave(next);
            setManaging(false);
          }}
        />
      ) : null}
    </View>
  );
}

/**
 * De vakken onder "Waaraan werk je?" beheren: hernoemen, weggooien, toevoegen.
 * Het blad werkt op een kopie en bewaart de hele lijst in één keer; sluiten
 * zonder bewaren laat alles zoals het was. Een oude sessie houdt haar vak.
 */
function SubjectsSheet({
  subjects,
  onClose,
  onSave,
}: {
  subjects: string[];
  onClose: () => void;
  onSave: (subjects: string[]) => Promise<void>;
}) {
  const [draft, setDraft] = useState<string[]>(subjects);
  const [added, setAdded] = useState('');
  const [saving, setSaving] = useState(false);

  const add = () => {
    const name = added.trim();
    if (!name) return;
    if (!draft.some((item) => item.trim().toLowerCase() === name.toLowerCase())) setDraft([...draft, name]);
    setAdded('');
  };

  const save = async () => {
    setSaving(true);
    try {
      const pending = added.trim();
      const all = pending && !draft.some((item) => item.trim().toLowerCase() === pending.toLowerCase()) ? [...draft, pending] : draft;
      await onSave(all.map((item) => item.trim()).filter(Boolean));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Sheet visible title="Waaraan werk je?" onClose={onClose}>
      <Text style={styles.sheetHint}>
        De vakken die je onder het tekstveld ziet. Tik op een naam om ze aan te passen.
      </Text>
      {draft.map((item, index) => (
        <View key={index} style={styles.sheetRow}>
          <TextInput
            value={item}
            onChangeText={(text) => setDraft(draft.map((other, at) => (at === index ? text : other)))}
            style={styles.sheetInput}
            maxLength={60}
            accessibilityLabel={`Vak ${index + 1}`}
          />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`${item || 'Vak'} verwijderen`}
            hitSlop={8}
            onPress={() => setDraft(draft.filter((_, at) => at !== index))}
            style={styles.sheetDelete}
          >
            <Trash2 color={COLORS.dangerInk} size={18} />
          </Pressable>
        </View>
      ))}
      <View style={styles.sheetRow}>
        <TextInput
          value={added}
          onChangeText={setAdded}
          placeholder="Nieuw vak"
          placeholderTextColor={COLORS.muted}
          style={styles.sheetInput}
          maxLength={60}
          returnKeyType="done"
          onSubmitEditing={add}
        />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Vak toevoegen"
          hitSlop={8}
          disabled={!added.trim()}
          onPress={add}
          style={[styles.sheetDelete, !added.trim() && styles.disabled]}
        >
          <Plus color={COLORS.ink} size={20} />
        </Pressable>
      </View>
      <Button label="Bewaren" onPress={() => void save()} busy={saving} />
    </Sheet>
  );
}

// ── De zaal ─────────────────────────────────────────────────────────────────

function Room({ group, onOpen }: { group: AppStudyGroup; onOpen: () => void }) {
  const present = group.members.filter((member) => member.studying || member.paused);

  return (
    <Card>
      <Text style={styles.label}>Nu aan het studeren</Text>

      {present.length === 0 ? (
        <Text style={styles.body}>
          Niemand van {group.name} zit nu. Begin jij, dan krijgen ze een bericht.
        </Text>
      ) : (
        present.map((member) => <Seat key={member.userId} member={member} />)
      )}

      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`De groep ${group.name} openen`}
        onPress={onOpen}
        style={({ pressed }) => [styles.groupLink, pressed && styles.rowPressed]}
      >
        <Text style={styles.groupLinkText}>
          {group.memberCount} {group.memberCount === 1 ? 'lid' : 'leden'} &middot; code {group.code}
        </Text>
        <ChevronRight color={COLORS.muted} size={17} />
      </Pressable>
    </Card>
  );
}

function Seat({ member }: { member: AppStudyMemberState }) {
  return (
    <View style={styles.seat}>
      <Avatar member={member} live={member.studying} />
      <View style={styles.seatText}>
        <Text style={styles.seatName} numberOfLines={1}>
          {member.isYou ? 'Jij' : member.name}
        </Text>
        <Text style={styles.seatSub} numberOfLines={1}>
          {member.paused ? 'Even gepauzeerd' : (member.subject ?? 'Aan het studeren')}
        </Text>
      </View>
      <Text style={[styles.seatTime, member.paused && styles.seatTimeDim]}>
        {formatSpan(member.liveSeconds ?? 0)}
      </Text>
    </View>
  );
}

function Avatar({ member, live }: { member: AppStudyMemberState; live: boolean }) {
  if (member.avatarUrl) {
    return (
      <Image cachePolicy="memory-disk"
        source={{ uri: member.avatarUrl }}
        style={[styles.avatar, live && styles.avatarLive]}
        contentFit="cover"
      />
    );
  }
  return (
    <View style={[styles.avatar, styles.avatarEmpty, live && styles.avatarLive]}>
      <Text style={styles.initials}>{initialsOf(member.name)}</Text>
    </View>
  );
}

function initialsOf(name: string): string {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');
}

// ── Het groepsdoel ──────────────────────────────────────────────────────────

function GroupGoal({ group }: { group: AppStudyGroup }) {
  const goal = (group.weeklyGoalMinutes ?? 0) * 60;
  const share = goal > 0 ? Math.min(1, group.weekSeconds / goal) : 0;

  return (
    <Card>
      <Text style={styles.label}>Samen deze week</Text>
      <Text style={styles.goalLine}>
        {formatSpan(group.weekSeconds)} van de {formatSpan(goal)}
      </Text>
      <View style={styles.track}>
        <View style={[styles.trackFill, { width: `${Math.round(share * 100)}%` }]} />
      </View>
      <Text style={styles.hint}>
        {share >= 1
          ? 'Gehaald. Iedereen heeft eraan meegedaan.'
          : `Nog ${formatSpan(goal - group.weekSeconds)} te gaan.`}
      </Text>
    </Card>
  );
}

// ── De ranglijst ────────────────────────────────────────────────────────────

function Leaderboard({ group }: { group: AppStudyGroup }) {
  const best = Math.max(1, ...group.members.map((member) => member.weekSeconds));

  return (
    <Card>
      <Text style={styles.label}>Deze week</Text>
      {group.members.map((member, index) => (
        <View key={member.userId} style={styles.rank}>
          <Text style={styles.pos}>{index + 1}</Text>
          <Avatar member={member} live={member.studying} />
          <View style={styles.rankText}>
            <Text style={styles.rankName} numberOfLines={1}>
              {member.isYou ? 'Jij' : member.name}
            </Text>
            <View style={styles.bar}>
              <View
                style={[
                  styles.barFill,
                  member.isYou && styles.barFillMine,
                  { width: `${Math.round((member.weekSeconds / best) * 100)}%` },
                ]}
              />
            </View>
          </View>
          <Text style={styles.rankTime}>{formatSpan(member.weekSeconds)}</Text>
        </View>
      ))}
    </Card>
  );
}

// ── Jouw week ───────────────────────────────────────────────────────────────

function YourWeek({
  overview,
  yours,
}: {
  overview: AppStudyOverview;
  yours: AppStudyMemberState | null;
}) {
  const best = Math.max(1, ...overview.week.map((day) => day.seconds));
  const days = ['ma', 'di', 'wo', 'do', 'vr', 'za', 'zo'];

  return (
    <Card>
      <Text style={styles.label}>Jouw week</Text>

      <View style={styles.stats}>
        <Stat label="Vandaag" value={formatSpan(overview.todaySeconds)} />
        <Stat label="Deze week" value={formatSpan(overview.weekSeconds)} />
        <Stat
          label="Reeks"
          value={overview.streak === 0 ? '0 d' : `${overview.streak} d`}
        />
      </View>

      <View style={styles.week}>
        {overview.week.map((day, index) => (
          <View key={day.date} style={styles.weekDay}>
            <View style={styles.weekTrack}>
              <View
                style={[
                  styles.weekFill,
                  day.goalMet && styles.weekFillMet,
                  { height: `${Math.round((day.seconds / best) * 100)}%` },
                ]}
              />
            </View>
            <Text style={styles.weekLabel}>
              {days[(new Date(day.date).getUTCDay() + 6) % 7] ?? days[index]}
            </Text>
          </View>
        ))}
      </View>

      <Text style={styles.hint}>
        Je dagdoel staat op {formatSpan(overview.dailyGoalMinutes * 60)}.
        {yours && yours.todaySeconds >= overview.dailyGoalMinutes * 60
          ? ' Vandaag gehaald.'
          : ''}
      </Text>
    </Card>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statLabel}>{label.toUpperCase()}</Text>
      <Text style={styles.statValue}>{value}</Text>
    </View>
  );
}

// ── Groepen ─────────────────────────────────────────────────────────────────

/**
 * Je groepen, in een blad dat opent vanaf de naam van de groep boven de zaal:
 * wie er in elke groep nu zit, en onderaan een nieuwe groep maken of er een
 * binnengaan met een code.
 */
function GroupSheet({
  visible,
  groups,
  activeId,
  onPick,
  onNew,
  onClose,
}: {
  visible: boolean;
  groups: AppStudyGroup[];
  activeId: string | null;
  onPick: (id: string) => void;
  onNew: () => void;
  onClose: () => void;
}) {
  return (
    <Sheet visible={visible} title="Je groepen" onClose={onClose}>
      <View style={styles.sheetList}>
        {groups.map((item, index) => {
          const active = item.id === activeId;
          return (
            <Pressable
              key={item.id}
              accessibilityRole="radio"
              accessibilityState={{ selected: active }}
              accessibilityLabel={`${item.name}, ${item.liveCount} nu bezig`}
              onPress={() => onPick(item.id)}
              style={({ pressed }) => [styles.groupRow, index > 0 && styles.sheetLine, pressed && styles.rowPressed]}
            >
              <View style={styles.sheetText}>
                <Text style={styles.sheetName}>{item.name}</Text>
                <Text style={styles.sheetSub}>
                  {item.liveCount > 0
                    ? `${item.liveCount} van de ${item.memberCount} nu bezig`
                    : `${item.memberCount} ${item.memberCount === 1 ? 'lid' : 'leden'}`}
                </Text>
              </View>
              {active ? <Check color={COLORS.navy} size={18} /> : null}
            </Pressable>
          );
        })}
      </View>
      <Button label="Groep maken of deelnemen" variant="ghost" onPress={onNew} />
    </Sheet>
  );
}

function NoGroups({ onNew }: { onNew: () => void }) {
  return (
    <Card>
      <View style={styles.cardHead}>
        <View style={styles.cardIcon}>
          <Users color={COLORS.ink} size={21} />
        </View>
        <Text style={styles.cardHeadTitle}>Blok samen</Text>
      </View>
      <Text style={styles.body}>
        Maak een groep, deel de code met je vrienden, en jullie zien van elkaar wie
        er zit. Je tijd is enkel zichtbaar voor wie in dezelfde groep zit.
      </Text>
      <Button label="Groep maken of deelnemen" onPress={onNew} />
    </Card>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.paper },
  scroll: { paddingBottom: SPACING.xxl },
  content: { padding: SPACING.lg, paddingTop: SPACING.xl - 2, gap: SPACING.lg },
  // Trekt de gele kop door wanneer je op iOS omlaag trekt.
  overscroll: {
    position: 'absolute',
    top: -1000,
    left: 0,
    right: 0,
    height: 1000,
    backgroundColor: COLORS.yellow,
  },
  headLine: { fontFamily: FONTS.bold, fontSize: 17, color: COLORS.navy },
  section: { gap: SPACING.md },
  sectionTitle: { flexShrink: 1, fontFamily: FONTS.bold, fontSize: 22, letterSpacing: -0.5, color: COLORS.navy },
  groupTitle: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, alignSelf: 'flex-start', paddingHorizontal: SPACING.xs },
  groupTitleChevron: {
    width: 26,
    height: 26,
    borderRadius: RADIUS.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.paper2,
  },
  sheetList: { backgroundColor: COLORS.surface, borderRadius: RADIUS.md, overflow: 'hidden' },
  groupRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.md, padding: SPACING.md },
  sheetLine: { borderTopWidth: 1, borderTopColor: COLORS.line },
  sheetText: { flex: 1, gap: 2 },
  sheetName: { fontFamily: FONTS.semibold, fontSize: 15, color: COLORS.ink },
  sheetSub: { ...TYPE.small, color: COLORS.muted },

  panel: {
    backgroundColor: COLORS.navy,
    borderRadius: 26,
    overflow: 'hidden',
  },
  panelBody: { padding: SPACING.lg + 2, gap: SPACING.md },
  panelTitle: { fontFamily: FONTS.bold, fontSize: 22, letterSpacing: -0.6, color: COLORS.onDark },
  cardHead: { flexDirection: 'row', alignItems: 'center', gap: SPACING.md },
  cardIcon: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: COLORS.yellow,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardHeadTitle: { fontFamily: FONTS.bold, fontSize: 18, letterSpacing: -0.4, color: COLORS.ink },
  panelHint: { ...TYPE.small, color: COLORS.onDarkMuted },
  clock: {
    ...TYPE.pageTitle,
    fontSize: 40,
    lineHeight: 46,
    color: COLORS.onDark,
    fontVariant: ['tabular-nums'],
  },

  controls: { flexDirection: 'row', gap: SPACING.sm, marginTop: SPACING.sm },
  control: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.sm,
    paddingVertical: 13,
    borderRadius: RADIUS.pill,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.22)',
  },
  controlPressed: { opacity: 0.75 },
  controlLabel: { ...TYPE.body, fontFamily: TYPE.cardTitle.fontFamily, color: COLORS.onDark },
  controlStop: { backgroundColor: COLORS.yellow, borderColor: COLORS.yellow },
  controlStopLabel: { color: COLORS.ink },

  subject: { gap: SPACING.sm },
  subjectInput: {
    ...TYPE.body,
    color: COLORS.onDark,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: COLORS.onDarkControlBorder,
    borderRadius: 14,
    paddingHorizontal: SPACING.md,
    minHeight: 48,
  },

  chipRow: { flexGrow: 0 },
  chip: {
    paddingHorizontal: SPACING.md,
    paddingVertical: 7,
    borderRadius: RADIUS.pill,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
    marginRight: SPACING.sm,
  },
  chipOn: { backgroundColor: COLORS.yellow, borderColor: COLORS.yellow },
  chipManage: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  sheetHint: { ...TYPE.small, color: COLORS.muted },
  sheetRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm },
  sheetInput: {
    ...TYPE.body,
    flex: 1,
    color: COLORS.ink,
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.controlBorder,
    paddingHorizontal: SPACING.md,
    paddingVertical: 10,
  },
  sheetDelete: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  disabled: { opacity: 0.4 },
  chipText: { ...TYPE.small, color: COLORS.onDarkMuted },
  chipTextOn: { color: COLORS.ink, fontFamily: TYPE.cardTitle.fontFamily },


  label: {
    ...TYPE.kicker,
    color: COLORS.muted,
    marginBottom: SPACING.sm,
  },
  cardTitle: { ...TYPE.cardTitle, color: COLORS.ink },
  body: { ...TYPE.body, color: COLORS.body },
  hint: { ...TYPE.small, color: COLORS.muted, marginTop: SPACING.sm },
  problem: { ...TYPE.small, color: COLORS.ink, textAlign: 'center' },

  seat: { flexDirection: 'row', alignItems: 'center', gap: SPACING.md, paddingVertical: 9 },
  seatText: { flex: 1, minWidth: 0 },
  seatName: { ...TYPE.body, fontFamily: TYPE.cardTitle.fontFamily, color: COLORS.ink },
  seatSub: { ...TYPE.small, color: COLORS.muted },
  seatTime: {
    ...TYPE.body,
    fontFamily: TYPE.cardTitle.fontFamily,
    color: COLORS.ink,
    fontVariant: ['tabular-nums'],
  },
  seatTimeDim: { color: COLORS.muted },

  avatar: { width: 34, height: 34, borderRadius: 17, backgroundColor: COLORS.paper2 },
  avatarEmpty: { alignItems: 'center', justifyContent: 'center' },
  avatarLive: { borderWidth: 2, borderColor: COLORS.yellow },
  initials: { ...TYPE.small, fontFamily: TYPE.cardTitle.fontFamily, color: COLORS.navy },

  groupLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    borderTopWidth: 1,
    borderTopColor: COLORS.line,
    marginTop: SPACING.sm,
    paddingTop: SPACING.md,
  },
  groupLinkText: { ...TYPE.small, color: COLORS.muted, flex: 1 },
  rowPressed: { opacity: 0.6 },

  goalLine: { ...TYPE.sectionTitle, color: COLORS.ink },
  track: {
    height: 8,
    borderRadius: RADIUS.pill,
    backgroundColor: COLORS.paper2,
    overflow: 'hidden',
    marginTop: SPACING.sm,
  },
  trackFill: { height: '100%', backgroundColor: COLORS.yellowDeep, borderRadius: RADIUS.pill },

  rank: { flexDirection: 'row', alignItems: 'center', gap: SPACING.md, paddingVertical: 8 },
  pos: {
    ...TYPE.small,
    fontFamily: TYPE.cardTitle.fontFamily,
    color: COLORS.muted,
    width: 14,
    fontVariant: ['tabular-nums'],
  },
  rankText: { flex: 1, minWidth: 0, gap: 5 },
  rankName: { ...TYPE.small, fontFamily: TYPE.cardTitle.fontFamily, color: COLORS.ink },
  bar: { height: 4, borderRadius: RADIUS.pill, backgroundColor: COLORS.paper2, overflow: 'hidden' },
  barFill: { height: '100%', backgroundColor: COLORS.navy, borderRadius: RADIUS.pill },
  barFillMine: { backgroundColor: COLORS.yellowDeep },
  rankTime: {
    ...TYPE.small,
    fontFamily: TYPE.cardTitle.fontFamily,
    color: COLORS.body,
    fontVariant: ['tabular-nums'],
  },

  stats: { flexDirection: 'row', gap: SPACING.sm },
  stat: {
    flex: 1,
    backgroundColor: COLORS.paper2,
    borderRadius: RADIUS.sm,
    paddingVertical: SPACING.md,
    alignItems: 'center',
  },
  statLabel: { ...TYPE.kicker, fontSize: 9.5, color: COLORS.muted },
  statValue: {
    ...TYPE.sectionTitle,
    fontSize: 17,
    color: COLORS.ink,
    marginTop: 2,
    fontVariant: ['tabular-nums'],
  },

  week: { flexDirection: 'row', gap: 6, marginTop: SPACING.lg, height: 74 },
  weekDay: { flex: 1, gap: 5 },
  weekTrack: {
    flex: 1,
    backgroundColor: COLORS.paper2,
    borderRadius: 5,
    justifyContent: 'flex-end',
    overflow: 'hidden',
  },
  weekFill: { backgroundColor: COLORS.navy, borderRadius: 5 },
  weekFillMet: { backgroundColor: COLORS.yellowDeep },
  weekLabel: { ...TYPE.small, fontSize: 10, color: COLORS.muted, textAlign: 'center' },
});
