import { useLocalSearchParams } from 'expo-router';

import * as WebBrowser from 'expo-web-browser';
import { Image } from 'expo-image';
import { useKeepAwake } from 'expo-keep-awake';
import { CircleCheck, Clock, MapPin, Maximize2, ScanLine, X } from 'lucide-react-native';
import { useState } from 'react';
import {
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { baseUrl } from '../api/client';
import type { AppMyOrder, AppMyTicket } from '../api/contract';
import { fetchMyTickets, fetchTicketEvents } from '../api/endpoints';
import { messageFor, useResource } from '../api/useResource';
import { CARD_SHADOW } from '../components/HomeSection';
import { HeadButton, PageHead } from '../components/PageHead';
import { DatePin } from '../components/DatePin';
import { VtkQr } from '../components/VtkQr';
import { Button, Card, Empty, ErrorState, Loading, StaleNotice } from '../components/ui';
import { formatDay, formatEuro, formatTime } from '../format';
import { useApp } from '../state/app';
import { useTabRouter } from '../navigation';
import { COLORS, FONTS, RADIUS, SPACING, TYPE } from '../theme/tokens';
import { useTabParam } from '../useTabParam';

type Tab = 'kopen' | 'mijne';

/**
 * Tickets: kopen en tonen, in één tab met twee tabbladen in de kop.
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
 * **Mijn tickets staat vooraan en is het standaardsegment.** Wie hier binnenkomt
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

  const sales = useResource('tickets', () => fetchTicketEvents(locale), locale);
  const mine = useResource(
    'mijn-tickets',
    () => (viewer ? fetchMyTickets(locale) : Promise.resolve([])),
    `${locale}:${viewer?.id ?? 'anon'}`,
  );

  // Het bolletje telt enkel wat er nog komt; voorbije tickets staan standaard verborgen.
  const ticketCount = (mine.data ?? [])
    .filter((order) => !isPast(order))
    .reduce((total, order) => total + order.tickets.length, 0);

  return (
    <>
      <PageHead
        title="Tickets"
        subtitle="Voor cantussen, galabals en andere VTK-events"
        back={false}
        tabs={{
          value: tab,
          onChange: setTab,
          options: [
            { value: 'kopen', label: 'Kopen' },
            { value: 'mijne', label: 'Mijn tickets', badge: ticketCount },
          ],
        }}
        right={
          bootstrap?.abilities?.scanTickets ? (
            <HeadButton accessibilityLabel="Tickets scannen" onPress={() => router.push('/deur')}>
              <ScanLine color={COLORS.ink} size={22} />
            </HeadButton>
          ) : undefined
        }
      />

      {tab === 'kopen' ? (
        <SalesList resource={sales} locale={locale} onOpen={(slug) => router.push(`/ticket/${slug}`)} />
      ) : (
        <MyTickets
          resource={mine}
          locale={locale}
          loggedIn={Boolean(viewer)}
          onLogin={() => router.push('/inloggen')}
          onShop={() => setTab('kopen')}
        />
      )}
    </>
  );
}

// ── Kopen ───────────────────────────────────────────────────────────────────

function SalesList({
  resource,
  locale,
  onOpen,
}: {
  resource: ReturnType<typeof useResource<Awaited<ReturnType<typeof fetchTicketEvents>>>>;
  locale: 'nl' | 'en';
  onOpen: (slug: string) => void;
}) {
  if (resource.loading) return <Loading label="Tickets ophalen" />;
  if (!resource.data) {
    return (
      <ErrorState message={messageFor(resource.error)} onRetry={() => void resource.refresh()} />
    );
  }

  return (
    <ScrollView
      style={styles.root}
      contentContainerStyle={styles.list}
      refreshControl={
        <RefreshControl refreshing={resource.refreshing} onRefresh={() => void resource.refresh()} />
      }
    >
      {resource.stale ? <StaleNotice onRetry={() => void resource.refresh()} /> : null}

      {resource.data.length === 0 ? (
        <Empty
          title="Momenteel geen ticketverkoop"
          hint="Nieuwe events verschijnen hier zodra de verkoop opengaat. Duid in de kalender aan wat je interesseert, dan krijg je een bericht."
        />
      ) : null}

      {resource.data.map((event) => (
        <Pressable
          key={event.id}
          accessibilityRole="button"
          accessibilityLabel={event.title}
          onPress={() => onOpen(event.slug)}
          style={({ pressed }) => [styles.ticket, pressed && styles.pressed]}
        >
          <View style={styles.shot}>
            {event.imageUrl ? (
              <Image source={{ uri: event.imageUrl }} style={styles.photo} contentFit="cover" transition={120} />
            ) : null}
            <View style={styles.pin}>
              <DatePin iso={event.startsAt} locale={locale} shadow />
            </View>
          </View>
          <View style={styles.ticketBody}>
            <Text style={styles.org} numberOfLines={1}>
              {event.ownerGroupName}
              {event.location ? `, ${event.location}` : ''}
            </Text>
            <View style={styles.titleWrap}>
              <Text style={styles.rowTitle} numberOfLines={2}>
                {event.title}
              </Text>
            </View>
            <View style={styles.buy}>
              <View style={styles.priceCol}>
                {event.requiresLogin ? (
                  <Text style={styles.priceHint}>Log in om de ledentickets te zien</Text>
                ) : event.fromPriceCents === null ? (
                  <Text style={styles.priceHint}>Geen tickets meer beschikbaar</Text>
                ) : (
                  <>
                    <Text style={styles.priceHint}>{event.fromPriceCents === 0 ? 'Prijs' : 'Vanaf'}</Text>
                    <Text style={styles.price}>
                      {event.fromPriceCents === 0 ? 'Gratis' : formatEuro(event.fromPriceCents)}
                    </Text>
                  </>
                )}
              </View>
              <View style={styles.cta}>
                <Text style={styles.ctaLabel}>Tickets</Text>
              </View>
            </View>
          </View>
        </Pressable>
      ))}
    </ScrollView>
  );
}

// ── Mijn tickets ────────────────────────────────────────────────────────────

function MyTickets({
  resource,
  locale,
  loggedIn,
  onLogin,
  onShop,
}: {
  resource: ReturnType<typeof useResource<Awaited<ReturnType<typeof fetchMyTickets>>>>;
  locale: 'nl' | 'en';
  loggedIn: boolean;
  onLogin: () => void;
  onShop: () => void;
}) {
  const [showPast, setShowPast] = useState(false);
  const [enlarged, setEnlarged] = useState<Enlarged>(null);

  if (!loggedIn) {
    return (
      <ScrollView style={styles.root} contentContainerStyle={styles.content}>
        <Card>
          <Text style={styles.cardTitle}>Log eerst in</Text>
          <Text style={styles.body}>Je tickets hangen aan je account.</Text>
          <Button label="Inloggen" onPress={onLogin} />
        </Card>
      </ScrollView>
    );
  }

  if (resource.loading) return <Loading label="Tickets ophalen" />;
  if (!resource.data) {
    return (
      <ErrorState message={messageFor(resource.error)} onRetry={() => void resource.refresh()} />
    );
  }

  const upcoming = resource.data.filter((order) => !isPast(order));
  // Het recentste eerst: wie terugbladert, zoekt meestal vorige week en niet vorig jaar.
  const past = resource.data
    .filter(isPast)
    .sort((a, b) => b.event.startsAt.localeCompare(a.event.startsAt));

  return (
    <>
      <ScrollView
        style={styles.root}
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl refreshing={resource.refreshing} onRefresh={() => void resource.refresh()} />
        }
      >
        {resource.stale ? <StaleNotice onRetry={() => void resource.refresh()} /> : null}

        {upcoming.length === 0 ? (
          <Empty
            title={past.length > 0 ? 'Geen tickets voor wat er komt' : 'Nog geen tickets'}
            hint="Wat je koopt, komt hier te staan en blijft ook zonder netwerk zichtbaar."
            action={{ label: 'Naar de verkoop', onPress: onShop }}
          />
        ) : null}

        {upcoming.map((order) => (
          <Order key={order.id} order={order} locale={locale} onEnlarge={setEnlarged} />
        ))}

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
              <Order key={order.id} order={order} locale={locale} onEnlarge={setEnlarged} past />
            ))
          : null}
      </ScrollView>

      <TicketZoom
        ticket={enlarged?.ticket ?? null}
        title={enlarged?.title ?? ''}
        onClose={() => setEnlarged(null)}
      />
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

type Enlarged = { ticket: AppMyTicket; title: string } | null;

/**
 * Eén bestelling als ticket: de banner van het event met de gele datumpin, de
 * titel, wanneer en waar, en daaronder elk ticket na een scheurlijn, met de QR.
 */
function Order({
  order,
  locale,
  onEnlarge,
  past = false,
}: {
  order: AppMyOrder;
  locale: 'nl' | 'en';
  onEnlarge: (next: Enlarged) => void;
  past?: boolean;
}) {
  const when = `${formatDay(order.event.startsAt, locale)}, ${formatTime(order.event.startsAt, locale)}`;
  return (
    <View style={[styles.ticket, past && styles.orderPast]}>
      {order.event.imageUrl ? (
        <View style={styles.shot}>
          <Image source={{ uri: order.event.imageUrl }} style={styles.photo} contentFit="cover" transition={120} />
          <View style={styles.pin}>
            <DatePin iso={order.event.startsAt} locale={locale} month={false} shadow />
          </View>
        </View>
      ) : null}
      <View style={styles.orderBody}>
        <View style={[styles.titleWrap, order.event.imageUrl ? styles.besidePin : null]}>
          <Text accessibilityRole="header" style={styles.orderTitle}>
            {order.event.title}
          </Text>
        </View>
        <View style={styles.infoRow}>
          <Clock color={COLORS.muted} size={15} />
          <Text style={styles.infoText}>{when.charAt(0).toUpperCase() + when.slice(1)}</Text>
        </View>
        {order.event.location ? (
          <View style={styles.infoRow}>
            <MapPin color={COLORS.muted} size={15} />
            <Text style={styles.infoText}>{order.event.location}</Text>
          </View>
        ) : null}
        <Text style={styles.orderNumber}>Bestelling {order.orderNumber}</Text>
      </View>

      {order.tickets.map((ticket) => (
        <View key={ticket.id}>
          <Perforation />
          <TicketBlock ticket={ticket} onEnlarge={() => onEnlarge({ ticket, title: order.event.title })} />
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

function TicketBlock({ ticket, onEnlarge }: { ticket: AppMyTicket; onEnlarge: () => void }) {
  const { width } = useWindowDimensions();
  const [open, setOpen] = useState(false);

  const size = Math.min(200, width - SPACING.lg * 6);
  const used = Boolean(ticket.checkedInAt);

  return (
    <View style={styles.ticketBlock}>
      <View style={styles.ticketHead}>
        <Text style={[styles.cardTitle, styles.flex]}>{ticket.typeName}</Text>
        {ticket.attendeeName ? <Text style={styles.hint}>{ticket.attendeeName}</Text> : null}
      </View>

      {used ? (
        <View style={styles.usedRow}>
          <CircleCheck color={COLORS.muted} size={16} />
          <Text style={styles.hint}>Al gescand</Text>
        </View>
      ) : null}

      {/* Een tik vergroot de code tot over het hele scherm: aan een deur scant een
          camera een grote QR op wit veel sneller dan een klein vierkant in een kaart. */}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Ticket vergroten om te laten scannen"
        onPress={onEnlarge}
        style={({ pressed }) => [styles.qrWrap, pressed && styles.pressed]}
      >
        <VtkQr value={ticket.credential} size={size} />
      </Pressable>
      <Pressable accessibilityRole="button" onPress={onEnlarge} hitSlop={8} style={styles.zoomHint}>
        <Maximize2 color={COLORS.muted} size={13} />
        <Text style={styles.code}>{ticket.publicId}, tik om te vergroten</Text>
      </Pressable>

      <Button label={open ? 'Minder' : 'PDF en wallet'} variant={open ? 'ghost' : 'primary'} onPress={() => setOpen(!open)} />

      {open ? (
        <>
          <Button
            label="Ticket als PDF"
            variant="ghost"
            onPress={() => void WebBrowser.openBrowserAsync(ticket.pdfUrl)}
          />
          {ticket.walletAppleUrl ? (
            <Button
              label="Aan Apple Wallet toevoegen"
              variant="ghost"
              onPress={() => void WebBrowser.openBrowserAsync(ticket.walletAppleUrl as string)}
            />
          ) : null}
          {ticket.walletGoogleUrl ? (
            <Button
              label="Aan Google Wallet toevoegen"
              variant="ghost"
              onPress={() => void WebBrowser.openBrowserAsync(ticket.walletGoogleUrl as string)}
            />
          ) : null}
          <Text style={styles.hint}>
            Deze knoppen openen {baseUrl().replace(/^https?:\/\//, '')} in je browser.
          </Text>
        </>
      ) : null}
    </View>
  );
}

/**
 * Eén ticket over het hele scherm, om te laten scannen.
 *
 * Wit en zo groot als het scherm toelaat, met de naam en het type erbij zodat
 * wie aan de deur staat ook kan lezen wat hij scant. Het scherm blijft aan zolang
 * dit openstaat (`expo-keep-awake` zit in `expo` zelf, dus in elke build). De
 * helderheid zetten we niet hoger: daar is een native module voor nodig die niet
 * in elke APK zit.
 */
function TicketZoom({
  ticket,
  title,
  onClose,
}: {
  ticket: AppMyTicket | null;
  title: string;
  onClose: () => void;
}) {
  return (
    <Modal visible={ticket !== null} animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      {ticket ? <TicketZoomBody ticket={ticket} title={title} onClose={onClose} /> : null}
    </Modal>
  );
}

function TicketZoomBody({ ticket, title, onClose }: { ticket: AppMyTicket; title: string; onClose: () => void }) {
  useKeepAwake();
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const size = Math.min(width - SPACING.xl * 2, height * 0.55);
  const used = Boolean(ticket.checkedInAt);

  return (
    <Pressable
      accessibilityLabel="Sluiten"
      onPress={onClose}
      style={[styles.zoom, { paddingTop: insets.top + SPACING.md, paddingBottom: insets.bottom + SPACING.xl }]}
    >
      <View style={styles.zoomTop}>
        <Pressable accessibilityRole="button" accessibilityLabel="Sluiten" onPress={onClose} hitSlop={14}>
          <X color={COLORS.ink} size={26} />
        </Pressable>
      </View>
      <View style={styles.zoomBody}>
        <Text style={styles.zoomTitle} numberOfLines={2}>
          {title}
        </Text>
        <Text style={styles.zoomType}>
          {ticket.typeName}
          {ticket.attendeeName ? `, ${ticket.attendeeName}` : ''}
        </Text>
        <View style={styles.zoomQr}>
          <VtkQr value={ticket.credential} size={size} />
        </View>
        <Text style={styles.zoomCode}>{ticket.publicId}</Text>
        {used ? (
          <View style={styles.usedRow}>
            <CircleCheck color={COLORS.muted} size={16} />
            <Text style={styles.hint}>Al gescand</Text>
          </View>
        ) : null}
      </View>
      <Text style={styles.hint}>Tik ergens om te sluiten</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.paper },
  list: { padding: SPACING.xl - 4, gap: SPACING.lg, paddingBottom: SPACING.xxl },
  content: { padding: SPACING.xl - 4, gap: SPACING.xl, paddingBottom: SPACING.xxl },

  // De kaart van /tickets: banner met de gele datumpin, de titel met de gele lijn,
  // de prijs en de knop onderaan. Lager dan 16:9, zodat er meer onder elkaar past.
  ticket: {
    backgroundColor: COLORS.surface,
    borderRadius: 22,
    ...CARD_SHADOW,
  },
  pressed: { opacity: 0.92 },
  shot: {
    aspectRatio: 2.4,
    backgroundColor: COLORS.paper2,
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
  },
  photo: { ...StyleSheet.absoluteFill, borderTopLeftRadius: 22, borderTopRightRadius: 22 },
  pin: { position: 'absolute', right: SPACING.lg, bottom: -24 },
  ticketBody: { paddingHorizontal: SPACING.lg, paddingTop: 10, paddingBottom: SPACING.lg, gap: 4 },
  org: { fontFamily: FONTS.medium, fontSize: 12.5, color: COLORS.muted, paddingRight: 70 },
  titleWrap: {
    alignSelf: 'flex-start',
    paddingBottom: 5,
    borderBottomWidth: 3,
    borderBottomColor: COLORS.yellow,
  },
  rowTitle: { fontFamily: FONTS.semibold, fontSize: 17, lineHeight: 22, color: COLORS.ink },
  buy: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: SPACING.sm,
  },
  priceCol: { flex: 1 },
  priceHint: { ...TYPE.small, fontSize: 12, color: COLORS.muted },
  price: { fontFamily: FONTS.semibold, fontSize: 16, color: COLORS.ink, fontVariant: ['tabular-nums'] },
  cta: {
    backgroundColor: COLORS.ink,
    borderRadius: RADIUS.pill,
    paddingHorizontal: 18,
    minHeight: 40,
    justifyContent: 'center',
  },
  ctaLabel: { fontFamily: FONTS.semibold, fontSize: 14, color: COLORS.paper },

  orderBody: { paddingHorizontal: SPACING.lg, paddingTop: SPACING.md, paddingBottom: SPACING.sm, gap: 6 },
  besidePin: { marginRight: 70 },
  orderTitle: { fontFamily: FONTS.bold, fontSize: 21, lineHeight: 26, letterSpacing: -0.6, color: COLORS.ink },
  infoRow: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  infoText: { ...TYPE.small, fontSize: 14, color: COLORS.body, flexShrink: 1 },
  orderNumber: { ...TYPE.small, fontSize: 12, color: COLORS.muted },
  flex: { flex: 1 },
  perforation: { height: 24, flexDirection: 'row', alignItems: 'center' },
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
  ticketBlock: { paddingHorizontal: SPACING.lg, paddingTop: SPACING.xs, paddingBottom: SPACING.lg, gap: SPACING.sm },
  ticketHead: { flexDirection: 'row', alignItems: 'baseline', gap: SPACING.md },
  orderPast: { opacity: 0.7 },
  cardTitle: { ...TYPE.cardTitle, color: COLORS.ink },
  body: { ...TYPE.body, color: COLORS.body },
  hint: { ...TYPE.small, color: COLORS.muted },
  usedRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm },
  // De QR draagt zijn eigen navy kader, dus er hoeft geen tweede wit vlak omheen.
  qrWrap: { alignSelf: 'center', marginVertical: SPACING.sm },
  code: { ...TYPE.small, color: COLORS.muted, textAlign: 'center', letterSpacing: 1 },
  zoomHint: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },

  zoom: {
    flex: 1,
    backgroundColor: COLORS.surface,
    paddingHorizontal: SPACING.xl,
    alignItems: 'center',
  },
  zoomTop: { alignSelf: 'stretch', alignItems: 'flex-end' },
  zoomBody: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: SPACING.sm },
  zoomTitle: { ...TYPE.heading, color: COLORS.ink, textAlign: 'center' },
  zoomType: { ...TYPE.body, color: COLORS.body, textAlign: 'center' },
  zoomQr: { marginVertical: SPACING.lg },
  zoomCode: { fontFamily: FONTS.semibold, fontSize: 16, color: COLORS.ink, letterSpacing: 2 },
});
