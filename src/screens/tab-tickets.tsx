import { useLocalSearchParams } from 'expo-router';

import * as WebBrowser from 'expo-web-browser';
import { Image } from 'expo-image';
import { useKeepAwake } from 'expo-keep-awake';
import { CircleCheck, Clock, FileText, MapPin, ScanLine, Wallet, X } from 'lucide-react-native';
import { useRef, useState } from 'react';
import {
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  type ScrollViewInstance,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { AppMyOrder, AppMyTicket, AppTicketEvent } from '../api/contract';
import { fetchMyTickets, fetchTicketEvents } from '../api/endpoints';
import { messageFor, useResource } from '../api/useResource';
import { CARD_SHADOW } from '../components/HomeSection';
import { DatePin } from '../components/DatePin';
import { VtkQr } from '../components/VtkQr';
import { YellowHead, YellowHeadButton } from '../components/YellowHead';
import { Button, Card, Empty, ErrorState, Loading, StaleNotice } from '../components/ui';
import { formatDay, formatEuro, formatTime } from '../format';
import { useApp } from '../state/app';
import { addToAppleWallet, addToGoogleWallet } from '../wallet';
import { useTabRouter } from '../navigation';
import { COLORS, FONTS, RADIUS, SPACING, TYPE } from '../theme/tokens';
import { useTabParam } from '../useTabParam';
import { useTrackView } from '../usage';

type Tab = 'kopen' | 'mijne';

/**
 * Tickets: kopen en tonen, in één tab met twee tabbladen als pillen in een gele
 * kop (`YellowHead`), zoals Kalender en Studies.
 *
 * Dat is een van de twee redenen waarom tickets een eigen plaats in de onderbalk
 * kregen. De andere is dat tonen tijdgevoelig is: aan de deur van een cantus wil
 * je niet door een menu moeten. Twee tikken en de code staat op het scherm.
 *
 * **De QR wordt hier getekend uit het `credential` dat de server meestuurt** en
 * niet als afbeelding opgehaald. Dat is niet enkel een rondje minder: aan de
 * ingang van een zaal is het netwerk vaak weg, en een ticket dat dan niet te
 * tonen is, is geen ticket. Wat er in de leescache staat, volstaat om binnen te
 * geraken.
 *
 * **Mijn tickets staat vooraan en is het standaardtabblad.** Wie hier binnenkomt
 * heeft meestal al een ticket en wil het tonen; kopen doe je een keer, tonen doe
 * je aan elke deur. Wie niet ingelogd is, ziet wel de verkoop, want zijn eigen
 * tickets zijn dan enkel een aanmeldscherm.
 *
 * De scanknop staat er ook, maar enkel voor wie iets te scannen heeft
 * (`abilities.scanTickets`): een gewone student ziet hem niet. Wie komt shiften,
 * scant onder Meer de uitnodigings-QR die de organisator toont, en heeft vanaf
 * dan deze knop en dat event onder Tickets scannen.
 */
export default function TicketsScreen() {
  const router = useTabRouter();
  const params = useLocalSearchParams<{ tab?: string }>();
  const { locale, viewer, bootstrap } = useApp();
  const [tab, setTab] = useState<Tab>(() => {
    if (params.tab === 'kopen' || params.tab === 'mijne') return params.tab;
    return viewer ? 'mijne' : 'kopen';
  });
  useTabParam<Tab>(params.tab, ['kopen', 'mijne'], setTab);
  useTrackView(`tickets:${tab}`);

  const sales = useResource('tickets', () => fetchTicketEvents(locale), locale, tab === 'kopen');
  const mine = useResource(
    'mijn-tickets',
    () => (viewer ? fetchMyTickets(locale) : Promise.resolve([])),
    `${locale}:${viewer?.id ?? 'anon'}`,
  );

  // Het bolletje telt enkel wat er nog komt; voorbije tickets staan standaard verborgen.
  const ticketCount = (mine.data ?? [])
    .filter((order) => !isPast(order))
    .reduce((total, order) => total + order.tickets.length, 0);

  const head = (
    <YellowHead
      title="Tickets"
      tabs={{
        value: tab,
        onChange: setTab,
        options: [
          { value: 'mijne', label: 'Mijn tickets', badge: ticketCount },
          { value: 'kopen', label: 'Kopen' },
        ],
      }}
      right={
        bootstrap?.abilities?.scanTickets ? (
          <YellowHeadButton label="Tickets scannen" onPress={() => router.push('/deur')}>
            <ScanLine color={COLORS.yellow} size={21} />
          </YellowHeadButton>
        ) : undefined
      }
    />
  );

  return tab === 'kopen' ? (
    <SalesList head={head} resource={sales} locale={locale} onOpen={(slug) => router.push(`/ticket/${slug}`)} />
  ) : (
    <MyTickets
      head={head}
      resource={mine}
      locale={locale}
      loggedIn={Boolean(viewer)}
      onLogin={() => router.push('/inloggen')}
      onShop={() => setTab('kopen')}
    />
  );
}

/**
 * De gele kop met daaronder het papier, in één ScrollView. Boven de kop staat
 * geel, zodat omlaag trekken op iOS geen witte strook toont.
 */
function Frame({
  head,
  refreshing,
  onRefresh,
  stale,
  children,
}: {
  head: React.ReactNode;
  refreshing?: boolean;
  onRefresh?: () => void;
  stale?: boolean;
  children: React.ReactNode;
}) {
  return (
    <View style={styles.root}>
      <ScrollView
        style={styles.root}
        contentContainerStyle={styles.scroll}
        refreshControl={
          onRefresh ? (
            <RefreshControl refreshing={Boolean(refreshing)} tintColor={COLORS.navy} onRefresh={onRefresh} />
          ) : undefined
        }
      >
        <View style={styles.overscroll} />
        {head}
        {stale && onRefresh ? <StaleNotice onRetry={onRefresh} /> : null}
        <View style={styles.content}>{children}</View>
      </ScrollView>
    </View>
  );
}

// ── Kopen ───────────────────────────────────────────────────────────────────

function SalesList({
  head,
  resource,
  locale,
  onOpen,
}: {
  head: React.ReactNode;
  resource: ReturnType<typeof useResource<AppTicketEvent[]>>;
  locale: 'nl' | 'en';
  onOpen: (slug: string) => void;
}) {
  if (resource.loading || !resource.data) {
    return (
      <Frame head={head}>
        {resource.loading ? (
          <Loading label="Tickets ophalen" />
        ) : (
          <ErrorState message={messageFor(resource.error)} onRetry={() => void resource.refresh()} />
        )}
      </Frame>
    );
  }

  return (
    <Frame
      head={head}
      refreshing={resource.refreshing}
      onRefresh={() => void resource.refresh()}
      stale={resource.stale}
    >
      {resource.data.length === 0 ? (
        <Empty
          title="Momenteel geen ticketverkoop"
          hint="Nieuwe events verschijnen hier zodra de verkoop opengaat. Duid in de kalender aan wat je interesseert, dan krijg je een bericht."
        />
      ) : (
        <Text accessibilityRole="header" style={styles.heading}>
          In verkoop
        </Text>
      )}

      {resource.data.map((event) => (
        <SaleCard key={event.id} event={event} locale={locale} onOpen={() => onOpen(event.slug)} />
      ))}

      {resource.data.length > 0 ? (
        <Text style={styles.footnote}>
          Nieuwe events verschijnen hier zodra de verkoop opengaat. Duid in de kalender aan wat je
          interesseert, dan krijg je een bericht.
        </Text>
      ) : null}
    </Frame>
  );
}

/** Eén event in de verkoop: de banner met de gele datumpin, wie en waar, de prijs. */
function SaleCard({ event, locale, onOpen }: { event: AppTicketEvent; locale: 'nl' | 'en'; onOpen: () => void }) {
  const soldOut = !event.requiresLogin && event.fromPriceCents === null;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={event.title}
      onPress={onOpen}
      style={({ pressed }) => [styles.card, pressed && styles.pressed]}
    >
      <View style={styles.shot}>
        {event.imageUrl ? (
          <Image cachePolicy="memory-disk" source={{ uri: event.imageUrl }} style={styles.photo} contentFit="cover" transition={120} />
        ) : null}
        <View style={styles.pin}>
          <DatePin iso={event.startsAt} locale={locale} shadow />
        </View>
      </View>
      <View style={styles.saleBody}>
        <Text style={styles.org} numberOfLines={1}>
          {event.ownerGroupName}
          {event.location ? `, ${event.location}` : ''}
        </Text>
        <Text style={styles.saleTitle} numberOfLines={2}>
          {event.title}
        </Text>
        <View style={styles.buy}>
          <View style={styles.flex}>
            {event.requiresLogin ? (
              <Text style={styles.priceHint}>Log in om de ledentickets te zien</Text>
            ) : soldOut ? (
              <View style={styles.soldOut}>
                <Text style={styles.soldOutLabel}>Uitverkocht</Text>
              </View>
            ) : (
              <>
                <Text style={styles.priceHint}>{event.fromPriceCents === 0 ? 'Prijs' : 'Vanaf'}</Text>
                <Text style={styles.price}>
                  {event.fromPriceCents === 0 ? 'Gratis' : formatEuro(event.fromPriceCents ?? 0)}
                </Text>
              </>
            )}
          </View>
          <View style={[styles.cta, soldOut && styles.ctaQuiet]}>
            <Text style={[styles.ctaLabel, soldOut && styles.ctaLabelQuiet]}>{soldOut ? 'Bekijken' : 'Tickets'}</Text>
          </View>
        </View>
      </View>
    </Pressable>
  );
}

