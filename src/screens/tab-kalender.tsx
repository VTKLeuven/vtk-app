import { useLocalSearchParams } from 'expo-router';
import { Bell, ChevronLeft, ChevronRight } from 'lucide-react-native';
import { useMemo, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';

import type { AppCalendarEvent } from '../api/contract';
import { fetchCalendar, setEventInterest } from '../api/endpoints';
import { messageFor, useResource } from '../api/useResource';
import { AGENDA_WEEKS, AgendaGrid } from '../components/AgendaGrid';
import { EventRow, MyEventCard } from '../components/EventRow';
import { YellowHead, YellowHeadButton, YellowRoundButton, YellowSegmented } from '../components/YellowHead';
import { PlanningView } from '../components/planning/PlanningView';
import { Button, Card, Empty, ErrorState, Loading, StaleNotice } from '../components/ui';
import { formatDay } from '../format';
import { dayKeyOf, todayKey } from '../monthGrid';
import { displayStart, eventDayKeys } from '../moments';
import { addDays, mondayOf } from '../planning/grid';
import { getPref, setPref } from '../storage';
import { useApp } from '../state/app';
import { useTabRouter } from '../navigation';
import { COLORS, FONTS, SPACING, TYPE } from '../theme/tokens';
import { useTabParam } from '../useTabParam';
import { useTrackView } from '../usage';

/** De tabbladen in de kop. */
type Tab = 'planning' | 'agenda' | 'mijn';
/** Hoe Evenementen getoond wordt: als lijst of als agenda van vier weken. */
type Weergave = 'lijst' | 'agenda';

const VIEW_KEY = 'kalender-weergave';

/**
 * De kalender, sinds november 2026 in de stijl van Home (voorstel G.1): een geel
 * vlak met de titel, de bel en de tabbladen als pillen (`YellowHead`), en
 * daaronder witte kaarten op papier.
 *
 * **Evenementen** heeft twee weergaven, gekozen in het geel: **Lijst** (per dag,
 * elk evenement even groot, `EventRow`) en **Agenda** (vier weken als vierkantjes,
 * één terug en twee verder, met de gekozen dag eronder; `AgendaGrid`). Agenda
 * heette tot dan Maand en toonde zes weken. De keuze blijft bewaard; een oude
 * bewaarde "maand" opent de agenda.
 *
 * Lijst is wat je meestal wil: wat komt er nu. Agenda is wat je wil wanneer je
 * een datum in gedachten hebt of iets plant en wil zien welke avonden al vol
 * zitten. De lijst vraagt alles vanaf nu, de agenda precies haar vier weken,
 * inclusief de week die voorbij is.
 *
 * **Planning** is de planning van Burgieclan (lessenrooster, deadlines en de
 * VTK-evenementen die je erin zette); zie `PlanningView`. Die tekent de gele kop
 * zelf (`renderHead`), omdat ze er de dagen die je ziet of je voortgang in zet.
 * Wie ze kan zien, komt er standaard op uit; dat wordt bewust niet bewaard.
 *
 * **Mijn lijst** toont wat je met de ster aanduidde, groter dan in de lijst
 * (`MyEventCard`), met hoe lang het nog duurt.
 *
 * **De ster is geen inschrijving.** Ze zet een evenement in Mijn lijst en hangt er
 * de herinnering van de dag ervoor aan. Wat ze niet doet: een plaats reserveren,
 * een ticket kopen of iemand laten weten dat je komt. De bel in de kop opent de
 * meldingen, waar je een hele categorie volgt.
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
  const [chosen, setChosen] = useState<Tab | null>(() =>
    params.tab === 'planning' || params.tab === 'agenda' || params.tab === 'mijn' ? params.tab : null,
  );
  useTabParam<Tab>(params.tab, ['planning', 'agenda', 'mijn'], setChosen, params.n);
  const fallback: Tab = planningTab ? 'planning' : 'agenda';
  const allowed = (option: Tab | null) =>
    option !== null && !(option === 'planning' && !planningTab) && !(option === 'mijn' && !viewer);
  const tab: Tab = chosen !== null && allowed(chosen) ? chosen : fallback;

  const [view, setViewState] = useState<Weergave>(() => {
    const stored = getPref(VIEW_KEY);
    return stored === 'agenda' || stored === 'maand' ? 'agenda' : 'lijst';
  });
  const setView = (next: Weergave) => {
    setPref(VIEW_KEY, next);
    setViewState(next);
  };

  const today = todayKey();
  // De agenda: blokken van vier weken, standaard vanaf de maandag van vorige week.
  const [page, setPage] = useState(0);
  const agendaStart = addDays(mondayOf(today), -7 + page * AGENDA_WEEKS * 7);
  const agendaEnd = addDays(agendaStart, AGENDA_WEEKS * 7 - 1);
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const inAgenda = (day: string) => day >= agendaStart && day <= agendaEnd;
  const day = selectedDay && inAgenda(selectedDay) ? selectedDay : inAgenda(today) ? today : agendaStart;

  const planning = tab === 'planning';
  const mine = tab === 'mijn';
  const agenda = tab === 'agenda' && view === 'agenda';
  useTrackView(planning ? null : mine ? 'kalender:mijn' : agenda ? 'kalender:evenementen:agenda' : 'kalender:evenementen');

  const range = agenda
    ? { from: `${addDays(agendaStart, -1)}T00:00:00.000Z`, to: `${addDays(agendaEnd, 2)}T00:00:00.000Z` }
    : null;
  const resource = useResource(
    'kalender',
    () => fetchCalendar(locale, { interesse: mine, van: range?.from, tot: range?.to }),
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
  const interest = (event: AppCalendarEvent) => (viewer ? (next: boolean) => toggleInterest(event.id, next) : undefined);
  const open = (event: AppCalendarEvent) => router.push(`/evenement/${event.id}`);

  // Een reeks die al loopt, staat op haar eerstvolgende moment; de server sorteert
  // op de start van de reeks, dus hier opnieuw.
  const events = useMemo(
    () => [...(resource.data?.events ?? [])].sort((a, b) => displayStart(a).localeCompare(displayStart(b))),
    [resource.data],
  );

  // De lijst per dag, op de dag waarop een evenement nu staat.
  const days = useMemo(() => {
    const groups: { key: string; items: AppCalendarEvent[] }[] = [];
    for (const event of events) {
      const key = dayKeyOf(displayStart(event));
      const last = groups[groups.length - 1];
      if (last && last.key === key) last.items.push(event);
      else groups.push({ key, items: [event] });
    }
    return groups;
  }, [events]);

  // De agenda: hoeveel er per dag is, en wat er op de gekozen dag staat.
  const counts = useMemo(() => {
    const map = new Map<string, number>();
    for (const event of events) for (const key of eventDayKeys(event)) map.set(key, (map.get(key) ?? 0) + 1);
    return map;
  }, [events]);
  const dayEvents = events
    .filter((event) => eventDayKeys(event).includes(day))
    .map((event) => ({
      event,
      // Bij een reeks het moment van die dag, niet het eerstvolgende.
      at: event.moments?.find((moment) => dayKeyOf(moment.start) === day)?.start,
    }));

  const tabs = {
    value: tab,
    onChange: setChosen,
    options: [
      ...(planningTab ? [{ value: 'planning' as const, label: 'Planning' }] : []),
      { value: 'agenda' as const, label: 'Evenementen' },
      ...(viewer ? [{ value: 'mijn' as const, label: 'Mijn lijst' }] : []),
    ],
  };
  const bell = viewer ? (
    <YellowHeadButton label="Meldingen instellen" onPress={() => router.push('/meldingen')}>
      <Bell color={COLORS.yellow} size={19} />
    </YellowHeadButton>
  ) : undefined;

  // De planning heeft haar eigen verticale scroll (de uren van de dag) en tekent
  // de kop zelf.
  if (planning) {
    return (
      <View style={styles.root}>
        {viewer ? (
          <PlanningView
            locale={locale}
            renderHead={(extra) => (
              <YellowHead title="Kalender" tabs={tabs} right={bell}>
                {extra}
              </YellowHead>
            )}
            onOpenEvent={(id) => router.push(`/evenement/${id}`)}
            onOpenCourse={(id) => router.push(`/vak/${id}`)}
            onOpenStudies={() => router.push({ pathname: '/studies', params: { tab: 'blokken' } })}
          />
        ) : (
          <ScrollView contentContainerStyle={styles.scrollContent}>
            <View style={styles.overscroll} />
            <YellowHead title="Kalender" tabs={tabs} />
            <View style={styles.content}>
              <Card>
                <Text style={styles.loginTitle}>Log eerst in</Text>
                <Text style={styles.loginBody}>
                  Daarna kan je je lessenrooster van KU Leuven importeren, en zie je hier je lessen naast de
                  evenementen van VTK.
                </Text>
                <Button label="Inloggen" onPress={() => router.push('/inloggen')} />
              </Card>
            </View>
          </ScrollView>
        )}
      </View>
    );
  }

  const switcher = (
    <YellowSegmented
      value={view}
      onChange={(next) => {
        setView(next);
        setSelectedDay(null);
      }}
      options={[
        { value: 'lijst', label: 'Lijst' },
        { value: 'agenda', label: 'Agenda' },
      ]}
    />
  );

  const headExtra = mine ? (
    resource.data ? (
      <Text style={styles.headLabel}>
        {events.length === 0 ? 'Nog niets aangeduid' : events.length === 1 ? '1 evenement aangeduid' : `${events.length} evenementen aangeduid`}
      </Text>
    ) : null
  ) : agenda ? (
    <>
      <View style={styles.headRow}>
        <View style={styles.headNav}>
          <YellowRoundButton label="Vorige weken" onPress={() => setPage(page - 1)}>
            <ChevronLeft size={17} color={COLORS.navy} strokeWidth={2.4} />
          </YellowRoundButton>
          <Text style={styles.headLabel} numberOfLines={1}>
            {shortRange(agendaStart, agendaEnd, locale)}
          </Text>
          <YellowRoundButton label="Volgende weken" onPress={() => setPage(page + 1)}>
            <ChevronRight size={17} color={COLORS.navy} strokeWidth={2.4} />
          </YellowRoundButton>
        </View>
        {switcher}
      </View>
      <AgendaGrid
        start={agendaStart}
        today={today}
        selected={day}
        counts={counts}
        locale={locale}
        onSelect={setSelectedDay}
      />
    </>
  ) : (
    <View style={styles.headRow}>
      <Text style={styles.headLabel}>Vanaf vandaag</Text>
      {switcher}
    </View>
  );

  let body: React.ReactNode;
  if (resource.loading && !resource.data) {
    body = <Loading label="Kalender ophalen" />;
  } else if (!resource.data) {
    body = <ErrorState message={messageFor(resource.error)} onRetry={() => void resource.refresh()} />;
  } else if (agenda) {
    body = (
      <>
        <DayTitle day={day} today={today} locale={locale} count={dayEvents.length} />
        {dayEvents.length === 0 ? (
          <Text style={styles.hint}>Niets gepland op deze dag.</Text>
        ) : (
          dayEvents.map(({ event, at }) => (
            <EventRow
              key={event.id}
              event={event}
              at={at}
              locale={locale}
              onPress={() => open(event)}
              onToggleInterest={interest(event)}
            />
          ))
        )}
      </>
    );
  } else if (events.length === 0) {
    body = (
      <Empty
        title="Niets gevonden"
        hint={
          mine
            ? 'Je hebt nog niets aangeduid. Tik het sterretje bij een evenement en het komt hier te staan.'
            : 'Er staat nog niets gepland.'
        }
      />
    );
  } else if (mine) {
    body = events.map((event) => (
      <MyEventCard
        key={event.id}
        event={event}
        today={today}
        locale={locale}
        onPress={() => open(event)}
        onTickets={event.ticketSlug ? () => router.push(`/ticket/${event.ticketSlug}`) : undefined}
        onToggleInterest={interest(event)}
      />
    ));
  } else {
    body = (
      <>
        {days.map((group) => (
          <View key={group.key} style={styles.group}>
            <DayTitle day={group.key} today={today} locale={locale} />
            {group.items.map((event) => (
              <EventRow
                key={event.id}
                event={event}
                at={event.moments?.find((moment) => dayKeyOf(moment.start) === group.key)?.start}
                locale={locale}
                onPress={() => open(event)}
                onToggleInterest={interest(event)}
              />
            ))}
          </View>
        ))}
        {viewer && resource.data.filteredByAudience ? (
          <Text style={styles.footer}>
            Je ziet de evenementen die bij jouw studiejaar horen. Activiteiten voor een andere doelgroep staan er
            niet tussen.
          </Text>
        ) : null}
      </>
    );
  }

  return (
    <View style={styles.root}>
      <ScrollView
        style={styles.root}
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl
            refreshing={resource.refreshing}
            tintColor={COLORS.navy}
            onRefresh={() => void resource.refresh()}
          />
        }
      >
        <View style={styles.overscroll} />
        <YellowHead title="Kalender" tabs={tabs} right={bell}>
          {headExtra}
        </YellowHead>
        {resource.stale ? <StaleNotice onRetry={() => void resource.refresh()} /> : null}
        <View style={styles.content}>{body}</View>
      </ScrollView>
    </View>
  );
}

/** "Vandaag" met de datum ernaast, "Morgen", of de weekdag met de datum. */
function DayTitle({
  day,
  today,
  locale,
  count,
}: {
  day: string;
  today: string;
  locale: 'nl' | 'en';
  count?: number;
}) {
  const full = formatDay(`${day}T12:00:00.000Z`, locale);
  const [weekday, ...rest] = full.split(' ');
  const title =
    day === today ? 'Vandaag' : day === addDays(today, 1) ? 'Morgen' : weekday.charAt(0).toUpperCase() + weekday.slice(1);
  const detail =
    count !== undefined
      ? count === 1
        ? '1 evenement'
        : `${count} evenementen`
      : day === today || day === addDays(today, 1)
        ? full
        : rest.join(' ');
  return (
    <View style={styles.dayTitle}>
      <Text accessibilityRole="header" style={styles.dayTitleText}>
        {title}
      </Text>
      <Text style={styles.dayTitleDetail}>{detail}</Text>
    </View>
  );
}

/** "23 nov – 20 dec". */
function shortRange(from: string, to: string, locale: 'nl' | 'en'): string {
  const format = new Intl.DateTimeFormat(locale === 'en' ? 'en-GB' : 'nl-BE', {
    timeZone: 'UTC',
    day: 'numeric',
    month: 'short',
  });
  const label = (key: string) => format.format(new Date(`${key}T12:00:00Z`)).replace('.', '');
  return `${label(from)} – ${label(to)}`;
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.paper },
  scrollContent: { paddingBottom: SPACING.xxl },
  // Wat boven de kop verschijnt als je op iOS omlaag trekt: geel, zoals de kop.
  overscroll: {
    position: 'absolute',
    top: -1000,
    left: 0,
    right: 0,
    height: 1000,
    backgroundColor: COLORS.yellow,
  },
  content: { paddingHorizontal: SPACING.xl - 4, paddingTop: SPACING.xl - 2, gap: SPACING.md },
  group: { gap: 10, marginBottom: SPACING.md },

  headRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: SPACING.sm },
  headNav: { flexDirection: 'row', alignItems: 'center', gap: 6, flexShrink: 1 },
  headLabel: { flexShrink: 1, fontFamily: FONTS.bold, fontSize: 15, color: COLORS.navy },

  dayTitle: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: SPACING.sm },
  dayTitleText: { fontFamily: FONTS.bold, fontSize: 22, letterSpacing: -0.5, color: COLORS.navy },
  dayTitleDetail: { flexShrink: 1, fontFamily: FONTS.semibold, fontSize: 13, color: COLORS.muted, textAlign: 'right' },
  hint: { ...TYPE.small, color: COLORS.muted },
  loginTitle: { ...TYPE.cardTitle, color: COLORS.ink },
  loginBody: { ...TYPE.body, color: COLORS.body },
  footer: { ...TYPE.small, color: COLORS.muted, paddingTop: SPACING.sm },
});
