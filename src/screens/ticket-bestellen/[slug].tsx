import * as WebBrowser from 'expo-web-browser';
import { useLocalSearchParams } from 'expo-router';
import { Check } from 'lucide-react-native';
import { useMemo, useRef, useState } from 'react';
import { Alert, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { ApiError, baseUrl } from '../../api/client';
import type { AppPaymentMethod, AppTicketEventDetail, AppTicketType } from '../../api/contract';
import { fetchOrderStatus, fetchTicketEvent, startOrderPayment, startTicketCheckout } from '../../api/endpoints';
import { messageFor, useResource } from '../../api/useResource';
import { CARD_SHADOW } from '../../components/HomeSection';
import { WebFlow } from '../../components/WebFlow';
import { YellowHead } from '../../components/YellowHead';
import { QuestionField, type AnswerValue } from '../../components/QuestionField';
import { Button, Card, CardList, ErrorState, Loading } from '../../components/ui';
import { formatEuro } from '../../format';
import { useApp } from '../../state/app';
import { useTabRouter } from '../../navigation';
import { checkoutErrorText, decodeQuantities, paymentErrorText } from '../../ticketOrder';
import { IS_DARK } from '../../theme/mode';
import { COLORS, FONTS, RADIUS, SPACING, TYPE } from '../../theme/tokens';
import { t } from '../../i18n';

/**
 * De tweede stap van tickets kopen: wie er komt, je gegevens, de voorwaarden en
 * hoe je betaalt.
 *
 * De ticketpagina kiest enkel de aantallen en stuurt ze hierheen
 * (`?aantallen=type:2`). Zo is er geen formulier dat onderaan een lange pagina
 * wacht zonder dat je het ziet; hier staat het vooraan, met "Betalen" vast
 * onderaan. De kop is geel, zoals een vak in Studies, met je bestelling erin.
 *
 * **De betaalwijze kies je hier** (november 2026), uit wat de server aanzet en
 * in zijn volgorde (`paymentMethods`). Standaard Bancontact wie de app in het
 * Nederlands gebruikt en Mollie wie ze in het Engels gebruikt, zoals op de
 * bestelpagina van de site: Bancontact rechtstreeks kost VTK minder, maar een
 * internationale student kan er niet mee betalen. Na de checkout start de app de
 * betaling zelf (`/api/tickets/orders/<id>/pay`, dezelfde route als de knoppen op
 * de site) en opent ze meteen Mollie of de Bancontact-pagina. Een oudere server
 * stuurt geen `paymentMethods`; dan kies je zoals vroeger op de bestelpagina.
 *
 * **Betalen gebeurt in een WebView in de app** (`WebFlow`), niet in de
 * systeembrowser: die heeft het toegangscookie van de bestelling niet (dat zet
 * de checkout op het antwoord aan de app) en je login evenmin. Mollie nabouwen
 * doen we niet. Komt de WebView terug op de bestelpagina, of sluit je hem, dan
 * vragen we de server wat er van de bestelling geworden is; we gokken niet.
 * Lukte het niet, dan blijft de bestelling hier klaarstaan en betaal je opnieuw,
 * met dezelfde of een andere betaalwijze. Voorraad, limieten en of een type nog
 * te koop staat, controleert de checkout bindend.
 */
export default function TicketOrderScreen() {
  const router = useTabRouter();
  const { locale, viewer } = useApp();
  const { slug, aantallen } = useLocalSearchParams<{ slug: string; aantallen?: string }>();

  const resource = useResource(`ticket:${slug}`, () => fetchTicketEvent(locale, slug), `${locale}:${slug}`);

  if (resource.loading) return <Loading />;
  if (!resource.data) {
    return <ErrorState message={messageFor(resource.error)} onRetry={() => void resource.refresh()} />;
  }

  return (
    <Order
      event={resource.data}
      quantities={decodeQuantities(aantallen)}
      locale={locale}
      viewerName={viewer?.name ?? ''}
      viewerEmail={viewer?.email ?? ''}
      onDone={() => {
        void resource.reload();
        router.replace('/mijn-tickets');
      }}
    />
  );
}

const METHOD_LABEL: Record<AppPaymentMethod, { title: string; hint: string }> = {
  bancontact: { title: 'Bancontact', hint: t('Met de app van je bank of de Bancontact-app', 'With your banking app or the Bancontact app') },
  mollie: { title: 'Mollie', hint: t('Kaart en andere betaalwijzen, ook voor een buitenlandse rekening', 'Card and other payment methods, also for a foreign account') },
  mock: { title: t('Testbetaling', 'Test payment'), hint: t('Enkel op een testserver', 'Only on a test server') },
};

/**
 * Wat er standaard aangeduid staat: Bancontact in het Nederlands, Mollie in het
 * Engels, en anders wat de server eerst zet.
 */
function defaultMethod(methods: AppPaymentMethod[], locale: 'nl' | 'en'): AppPaymentMethod | null {
  const preferred: AppPaymentMethod = locale === 'nl' ? 'bancontact' : 'mollie';
  if (methods.includes(preferred)) return preferred;
  return methods[0] ?? null;
}

function Order({
  event,
  quantities,
  locale,
  viewerName,
  viewerEmail,
  onDone,
}: {
  event: AppTicketEventDetail;
  quantities: Record<string, number>;
  locale: 'nl' | 'en';
  viewerName: string;
  viewerEmail: string;
  onDone: () => void;
}) {
  const methods = useMemo(
    () => (event.paymentMethods ?? []).filter((method) => method in METHOD_LABEL),
    [event.paymentMethods],
  );
  const [buyerName, setBuyerName] = useState(viewerName);
  const [buyerEmail, setBuyerEmail] = useState(viewerEmail);
  const [attendees, setAttendees] = useState<Record<string, string>>({});
  const [answers, setAnswers] = useState<Record<string, Record<string, AnswerValue>>>({});
  const [terms, setTerms] = useState(false);
  const [method, setMethod] = useState<AppPaymentMethod | null>(() => defaultMethod(methods, locale));
  const [busy, setBusy] = useState(false);
  /**
   * Een bestelling die al gemaakt is maar nog niet betaald. Wie het betalen
   * afbrak, betaalt die opnieuw in plaats van een tweede te maken; de checkout
   * zou dat met `TOO_MANY_RESERVATIONS` ook weigeren.
   */
  const [pending, setPending] = useState<{ orderId: string; checkoutUrl: string } | null>(null);
  const [payment, setPayment] = useState<{ url: string; orderId: string; onOrderPage: boolean } | null>(null);
  /** Of de WebView de bestelpagina al verliet (naar Mollie of de Bancontact-QR). */
  const leftOrder = useRef(false);

  /**
   * Eén regel per ticket, met een stabiele sleutel `<typeId>#<index>` die de
   * velden per ticket aan elkaar knoopt. Een type dat intussen niet meer te koop
   * staat, valt weg; de checkout zou het toch weigeren.
   */
  const seats = useMemo(() => {
    const list: { key: string; type: AppTicketType; index: number }[] = [];
    for (const type of event.ticketTypes) {
      for (let index = 0; index < (quantities[type.id] ?? 0); index += 1) {
        list.push({ key: `${type.id}#${index}`, type, index });
      }
    }
    return list;
  }, [event.ticketTypes, quantities]);

  const lines = event.ticketTypes.filter((type) => (quantities[type.id] ?? 0) > 0);
  const totalCents = lines.reduce((sum, type) => sum + (quantities[type.id] ?? 0) * type.priceCents, 0);
  const free = totalCents === 0;

  const missing = seats.find(({ key, type }) => {
    if (!(attendees[key] ?? '').trim()) return true;
    return type.questions.some((question) => {
      if (!question.required) return false;
      const value = answers[key]?.[question.id];
      if (question.type === 'BOOLEAN') return value !== true;
      if (question.type === 'MULTIPLE_CHOICE') return !Array.isArray(value) || value.length === 0;
      return typeof value !== 'string' || value.trim() === '';
    });
  });
  const buyerOk = buyerName.trim().length >= 2 && buyerEmail.includes('@');
  const canSubmit = pending ? !free : seats.length > 0 && !missing && buyerOk && terms;
  const todo = pending
    ? null
    : !seats.length
      ? t('Kies eerst je tickets', 'Choose your tickets first')
      : missing
        ? t('Vul alle namen en verplichte vragen in', 'Fill in all names and required questions')
        : !buyerOk
          ? t('Vul je naam en e-mail in', 'Fill in your name and email')
          : !terms
            ? t('Aanvaard de voorwaarden', 'Accept the terms')
            : null;

  /** Wat er van de bestelling geworden is, gevraagd aan de server en niet geraden. */
  const settle = async (orderId: string) => {
    const status = await fetchOrderStatus(orderId).catch(() => null);
    if (status?.status === 'PAID') {
      onDone();
    } else {
      Alert.alert(
        t('Nog niet betaald', 'Not paid yet'),
        t('We zien nog geen betaling. Je bestelling staat klaar: betaal opnieuw, eventueel met een andere betaalwijze. Betaalde je wel, kijk dan over een minuut bij Mijn tickets.', 'We do not see a payment yet. Your order is ready: pay again, possibly with another payment method. If you did pay, check My tickets in a minute.'),
        [{ text: t('Naar mijn tickets', 'To my tickets'), onPress: onDone }, { text: t('Opnieuw betalen', 'Pay again') }],
      );
    }
  };

  /** De betaling starten met de gekozen betaalwijze, of terugvallen op de bestelpagina. */
  const pay = async (orderId: string, checkoutUrl: string) => {
    if (!method) {
      leftOrder.current = false;
      setPayment({ url: checkoutUrl, orderId, onOrderPage: true });
      return;
    }
    try {
      const started = await startOrderPayment(orderId, method, locale);
      leftOrder.current = true;
      setPayment({ url: started.checkoutUrl, orderId, onOrderPage: false });
    } catch (error) {
      if (error instanceof ApiError && error.code === 'ALREADY_PAID') {
        onDone();
      } else if (error instanceof ApiError && error.code === 'METHOD_UNAVAILABLE') {
        // De server zette die betaalwijze intussen af: kies op de bestelpagina.
        leftOrder.current = false;
        setPayment({ url: checkoutUrl, orderId, onOrderPage: true });
      } else {
        if (error instanceof ApiError && (error.code === 'RESERVATION_EXPIRED' || error.code === 'ORDER_NOT_PAYABLE')) {
          setPending(null);
        }
        Alert.alert(t('Betalen lukte niet', 'Payment failed'), paymentErrorText(error));
      }
    }
  };

  const submit = async () => {
    setBusy(true);
    try {
      if (pending) {
        await pay(pending.orderId, pending.checkoutUrl);
        return;
      }
      const checkout = await startTicketCheckout({
        eventId: event.id,
        buyerName: buyerName.trim(),
        buyerEmail: buyerEmail.trim(),
        locale,
        termsAccepted: true,
        items: seats.map(({ key, type }) => ({
          ticketTypeId: type.id,
          attendeeName: (attendees[key] ?? '').trim(),
          answers: answers[key] ?? {},
        })),
      });
      // Gratis is meteen betaald; dan valt er niets te tonen.
      const status = await fetchOrderStatus(checkout.orderId).catch(() => null);
      if (status?.status === 'PAID') {
        onDone();
        return;
      }
      setPending({ orderId: checkout.orderId, checkoutUrl: checkout.checkoutUrl });
      await pay(checkout.orderId, checkout.checkoutUrl);
    } catch (error) {
      Alert.alert(t('Bestellen lukte niet', 'Ordering failed'), checkoutErrorText(error));
    } finally {
      setBusy(false);
    }
  };

  const closePayment = () => {
    const orderId = payment?.orderId;
    setPayment(null);
    if (orderId) void settle(orderId);
  };

  return (
    <View style={styles.root}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        style={styles.root}
        keyboardDismissMode="on-drag"
        keyboardShouldPersistTaps="handled"
        automaticallyAdjustKeyboardInsets
      >
        <View style={styles.overscroll} />
        <YellowHead title={t('Bestellen', 'Order')} subtitle={event.title} back>
          {/* Je bestelling, in het geel: wat je koopt en wat het kost. */}
          <View style={styles.summary}>
            {lines.map((type) => (
              <View key={type.id} style={styles.line}>
                <Text style={styles.lineText} numberOfLines={2}>
                  {quantities[type.id]} x {type.name}
                </Text>
                <Text style={styles.linePrice}>
                  {type.priceCents === 0 ? t('Gratis', 'Free') : formatEuro((quantities[type.id] ?? 0) * type.priceCents)}
                </Text>
              </View>
            ))}
            {lines.length > 1 ? (
              <>
                <View style={styles.summaryLine} />
                <View style={styles.line}>
                  <Text style={[styles.lineText, styles.total]}>{t('Totaal', 'Total')}</Text>
                  <Text style={[styles.linePrice, styles.total]}>{free ? t('Gratis', 'Free') : formatEuro(totalCents)}</Text>
                </View>
              </>
            ) : null}
          </View>
        </YellowHead>

        <View style={styles.content}>
          {pending ? (
            <Card featured>
              <Text style={styles.body}>
                {t('Je bestelling staat klaar en je tickets blijven even voor je gereserveerd. Kies hoe je betaalt en tik op Betalen.', 'Your order is ready and your tickets stay reserved for you for a while. Choose how you pay and tap Pay.')}
              </Text>
            </Card>
          ) : null}

          <Heading>{t('Wie komt er', 'Who is coming')}</Heading>
          {seats.map(({ key, type, index }) => (
            <Card key={key}>
              <Text style={styles.kicker}>
                Ticket {index + 1}, {type.name}
              </Text>
              <Text style={styles.label}>{t('Naam op het ticket', 'Name on the ticket')}</Text>
              <TextInput
                value={attendees[key] ?? ''}
                onChangeText={(next) => setAttendees((current) => ({ ...current, [key]: next }))}
                style={styles.input}
                editable={!pending}
                autoCapitalize="words"
                accessibilityLabel={t(`Naam voor ticket ${index + 1}, ${type.name}`, `Name for ticket ${index + 1}, ${type.name}`)}
              />
              {type.questions.map((question) => (
                <QuestionField
                  key={question.id}
                  question={question}
                  value={answers[key]?.[question.id]}
                  onChange={(value) =>
                    setAnswers((current) => ({
                      ...current,
                      [key]: { ...(current[key] ?? {}), [question.id]: value },
                    }))
                  }
                />
              ))}
            </Card>
          ))}

          <Heading>{t('Je gegevens', 'Your details')}</Heading>
          <Card>
            <Text style={styles.label}>{t('Naam', 'Name')}</Text>
            <TextInput
              value={buyerName}
              onChangeText={setBuyerName}
              style={styles.input}
              editable={!pending}
              autoCapitalize="words"
              autoComplete="name"
              accessibilityLabel={t('Jouw naam', 'Your name')}
            />
            <Text style={styles.label}>E-mail</Text>
            <TextInput
              value={buyerEmail}
              onChangeText={setBuyerEmail}
              style={styles.input}
              editable={!pending}
              autoCapitalize="none"
              autoComplete="email"
              keyboardType="email-address"
              accessibilityLabel={t('Jouw e-mailadres', 'Your email address')}
            />
            <Text style={styles.hint}>{t('De tickets komen op dit adres toe, en staan daarna ook bij Mijn tickets.', 'The tickets arrive at this address, and are then also in My tickets.')}</Text>
          </Card>

          {!free && methods.length > 1 ? (
            <>
              <Heading>{t('Betalen met', 'Pay with')}</Heading>
              <CardList inset={0}>
                {methods.map((option) => {
                  const selected = option === method;
                  return (
                    <Pressable
                      key={option}
                      accessibilityRole="radio"
                      accessibilityState={{ checked: selected }}
                      accessibilityLabel={`${METHOD_LABEL[option].title}, ${METHOD_LABEL[option].hint}`}
                      onPress={() => setMethod(option)}
                      style={({ pressed }) => [styles.method, pressed && styles.pressed]}
                    >
                      <View style={[styles.radio, selected && styles.radioOn]}>
                        {selected ? <View style={styles.radioDot} /> : null}
                      </View>
                      <View style={styles.flex}>
                        <Text style={styles.methodTitle}>{METHOD_LABEL[option].title}</Text>
                        <Text style={styles.hint}>{METHOD_LABEL[option].hint}</Text>
                      </View>
                    </Pressable>
                  );
                })}
              </CardList>
            </>
          ) : null}

          {pending ? null : (
            <Card>
              <Pressable
                accessibilityRole="checkbox"
                accessibilityState={{ checked: terms }}
                onPress={() => setTerms(!terms)}
                style={styles.terms}
              >
                <View style={[styles.box, terms && styles.boxOn]}>
                  {terms ? <Check color={COLORS.onSelectedAccent} size={16} strokeWidth={3} /> : null}
                </View>
                <Text style={[styles.body, styles.flex]}>{t('Ik ga akkoord met de voorwaarden', 'I agree to the terms')}</Text>
              </Pressable>
              <Text
                style={styles.link}
                accessibilityRole="link"
                onPress={() => void WebBrowser.openBrowserAsync(`${baseUrl()}${event.termsUrl}`)}
              >
                {t('Lees de voorwaarden', 'Read the terms')}
              </Text>
            </Card>
          )}
        </View>
      </ScrollView>

      {/* Betalen: Mollie of de Bancontact-pagina over het hele scherm, in de app. */}
      <Modal visible={payment !== null} animationType="slide" onRequestClose={closePayment}>
        {payment ? (
          <WebFlow
            url={payment.url}
            title={t('Betalen', 'Pay')}
            markAsApp
            isDone={(url) => {
              if (!isOrderPage(url, payment.orderId)) {
                leftOrder.current = true;
                return false;
              }
              // Wie op de bestelpagina begon, kiest daar eerst; wie bij Mollie of
              // Bancontact begon, is klaar zodra hij erop terugkomt.
              return !payment.onOrderPage || leftOrder.current || /[?&]payment=/.test(url);
            }}
            onDone={closePayment}
            onClose={closePayment}
          />
        ) : null}
      </Modal>

      {/* Het totaal en de knop, vast onderaan zoals bij de broodjes. */}
      <View style={styles.bar}>
        <View style={styles.flex}>
          <Text style={styles.barTotal}>
            {seats.length} {seats.length === 1 ? 'ticket' : 'tickets'}, {free ? 'gratis' : formatEuro(totalCents)}
          </Text>
          {todo ? (
            <Text style={styles.hint} numberOfLines={1}>
              {todo}
            </Text>
          ) : !free && method ? (
            <Text style={styles.hint} numberOfLines={1}>
              {t('Je betaalt in de app, met', 'You pay in the app, with')} {METHOD_LABEL[method].title}
            </Text>
          ) : null}
        </View>
        <View style={styles.barButton}>
          <Button
            label={free ? t('Afronden', 'Complete') : t('Betalen', 'Pay')}
            busy={busy}
            disabled={!canSubmit}
            onPress={() => void submit()}
          />
        </View>
      </View>
    </View>
  );
}

/** De kop van een deel, een titel in navy zoals op Home. */
function Heading({ children }: { children: string }) {
  return (
    <Text accessibilityRole="header" style={styles.heading}>
      {children}
    </Text>
  );
}

/**
 * De bestelpagina zelf, niet `/bancontact` eronder. Kom je er terug na Mollie
 * (`?payment=return` of `?payment=cancelled`, de `successUrl`/`cancelUrl` in
 * `lib/ticketing/orders.ts` op de site) of na de Bancontact-QR, dan is het
 * betalen voorbij en sluit het scherm.
 */
function isOrderPage(url: string, orderId: string): boolean {
  return new RegExp(`/tickets/bestelling/${orderId}/?(?:[?#]|$)`).test(url);
}

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
    backgroundColor: COLORS.head,
  },
  content: { paddingHorizontal: SPACING.xl - 4, paddingTop: SPACING.xl - 2, gap: SPACING.md },
  heading: {
    fontFamily: FONTS.bold,
    fontSize: 22,
    letterSpacing: -0.5,
    color: COLORS.strong,
    marginTop: SPACING.sm,
    paddingHorizontal: SPACING.xs,
  },
  pressed: { opacity: 0.85 },

  summary: {
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: SPACING.sm,
    backgroundColor: COLORS.wash,
  },
  summaryLine: { height: StyleSheet.hairlineWidth, backgroundColor: IS_DARK ? COLORS.line2 : 'rgba(14, 26, 54, 0.2)' },
  line: { flexDirection: 'row', alignItems: 'center', gap: SPACING.md, paddingVertical: SPACING.sm },
  lineText: { ...TYPE.body, fontSize: 15, color: COLORS.strong, flex: 1 },
  linePrice: { fontFamily: FONTS.semibold, fontSize: 15, color: COLORS.strong, fontVariant: ['tabular-nums'] },
  total: { fontFamily: FONTS.bold },

  body: { ...TYPE.body, color: COLORS.body },
  hint: { ...TYPE.small, color: COLORS.muted },
  kicker: { fontFamily: FONTS.semibold, fontSize: 13, color: COLORS.muted },
  label: { ...TYPE.body, fontFamily: TYPE.cardTitle.fontFamily, color: COLORS.ink },
  link: { ...TYPE.small, color: COLORS.ink, textDecorationLine: 'underline', alignSelf: 'flex-start' },
  input: {
    ...TYPE.body,
    color: COLORS.ink,
    borderRadius: 12,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.md,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.controlBorder,
  },

  method: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
    paddingHorizontal: SPACING.lg,
    paddingVertical: 14,
    minHeight: 64,
  },
  methodTitle: { ...TYPE.cardTitle, color: COLORS.ink },
  radio: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: COLORS.controlBorder,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioOn: { borderColor: COLORS.selected, backgroundColor: COLORS.selected },
  radioDot: { width: 9, height: 9, borderRadius: 5, backgroundColor: COLORS.onSelectedAccent },

  terms: { flexDirection: 'row', alignItems: 'center', gap: SPACING.md, minHeight: 44 },
  box: {
    width: 26,
    height: 26,
    borderRadius: RADIUS.sm,
    borderWidth: 1.5,
    borderColor: COLORS.controlBorder,
    backgroundColor: COLORS.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  boxOn: { backgroundColor: COLORS.selected, borderColor: COLORS.selected },
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
    marginHorizontal: SPACING.md,
    marginBottom: SPACING.sm,
    paddingLeft: SPACING.lg,
    paddingRight: SPACING.md,
    paddingVertical: SPACING.md,
    borderRadius: 22,
    backgroundColor: COLORS.surface,
    ...CARD_SHADOW,
    shadowOpacity: 0.18,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
    elevation: 6,
  },
  barTotal: { fontFamily: FONTS.semibold, fontSize: 15, color: COLORS.ink, fontVariant: ['tabular-nums'] },
  barButton: { minWidth: 132 },
});