// ── Mijn tickets ────────────────────────────────────────────────────────────

type Enlarged = { order: AppMyOrder; index: number } | null;

function MyTickets({
  head,
  resource,
  locale,
  loggedIn,
  onLogin,
  onShop,
}: {
  head: React.ReactNode;
  resource: ReturnType<typeof useResource<AppMyOrder[]>>;
  locale: 'nl' | 'en';
  loggedIn: boolean;
  onLogin: () => void;
  onShop: () => void;
}) {
  const [showPast, setShowPast] = useState(false);
  const [enlarged, setEnlarged] = useState<Enlarged>(null);

  if (!loggedIn) {
    return (
      <Frame head={head}>
        <Card>
          <Text style={styles.cardTitle}>Log eerst in</Text>
          <Text style={styles.body}>Je tickets hangen aan je account.</Text>
          <Button label="Inloggen" onPress={onLogin} />
        </Card>
      </Frame>
    );
  }

  if (resource.loading || !resource.data) {
    return (
      <Frame head={head}>
        {resource.loading ? (
          <Loading label="Tickets ophalen" />
        ) : (
          <ErrorState message={messageFor(resource.error)} onRetry={() => void resource.refresh()} />
        )}
      </Frame>
    );
  }

  const upcoming = resource.data.filter((order) => !isPast(order));
  // Het recentste eerst: wie terugbladert, zoekt meestal vorige week en niet vorig jaar.
  const past = resource.data
    .filter(isPast)
    .sort((a, b) => b.event.startsAt.localeCompare(a.event.startsAt));

  return (
    <>
      <Frame
        head={head}
        refreshing={resource.refreshing}
        onRefresh={() => void resource.refresh()}
        stale={resource.stale}
      >
        {upcoming.length === 0 ? (
          <Empty
            title={past.length > 0 ? 'Geen tickets voor wat er komt' : 'Nog geen tickets'}
            hint="Wat je koopt, komt hier te staan en blijft ook zonder netwerk zichtbaar."
            action={{ label: 'Naar de verkoop', onPress: onShop }}
          />
        ) : (
          <Text accessibilityRole="header" style={styles.heading}>
            Komend
          </Text>
        )}

        {upcoming.map((order) => (
          <Order key={order.id} order={order} locale={locale} onEnlarge={(index) => setEnlarged({ order, index })} />
        ))}

        {upcoming.length > 0 ? (
          <Text style={styles.footnote}>
            Tik op een code om ze over het hele scherm te tonen. Je tickets blijven zichtbaar zonder netwerk.
          </Text>
        ) : null}

        {past.length > 0 ? (
          <Button
            label={
              showPast
                ? 'Voorbije evenementen verbergen'
                : `Voorbije evenementen tonen (${past.length})`
            }
            variant="ghost"
            onPress={() => setShowPast(!showPast)}
          />
        ) : null}

        {showPast
          ? past.map((order) => (
              <Order
                key={order.id}
                order={order}
                locale={locale}
                onEnlarge={(index) => setEnlarged({ order, index })}
                past
              />
            ))
          : null}
      </Frame>

      <TicketZoom enlarged={enlarged} locale={locale} onClose={() => setEnlarged(null)} />
    </>
  );
}

