
import { useLocalSearchParams } from 'expo-router';
import { Bell } from 'lucide-react-native';
import { useMemo, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';

import { fetchCalendar, setEventInterest } from '../api/endpoints';
import { messageFor, useResource } from '../api/useResource';
import { EventTile } from '../components/EventTile';
import { MonthView } from '../components/MonthView';
import { PlanningView } from '../components/planning/PlanningView';
import { PageHead } from '../components/PageHead';
import { Empty, ErrorState, Loading, StaleNotice, WeekHead } from '../components/ui';
import { formatDay } from '../format';
import { anchorOf, dayKeyOf, gridRange, todayKey, type MonthAnchor } from '../monthGrid';
import { displayStart, eventDayKeys } from '../moments';
import { getPref, setPref } from '../storage';
import { useApp } from '../state/app';
import { useTabRouter } from '../navigation';
import { COLORS, FONTS, RADIUS, SPACING, TYPE } from '../theme/tokens';
import { useTabParam } from '../useTabParam';
import { groupByWeek } from '../weeks';

/** De tabbladen in de kop. */
type Tab = 'planning' | 'agenda' | 'mijn';
/** Hoe Agenda getoond wordt: als lijst of als maandrooster. */
type Weergave = 'lijst' | 'maand';

const VIEW_KEY = 'kalender-weergave';

/**
 * De kalender, in de vorm van /kalender op de site: de
 * eventtegel met de gele datumpin, per week een kop, en de thema's als chips.
 * De tegels zijn lager dan op de site (`compact`), zodat er meer onder elkaar
 * past op een telefoon.
 *
 * **Lijst** is wat je meestal wil: wat komt er nu. **Maand** is wat je wil
 * wanneer je een datum in gedachten hebt ("wanneer was die cantus ook weer") of
 * wanneer je iets plant en wil zien welke avonden al vol zitten. Dat zijn twee
 * verschillende vragen, en geen van beide weergaven beantwoordt ze allebei goed.
 *
 * Lijst en Maand zijn twee weergaven van hetzelfde tabblad **Agenda**, met een
 * schakelaar boven de inhoud, en geen twee tabbladen: het is dezelfde agenda. De
 * keuze tussen die twee blijft bewaard. Wie de maandweergave verkiest, wil die
 * niet elke keer opnieuw aanzetten.
 *
 * **Planning** is iets anders: de planning van Burgieclan (lessenrooster,
 * deadlines en de VTK-evenementen die je erin zette) als drie dagen naast
 * elkaar. Ze staat naast de kalender en vervangt hem niet; zie `PlanningView`.
 * Wie ze kan zien, komt er standaard op uit: je lessen open je vaker dan de
 * agenda van VTK. Dat wordt bewust niet bewaard; wie even naar Agenda keek, vindt
 * bij de volgende start opnieuw zijn planning.
 *
 * De kop is hier lager dan op andere schermen (`compact`): de planning heeft
 * elke verticale pixel nodig voor de uren van de dag.
 *
 * De twee halen ook andere gegevens op: de lijst vraagt alles vanaf nu, de
 * maandweergave precies het zichtbare rooster, inclusief het verleden. Anders zou
 * bladeren naar vorige maand een leeg rooster geven.
 *
 * **De ster is geen inschrijving.** Ze zet een evenement in jouw lijst (het
 * tabblad "Mijn lijst" in de kop) en hangt er de herinnering van de dag ervoor aan. Wat ze niet
 * doet: een plaats reserveren, een ticket kopen of iemand laten weten dat je
 * komt. Dat onderscheid is de reden dat ze naast de rij staat en niet de rij zelf
 * is.
 *
 * Naast de ster staat een belknop in de kop: die opent de meldingen, waar je een
 * categorie kan volgen. Interesse gaat over één evenement, een categorie volgen
 * over alles wat er nog bij komt; die twee verwarren is de makkelijkste manier om
 * te veel of te weinig berichten te krijgen.
 */
export default function KalenderScreen() {
  const router = useTabRouter();
  const { locale, viewer, bootstrap } = useApp();
  // Enkel wanneer de server met Burgieclan gekoppeld is; zie `abilities.planning`.
  const planningAvailable = viewer !== null && bootstrap?.abilities?.planning === true;

  const params = useLocalSearchParams<{ tab?: string }>();
  // `null` zolang er niets gekozen is: dan Planning wanneer die er is, anders
  // Agenda. Zo komt wie net inlogde (en de bootstrap pas daarna binnenkrijgt)
  // ook op de planning uit.
  const [chosen, setChosen] = useState<Tab | null>(() =>
    params.tab === 'planning' || params.tab === 'agenda' || params.tab === 'mijn' ? params.tab : null,
  );
  useTabParam<Tab>(params.tab, ['planning', 'agenda', 'mijn'], setChosen);
  const fallback: Tab = planningAvailable ? 'planning' : 'agenda';
  // De planning en "Mijn lijst" vragen een login; uitgelogd valt dat terug op Agenda.
  const allowed = (option: Tab | null) =>
    option !== null && !(option === 'planning' && !planningAvailable) && !(option === 'mijn' && !viewer);
  const tab: Tab = chosen !== null && allowed(chosen) ? chosen : fallback;

  const [view, setViewState] = useState<Weergave>(() => (getPref(VIEW_KEY) === 'maand' ? 'maand' : 'lijst'));
  const [category, setCategory] = useState<string | null>(null);
  const [anchor, setAnchor] = useState<MonthAnchor>(() => anchorOf(todayKey()));
  const [selectedDay, setSelectedDay] = useState<string | null>(null);

  const setView = (next: Weergave) => {
    setPref(VIEW_KEY, next);
    setViewState(next);
  };

  const planning = tab === 'planning';
  const mine = tab === 'mijn';
  const month = tab === 'agenda' && view === 'maand';
  const range = month ? gridRange(anchor) : null;

  const resource = useResource(
    'kalender',
    () =>
      fetchCalendar(locale, {
        categorie: mine ? undefined : (category ?? undefined),
        interesse: mine,
        van: range?.from,
        tot: range?.to,
      }),
    `${locale}:${mine ? 'mijn' : (category ?? '')}:${range ? `${range.from}-${range.to}` : 'nu'}`,
  );

  /**
   * De ster meteen omzetten en pas daarna verversen. Wachten op het rondje zou
   * betekenen dat een tik op een trage verbinding een seconde lang niets lijkt te
   * doen, en dan tikt iedereen twee keer.
   */
  const toggleInterest = (id: string, next: boolean) => {
    void setEventInterest(id, next)
      .catch(() => undefined)
      .then(() => resource.refresh());
  };

  // Een reeks die al loopt, staat op haar eerstvolgende moment; de server sorteert
  // op de start van de reeks, dus hier opnieuw.
  const events = useMemo(
    () =>
      [...(resource.data?.events ?? [])].sort((a, b) =>
        displayStart(a).localeCompare(displayStart(b)),
      ),
    [resource.data],
  );

  const dayEvents = useMemo(
    () =>
      selectedDay
        ? events
            .filter((event) => eventDayKeys(event).includes(selectedDay))
            .map((event) => ({
              event,
              // Bij een reeks het moment van die dag, niet het eerstvolgende.
              at: event.moments?.find((moment) => dayKeyOf(moment.start) === selectedDay)?.start,
            }))
        : [],
    [events, selectedDay],
  );

  const weeks = useMemo(() => groupByWeek(events, (event) => displayStart(event), locale), [events, locale]);

  const headTabs = {
    value: tab,
    onChange: setChosen,
    options: [
      ...(planningAvailable ? [{ value: 'planning' as const, label: 'Planning' }] : []),
      { value: 'agenda' as const, label: 'Agenda' },
      ...(viewer ? [{ value: 'mijn' as const, label: 'Mijn lijst' }] : []),
    ],
  };

  const bell = viewer ? (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Meldingen instellen"
      onPress={() => router.push('/meldingen')}
      hitSlop={10}
    >
      <Bell color={COLORS.yellow} size={20} />
    </Pressable>
  ) : undefined;

  // De planning heeft haar eigen verticale scroll (de uren van de dag), dus de
  // kop staat hier vast in plaats van mee te schuiven zoals in de lijst.
  if (planning) {
    return (
      <View style={styles.root}>
        <PageHead title="Kalender" back={false} compact right={bell} tabs={headTabs} />
        <PlanningView locale={locale} onOpenEvent={(id) => router.push(`/evenement/${id}`)} />
      </View>
    );
  }

  if (resource.loading) return <Loading label="Kalender ophalen" />;
  if (!resource.data) {
    return (
      <ErrorState message={messageFor(resource.error)} onRetry={() => void resource.refresh()} />
    );
  }

  const { categories, filteredByAudience } = resource.data;

  return (
    <View style={styles.root}>
      <ScrollView
        style={styles.root}
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl
            refreshing={resource.refreshing}
            tintColor={COLORS.onDark}
            onRefresh={() => void resource.refresh()}
          />
        }
      >
        <View style={styles.overscroll} />
        <PageHead title="Kalender" back={false} compact right={bell} tabs={headTabs} />

        {!mine ? (
          <View style={styles.viewRow}>
            <Segmented
              value={view}
              onChange={(next) => {
                setView(next);
                setSelectedDay(null);
              }}
              options={[
                { value: 'lijst', label: 'Lijst' },
                { value: 'maand', label: 'Maand' },
              ]}
            />
          </View>
        ) : null}

        {categories.length > 0 && !mine ? (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.chips}
          >
            <Chip label="Alles" active={category === null} onPress={() => setCategory(null)} />
            {categories.map((item) => (
              <Chip
                key={item.slug}
                label={item.name}
                colour={item.colour}
                active={category === item.slug}
                onPress={() => setCategory(category === item.slug ? null : item.slug)}
              />
            ))}
          </ScrollView>
        ) : null}

        {resource.stale ? <StaleNotice onRetry={() => void resource.refresh()} /> : null}

        <View style={styles.content}>
          {month ? (
            <>
              <MonthView
                anchor={anchor}
                onAnchorChange={(next) => {
                  setAnchor(next);
                  setSelectedDay(null);
                }}
                events={events}
                locale={locale}
                selected={selectedDay}
                onSelect={setSelectedDay}
              />

              {selectedDay ? (
                <>
                  <Text style={styles.dayTitle}>
                    {formatDay(`${selectedDay}T12:00:00.000Z`, locale)}
                  </Text>
                  {dayEvents.length === 0 ? (
                    <Text style={styles.hint}>Niets gepland op deze dag.</Text>
                  ) : (
                    dayEvents.map(({ event, at }) => (
                      <EventTile
                        key={event.id}
                        event={event}
                        at={at}
                        locale={locale}
                        compact
                        onPress={() => router.push(`/evenement/${event.id}`)}
                        onToggleInterest={
                          viewer ? (next) => toggleInterest(event.id, next) : undefined
                        }
                      />
                    ))
                  )}
                </>
              ) : (
                <Text style={styles.hint}>
                  Tik een dag aan om te zien wat er die dag te doen is.
                </Text>
              )}
            </>
          ) : events.length === 0 ? (
            <Empty
              title="Niets gevonden"
              hint={
                mine
                  ? 'Je hebt nog niets aangeduid. Tik het sterretje bij een evenement en het komt hier te staan.'
                  : category
                    ? 'Er staat niets in deze categorie. Zet de filter op Alles om de rest te zien.'
                    : 'Er staat nog niets gepland.'
              }
              action={category && !mine ? { label: 'Toon alles', onPress: () => setCategory(null) } : undefined}
            />
          ) : (
            <>
              {weeks.map((week) => (
                <View key={week.key} style={styles.week}>
                  <WeekHead name={week.name} range={week.range} />
                  {week.items.map((event) => (
                    <EventTile
                      key={event.id}
                      event={event}
                      locale={locale}
                      compact
                      onPress={() => router.push(`/evenement/${event.id}`)}
                      onToggleInterest={viewer ? (next) => toggleInterest(event.id, next) : undefined}
                    />
                  ))}
                </View>
              ))}
              {viewer && filteredByAudience ? (
                <Text style={styles.footer}>
                  Je ziet de evenementen die bij jouw studiejaar horen. Activiteiten voor een andere
                  doelgroep staan er niet tussen.
                </Text>
              ) : null}
            </>
          )}
        </View>
      </ScrollView>
    </View>
  );
}

