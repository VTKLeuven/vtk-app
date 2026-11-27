import { BookOpen, CheckCheck, CircleX, PackageCheck, TimerOff, Truck } from 'lucide-react-native';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import type { AppCudiOrder, AppCudiOrdering, AppLocale } from '../../api/contract';
import { formatDayShort, formatEuro, formatShortDate, formatTime } from '../../format';
import { COLORS, CUDI_STATUS, FONTS, RADIUS, SPACING, TYPE } from '../../theme/tokens';
import { CARD_SHADOW } from '../HomeSection';
import { Button } from '../ui';

/**
 * Eén bestelling bij de cursusdienst, overal hetzelfde: in het tabblad Cudi en op
 * het scherm met al je bestellingen. Bovenaan een band in de kleur van de stand
 * (groen ligt klaar, amber wacht, blauw is afgehaald, rood is vervallen), per
 * cursus een pil in de kleur van zijn eigen stand, en onderaan het totaal met hoe
 * je betaalt. Tot november 2026 was dit een witte kaart met grijze tekst.
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
  const payOnline = needsOnlinePayment(order, ordering);
  const look = ORDER_LOOK[order.status];
  const Icon = look.icon;
  const payment = order.paidOnline
    ? { label: 'Betaald', tone: TONES.ok }
    : !order.open
      ? null
      : payOnline
        ? { label: 'Nog online te betalen', tone: TONES.waiting }
        : { label: 'Betalen bij het afhalen', tone: TONES.info };

  return (
    <View style={[styles.card, !order.open && styles.cardDone]}>
      <View style={[styles.band, { backgroundColor: look.tone.bg }]}>
        <View style={[styles.badge, { backgroundColor: look.tone.ink }]}>
          <Icon size={17} color={COLORS.surface} />
        </View>
        <View style={styles.flex}>
          <Text style={[styles.title, { color: look.tone.ink }]}>{ORDER_STATUS[order.status]}</Text>
          <Text style={styles.bandMeta}>
            Bestelling #{order.number} · {formatShortDate(order.createdAt, locale, !order.open)}
          </Text>
        </View>
      </View>

      <View style={styles.lines}>
        {order.lines.map((line, index) => {
          const tone = lineTone(line.status);
          return (
            <View key={line.id} style={[styles.line, index > 0 && styles.lineDivider]}>
              <View style={[styles.lineIcon, { backgroundColor: tone.bg }]}>
                <BookOpen size={16} color={tone.ink} />
              </View>
              <View style={styles.flex}>
                <Text style={styles.lineTitle} numberOfLines={2}>
                  {line.quantity > 1 ? `${line.quantity} × ` : ''}
                  {line.title}
                </Text>
                <View style={styles.lineMeta}>
                  {lineStatus(line, locale) ? (
                    <Text style={[styles.chip, { backgroundColor: tone.bg, color: tone.ink }]}>{lineStatus(line, locale)}</Text>
                  ) : null}
                  {line.price > 0 ? <Text style={styles.price}>{euro(line.price * line.quantity)}</Text> : null}
                </View>
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
          );
        })}
      </View>

      <View style={styles.footer}>
        <View style={styles.flex}>
          <Text style={styles.totalLabel}>Totaal</Text>
          <Text style={styles.total}>{euro(order.total)}</Text>
        </View>
        {payment ? (
          <Text style={[styles.chip, styles.chipLarge, { backgroundColor: payment.tone.bg, color: payment.tone.ink }]}>
            {payment.label}
          </Text>
        ) : null}
      </View>
      {payOnline && onPay ? (
        <View style={styles.pay}>
          <Button label="Nu betalen" busy={busy === order.id} onPress={onPay} />
        </View>
      ) : null}
    </View>
  );
}

type Tone = { bg: string; ink: string };

/**
 * De kleuren van een bestelling: dezelfde tinten als elders in de app voor
 * "klaar" (groen), "wachten" (amber), "mis" (rood), en navy voor "afgehandeld"
 * en "te betalen" (tot eind november 2026 het lichtblauw van de planning, dat hier
 * vreemd afstak). Geen nieuwe kleuren; zie `src/theme/tokens.ts`.
 */