/**
 * Wanneer een ticket bij "voorbij" hoort: een dag na de start van het evenement.
 * De server stuurt enkel het begin mee, en een cantus die om tien uur begint,
 * loopt tot diep in de nacht; tot de volgende avond staat hij dus nog vooraan.
 */
const PAST_AFTER_MS = 24 * 60 * 60 * 1000;

function isPast(order: AppMyOrder): boolean {
  return Date.parse(order.event.startsAt) < Date.now() - PAST_AFTER_MS;
}

/** "Woensdag 2 december, 20:00". */
function whenLabel(iso: string, locale: 'nl' | 'en'): string {
  const when = `${formatDay(iso, locale)}, ${formatTime(iso, locale)}`;
  return when.charAt(0).toUpperCase() + when.slice(1);
}

/**
 * Eén bestelling als ticket: de banner van het event met de gele datumpin, de
 * titel, wanneer en waar, en na een scheurlijn elk ticket als compacte strook:
 * de QR links, het type, de naam en de code ernaast (voorstel B, november 2026).
 * Zo past een bestelling voor twee op één scherm; een tik op de QR zet ze groot.
 */
function Order({
  order,
  locale,
  onEnlarge,
  past = false,
}: {
  order: AppMyOrder;
  locale: 'nl' | 'en';
  onEnlarge: (index: number) => void;
  past?: boolean;
}) {
  return (
    <View style={[styles.card, past && styles.orderPast]}>
      {order.event.imageUrl ? (
        <View style={styles.shot}>
          <Image cachePolicy="memory-disk" source={{ uri: order.event.imageUrl }} style={styles.photo} contentFit="cover" transition={120} />
          <View style={styles.pin}>
            <DatePin iso={order.event.startsAt} locale={locale} month={false} shadow />
          </View>
        </View>
      ) : null}
      <View style={styles.orderBody}>
        <Text
          accessibilityRole="header"
          style={[styles.orderTitle, order.event.imageUrl ? styles.besidePin : null]}
        >
          {order.event.title}
        </Text>
        <View style={styles.infoRow}>
          <Clock color={COLORS.muted} size={15} />
          <Text style={styles.infoText}>{whenLabel(order.event.startsAt, locale)}</Text>
        </View>
        {order.event.location ? (
          <View style={styles.infoRow}>
            <MapPin color={COLORS.muted} size={15} />
            <Text style={styles.infoText}>{order.event.location}</Text>
          </View>
        ) : null}
      </View>

      <Perforation />
      {order.tickets.map((ticket, index) => (
        <View key={ticket.id}>
          {index > 0 ? <View style={styles.hairline} /> : null}
          <TicketStub ticket={ticket} onEnlarge={() => onEnlarge(index)} />
        </View>
      ))}
    </View>
  );
}

