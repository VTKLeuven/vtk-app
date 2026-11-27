import { Pressable, StyleSheet, Text, View } from 'react-native';

import { COLORS, FONTS, SPACING } from '../theme/tokens';

/**
 * De schaduw van een witte kaart op Home: zacht en laag, zodat de kaart van het
 * papier loskomt zonder een rand. Enkel voor Home; elders blijven het registers.
 */
export const CARD_SHADOW = {
  shadowColor: COLORS.navy,
  shadowOpacity: 0.1,
  shadowRadius: 14,
  shadowOffset: { width: 0, height: 8 },
  elevation: 2,
} as const;

/**
 * Een deel van Home met zijn kop: een korte titel in navy ("Voor jou", "Ook
 * binnenkort") en eventueel een link rechts. Voorstel G.1 van november 2026; tot
 * dan was de kop een klein woord in kapitalen, maar onder het gele vlak verdween
 * dat.
 *
 * `bleed` laat de inhoud tot tegen de rand van het scherm lopen, voor een lijst
 * die je opzij veegt; de kop houdt zijn marge.
 */
export function HomeSection({
  title,
  link,
  bleed = false,
  children,
}: {
  title: string;
  link?: { label: string; accessibilityLabel: string; onPress: () => void };
  bleed?: boolean;
  children: React.ReactNode;
}) {
  return (
    <View style={[styles.section, bleed && styles.bleed]}>
      <View style={[styles.head, bleed && styles.headBleed]}>
        <Text accessibilityRole="header" style={styles.title}>
          {title}
        </Text>
        {link ? (
          <Pressable
            accessibilityRole="link"
            accessibilityLabel={link.accessibilityLabel}
            onPress={link.onPress}
            hitSlop={10}
          >
            <Text style={styles.link}>{link.label}</Text>
          </Pressable>
        ) : null}
      </View>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  section: { marginTop: SPACING.xl + 4, paddingHorizontal: SPACING.lg, gap: SPACING.md },
  bleed: { paddingHorizontal: 0 },
  head: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.xs,
  },
  headBleed: { paddingHorizontal: SPACING.lg + SPACING.xs },
  title: { fontFamily: FONTS.bold, fontSize: 22, letterSpacing: -0.5, color: COLORS.strong },
  link: { fontFamily: FONTS.semibold, fontSize: 14, color: COLORS.strong },
});
