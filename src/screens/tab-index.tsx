import { Image } from 'expo-image';
import { ExternalLink, QrCode } from 'lucide-react-native';
import * as WebBrowser from 'expo-web-browser';
import { useEffect, useMemo } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';

import type { AppCalendarEvent, AppLocale } from '../api/contract';
import { fetchCalendar, fetchToday } from '../api/endpoints';
import { messageFor, useResource } from '../api/useResource';
import { AlmaToday } from '../components/AlmaToday';
import { CroppedPhoto } from '../components/CroppedPhoto';
import { CARD_SHADOW, HomeSection } from '../components/HomeSection';
import { UpcomingLessonsList, useUpcomingLessons } from '../components/planning/UpcomingLessons';
import { Prose } from '../components/Prose';
import { RewardCoins } from '../components/RewardCoins';
import { ServiceList } from '../components/ServiceList';
import { KURT_URL } from '../components/planning/BlokView';
import { LinkCard, TaskCard } from '../components/TaskCard';
import { Button, Card, ErrorState, Loading, StaleNotice } from '../components/ui';
import { WEEK_DAYS, WeekHero } from '../components/WeekHero';
import { formatDayShort, formatTime, formatVouchers } from '../format';
import { dayKeyOf, todayKey } from '../monthGrid';
import { displayStart } from '../moments';
import { addDays } from '../planning/grid';
import { askPushOnce } from '../push';
import { useApp } from '../state/app';
import { useTabRouter } from '../navigation';
import { COLORS, FONTS, RADIUS, SPACING, TYPE } from '../theme/tokens';

/** Zoveel evenementen staan er onder "Ook binnenkort"; de rest staat in Kalender. */
const MAX_LATER = 8;

/**
 * Home: **vandaag**.
 *
 * Dit scherm beantwoordt de twee vragen waarmee iemand de app opent: *wat is er
 * open* en *wat wacht er op mij*, en daarnaast wat VTK deze week doet.
 *
 * De opbouw is voorstel G.1 van november 2026, "geel vlak". De volgorde ligt vast:
 *
 * - bovenaan een geel vlak met het logo, je naam en je bonnetjes, "Deze week bij
 *   VTK", een strook met de komende zeven dagen en de evenementen van de gekozen
 *   dag als kaarten die je opzij veegt (`WeekHero`);
 * - Theokot, cudi en 't ElixIr als drie witte tegels met hun logo (`ServiceList`);
 * - je lessen in één kaart (`UpcomingLessonsList`), voor wie een lessenrooster
 *   koppelde. **Daar staat enkel les**: broodjes en shiften horen onder "Voor jou";
 * - "Voor jou" als witte kaarten (`TaskCard`), en altijd een kaart naar KURT;
 * - de vier Alma's op campus Arenberg (`AlmaToday`);
 * - "Ook binnenkort": de evenementen vanaf morgen als schuiflijst. Wat de kop
 *   vandaag al toont, staat hier niet nog eens;
 * - "Snel naar".
 *
 * Tot dan (voorstel F1) opende Home met een foto over de volle breedte die om de
 * zeven seconden doorschoof. Geel is hier meer dan een accent; dat is een keuze
 * voor dit ene scherm en geen nieuwe regel voor de rest van de app.
 */
