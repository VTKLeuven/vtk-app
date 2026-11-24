import { Image } from 'expo-image';
import { Coins, ExternalLink, QrCode } from 'lucide-react-native';
import * as WebBrowser from 'expo-web-browser';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';

import type { AppCalendarEvent, AppLocale } from '../api/contract';
import { fetchToday } from '../api/endpoints';
import { messageFor, useResource } from '../api/useResource';
import { AlmaToday } from '../components/AlmaToday';
import { HomeHero, shortWhen } from '../components/HomeHero';
import { CARD_SHADOW, HomeSection } from '../components/HomeSection';
import { PageHead } from '../components/PageHead';
import { UpcomingLessonsList, useUpcomingLessons } from '../components/planning/UpcomingLessons';
import { Prose } from '../components/Prose';
import { ServiceList } from '../components/ServiceList';
import { TaskCard } from '../components/TaskCard';
import { Button, Card, ErrorState, Loading, StaleNotice } from '../components/ui';
import { formatVouchers } from '../format';
import { useApp } from '../state/app';
import { useTabRouter } from '../navigation';
import { COLORS, FONTS, RADIUS, SPACING, TYPE } from '../theme/tokens';

/** Zoveel evenementen staan er onder "Aankomende evenementen"; de rest staat in Kalender. */
const MAX_EVENTS = 6;

/**
 * Home: **vandaag**.
 *
 * Dit scherm beantwoordt de twee vragen waarmee iemand de app opent: *wat is er
 * open* en *wat wacht er op mij*, en daarnaast wat VTK vandaag doet.
 *
 * De opbouw is voorstel F1 van november 2026, "foto voorop":
 *
 * - bovenaan de aankomende evenementen als foto over de volle breedte, die om de
 *   zeven seconden doorschuiven en die je zelf kan vegen (`HomeHero`), met de groet
 *   en je knoppen erbovenop;
 * - Theokot, cudi en 't ElixIr als één witte balk (`ServiceList`);
 * - je volgende drie lessen in één kaart (`UpcomingLessonsList`), voor wie een
 *   lessenrooster koppelde;
 * - de vier Alma's op campus Arenberg (`AlmaToday`): open of niet en wat er
 *   warm op het menu staat;
 * - "Voor jou" als witte kaarten (`TaskCard`), de broodjes met een foto;
 * - de aankomende evenementen nog eens als lijst, en "Snel naar".
 *
 * Dit is het enige scherm dat niet met de navy `PageHead` opent, en dat is een
 * keuze: Home is het scherm dat je het vaakst ziet, en daar draagt een foto van
 * wat er vandaag gebeurt meer dan een patroon. Zonder aankomende evenementen valt
 * het terug op de gewone kop.
 */
