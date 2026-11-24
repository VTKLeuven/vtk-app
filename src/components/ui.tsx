import { Children, isValidElement } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

import { COLORS, FONTS, RADIUS, SPACING, TYPE } from '../theme/tokens';
import { CARD_SHADOW } from './HomeSection';

/**
 * De bouwstenen die op elk scherm terugkomen, in de taal van de nieuwe Home
 * (voorstel F1, november 2026): witte kaarten met ronde hoeken en een zachte
 * schaduw op een papieren grond, een zwarte pil als primaire knop, en geel enkel
 * als accent.
 *
 * Geen gradiënten en geen kaart in een kaart.
 */

// ── Kaart ───────────────────────────────────────────────────────────────────

export function Card({
  children,
  style,
  /** Markeert een uitgelichte kaart met een gele rand. */
  featured = false,
}: {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  featured?: boolean;
}) {
  return (
    <View style={[styles.card, featured && styles.cardFeatured, style]}>{children}</View>
  );
}

/**
 * Een aanraakbare kaart. Bewust een lichte indruk bij het indrukken en geen
 * beweging: de site houdt hover ook ingetogen.
 */
export function CardButton({
  children,
  onPress,
  style,
  accessibilityLabel,
}: {
  children: React.ReactNode;
  onPress: () => void;
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      onPress={onPress}
      style={({ pressed }) => [styles.card, pressed && styles.cardPressed, style]}
    >
      {children}
    </Pressable>
  );
}

/**
 * Een lijst als één witte kaart, met een haarlijn tussen de rijen en niet erna.
 * Vervangt sinds de nieuwe Home de registers met haarlijnen op papier. De rijen
 * zelf tekenen geen rand; `inset` is de lucht links en rechts van elke rij, of
 * `0` voor een rij die zelf zijn marge zet (en dan tot tegen de rand oplicht).
 */
export function CardList({
  children,
  inset = SPACING.lg,
  style,
}: {
  children: React.ReactNode;
  inset?: number;
  style?: StyleProp<ViewStyle>;
}) {
  const rows = Children.toArray(children).filter(Boolean);
  if (rows.length === 0) return null;
  return (
    <View style={[styles.cardList, style]}>
      {rows.map((row, index) => (
        <View
          key={isValidElement(row) && row.key != null ? row.key : index}
          style={[{ paddingHorizontal: inset }, index > 0 && styles.cardListDivider]}
        >
          {row}
        </View>
      ))}
    </View>
  );
}

// ── Knoppen ─────────────────────────────────────────────────────────────────

export function Button({
  label,
  onPress,
  variant = 'primary',
  disabled = false,
  busy = false,
  /** Op een donkere band keert de primaire knop om, net als op de site. */
  onDark = false,
}: {
  label: string;
  onPress: () => void;
  /** `accent` is de gele knop, voor de ene hoofdactie op een donker vlak. */
  variant?: 'primary' | 'ghost' | 'accent';
  disabled?: boolean;
  busy?: boolean;
  onDark?: boolean;
}) {
  const inactive = disabled || busy;
  const accent = variant === 'accent';
  const primary = variant === 'primary' || accent;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: inactive, busy }}
      disabled={inactive}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        accent
          ? styles.buttonAccent
          : primary
            ? onDark
              ? styles.buttonPrimaryOnDark
              : styles.buttonPrimary
            : styles.buttonGhost,
        onDark && !primary && styles.buttonGhostOnDark,
        pressed && styles.buttonPressed,
        inactive && styles.buttonDisabled,
      ]}
    >
      {busy ? (
        <ActivityIndicator color={primary && !onDark && !accent ? COLORS.paper : COLORS.ink} size="small" />
      ) : (
        <Text
          style={[
            styles.buttonLabel,
            accent
              ? styles.buttonLabelAccent
              : primary
                ? onDark
                  ? styles.buttonLabelOnDarkPrimary
                  : styles.buttonLabelPrimary
                : styles.buttonLabelGhost,
            onDark && !primary && styles.buttonLabelOnDarkGhost,
          ]}
        >
          {label}
        </Text>
      )}
    </Pressable>
  );
}

// ── Toestanden ──────────────────────────────────────────────────────────────

/**
 * Een leeg scherm zegt wát er leeg is en wat je eraan kan doen. "Geen resultaten"
 * zonder meer is een doodlopende straat.
 */
export function Empty({
  title,
  hint,
  action,
}: {
  title: string;
  hint?: string;
  action?: { label: string; onPress: () => void };
}) {
  return (
    <View style={styles.state}>
      <Text style={styles.stateTitle}>{title}</Text>
      {hint ? <Text style={styles.stateHint}>{hint}</Text> : null}
      {action ? <Button label={action.label} onPress={action.onPress} variant="ghost" /> : null}
    </View>
  );
}

