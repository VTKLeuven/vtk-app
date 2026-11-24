import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import type { AppCudiOrder, AppCudiOrdering, AppLocale } from '../../api/contract';
import { formatDayShort, formatEuro, formatShortDate, formatTime } from '../../format';
import { COLORS, FONTS, RADIUS, SPACING, TYPE } from '../../theme/tokens';
import { Button, Card } from '../ui';

/**
 * Eén bestelling bij de cursusdienst, overal hetzelfde: in het tabblad Cudi en op
 * het scherm met al je bestellingen. Wat klaarligt krijgt de gele rail, zoals een
 * uitgelichte kaart op de site; per regel staat of ze klaarligt en tot wanneer.
 *
 * Annuleren en betalen zijn optioneel: het tabblad toont enkel wat nog moet
 * gebeuren, het overzicht laat ook annuleren toe.
 */
export function CudiOrderCard({
  order,
  ordering,
  locale,
  busy,
  onCancel,
  onPay,
}: {
  order: AppCudiOrder;
  ordering: AppCudiOrdering;
  locale: AppLocale;
  /** De id van de regel of bestelling waaraan nu gewerkt wordt. */
  busy?: string | null;
  onCancel?: (line: AppCudiOrder['lines'][number]) => void;
  onPay?: () => void;
}) {
  const ready = order.open && (order.status === 'READY' || order.status === 'ONLINE_PAID');
  const payOnline = needsOnlinePayment(order, ordering);

  return (
    <Card featured={ready}>
      <View style={styles.head}>
        <Text style={styles.title}>{ORDER_STATUS[order.status]}</Text>
        <Text style={styles.meta}>
          #{order.number} · {formatShortDate(order.createdAt, locale, !order.open)}
        </Text>
      </View>

      <View style={styles.lines}>
        {order.lines.map((line) => (
          <View key={line.id} style={styles.line}>
            <View style={styles.flex}>
              <Text style={styles.lineTitle} numberOfLines={2}>
                {line.quantity > 1 ? `${line.quantity} × ` : ''}
                {line.title}
              </Text>
              <Text
                style={[
                  styles.meta,
                  line.status === 'ASSIGNED' && styles.ready,
                  line.status === 'BOOKED' && styles.waiting,
                ]}
              >
                {lineStatus(line, locale)}
              </Text>
            </View>
            {onCancel && line.cancelable ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`${line.title} uit de bestelling halen`}
                disabled={Boolean(busy)}
                onPress={() => onCancel(line)}
                hitSlop={6}
                style={({ pressed }) => [styles.cancel, pressed && styles.pressed]}
              >
                {busy === line.id ? (
                  <ActivityIndicator size="small" color={COLORS.navy} style={styles.cancelBusy} />
                ) : (
                  <Text style={styles.cancelLabel}>Annuleren</Text>
                )}
              </Pressable>
            ) : null}
          </View>
        ))}
      </View>

      <Text style={styles.meta}>
        {order.paidOnline
          ? `Betaald, ${euro(order.total)}`
          : !order.open
            ? euro(order.total)
            : payOnline
              ? `Nog online te betalen: ${euro(order.total)}`
              : `Te betalen bij het afhalen: ${euro(order.total)}`}
      </Text>
      {payOnline && onPay ? <Button label="Nu betalen" busy={busy === order.id} onPress={onPay} /> : null}
    </Card>
  );
}

/** Een open bestelling die cudi enkel online laat betalen, en die nog niet betaald is. */
export function needsOnlinePayment(order: AppCudiOrder, ordering: AppCudiOrdering): boolean {
  return order.open && !order.paidOnline && ordering.paymentMode === 'ONLINE_ONLY' && ordering.onlineCheckout;
}

export const ORDER_STATUS: Record<AppCudiOrder['status'], string> = {
  READY: 'Ligt klaar',
  ONLINE_PAID: 'Betaald, af te halen',
  PENDING: 'Wacht op levering',
  POS_COMPLETED: 'Afgehaald',
  EXPIRED: 'Niet op tijd afgehaald',
  CANCELLED: 'Geannuleerd',
};

export function lineStatus(line: AppCudiOrder['lines'][number], locale: AppLocale): string {
  switch (line.status) {
    case 'ASSIGNED':
      return line.pickupDeadline
        ? `Ligt klaar tot ${formatDayShort(line.pickupDeadline, locale)} ${formatTime(line.pickupDeadline, locale)}`
        : 'Ligt klaar';
    case 'BOOKED':
      return 'Op de wachtlijst';
    case 'SOLD':
      return 'Afgehaald';
    case 'CANCELLED':
      return 'Geannuleerd';
    case 'EXPIRED':
      return 'Vervallen';
    default:
      return '';
  }
}

/** Cudi rekent in euro met decimalen; de app toont geld zoals overal, via `formatEuro`. */
export function euro(amount: number): string {
  return formatEuro(Math.round(amount * 100));
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  pressed: { opacity: 0.6 },
  head: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: SPACING.sm },
  title: { ...TYPE.cardTitle, color: COLORS.ink, flexShrink: 1 },
  meta: { ...TYPE.small, color: COLORS.body },
  ready: { color: COLORS.okInk, fontFamily: FONTS.semibold },
  waiting: { color: COLORS.lowInk },
  lines: { borderTopWidth: 1, borderTopColor: COLORS.line2 },
  line: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.line2,
  },
  lineTitle: { ...TYPE.body, color: COLORS.ink },
  cancel: {
    minHeight: 44,
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: COLORS.line2,
    borderRadius: RADIUS.pill,
    paddingHorizontal: SPACING.md,
  },
  cancelLabel: { ...TYPE.small, fontFamily: FONTS.medium, color: COLORS.ink },
  // Even breed als het woord, zodat de pil niet verspringt terwijl ze werkt.
  cancelBusy: { width: 62 },
});
