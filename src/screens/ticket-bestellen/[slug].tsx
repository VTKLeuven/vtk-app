import * as WebBrowser from 'expo-web-browser';
import { useLocalSearchParams } from 'expo-router';
import { Check } from 'lucide-react-native';
import { useMemo, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { baseUrl } from '../../api/client';
import type { AppTicketEventDetail, AppTicketType } from '../../api/contract';
import { fetchOrderStatus, fetchTicketEvent, startTicketCheckout } from '../../api/endpoints';
import { messageFor, useResource } from '../../api/useResource';
import { PageHead } from '../../components/PageHead';
import { QuestionField, type AnswerValue } from '../../components/QuestionField';
import { Button, Card, CardList, ErrorState, Loading, SectionHeading } from '../../components/ui';
import { formatEuro } from '../../format';
import { useApp } from '../../state/app';
import { useTabRouter } from '../../navigation';
import { checkoutErrorText, decodeQuantities } from '../../ticketOrder';
import { COLORS, FONTS, RADIUS, SPACING, TYPE } from '../../theme/tokens';

/**
 * De tweede stap van tickets kopen: wie er komt, je gegevens en de voorwaarden.
 *
 * De ticketpagina kiest enkel de aantallen en stuurt ze hierheen
 * (`?aantallen=type:2`). Zo is er geen formulier dat onderaan een lange pagina
 * wacht zonder dat je het ziet; hier staat het vooraan, met "Betalen" vast
 * onderaan.
 *
 * **Betalen gebeurt in de browser**, want dat is Mollie, en dat willen we niet
 * nabouwen: bankapps, Bancontact en 3D Secure horen in een echte browser. Na het
 * sluiten van die browser vragen we de server wat er van de bestelling geworden
 * is; we gokken niet op basis van of iemand terugkwam. Voorraad, limieten en of
 * een type nog te koop staat, controleert de checkout bindend.
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
  const [buyerName, setBuyerName] = useState(viewerName);
  const [buyerEmail, setBuyerEmail] = useState(viewerEmail);
  const [attendees, setAttendees] = useState<Record<string, string>>({});
  const [answers, setAnswers] = useState<Record<string, Record<string, AnswerValue>>>({});
  const [terms, setTerms] = useState(false);
  const [busy, setBusy] = useState(false);

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
  const canSubmit = seats.length > 0 && !missing && buyerOk && terms;
  const todo = !seats.length
    ? 'Kies eerst je tickets'
    : missing
      ? 'Vul alle namen en verplichte vragen in'
      : !buyerOk
        ? 'Vul je naam en e-mail in'
        : !terms
          ? 'Aanvaard de voorwaarden'
          : null;

  const submit = async () => {
    setBusy(true);
    try {
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

      await WebBrowser.openBrowserAsync(checkout.checkoutUrl);

      // De browser sluiten zegt niets over de betaling; de server weet het wel.
      const status = await fetchOrderStatus(checkout.orderId).catch(() => null);
      if (status?.status === 'PAID') {
        onDone();
      } else {
        Alert.alert(
          'Bestelling nog niet bevestigd',
          'We zien nog geen betaling. Duurt dat langer dan een minuut, kijk dan bij Mijn tickets of in je mail.',
          [{ text: 'Naar mijn tickets', onPress: onDone }, { text: 'Hier blijven' }],
        );
      }
    } catch (error) {
      Alert.alert('Bestellen lukte niet', checkoutErrorText(error));
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.root}>
      <PageHead title="Bestellen" subtitle={event.title} />
      <ScrollView
        contentContainerStyle={styles.content}
        style={styles.root}
        keyboardDismissMode="on-drag"
        keyboardShouldPersistTaps="handled"
        automaticallyAdjustKeyboardInsets
      >
        <SectionHeading>Je bestelling</SectionHeading>
        <CardList>
          {lines.map((type) => (
            <View key={type.id} style={styles.line}>
              <Text style={styles.lineText} numberOfLines={2}>
                {quantities[type.id]} x {type.name}
              </Text>
              <Text style={styles.linePrice}>
                {type.priceCents === 0 ? 'Gratis' : formatEuro((quantities[type.id] ?? 0) * type.priceCents)}
              </Text>
            </View>
          ))}
        </CardList>

        <SectionHeading>Wie komt er?</SectionHeading>
        {seats.map(({ key, type, index }) => (
          <Card key={key}>
            <Text style={styles.kicker}>
              {type.name.toUpperCase()}   TICKET {index + 1}
            </Text>
            <Text style={styles.label}>Naam</Text>
            <TextInput
              value={attendees[key] ?? ''}
              onChangeText={(next) => setAttendees((current) => ({ ...current, [key]: next }))}
              style={styles.input}
              autoCapitalize="words"
              accessibilityLabel={`Naam voor ticket ${index + 1}, ${type.name}`}
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

        <SectionHeading>Jouw gegevens</SectionHeading>
        <Card>
          <Text style={styles.label}>Naam</Text>
          <TextInput
            value={buyerName}
            onChangeText={setBuyerName}
            style={styles.input}
            autoCapitalize="words"
            autoComplete="name"
            accessibilityLabel="Jouw naam"
          />
          <Text style={styles.label}>E-mail</Text>
          <TextInput
            value={buyerEmail}
            onChangeText={setBuyerEmail}
            style={styles.input}
            autoCapitalize="none"
            autoComplete="email"
            keyboardType="email-address"
            accessibilityLabel="Jouw e-mailadres"
          />
          <Text style={styles.hint}>De tickets komen op dit adres toe, en staan daarna ook bij Mijn tickets.</Text>
        </Card>

        <Card>
          <Pressable
            accessibilityRole="checkbox"
            accessibilityState={{ checked: terms }}
            onPress={() => setTerms(!terms)}
            style={styles.terms}
          >
            <View style={[styles.box, terms && styles.boxOn]}>
              {terms ? <Check color={COLORS.ink} size={16} strokeWidth={3} /> : null}
            </View>
            <Text style={[styles.body, styles.flex]}>Ik ga akkoord met de voorwaarden</Text>
          </Pressable>
          <Text
            style={styles.link}
            accessibilityRole="link"
            onPress={() => void WebBrowser.openBrowserAsync(`${baseUrl()}${event.termsUrl}`)}
          >
            Lees de voorwaarden
          </Text>
        </Card>
      </ScrollView>

      {/* Het totaal en de knop, vast onderaan zoals bij de broodjes. */}
      <View style={styles.bar}>
        <View style={styles.flex}>
          <Text style={styles.barTotal}>
            {seats.length} {seats.length === 1 ? 'ticket' : 'tickets'}, {totalCents === 0 ? 'gratis' : formatEuro(totalCents)}
          </Text>
          {todo ? <Text style={styles.hint} numberOfLines={1}>{todo}</Text> : null}
        </View>
        <View style={styles.barButton}>
          <Button
            label={totalCents === 0 ? 'Afronden' : 'Betalen'}
            busy={busy}
            disabled={!canSubmit}
            onPress={() => void submit()}
          />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.paper },
  flex: { flex: 1 },
  content: { padding: SPACING.lg, gap: SPACING.md, paddingBottom: SPACING.xxl },
  line: { flexDirection: 'row', alignItems: 'center', gap: SPACING.md, paddingVertical: SPACING.md },
  lineText: { ...TYPE.body, color: COLORS.ink, flex: 1 },
  linePrice: { fontFamily: FONTS.semibold, fontSize: 15, color: COLORS.ink, fontVariant: ['tabular-nums'] },
  body: { ...TYPE.body, color: COLORS.body },
  hint: { ...TYPE.small, color: COLORS.muted },
  kicker: { ...TYPE.kicker, color: COLORS.muted },
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
  boxOn: { backgroundColor: COLORS.yellow, borderColor: COLORS.yellow },
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
    shadowColor: COLORS.navy,
    shadowOpacity: 0.18,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
    elevation: 6,
  },
  barTotal: { fontFamily: FONTS.semibold, fontSize: 15, color: COLORS.ink, fontVariant: ['tabular-nums'] },
  barButton: { minWidth: 132 },
});