/**
 * Iets ging mis. Onderscheidt bewust "geen verbinding" van "de server zei nee":
 * bij het eerste helpt opnieuw proberen, bij het tweede zelden.
 */
export function ErrorState({
  message,
  onRetry,
}: {
  message: string;
  onRetry?: () => void;
}) {
  return (
    <View style={styles.state}>
      <Text style={styles.stateTitle}>Dat lukte niet</Text>
      <Text style={styles.stateHint}>{message}</Text>
      {onRetry ? <Button label="Opnieuw proberen" onPress={onRetry} variant="ghost" /> : null}
    </View>
  );
}

/**
 * Een spinner in het midden van wat er vrij is, zonder tekst: een app die
 * "Shiften ophalen" schrijft, leest als een website. Het label blijft wel voor
 * VoiceOver en TalkBack, die anders enkel "bezig" zeggen.
 */
export function Loading({ label = 'Bezig met laden' }: { label?: string }) {
  return (
    <View style={styles.loading} accessible accessibilityRole="progressbar" accessibilityLabel={label}>
      <ActivityIndicator size="large" color={COLORS.navy} />
    </View>
  );
}

/**
 * De strook boven een scherm dat uit de cache komt. Verzwijgen dat je oude
 * inhoud toont is erger dan een leeg scherm: iemand plant er zijn avond mee.
 */
export function StaleNotice({ onRetry }: { onRetry: () => void }) {
  return (
    <Pressable accessibilityRole="button" onPress={onRetry} style={styles.stale}>
      <Text style={styles.staleText}>
        Niet vernieuwd. Je ziet wat er de vorige keer opgehaald is. Tik om opnieuw te proberen.
      </Text>
    </Pressable>
  );
}

/**
 * De kop van een deel van een scherm: een klein woord in kapitalen, gedempt, met
 * eventueel een link rechts ("Kalender"). Zoals de koppen op Home; tot november
 * 2026 was dit een titel met de gele lijn eronder, zoals een h2 op de site.
 */
export function SectionHeading({
  children,
  right,
}: {
  children: string;
  /** Een link of actie rechts op dezelfde hoogte, zoals "Kalender". */
  right?: React.ReactNode;
}) {
  return (
    <View style={styles.headingRow}>
      <Text accessibilityRole="header" style={styles.headingText}>
        {children.toUpperCase()}
      </Text>
      {right ?? null}
    </View>
  );
}

/**
 * De kop van een week in een agenda, zoals op /shift: een haarlijn erboven, de
 * naam ("Deze week") en het bereik ernaast.
 */
export function WeekHead({ name, range }: { name: string; range: string }) {
  return (
    <View style={styles.week}>
      <Text style={styles.weekName}>{name}</Text>
      <Text style={styles.weekRange}>{range}</Text>
    </View>
  );
}

/** Een link in een `MarginRegister`. */
export type RegisterLink = {
  label: string;
  hint?: string;
  /** Opent een andere site; krijgt een pijl en zegt dat tegen de screenreader. */
  external?: boolean;
  onPress: () => void;
};

/**
 * Het register in de marge van de site: een kleine kop in kapitalen, een haarlijn
 * links, gedempte links met lucht ertussen. Voor wat je opzoekt of wat elders
 * staat, niet voor de hoofdzaak van een scherm. Meer gebruikt het voor zijn
 * snelkoppelingen, Studies voor wat op cudi of Burgieclan zelf blijft.
 */
export function MarginRegister({
  title,
  links,
  style,
}: {
  title?: string | null;
  links: RegisterLink[];
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View style={[styles.register, style]}>
      {title ? <Text style={styles.registerTitle}>{title}</Text> : null}
      <View style={styles.registerLine}>
        {links.map((link) => (
          <Pressable
            key={link.label}
            accessibilityRole={link.external ? 'link' : 'button'}
            accessibilityLabel={link.external ? `${link.label}, opent een browser` : link.label}
            onPress={link.onPress}
            hitSlop={4}
            style={({ pressed }) => [styles.registerRow, pressed && styles.registerPressed]}
          >
            <Text style={styles.registerLabel}>{link.label}</Text>
            {link.hint || link.external ? (
              <Text style={styles.registerHint} numberOfLines={1}>
                {link.hint ?? ''}
                {link.external ? ' ↗' : ''}
              </Text>
            ) : null}
          </Pressable>
        ))}
      </View>
    </View>
  );
}

