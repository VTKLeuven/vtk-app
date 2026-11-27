import { useCallback, useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import type { AppTicketEventDetail } from '../api/contract';
import { formatEuro } from '../format';
import { COLORS, FONTS, RADIUS, SPACING, TYPE } from '../theme/tokens';
import { Stepper } from './Stepper';
import { Button, Card, CardList, Empty } from './ui';

/**
 * Tickets kiezen: de types met een stapper en de balk onderaan met het totaal en
 * "Bestellen". Een eigen component sinds november 2026, omdat het op twee
 * plaatsen staat: op de ticketpagina (`ticket/[slug]`), en op de pagina van het
 * evenement waaraan de verkoop gekoppeld is. Zoals op de site is dat dan één
 * pagina: wie het evenement opent, koopt er meteen zijn ticket.
 *
 * Wat hier beslist wordt, beslist enkel om knoppen uit te schakelen. De
 * voorraad, de limieten per bestelling en of een type nog te koop staat, worden
 * bij het afrekenen opnieuw en bindend gecontroleerd.
 */
export type TicketSelection = {
  quantities: Record<string, number>;
  setQuantity: (typeId: string, next: number) => void;
  totals: { count: number; cents: number };
  /** Een type onder zijn minimum per bestelling; dan kan "Bestellen" nog niet. */
  belowMinimum: AppTicketEventDetail['ticketTypes'][number] | undefined;
};

export function useTicketSelection(event: AppTicketEventDetail | null): TicketSelection {
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const types = useMemo(() => event?.ticketTypes ?? [], [event]);

  const totals = useMemo(() => {
    let count = 0;
    let cents = 0;
    for (const type of types) {
      const quantity = quantities[type.id] ?? 0;
      count += quantity;
      cents += quantity * type.priceCents;
    }
    return { count, cents };
  }, [types, quantities]);

  const setQuantity = useCallback((typeId: string, next: number) => {
    setQuantities((current) => ({ ...current, [typeId]: next }));
  }, []);

  // Het minimum per type, zodat "Bestellen" niet opent op iets dat de checkout weigert.
  const belowMinimum = types.find((type) => {
    const quantity = quantities[type.id] ?? 0;
    return quantity > 0 && (type.minPerOrder ?? 1) > quantity;
  });

  return { quantities, setQuantity, totals, belowMinimum };
}

/** De kop van een deel, een titel in navy zoals op Home. */
export function ShopHeading({ children }: { children: string }) {
  return (
    <Text accessibilityRole="header" style={styles.heading}>
      {children}
    </Text>
  );
}

/** Hoeveel er nog zijn: uitverkocht in grijs, tien of minder in het geel van "bijna op". */
function Availability({ available }: { available: number }) {
  if (available > 10) return null;
  const soldOut = available === 0;
  return (
    <View style={[styles.chip, soldOut ? styles.chipFull : styles.chipLow]}>
      <Text style={[styles.chipLabel, soldOut ? styles.chipLabelFull : styles.chipLabelLow]}>
        {soldOut ? 'uitverkocht' : `nog ${available}`}
      </Text>
    </View>
  );
}

/** "Tickets" met de types en hun stappers, of de vraag om in te loggen. */
export function TicketTypes({
  event,
  selection,
  onNeedsLogin,
}: {
  event: AppTicketEventDetail;
  selection: TicketSelection;
  onNeedsLogin: () => void;
}) {
  if (event.requiresLogin) {
    return (
      <>
        <ShopHeading>Tickets</ShopHeading>
        <Card>
          <Text style={styles.title}>Enkel voor leden</Text>
          <Text style={styles.body}>
            De tickets voor dit event zijn voorbehouden aan leden. Log in met je VTK-account om ze te zien.
          </Text>
          <Button label="Inloggen" onPress={onNeedsLogin} />
        </Card>
      </>
    );
  }

  const { quantities, setQuantity, totals } = selection;

  return (
    <>
      <ShopHeading>Tickets</ShopHeading>
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
        <Empty title="Geen tickets beschikbaar" hint="Er staat op dit moment niets te koop voor dit event." />
      ) : null}

      <CardList>
        {event.ticketTypes.map((type) => {
          const quantity = quantities[type.id] ?? 0;
          const roomInOrder = event.maxTicketsPerOrder - totals.count + quantity;
          const max = Math.max(
            0,
            Math.min(type.available, type.maxPerOrder ?? Number.POSITIVE_INFINITY, roomInOrder),
          );

          return (
            <View key={type.id} style={styles.typeBlock}>
              <View style={styles.typeRow}>
                <View style={styles.typeText}>
                  <Text style={styles.title}>{type.name}</Text>
                  {type.description ? <Text style={styles.hint}>{type.description}</Text> : null}
                  <View style={styles.priceRow}>
                    <Text style={styles.price}>{type.priceCents === 0 ? 'Gratis' : formatEuro(type.priceCents)}</Text>
                    <Availability available={type.available} />
                  </View>
                </View>
                <Stepper
                  value={quantity}
                  max={max}
                  label={type.name}
                  disabled={type.available === 0 || event.maxTicketsPerOrder === 0}
                  onChange={(next) => setQuantity(type.id, next)}
                />
              </View>
              {type.minPerOrder && type.minPerOrder > 1 ? (
                <Text style={styles.hint}>Minstens {type.minPerOrder} per bestelling.</Text>
              ) : null}
            </View>
          );
        })}
      </CardList>
    </>
  );
}

/**
 * Zodra er een ticket gekozen is: het totaal en "Bestellen", vast onderaan. De
 * namen, je gegevens en betalen staan op het volgende scherm.
 */
export function TicketOrderBar({ selection, onOrder }: { selection: TicketSelection; onOrder: () => void }) {
  const { totals, belowMinimum } = selection;
  if (totals.count === 0) return null;
  return (
    <View style={styles.bar}>
      <View style={styles.flex}>
        <Text style={styles.barTotal}>
          {totals.count} {totals.count === 1 ? 'ticket' : 'tickets'}, {totals.cents === 0 ? 'gratis' : formatEuro(totals.cents)}
        </Text>
        {belowMinimum ? (
          <Text style={styles.hint} numberOfLines={1}>
            Minstens {belowMinimum.minPerOrder} x {belowMinimum.name}
          </Text>
        ) : null}
      </View>
      <View style={styles.barButton}>
        <Button label="Bestellen" disabled={Boolean(belowMinimum)} onPress={onOrder} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  heading: {
    fontFamily: FONTS.bold,
    fontSize: 22,
    letterSpacing: -0.5,
    color: COLORS.strong,
    marginTop: SPACING.sm,
    paddingHorizontal: SPACING.xs,
  },
  title: { ...TYPE.cardTitle, color: COLORS.ink },
  body: { ...TYPE.body, color: COLORS.body },
  hint: { ...TYPE.small, color: COLORS.muted },
  typeBlock: { paddingVertical: SPACING.lg, gap: SPACING.sm },
  typeRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.md },
  typeText: { flex: 1, gap: 2 },
  priceRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, marginTop: 2 },
  price: { ...TYPE.small, fontSize: 14, color: COLORS.body, fontVariant: ['tabular-nums'] },
  chip: { height: 22, justifyContent: 'center', paddingHorizontal: SPACING.sm, borderRadius: RADIUS.pill },
  chipLow: { backgroundColor: COLORS.lowBg },
  chipFull: { backgroundColor: COLORS.paper2 },
  chipLabel: { fontFamily: FONTS.semibold, fontSize: 12 },
  chipLabelLow: { color: COLORS.lowInk },
  chipLabelFull: { color: COLORS.body },
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