export default function HomeScreen() {
  const router = useTabRouter();
  const { locale, viewer, bootstrap, refresh: refreshApp } = useApp();
  const resource = useResource('vandaag', () => fetchToday(locale), locale);
  const upcoming = useUpcomingLessons(locale, Boolean(viewer) && bootstrap?.abilities?.planning === true);

  // Vandaag op de klok van de server: een telefoon die op de verkeerde dag staat,
  // zou anders een andere week tonen.
  const day = todayKey(resource.data ? new Date(resource.data.now) : new Date());
  // De evenementen van de hele week, voor de strook. `/vandaag` geeft er enkel de
  // eerstvolgende tien; met een drukke week viel de rest van de strook weg.
  const week = useResource(
    'home-week',
    () => fetchCalendar(locale, { tot: addDays(day, WEEK_DAYS) }),
    `${locale}:${day}`,
  );

  // Eén keer vanzelf om meldingen vragen, zodra je ingelogd op Home staat (`push.ts`).
  const viewerId = viewer?.id ?? null;
  useEffect(() => {
    if (viewerId) void askPushOnce();
  }, [viewerId]);

  // Vanaf morgen: wat vandaag gebeurt, staat al in de kop.
  const later = useMemo(
    () =>
      (resource.data?.upcomingEvents ?? [])
        .filter((event) => dayKeyOf(displayStart(event)) > day)
        .slice(0, MAX_LATER),
    [resource.data, day],
  );

  if (resource.loading) return <Loading label="VTK openen" />;
  if (!resource.data) {
    return (
      <ErrorState message={messageFor(resource.error)} onRetry={() => void resource.refresh()} />
    );
  }

  const today = resource.data;
  const greeting = today.greetingName ? `Dag ${today.greetingName}` : 'VTK Leuven';
  // Tot de week binnen is, de eerstvolgende evenementen van `/vandaag`.
  const weekEvents = week.data?.events ?? today.upcomingEvents;

  /** Rechtsboven op het geel: scannen voor wie dat mag, en je bonnetjes. */
  const actions = viewer ? (
    <View style={styles.headActions}>
      {today.canScanTickets || today.canAcceptVouchers ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Een code scannen"
          onPress={() => router.push('/scannen')}
          hitSlop={6}
          style={({ pressed }) => [styles.round, pressed && styles.pressedHead]}
        >
          <QrCode color={COLORS.yellow} size={19} />
        </Pressable>
      ) : null}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Bonnetjes, ${formatVouchers(today.vouchers ?? 0, locale)} openstaand`}
        onPress={() => router.push('/bonnetjes')}
        hitSlop={6}
        style={({ pressed }) => [styles.pill, pressed && styles.pressedHead]}
      >
        <RewardCoins
          display={formatVouchers(today.vouchers ?? 0, locale)}
          label={`${formatVouchers(today.vouchers ?? 0, locale)} bonnetjes`}
          onDark
        />
      </Pressable>
    </View>
  ) : undefined;

  return (
    <View style={styles.root}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={resource.refreshing}
            tintColor={COLORS.navy}
            onRefresh={() => {
              void resource.refresh();
              void week.reload();
              void upcoming.resource.reload();
              void refreshApp();
            }}
          />
        }
      >
        <View style={styles.overscroll} />
        <WeekHero
          events={weekEvents}
          today={day}
          locale={locale}
          greeting={greeting}
          actions={actions}
          onOpen={(id) => router.push(`/evenement/${id}`)}
        />

        {resource.stale ? <StaleNotice onRetry={() => void resource.refresh()} /> : null}

        {today.services.length > 0 ? (
          <View style={styles.services}>
            <ServiceList services={today.services} locale={locale} />
          </View>
        ) : null}

        {/* Je volgende lessen, voor wie een lessenrooster koppelde. Zonder
            rooster of zonder komende lessen tekent dit niets. */}
        <UpcomingLessonsList
          upcoming={upcoming}
          onOpen={() => router.push({ pathname: '/kalender', params: { tab: 'planning' } })}
        />

        {/* Wat op jou wacht, tussen je lessen en de Alma's: na "wat heb ik nu"
            komt "wat moet ik nog doen". Onderaan altijd KURT, voor een bibplaats. */}
        <HomeSection title="Voor jou">
          <View style={styles.stack}>
            {today.tasks.map((task, index) => (
              <TaskCard key={`${task.kind}-${task.at ?? index}`} task={task} />
            ))}
            <LinkCard
              title="Een bibplaats nodig?"
              detail="Reserveer een plaats in een bib van KU Leuven via KURT."
              onPress={() => void WebBrowser.openBrowserAsync(KURT_URL)}
            />
          </View>
        </HomeSection>

        {/* De Alma's op campus: open of niet, en wat er warm op het menu staat. */}
        <AlmaToday />

        {today.announcement ? (
          <View style={styles.block}>
            <Card featured>
              <Text style={styles.cardTitle}>{today.announcement.title}</Text>
              <Prose>{today.announcement.body}</Prose>
              {today.announcement.ctaUrl ? (
                <Button
                  label={today.announcement.ctaLabel ?? 'Meer weten'}
                  variant="ghost"
                  onPress={() =>
                    void WebBrowser.openBrowserAsync(today.announcement!.ctaUrl as string)
                  }
                />
              ) : null}
            </Card>
          </View>
        ) : null}

        {later.length > 0 ? (
          <HomeSection
            title="Ook binnenkort"
            bleed
            link={{
              label: 'Kalender',
              accessibilityLabel: 'Naar de evenementen in de kalender',
              // Het tabblad Evenementen, en niet de planning waarop Kalender opent.
              onPress: () => router.push({ pathname: '/kalender', params: { tab: 'agenda', n: String(Date.now()) } }),
            }}
          >
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.laterList}
            >
              {later.map((event) => (
                <LaterCard
                  key={event.id}
                  event={event}
                  today={day}
                  locale={locale}
                  onPress={() => router.push(`/evenement/${event.id}`)}
                />
              ))}
            </ScrollView>
          </HomeSection>
        ) : null}

        <HomeSection title="Snel naar">
          <Shortcuts
            onOpen={(route) => {
              // `/studies?tab=cudi`: de query als parameter, anders komt het vraagteken in het pad.
              const [pathname, query] = route.split('?');
              router.push(query ? { pathname, params: Object.fromEntries(new URLSearchParams(query)) } : pathname);
            }}
            onExternal={(url) => void WebBrowser.openBrowserAsync(url)}
          />
        </HomeSection>

        {!viewer ? (
          <View style={styles.block}>
            <Card featured>
              <Text style={styles.cardTitle}>Log in met je VTK-account</Text>
              <Text style={styles.cardBody}>
                Zonder inloggen kan je alles lezen. Broodjes, tickets, je bonnetjes en je shiften
                vragen een account; hetzelfde als op de site, KU Leuven-login inbegrepen.
              </Text>
              <Button label="Inloggen" onPress={() => router.push('/inloggen')} />
            </Card>
          </View>
        ) : null}

      </ScrollView>
    </View>
  );
}

/** Een evenement in "Ook binnenkort": de affiche met de dag in het geel erop, daaronder wat en wanneer. */
function LaterCard({
  event,
  today,
  locale,
  onPress,
}: {
  event: AppCalendarEvent;
  today: string;
  locale: AppLocale;
  onPress: () => void;
}) {
  const start = displayStart(event);
  const key = dayKeyOf(start);
  const badge = (key === addDays(today, 1) ? 'Morgen' : formatDayShort(start, locale))
    .replace(/\./g, '')
    .toUpperCase();
  const meta = [event.allDay ? null : formatTime(start, locale), event.location].filter(Boolean).join(' · ');
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={[event.title, badge.toLowerCase(), meta].filter(Boolean).join(', ')}
      onPress={onPress}
      style={({ pressed }) => [styles.later, pressed && styles.pressed]}
    >
      <View style={styles.laterPhoto}>
        {event.imageUrl ? (
          <CroppedPhoto source={{ uri: event.imageUrl }} crop={event.imageCrop} kind="focus" transition={120} />
        ) : null}
        <View style={styles.laterBadge}>
          <Text style={styles.laterBadgeText}>{badge}</Text>
        </View>
      </View>
      <Text style={styles.laterTitle} numberOfLines={1}>
        {event.title}
      </Text>
      {meta ? (
        <Text style={styles.laterMeta} numberOfLines={1}>
          {meta}
        </Text>
      ) : null}
    </Pressable>
  );
}

/**
 * De dingen die geen eigen tab hebben maar wel vaak gebruikt worden, als de
 * kaarten van "Wat we doen" op de homepage: een foto bovenaan, de titel met de
 * gele lijn. Lokalen staat er niet bij: dat heeft een eigen plek onder Studeren.
 *
 * De cursusdienst opent het tabblad Cudi onder Studies: sinds november 2026 staat
 * cudi in de app zelf en hoort er geen browser meer aan te pas te komen.
 */

const SHORTCUTS: {
  key: string;
  label: string;
  to: string;
  photo: number;
  external?: boolean;
}[] = [
  { key: 'broodjes', label: 'Broodjes', to: '/broodjes', photo: require('../../assets/snel/theokot.jpg') },
  { key: 'shiften', label: 'Shiften', to: '/shiften', photo: require('../../assets/snel/shiften.jpg') },
  { key: 'media', label: "Foto's", to: '/media', photo: require('../../assets/snel/sport.jpg') },
  {
    key: 'cursusdienst',
    label: 'Cursusdienst',
    to: '/studies?tab=cudi',
    photo: require('../../assets/snel/cursusdienst.jpg'),
  },
];

function Shortcuts({
  onOpen,
  onExternal,
}: {
  onOpen: (route: string) => void;
  onExternal: (url: string) => void;
}) {
  return (
    <View style={styles.grid}>
      {SHORTCUTS.map((item) => (
        <Pressable
          key={item.key}
          accessibilityRole="button"
          accessibilityLabel={item.external ? `${item.label}, opent cudi.vtk.be` : item.label}
          onPress={() => (item.external ? onExternal(item.to) : onOpen(item.to))}
          style={({ pressed }) => [styles.aanbod, pressed && styles.aanbodPressed]}
        >
          <Image cachePolicy="memory-disk" source={item.photo} style={styles.aanbodPhoto} contentFit="cover" />
          <View style={styles.aanbodBody}>
            <View style={styles.aanbodTitle}>
              <Text style={styles.aanbodLabel} numberOfLines={1}>
                {item.label}
              </Text>
            </View>
            {item.external ? (
              <ExternalLink color={COLORS.muted} size={13} />
            ) : (
              <Text style={styles.ontdek}>Ontdek</Text>
            )}
          </View>
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.paper },
  scroll: { flex: 1 },
  content: { paddingBottom: SPACING.xxl },
  // Vangt het omlaag trekken op iOS op: daar verschijnt dan geel in plaats van papier.
  overscroll: {
    position: 'absolute',
    top: -1000,
    left: 0,
    right: 0,
    height: 1000,
    backgroundColor: COLORS.yellow,
  },

  headActions: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm },
  // Navy op het geel, zoals de bonnetjes op de site naast een navy knop staan.
  round: {
    width: 44,
    height: 44,
    borderRadius: RADIUS.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.navy,
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 44,
    paddingLeft: 16,
    paddingRight: 12,
    borderRadius: RADIUS.pill,
    backgroundColor: COLORS.navy,
  },
  pressedHead: { opacity: 0.7 },

  services: { marginTop: SPACING.xl - 4, paddingHorizontal: SPACING.lg },
  stack: { gap: 10 },
  block: { marginTop: SPACING.xl + 2, paddingHorizontal: SPACING.lg },
  pressed: { opacity: 0.7 },

  laterList: { gap: SPACING.md, paddingHorizontal: SPACING.lg },
  later: { width: 200, gap: 4 },
  laterPhoto: {
    height: 128,
    borderRadius: 18,
    overflow: 'hidden',
    backgroundColor: COLORS.paper2,
    marginBottom: 4,
  },
  laterBadge: {
    position: 'absolute',
    top: SPACING.sm,
    left: SPACING.sm,
    paddingHorizontal: SPACING.sm,
    paddingVertical: 4,
    borderRadius: 7,
    backgroundColor: COLORS.yellow,
  },
  laterBadgeText: { fontFamily: FONTS.bold, fontSize: 11, letterSpacing: 0.3, color: COLORS.navy },
  laterTitle: { fontFamily: FONTS.semibold, fontSize: 15, color: COLORS.ink, paddingHorizontal: 2 },
  laterMeta: { ...TYPE.small, color: COLORS.muted, paddingHorizontal: 2 },

  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.md },
  aanbod: {
    width: '47.8%',
    backgroundColor: COLORS.surface,
    borderRadius: 18,
    overflow: 'hidden',
    ...CARD_SHADOW,
  },
  aanbodPressed: { opacity: 0.85 },
  aanbodPhoto: { width: '100%', aspectRatio: 16 / 9, backgroundColor: COLORS.paper2 },
  aanbodBody: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    gap: SPACING.sm,
    paddingHorizontal: SPACING.md,
    paddingTop: 10,
    paddingBottom: SPACING.md,
  },
  aanbodTitle: {
    flexShrink: 1,
    paddingBottom: 5,
    borderBottomWidth: 3,
    borderBottomColor: COLORS.yellow,
  },
  aanbodLabel: { fontFamily: FONTS.semibold, fontSize: 14, color: COLORS.ink },
  ontdek: { ...TYPE.small, fontSize: 12, color: COLORS.muted },

  cardTitle: { ...TYPE.cardTitle, color: COLORS.ink },
  cardBody: { ...TYPE.body, color: COLORS.body },
});