export default function HomeScreen() {
  const router = useTabRouter();
  const { locale, viewer, gate, bootstrap, refresh: refreshApp } = useApp();
  const resource = useResource('vandaag', () => fetchToday(locale), locale);
  const upcoming = useUpcomingLessons(locale, Boolean(viewer) && bootstrap?.abilities?.planning === true);

  if (resource.loading) return <Loading label="VTK openen" />;
  if (!resource.data) {
    return (
      <ErrorState message={messageFor(resource.error)} onRetry={() => void resource.refresh()} />
    );
  }

  const today = resource.data;
  const greeting = today.greetingName ? `Dag ${today.greetingName}` : 'VTK Leuven';
  const events = today.upcomingEvents.slice(0, MAX_EVENTS);

  const dayLabel = new Intl.DateTimeFormat(locale === 'en' ? 'en-GB' : 'nl-BE', {
    timeZone: 'Europe/Brussels',
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  }).format(new Date(today.now));
  const kicker = dayLabel.charAt(0).toUpperCase() + dayLabel.slice(1);

  /** De knoppen rechtsboven: halfwit op een foto, wit met een schaduw op papier. */
  const actions = (onPhoto: boolean) =>
    viewer ? (
      <View style={styles.headActions}>
        {today.canScanTickets || today.canAcceptVouchers ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Een code scannen"
            onPress={() => router.push('/scannen')}
            hitSlop={6}
            style={({ pressed }) => [
              styles.round,
              onPhoto ? styles.light : styles.glass,
              pressed && styles.pressedHead,
            ]}
          >
            <QrCode color={COLORS.ink} size={19} />
          </Pressable>
        ) : null}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Bonnetjes, ${formatVouchers(today.vouchers ?? 0, locale)} openstaand`}
          onPress={() => router.push('/bonnetjes')}
          hitSlop={6}
          style={({ pressed }) => [
            styles.pill,
            onPhoto ? styles.light : styles.glass,
            pressed && styles.pressedHead,
          ]}
        >
          <Coins color={COLORS.ink} size={17} />
          <Text style={styles.pillText}>
            {formatVouchers(today.vouchers ?? 0, locale)}
          </Text>
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
            tintColor={COLORS.onDark}
            onRefresh={() => {
              void resource.refresh();
              void upcoming.resource.reload();
              void refreshApp();
            }}
          />
        }
      >
        <View style={styles.overscroll} />
        {events.length > 0 ? (
          <HomeHero
            events={events}
            locale={locale}
            greeting={greeting}
            initial={today.greetingName ? today.greetingName.charAt(0).toUpperCase() : null}
            actions={actions(true)}
            onOpen={(id) => router.push(`/evenement/${id}`)}
          />
        ) : (
          <PageHead title={greeting} kicker={kicker} back={false} right={actions(false)} />
        )}

        {resource.stale ? <StaleNotice onRetry={() => void resource.refresh()} /> : null}

        {today.services.length > 0 ? (
          <View style={styles.services}>
            <ServiceList services={today.services} />
          </View>
        ) : null}

        {/* Je volgende lessen, voor wie een lessenrooster koppelde. Zonder
            rooster of zonder komende lessen tekent dit niets. */}
        <UpcomingLessonsList
          upcoming={upcoming}
          onOpen={() => router.push({ pathname: '/kalender', params: { tab: 'planning' } })}
        />

        {/* De Alma's op campus: open of niet, en wat er warm op het menu staat. */}
        <AlmaToday />

        {today.tasks.length > 0 ? (
          <HomeSection title="Voor jou">
            <View style={styles.stack}>
              {today.tasks.map((task, index) => (
                <TaskCard key={`${task.kind}-${task.at ?? index}`} task={task} />
              ))}
            </View>
          </HomeSection>
        ) : null}

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

        {events.length > 0 ? (
          <HomeSection
            title="Aankomende evenementen"
            link={{
              label: 'Kalender',
              accessibilityLabel: 'Naar de kalender',
              onPress: () => router.push('/kalender'),
            }}
          >
            <View style={styles.eventList}>
              {events.map((event) => (
                <EventRow
                  key={event.id}
                  event={event}
                  locale={locale}
                  onPress={() => router.push(`/evenement/${event.id}`)}
                />
              ))}
            </View>
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

        {viewer && !gate && today.tasks.length === 0 ? (
          <View style={styles.block}>
            <Text style={styles.quiet}>
              Er wacht niets op je. Wat je bestelt of koopt, verschijnt hier vanzelf.
            </Text>
          </View>
        ) : null}
      </ScrollView>
    </View>
  );
}

/** Een evenement als rij: de affiche klein links, daarnaast wanneer, wat en waar. */
function EventRow({
  event,
  locale,
  onPress,
}: {
  event: AppCalendarEvent;
  locale: AppLocale;
  onPress: () => void;
}) {
  const when = shortWhen(event, locale);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={[event.title, when, event.location].filter(Boolean).join(', ')}
      onPress={onPress}
      style={({ pressed }) => [styles.eventRow, pressed && styles.pressed]}
    >
      <View style={styles.eventThumb}>
        {event.imageUrl ? (
          <Image cachePolicy="memory-disk" source={{ uri: event.imageUrl }} style={StyleSheet.absoluteFill} contentFit="cover" transition={120} />
        ) : null}
      </View>
      <View style={styles.eventText}>
        <Text style={styles.eventWhen}>{when}</Text>
        <Text style={styles.eventTitle} numberOfLines={1}>
          {event.title}
        </Text>
        {event.location ? (
          <Text style={styles.eventWhere} numberOfLines={1}>
            {event.location}
          </Text>
        ) : null}
      </View>
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
  { key: 'shiften', label: 'Shiften', to: '/shiften', photo: require('../../assets/snel/onderwijs.jpg') },
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
  // Vangt het omlaag trekken op iOS op: daar verschijnt dan navy in plaats van papier.
  overscroll: {
    position: 'absolute',
    top: -1000,
    left: 0,
    right: 0,
    height: 1000,
    backgroundColor: COLORS.navy,
  },

  headActions: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm },
  round: { width: 44, height: 44, borderRadius: RADIUS.pill, alignItems: 'center', justifyContent: 'center' },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    height: 44,
    paddingHorizontal: 14,
    borderRadius: RADIUS.pill,
  },
  // Op een foto: wit, zodat het op elke affiche leesbaar blijft.
  light: { backgroundColor: 'rgba(255,255,255,0.92)' },
  // Op papier, zonder foto: wit met de schaduw van de kaarten.
  glass: { backgroundColor: COLORS.surface, ...CARD_SHADOW },
  pillText: { fontFamily: FONTS.semibold, fontSize: 15, color: COLORS.ink },
  pressedHead: { opacity: 0.6 },

  services: { marginTop: SPACING.xl - 4, paddingHorizontal: SPACING.lg },
  stack: { gap: 10 },
  block: { marginTop: SPACING.xl + 2, paddingHorizontal: SPACING.lg },
  pressed: { opacity: 0.7 },

  eventList: { gap: SPACING.md, paddingHorizontal: SPACING.xs },
  eventRow: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  eventThumb: {
    width: 96,
    height: 60,
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: COLORS.paper2,
  },
  eventText: { flex: 1, gap: 2 },
  eventWhen: { fontFamily: FONTS.semibold, fontSize: 12, color: COLORS.ink, fontVariant: ['tabular-nums'] },
  eventTitle: { fontFamily: FONTS.semibold, fontSize: 15, color: COLORS.ink },
  eventWhere: { ...TYPE.small, color: COLORS.muted },

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
  quiet: { ...TYPE.small, color: COLORS.muted, paddingHorizontal: SPACING.xs },
});