/**
 * Lijst of Maand, onder het tabblad Agenda. Een schakelaar op papier en geen
 * pillen in de kop: het is een andere weergave van dezelfde agenda, geen ander
 * tabblad.
 */
function Segmented<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (next: T) => void;
}) {
  return (
    <View style={styles.segmented} accessibilityRole="tablist">
      {options.map((option) => {
        const active = option.value === value;
        return (
          <Pressable
            key={option.value}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            onPress={() => onChange(option.value)}
            style={[styles.segment, active && styles.segmentActive]}
          >
            <Text style={[styles.segmentLabel, active && styles.segmentLabelActive]}>{option.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/** Een themafilter zoals de chips van /tickets: wit, met de kleur als stip, actief in inkt. */
function Chip({
  label,
  active,
  onPress,
  colour,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
  colour?: string | null;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      accessibilityLabel={label}
      onPress={onPress}
      style={[styles.chip, active && styles.chipActive]}
    >
      {colour ? <View style={[styles.chipDot, { backgroundColor: colour }]} /> : null}
      <Text style={[styles.chipLabel, active && styles.chipLabelActive]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.paper },
  scrollContent: { paddingBottom: SPACING.xxl },
  // Vangt het omlaag trekken op iOS op: daar verschijnt dan navy in plaats van papier.
  overscroll: {
    position: 'absolute',
    top: -1000,
    left: 0,
    right: 0,
    height: 1000,
    backgroundColor: COLORS.navy,
  },
  content: { paddingHorizontal: SPACING.xl - 4, paddingTop: SPACING.sm, gap: SPACING.md },
  week: { gap: SPACING.md, marginTop: SPACING.sm },

  viewRow: { paddingHorizontal: SPACING.xl - 4, paddingTop: SPACING.lg, flexDirection: 'row' },
  segmented: {
    flexDirection: 'row',
    padding: 3,
    borderRadius: RADIUS.pill,
    borderWidth: 1,
    borderColor: COLORS.line2,
    backgroundColor: COLORS.surface,
  },
  segment: { paddingHorizontal: 16, paddingVertical: 6, borderRadius: RADIUS.pill },
  segmentActive: { backgroundColor: COLORS.ink },
  segmentLabel: { ...TYPE.small, fontFamily: FONTS.semibold, color: COLORS.body },
  segmentLabelActive: { color: COLORS.paper },

  chips: { paddingHorizontal: SPACING.xl - 4, paddingTop: SPACING.md, paddingBottom: SPACING.xs, gap: SPACING.sm },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: RADIUS.pill,
    borderWidth: 1,
    borderColor: COLORS.line2,
    paddingHorizontal: 13,
    paddingVertical: 7,
    backgroundColor: COLORS.surface,
  },
  chipActive: { backgroundColor: COLORS.ink, borderColor: COLORS.ink },
  chipDot: { width: 7, height: 7, borderRadius: 4 },
  chipLabel: { ...TYPE.small, fontFamily: FONTS.medium, color: COLORS.body },
  chipLabelActive: { color: COLORS.paper },

  dayTitle: { ...TYPE.sectionTitle, color: COLORS.ink, marginTop: SPACING.sm },
  hint: { ...TYPE.small, color: COLORS.muted },
  footer: { ...TYPE.small, color: COLORS.muted, paddingTop: SPACING.lg },
});