/** De scheurlijn van een ticket: twee halve cirkels in de kleur van de grond, een stippellijn ertussen. */
function Perforation() {
  return (
    <View style={styles.perforation} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <View style={[styles.notch, styles.notchLeft]} />
      <View style={styles.dashes} />
      <View style={[styles.notch, styles.notchRight]} />
    </View>
  );
}

const STUB_QR = 112;

function TicketStub({ ticket, onEnlarge }: { ticket: AppMyTicket; onEnlarge: () => void }) {
  const used = Boolean(ticket.checkedInAt);
  // Enkel de wallet van dit toestel: Apple Wallet bestaat niet op Android en
  // Google Wallet hoort niet op een iPhone.
  const walletUrl = Platform.OS === 'ios' ? ticket.walletAppleUrl : ticket.walletGoogleUrl;

  return (
    <View style={styles.stub}>
      {/* Een tik vergroot de code tot over het hele scherm: aan een deur scant een
          camera een grote QR op wit veel sneller dan een klein vierkant in een kaart. */}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${ticket.typeName}: vergroten om te laten scannen`}
        onPress={onEnlarge}
        style={({ pressed }) => [pressed && styles.pressed, used && styles.usedQr]}
      >
        <VtkQr value={ticket.credential} size={STUB_QR} />
      </Pressable>
      <View style={styles.stubText}>
        <Text style={styles.cardTitle}>{ticket.typeName}</Text>
        {ticket.attendeeName ? <Text style={styles.attendee}>{ticket.attendeeName}</Text> : null}
        <Text style={styles.code}>{ticket.publicId}</Text>
        {used ? (
          <View style={styles.usedRow}>
            <CircleCheck color={COLORS.muted} size={14} />
            <Text style={styles.hint}>Al gescand</Text>
          </View>
        ) : null}
        <View style={styles.stubActions}>
          {walletUrl ? (
            <SmallButton
              label="Wallet"
              accessibilityLabel={Platform.OS === 'ios' ? 'Aan Apple Wallet toevoegen' : 'Aan Google Wallet toevoegen'}
              icon={<Wallet color={COLORS.navy} size={15} />}
              onPress={() =>
                void (Platform.OS === 'ios' ? addToAppleWallet(walletUrl) : addToGoogleWallet(walletUrl))
              }
            />
          ) : null}
          <SmallButton
            label="PDF"
            accessibilityLabel="Ticket als PDF"
            icon={<FileText color={COLORS.navy} size={15} />}
            onPress={() => void WebBrowser.openBrowserAsync(ticket.pdfUrl)}
          />
        </View>
      </View>
    </View>
  );
}

function SmallButton({
  label,
  accessibilityLabel,
  icon,
  onPress,
}: {
  label: string;
  accessibilityLabel: string;
  icon: React.ReactNode;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      onPress={onPress}
      hitSlop={4}
      style={({ pressed }) => [styles.smallButton, pressed && styles.pressed]}
    >
      {icon}
      <Text style={styles.smallButtonLabel}>{label}</Text>
    </Pressable>
  );
}

/**
 * Een bestelling over het hele scherm, om te laten scannen.
 *
 * Wit en zo groot als het scherm toelaat, met het event, het type en de naam
 * erbij zodat wie aan de deur staat ook kan lezen wat hij scant. Zitten er meer
 * tickets in de bestelling, dan veeg je opzij naar het volgende: wie voor een
 * groep kocht, toont ze zo na elkaar zonder terug naar de lijst te moeten. Het
 * scherm blijft aan zolang dit openstaat (`expo-keep-awake` zit in `expo` zelf,
 * dus in elke build). De helderheid zetten we niet hoger: daar is een native
 * module voor nodig die niet in elke APK zit.
 */
function TicketZoom({
  enlarged,
  locale,
  onClose,
}: {
  enlarged: Enlarged;
  locale: 'nl' | 'en';
  onClose: () => void;
}) {
  return (
    <Modal visible={enlarged !== null} animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      {enlarged ? <TicketZoomBody {...enlarged} locale={locale} onClose={onClose} /> : null}
    </Modal>
  );
}

function TicketZoomBody({
  order,
  index,
  locale,
  onClose,
}: {
  order: AppMyOrder;
  index: number;
  locale: 'nl' | 'en';
  onClose: () => void;
}) {
  useKeepAwake();
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const [current, setCurrent] = useState(index);
  const pager = useRef<ScrollViewInstance>(null);
  const size = Math.min(width - SPACING.xl * 2, height * 0.45);
  const count = order.tickets.length;
  const next = order.tickets[current + 1];

  return (
    <Pressable
      accessibilityLabel="Sluiten"
      onPress={onClose}
      style={[styles.zoom, { paddingTop: insets.top + SPACING.md, paddingBottom: insets.bottom + SPACING.xl }]}
    >
      <View style={styles.zoomTop}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Sluiten"
          onPress={onClose}
          hitSlop={8}
          style={({ pressed }) => [styles.zoomClose, pressed && styles.pressed]}
        >
          <X color={COLORS.ink} size={22} />
        </Pressable>
      </View>

      <View style={styles.zoomBody}>
        <View style={styles.zoomHead}>
          <Text style={styles.zoomTitle} numberOfLines={2}>
            {order.event.title}
          </Text>
          <Text style={styles.zoomWhen}>
            {whenLabel(order.event.startsAt, locale)}
            {order.event.location ? `, ${order.event.location}` : ''}
          </Text>
        </View>

        <ScrollView
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          ref={pager}
          // Open op het ticket waarop je tikte. `contentOffset` alleen werkt
          // enkel op iOS, dus op Android schuiven we er bij de eerste layout heen.
          contentOffset={{ x: index * width, y: 0 }}
          onLayout={() => {
            if (index > 0) pager.current?.scrollTo({ x: index * width, animated: false });
          }}
          onMomentumScrollEnd={(event) => setCurrent(Math.round(event.nativeEvent.contentOffset.x / width))}
          style={styles.zoomPager}
        >
          {order.tickets.map((ticket) => (
            <Pressable key={ticket.id} onPress={onClose} accessibilityLabel="Sluiten" style={[styles.zoomPage, { width }]}>
              <Text style={styles.zoomType}>
                {ticket.typeName}
                {ticket.attendeeName ? `, ${ticket.attendeeName}` : ''}
              </Text>
              <View style={styles.zoomQr}>
                <VtkQr value={ticket.credential} size={size} />
              </View>
              <Text style={styles.zoomCode}>{ticket.publicId}</Text>
              {ticket.checkedInAt ? (
                <View style={styles.usedRow}>
                  <CircleCheck color={COLORS.muted} size={16} />
                  <Text style={styles.hint}>Al gescand</Text>
                </View>
              ) : null}
            </Pressable>
          ))}
        </ScrollView>

        {count > 1 ? (
          <View style={styles.zoomPaging}>
            <View style={styles.dots} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
              {order.tickets.map((ticket, dot) => (
                <View key={ticket.id} style={[styles.dot, dot === current && styles.dotActive]} />
              ))}
            </View>
            <Text style={styles.hint}>
              Ticket {current + 1} van {count}
              {next ? `, veeg voor ${next.attendeeName || 'het volgende'}` : ''}
            </Text>
          </View>
        ) : null}
      </View>
      <Text style={styles.hint}>Tik ergens om te sluiten</Text>
    </Pressable>
  );
}

const SIDE = SPACING.xl - 4;

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.paper },
  flex: { flex: 1 },
  scroll: { paddingBottom: SPACING.xxl },
  // Wat boven de kop verschijnt als je op iOS omlaag trekt: geel, zoals de kop.
  overscroll: {
    position: 'absolute',
    top: -1000,
    left: 0,
    right: 0,
    height: 1000,
    backgroundColor: COLORS.yellow,
  },
  content: { paddingHorizontal: SIDE, paddingTop: SPACING.xl - 2, gap: SPACING.lg },
  heading: {
    fontFamily: FONTS.bold,
    fontSize: 22,
    letterSpacing: -0.5,
    color: COLORS.navy,
    paddingHorizontal: SPACING.xs,
  },
  footnote: { ...TYPE.small, color: COLORS.muted, textAlign: 'center', paddingHorizontal: SPACING.md },

  card: {
    backgroundColor: COLORS.surface,
    borderRadius: 22,
    ...CARD_SHADOW,
  },
  pressed: { opacity: 0.85 },
  // Lager dan 16:9, zodat er meer onder elkaar past.
  shot: {
    aspectRatio: 2.4,
    backgroundColor: COLORS.paper2,
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
  },
  photo: { ...StyleSheet.absoluteFill, borderTopLeftRadius: 22, borderTopRightRadius: 22 },
  pin: { position: 'absolute', right: SPACING.lg, bottom: -24 },

  saleBody: { paddingHorizontal: SPACING.lg, paddingTop: 10, paddingBottom: SPACING.lg, gap: 4 },
  org: { fontFamily: FONTS.medium, fontSize: 12.5, color: COLORS.muted, paddingRight: 70 },
  saleTitle: { fontFamily: FONTS.bold, fontSize: 18, lineHeight: 23, letterSpacing: -0.4, color: COLORS.ink },
  buy: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: SPACING.md,
    marginTop: SPACING.sm,
  },
  priceHint: { ...TYPE.small, fontSize: 12, color: COLORS.muted },
  price: { fontFamily: FONTS.semibold, fontSize: 16, color: COLORS.ink, fontVariant: ['tabular-nums'] },
  soldOut: {
    alignSelf: 'flex-start',
    height: 28,
    justifyContent: 'center',
    paddingHorizontal: SPACING.md,
    borderRadius: RADIUS.pill,
    backgroundColor: COLORS.paper2,
  },
  soldOutLabel: { fontFamily: FONTS.semibold, fontSize: 13, color: COLORS.body },
  cta: {
    backgroundColor: COLORS.navy,
    borderRadius: RADIUS.pill,
    paddingHorizontal: 18,
    minHeight: 40,
    justifyContent: 'center',
  },
  ctaQuiet: { backgroundColor: COLORS.paper },
  ctaLabel: { fontFamily: FONTS.bold, fontSize: 14, color: COLORS.yellow },
  ctaLabelQuiet: { fontFamily: FONTS.semibold, color: COLORS.navy },

  orderBody: { paddingHorizontal: SPACING.lg, paddingTop: SPACING.md, paddingBottom: SPACING.xs, gap: 6 },
  besidePin: { marginRight: 70 },
  orderTitle: { fontFamily: FONTS.bold, fontSize: 21, lineHeight: 26, letterSpacing: -0.6, color: COLORS.ink },
  infoRow: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  infoText: { ...TYPE.small, fontSize: 14, color: COLORS.body, flexShrink: 1 },
  orderPast: { opacity: 0.7 },
  perforation: { height: 24, flexDirection: 'row', alignItems: 'center', marginTop: SPACING.sm },
  notch: { width: 24, height: 24, borderRadius: 12, backgroundColor: COLORS.paper },
  notchLeft: { marginLeft: -12 },
  notchRight: { marginRight: -12 },
  dashes: {
    flex: 1,
    marginHorizontal: SPACING.sm,
    borderTopWidth: 2,
    borderStyle: 'dashed',
    borderColor: COLORS.line2,
  },
  hairline: { height: StyleSheet.hairlineWidth, backgroundColor: COLORS.line2, marginHorizontal: SPACING.lg },

  stub: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.lg,
  },
  usedQr: { opacity: 0.45 },
  stubText: { flex: 1, minWidth: 0, gap: 3 },
  attendee: { ...TYPE.small, fontSize: 13, color: COLORS.body },
  code: { ...TYPE.small, fontSize: 12, color: COLORS.muted, letterSpacing: 1 },
  stubActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: SPACING.sm },
  smallButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    height: 36,
    paddingHorizontal: SPACING.md,
    borderRadius: RADIUS.pill,
    backgroundColor: COLORS.paper,
  },
  smallButtonLabel: { fontFamily: FONTS.semibold, fontSize: 13, color: COLORS.navy },

  cardTitle: { ...TYPE.cardTitle, color: COLORS.ink },
  body: { ...TYPE.body, color: COLORS.body },
  hint: { ...TYPE.small, color: COLORS.muted, textAlign: 'center' },
  usedRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.xs },

  zoom: {
    flex: 1,
    backgroundColor: COLORS.surface,
    alignItems: 'center',
  },
  zoomTop: { alignSelf: 'stretch', alignItems: 'flex-end', paddingHorizontal: SPACING.xl },
  zoomClose: {
    width: 44,
    height: 44,
    borderRadius: RADIUS.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.paper,
  },
  zoomBody: { flex: 1, alignSelf: 'stretch', justifyContent: 'center', gap: SPACING.lg },
  zoomHead: { paddingHorizontal: SPACING.xl, gap: 6 },
  zoomTitle: {
    fontFamily: FONTS.bold,
    fontSize: 24,
    lineHeight: 29,
    letterSpacing: -0.6,
    color: COLORS.ink,
    textAlign: 'center',
  },
  zoomWhen: { ...TYPE.small, fontSize: 14, color: COLORS.muted, textAlign: 'center' },
  zoomPager: { flexGrow: 0 },
  zoomPage: { alignItems: 'center', gap: SPACING.sm },
  zoomType: { ...TYPE.body, color: COLORS.body, textAlign: 'center', paddingHorizontal: SPACING.xl },
  zoomQr: { marginVertical: SPACING.md },
  zoomCode: { fontFamily: FONTS.semibold, fontSize: 16, color: COLORS.ink, letterSpacing: 2 },
  zoomPaging: { alignItems: 'center', gap: SPACING.sm },
  dots: { flexDirection: 'row', gap: 6 },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: COLORS.line2 },
  dotActive: { width: 20, backgroundColor: COLORS.navy },
});
