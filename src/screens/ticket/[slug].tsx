import { Clock, MapPin } from 'lucide-react-native';
import { useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import type { AppTicketEventDetail } from '../../api/contract';
import { fetchTicketEvent } from '../../api/endpoints';
import { messageFor, useResource } from '../../api/useResource';
import { DatePin } from '../../components/DatePin';
import { PageHead, PhotoHead } from '../../components/PageHead';
import { Prose } from '../../components/Prose';
import { Stepper } from '../../components/Stepper';
import { Button, Card, Empty, ErrorState, Loading, SectionHeading } from '../../components/ui';
import { formatEventWhen, formatEuro } from '../../format';
import { useApp } from '../../state/app';
import { useTabRouter } from '../../navigation';
import { encodeQuantities } from '../../ticketOrder';
import { COLORS, FONTS, SPACING, TYPE } from '../../theme/tokens';

/**
 * Tickets kopen, stap één: welke tickets en hoeveel.
 *
 * Zodra er iets gekozen is, staat onderaan een zwevende balk met het totaal en
 * "Bestellen". Die opent `ticket-bestellen/[slug]`, waar je de namen en je
 * gegevens invult en betaalt. Tot november 2026 stond dat formulier onderaan
 * deze pagina, onder de uitleg, en zag niemand dat het er was.
 *
 * Wat het scherm zelf beslist, beslist het enkel om knoppen uit te schakelen. De
 * voorraad, de limieten per bestelling en de vraag of een type nog te koop staat,
 * worden bij het afrekenen opnieuw en bindend gecontroleerd.
 */
export default function TicketShopScreen() {
  const router = useTabRouter();
  const { locale } = useApp();
  const { slug } = useLocalSearchParams<{ slug: string }>();

  const resource = useResource(
    `ticket:${slug}`,
    () => fetchTicketEvent(locale, slug),
    `${locale}:${slug}`,
  );

  if (resource.loading) return <Loading />;
  if (!resource.data) {
    return (
      <ErrorState message={messageFor(resource.error)} onRetry={() => void resource.refresh()} />
    );
  }

  return (
    <Shop
      event={resource.data}
      locale={locale}
      onNeedsLogin={() => router.push('/inloggen')}
      onOrder={(quantities) =>
        router.push({
          pathname: `/ticket-bestellen/${slug}`,
          params: { aantallen: encodeQuantities(quantities) },
        })
      }
    />
  );
}

function Shop({
  event,
  locale,
  onNeedsLogin,
  onOrder,
}: {
  event: AppTicketEventDetail;
  locale: 'nl' | 'en';
  onNeedsLogin: () => void;
  onOrder: (quantities: Record<string, number>) => void;
}) {
  const [quantities, setQuantities] = useState<Record<string, number>>({});

  const totals = useMemo(() => {
    let count = 0;
    let cents = 0;
    for (const type of event.ticketTypes) {
      const quantity = quantities[type.id] ?? 0;
      count += quantity;
      cents += quantity * type.priceCents;
    }
    return { count, cents };
  }, [event.ticketTypes, quantities]);

  if (event.requiresLogin) {
    return (
      <>
        <PageHead title={event.title} subtitle={event.ownerGroupName} />
        <ScrollView contentContainerStyle={styles.content} style={styles.root}>
          <Card>
            <Text style={styles.title}>Enkel voor leden</Text>
            <Text style={styles.body}>
              De tickets voor dit event zijn voorbehouden aan leden. Log in met je VTK-account om
              ze te zien.
            </Text>
            <Button label="Inloggen" onPress={onNeedsLogin} />
          </Card>
        </ScrollView>
      </>
    );
  }

  // Het minimum per type, zodat "Bestellen" niet opent op iets dat de checkout weigert.
  const belowMinimum = event.ticketTypes.find((type) => {
    const quantity = quantities[type.id] ?? 0;
    return quantity > 0 && (type.minPerOrder ?? 1) > quantity;
  });

  return (
    <View style={styles.root}>
      {event.imageUrl ? null : <PageHead title={event.title} subtitle={event.ownerGroupName} />}
      <ScrollView contentContainerStyle={styles.content} style={styles.root}>
        {event.imageUrl ? (
          // De banner van /tickets over de volle breedte, met de gele datumpin.
          <View style={styles.bleed}>
            <PhotoHead
              image={{ uri: event.imageUrl }}
              title={event.title}
              subtitle={event.ownerGroupName}
              pin={<DatePin iso={event.startsAt} locale={locale} shadow />}
            />
          </View>
        ) : null}

        <View style={styles.facts}>
          <View style={styles.fact}>
            <Clock color={COLORS.muted} size={16} />
            <Text style={styles.factText}>{formatEventWhen(event.startsAt, event.endsAt, false, locale)}</Text>
          </View>
          {event.location ? (
            <View style={styles.fact}>
              <MapPin color={COLORS.muted} size={16} />
              <Text style={styles.factText}>{event.location}</Text>
            </View>
          ) : null}
        </View>

        {/* Eerst de tickets en dan de uitleg: wie hier komt, wil kopen. */}
        {event.ticketTypes.length > 0 ? <SectionHeading>Tickets</SectionHeading> : null}
        {event.honoraryOneTicket ? (
          <Card featured>
            <Text style={styles.body}>
              {event.honoraryOneTicket.used
                ? 'Als erelid koop je voor dit event één ticket, en dat heb je al.'
                : 'Als erelid koop je voor dit event één ticket.'}
            </Text>
          </Card>
        ) : null}

        {event.ticketTypes.length === 0 ? (
          <Empty
            title="Geen tickets beschikbaar"
            hint="Er staat op dit moment niets te koop voor dit event."
          />
        ) : null}

        {event.ticketTypes.map((type) => {
          const quantity = quantities[type.id] ?? 0;
          const roomInOrder = event.maxTicketsPerOrder - totals.count + quantity;
          const max = Math.max(
            0,
            Math.min(type.available, type.maxPerOrder ?? Number.POSITIVE_INFINITY, roomInOrder),
          );

          return (
            <Card key={type.id}>
              <View style={styles.typeRow}>
                <View style={styles.typeText}>
                  <Text style={styles.title}>{type.name}</Text>
                  {type.description ? <Text style={styles.hint}>{type.description}</Text> : null}
                  <Text style={styles.price}>
                    {type.priceCents === 0 ? 'Gratis' : formatEuro(type.priceCents)}
                    {type.available === 0 ? '   uitverkocht' : `   nog ${type.available}`}
                  </Text>
                </View>
                <Stepper
                  value={quantity}
                  max={max}
                  label={type.name}
                  disabled={type.available === 0 || event.maxTicketsPerOrder === 0}
                  onChange={(next) =>
                    setQuantities((current) => ({ ...current, [type.id]: next }))
                  }
                />
              </View>
              {type.minPerOrder && type.minPerOrder > 1 ? (
                <Text style={styles.hint}>Minstens {type.minPerOrder} per bestelling.</Text>
              ) : null}
            </Card>
          );
        })}

        {event.description ? (
          <>
            <SectionHeading>Over dit event</SectionHeading>
            <Card>
              <Prose>{event.description}</Prose>
            </Card>
          </>
        ) : null}
      </ScrollView>

      {/* Zodra er een ticket gekozen is: het totaal en "Bestellen", vast onderaan.
          De namen, je gegevens en betalen staan op het volgende scherm. */}
      {totals.count > 0 ? (
        <View style={styles.bar}>
          <View style={styles.flex}>
            <Text style={styles.barTotal}>
              {totals.count} {totals.count === 1 ? 'ticket' : 'tickets'},{' '}
              {totals.cents === 0 ? 'gratis' : formatEuro(totals.cents)}
            </Text>
            {belowMinimum ? (
              <Text style={styles.hint} numberOfLines={1}>
                Minstens {belowMinimum.minPerOrder} x {belowMinimum.name}
              </Text>
            ) : null}
          </View>
          <View style={styles.barButton}>
            <Button
              label="Bestellen"
              disabled={Boolean(belowMinimum)}
              onPress={() => onOrder(quantities)}
            />
          </View>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.paper },
  flex: { flex: 1 },
  content: { padding: SPACING.lg, gap: SPACING.md, paddingBottom: SPACING.xxl },
  // De kop met de foto loopt tot tegen de randen, buiten de marge van de inhoud.
  bleed: { marginHorizontal: -SPACING.lg, marginTop: -SPACING.lg },
  facts: { gap: SPACING.sm, paddingHorizontal: SPACING.xs },
  fact: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm },
  factText: { ...TYPE.body, color: COLORS.body, flexShrink: 1 },
  title: { ...TYPE.cardTitle, color: COLORS.ink },
  body: { ...TYPE.body, color: COLORS.body },
  hint: { ...TYPE.small, color: COLORS.muted },
  price: { ...TYPE.small, color: COLORS.body, marginTop: 2 },
  typeRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.md },
  typeText: { flex: 1, gap: 2 },
  // Het totaal en de knop, zwevend boven de tabbalk zoals bij de broodjes.
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