export const TONES = {
  ok: { bg: COLORS.okBg, ink: COLORS.okInk },
  waiting: { bg: COLORS.lowBg, ink: COLORS.lowInk },
  info: { bg: COLORS.paper2, ink: COLORS.navy },
  danger: { bg: COLORS.dangerBg, ink: COLORS.dangerInk },
  quiet: { bg: COLORS.paper2, ink: COLORS.muted },
} as const satisfies Record<string, Tone>;

/**
 * De band van een bestelling in de kleur van haar stand, dezelfde als de pil op
 * cudi.vtk.be (`CUDI_STATUS`): groen afgehaald of klaar, blauw online betaald,
 * geel wacht op levering, amber niet op tijd afgehaald, rood geannuleerd.
 */
const ORDER_LOOK: Record<AppCudiOrder['status'], { tone: Tone; icon: typeof BookOpen }> = {
  READY: { tone: CUDI_STATUS.green, icon: PackageCheck },
  ONLINE_PAID: { tone: CUDI_STATUS.blue, icon: PackageCheck },
  PENDING: { tone: CUDI_STATUS.yellow, icon: Truck },
  POS_COMPLETED: { tone: CUDI_STATUS.green, icon: CheckCheck },
  EXPIRED: { tone: CUDI_STATUS.amber, icon: TimerOff },
  CANCELLED: { tone: CUDI_STATUS.red, icon: CircleX },
};

/** Een cursus in een bestelling, in dezelfde kleuren als de band. */
function lineTone(status: string): Tone {
  switch (status) {
    case 'ASSIGNED':
    case 'SOLD':
      return CUDI_STATUS.green;
    case 'BOOKED':
      return CUDI_STATUS.yellow;
    case 'EXPIRED':
      return CUDI_STATUS.amber;
    case 'CANCELLED':
      return CUDI_STATUS.red;
    default:
      return TONES.quiet;
  }
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
  card: { backgroundColor: COLORS.surface, borderRadius: 20, overflow: 'hidden', ...CARD_SHADOW },
  cardDone: { opacity: 0.92 },
  band: { flexDirection: 'row', alignItems: 'center', gap: SPACING.md, paddingHorizontal: SPACING.lg, paddingVertical: SPACING.md },
  badge: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  title: { ...TYPE.cardTitle, flexShrink: 1 },
  bandMeta: { ...TYPE.small, color: COLORS.body, fontVariant: ['tabular-nums'] },
  lines: { paddingHorizontal: SPACING.lg },
  line: { flexDirection: 'row', alignItems: 'center', gap: SPACING.md, paddingVertical: 12 },
  lineDivider: { borderTopWidth: 1, borderTopColor: COLORS.line },
  lineIcon: { width: 34, height: 40, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  lineTitle: { ...TYPE.body, fontFamily: FONTS.medium, color: COLORS.ink },
  lineMeta: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: SPACING.sm, marginTop: 4 },
  chip: {
    fontFamily: FONTS.semibold,
    fontSize: 11.5,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: RADIUS.pill,
    overflow: 'hidden',
  },
  chipLarge: { fontSize: 12.5, paddingHorizontal: 10, paddingVertical: 5 },
  price: { ...TYPE.small, color: COLORS.muted, fontVariant: ['tabular-nums'] },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
    borderTopWidth: 1,
    borderTopColor: COLORS.line,
    backgroundColor: COLORS.paper,
  },
  totalLabel: { ...TYPE.small, color: COLORS.muted },
  total: { fontFamily: FONTS.bold, fontSize: 18, color: COLORS.ink, fontVariant: ['tabular-nums'] },
  pay: { paddingHorizontal: SPACING.lg, paddingBottom: SPACING.lg, backgroundColor: COLORS.paper },
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