/**
 * Een fout die blijft staan tot ze opgelost is, op de plek waar ze over gaat:
 * de rode rail van de site. Voor een actie die mislukte terwijl je onderaan een
 * lijst stond, hoort een `Alert`: die zie je, waar je ook gescrold bent.
 */
export function InlineError({ children }: { children: string }) {
  return (
    <View style={styles.inlineError} accessibilityRole="alert">
      <Text style={styles.inlineErrorText}>{children}</Text>
    </View>
  );
}

export function SectionTitle({ children }: { children: string }) {
  return <Text style={styles.sectionTitle}>{children}</Text>;
}

const styles = StyleSheet.create({
  headingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: SPACING.md,
    minHeight: 24,
  },
  headingText: {
    flexShrink: 1,
    fontFamily: FONTS.semibold,
    fontSize: 11,
    letterSpacing: 1.4,
    color: COLORS.muted,
  },
  week: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: SPACING.sm,
    paddingTop: SPACING.md,
    borderTopWidth: 1,
    borderTopColor: COLORS.line2,
  },
  weekName: { ...TYPE.cardTitle, fontSize: 17, color: COLORS.ink },
  weekRange: { ...TYPE.small, color: COLORS.muted },
  card: {
    backgroundColor: COLORS.surface,
    borderRadius: 20,
    padding: SPACING.lg,
    gap: SPACING.sm,
    ...CARD_SHADOW,
  },
  cardFeatured: { borderWidth: 2, borderColor: COLORS.yellow },
  cardList: { backgroundColor: COLORS.surface, borderRadius: 20, ...CARD_SHADOW },
  cardListDivider: { borderTopWidth: 1, borderTopColor: COLORS.line },
  cardPressed: { opacity: 0.85 },

  button: {
    minHeight: 48,
    paddingHorizontal: SPACING.xl,
    borderRadius: RADIUS.pill,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  buttonPrimary: { backgroundColor: COLORS.ink, borderColor: COLORS.ink },
  buttonPrimaryOnDark: { backgroundColor: COLORS.surface, borderColor: COLORS.surface },
  buttonAccent: { backgroundColor: COLORS.yellow, borderColor: COLORS.yellow },
  buttonLabelAccent: { color: COLORS.ink, fontFamily: FONTS.bold },
  buttonGhost: { backgroundColor: COLORS.surface, borderColor: COLORS.controlBorder },
  buttonGhostOnDark: { borderColor: 'rgba(255,255,255,0.28)' },
  buttonPressed: { opacity: 0.85 },
  buttonDisabled: { opacity: 0.45 },
  buttonLabel: { ...TYPE.body, fontFamily: TYPE.cardTitle.fontFamily },
  buttonLabelPrimary: { color: COLORS.paper },
  buttonLabelOnDarkPrimary: { color: COLORS.ink },
  buttonLabelGhost: { color: COLORS.ink },
  buttonLabelOnDarkGhost: { color: COLORS.onDark },

  state: { padding: SPACING.xl, gap: SPACING.md, alignItems: 'flex-start' },
  loading: {
    flex: 1,
    minHeight: 160,
    alignItems: 'center',
    justifyContent: 'center',
    padding: SPACING.xl,
  },
  stateTitle: { ...TYPE.cardTitle, color: COLORS.ink },
  stateHint: { ...TYPE.body, color: COLORS.muted },

  stale: {
    marginHorizontal: SPACING.lg,
    marginTop: SPACING.sm,
    backgroundColor: COLORS.lowBg,
    borderRadius: 14,
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.sm + 2,
  },
  staleText: { ...TYPE.small, color: COLORS.body },

  sectionTitle: { ...TYPE.sectionTitle, color: COLORS.ink },

  register: { gap: SPACING.sm },
  registerTitle: {
    fontFamily: FONTS.bold,
    fontSize: 11.5,
    letterSpacing: 1.1,
    textTransform: 'uppercase',
    color: COLORS.ink,
  },
  // De lijn in de marge is geel: het accent van een register.
  registerLine: { borderLeftWidth: 2, borderLeftColor: COLORS.yellow, paddingLeft: 14 },
  registerRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: SPACING.sm,
    minHeight: 36,
    paddingVertical: 7,
  },
  registerPressed: { opacity: 0.6 },
  registerLabel: { ...TYPE.body, color: COLORS.body },
  registerHint: { ...TYPE.small, fontSize: 12.5, color: COLORS.muted, flexShrink: 1 },

  inlineError: {
    backgroundColor: COLORS.dangerBg,
    borderLeftWidth: 3,
    borderLeftColor: COLORS.dangerLine,
    borderRadius: RADIUS.sm,
    padding: SPACING.md,
  },
  inlineErrorText: { ...TYPE.small, color: COLORS.dangerInk },
});
