
import { useLocalSearchParams } from 'expo-router';
import { Bell } from 'lucide-react-native';
import { useMemo, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';

import { fetchCalendar, setEventInterest } from '../api/endpoints';
import { messageFor, useResource } from '../api/useResource';
import { EventTile } from '../components/EventTile';
import { MonthView } from '../components/MonthView';
import { PlanningView } from '../components/planning/PlanningView';
import { HeadButton, PageHead } from '../components/PageHead';
import { Button, Card, Empty, ErrorState, Loading, StaleNotice, WeekHead } from '../components/ui';
import { formatDay } from '../format';
import { anchorOf, dayKeyOf, gridRange, todayKey, type MonthAnchor } from '../monthGrid';
import { displayStart, eventDayKeys } from '../moments';
import { getPref, setPref } from '../storage';
import { useApp } from '../state/app';
import { useTabRouter } from '../navigation';
import { COLORS, FONTS, RADIUS, SPACING, TYPE } from '../theme/tokens';
import { useTabParam } from '../useTabParam';
import { useTrackView } from '../usage';
import { groupByWeek } from '../weeks';
import { CARD_SHADOW } from '../components/HomeSection';

/** De tabbladen in de kop. */
type Tab = 'planning' | 'agenda' | 'mijn';
/** Hoe Evenementen getoond wordt: als lijst of als maandrooster. */
type Weergave = 'lijst' | 'maand';

const VIEW_KEY = 'kalender-weergave';

/**
 * De kalender, in de vorm van /kalender op de site: de
 * eventtegel met de gele datumpin en per week een kop. Een filter op categorie
 * staat er sinds november 2026 niet meer: enkel Lijst en Maand bovenaan.
 * De tegels zijn lager dan op de site (`compact`), zodat er meer onder elkaar
 * past op een telefoon.
 *
 * **Lijst** is wat je meestal wil: wat komt er nu. **Maand** is wat je wil
 * wanneer je een datum in gedachten hebt ("wanneer was die cantus ook weer") of
 * wanneer je iets plant en wil zien welke avonden al vol zitten. Dat zijn twee
 * verschillende vragen, en geen van beide weergaven beantwoordt ze allebei goed.
 *
 * Lijst en Maand zijn twee weergaven van hetzelfde tabblad **Evenementen** (tot november 2026 Agenda), met een
 * schakelaar boven de inhoud, en geen twee tabbladen: het is dezelfde agenda. De
 * keuze tussen die twee blijft bewaard. Wie de maandweergave verkiest, wil die
 * niet elke keer opnieuw aanzetten.
 *
 * **Planning** is iets anders: de planning van Burgieclan (lessenrooster,
 * deadlines en de VTK-evenementen die je erin zette) als drie dagen naast
 * elkaar. Ze staat naast de kalender en vervangt hem niet; zie `PlanningView`.
 * Wie ze kan zien, komt er standaard op uit: je lessen open je vaker dan de
 * agenda van VTK. Dat wordt bewust niet bewaard; wie even naar Evenementen keek, vindt
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
  // Uitgelogd staat de planning er ook, en opent de kalender erop: met de vraag
  // om eerst in te loggen, zodat je weet dat je er je lessenrooster in krijgt.
  const planningTab = viewer === null || planningAvailable;

  const params = useLocalSearchParams<{ tab?: string; n?: string }>();
  // `null` zolang er niets gekozen is: dan Planning wanneer die er is, anders
  // Agenda. Zo komt wie net inlogde (en de bootstrap pas daarna binnenkrijgt)
  // ook op de planning uit.
  const [chosen, setChosen] = useState<Tab | null>(() =>
    params.tab === 'planning' || params.tab === 'agenda' || params.tab === 'mijn' ? params.tab : null,
  );
  useTabParam<Tab>(params.tab, ['planning', 'agenda', 'mijn'], setChosen, params.n);
  const fallback: Tab = planningTab ? 'planning' : 'agenda';
  // "Mijn lijst" vraagt een login; uitgelogd valt dat terug op de planning.
  const allowed = (option: Tab | null) =>
    option !== null && !(option === 'planning' && !planningTab) && !(option === 'mijn' && !viewer);
  const tab: Tab = chosen !== null && allowed(chosen) ? chosen : fallback;

  const [view, setViewState] = useState<Weergave>(() => (getPref(VIEW_KEY) === 'maand' ? 'maand' : 'lijst'));
  const [anchor, setAnchor] = useState<MonthAnchor>(() => anchorOf(todayKey()));
  const [selectedDay, setSelectedDay] = useState<string | null>(null);

  const setView = (next: Weergave) => {
    setPref(VIEW_KEY, next);
    setViewState(next);
  };

  const planning = tab === 'planning';
  const mine = tab === 'mijn';
  const month = tab === 'agenda' && view === 'maand';
  // De planning meldt zelf welke weergave open staat (`PlanningView`).
  useTrackView(planning ? null : mine ? 'kalender:mijn' : month ? 'kalender:evenementen:maand' : 'kalender:evenementen');
  const range = month ? gridRange(anchor) : null;

  const resource = useResource(
    'kalender',
    () =>
      fetchCalendar(locale, {
        interesse: mine,
        van: range?.from,
        tot: range?.to,
      }),
    `${locale}:${mine ? 'mijn' : ''}:${range ? `${range.from}-${range.to}` : 'nu'}`,
    !planning,
  );

  /**
   * De ster meteen omzetten en pas daarna verversen. Wachten op het rondje zou
   * betekenen dat een tik op een trage verbinding een seconde lang niets lijkt te
   * doen, en dan tikt iedereen twee keer.
   */
  const toggleInterest = (id: string, next: boolean) => {
    void setEventInterest(id, next)
      .catch(() => undefined)
      .then(() => resource.reload());
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
      ...(planningTab ? [{ value: 'planning' as const, label: 'Planning' }] : []),
      { value: 'agenda' as const, label: 'Evenementen' },
      ...(viewer ? [{ value: 'mijn' as const, label: 'Mijn lijst' }] : []),
    ],
  };

  const bell = viewer ? (
    <HeadButton accessibilityLabel="Meldingen instellen" onPress={() => router.push('/meldingen')}>
      <Bell color={COLORS.ink} size={20} />
    </HeadButton>
  ) : undefined;

  // De planning heeft haar eigen verticale scroll (de uren van de dag), dus de
  // kop staat hier vast in plaats van mee te schuiven zoals in de lijst.
  if (planning) {
    return (
      <View style={styles.root}>
        <PageHead title="Kalender" back={false} compact right={bell} tabs={headTabs} />
        {viewer ? (
          <PlanningView
            locale={locale}
            onOpenEvent={(id) => router.push(`/evenement/${id}`)}
            onOpenCourse={(id) => router.push(`/vak/${id}`)}
            onOpenStudies={() => router.push({ pathname: '/studies', params: { tab: 'blokken' } })}
          />
        ) : (
          <ScrollView contentContainerStyle={styles.loginContent}>
            <Card>
              <Text style={styles.loginTitle}>Log eerst in</Text>
              <Text style={styles.loginBody}>
                Daarna kan je je lessenrooster van KU Leuven importeren, en zie je hier je lessen naast de
                evenementen van VTK.
              </Text>
              <Button label="Inloggen" onPress={() => router.push('/inloggen')} />
            </Card>
          </ScrollView>
        )}
      </View>
    );
  }

  if (resource.loading) return <Loading label="Kalender ophalen" />;
  if (!resource.data) {
    return (
      <ErrorState message={messageFor(resource.error)} onRetry={() => void resource.refresh()} />
    );
  }

  const { filteredByAudience } = resource.data;

  return (
    <View style={styles.root}>
      <ScrollView
        style={styles.root}
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl
            refreshing={resource.refreshing}
            tintColor={COLORS.muted}
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
                  : 'Er staat nog niets gepland.'
              }
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
 * Lijst of Maand, onder het tabblad Evenementen. Een schakelaar op papier en geen
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


const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.paper },
  scrollContent: { paddingBottom: SPACING.xxl },
  // Wat boven de kop verschijnt als je op iOS omlaag trekt: papier, zoals de kop.
  overscroll: {
    position: 'absolute',
    top: -1000,
    left: 0,
    right: 0,
    height: 1000,
    backgroundColor: COLORS.paper,
  },
  content: { paddingHorizontal: SPACING.xl - 4, paddingTop: SPACING.sm, gap: SPACING.md },
  week: { gap: SPACING.md, marginTop: SPACING.sm },

  viewRow: { paddingHorizontal: SPACING.xl - 4, paddingTop: SPACING.lg, flexDirection: 'row' },
  segmented: {
    flexDirection: 'row',
    padding: 3,
    borderRadius: RADIUS.pill,
    backgroundColor: COLORS.surface,
    ...CARD_SHADOW,
  },
  segment: { paddingHorizontal: 16, paddingVertical: 6, borderRadius: RADIUS.pill },
  segmentActive: { backgroundColor: COLORS.ink },
  segmentLabel: { ...TYPE.small, fontFamily: FONTS.semibold, color: COLORS.body },
  segmentLabelActive: { color: COLORS.paper },


  dayTitle: { ...TYPE.sectionTitle, color: COLORS.ink, marginTop: SPACING.sm },
  hint: { ...TYPE.small, color: COLORS.muted },
  loginContent: { padding: SPACING.lg, gap: SPACING.md, paddingBottom: SPACING.xxl },
  loginTitle: { ...TYPE.cardTitle, color: COLORS.ink },
  loginBody: { ...TYPE.body, color: COLORS.body },
  footer: { ...TYPE.small, color: COLORS.muted, paddingTop: SPACING.lg },
});
