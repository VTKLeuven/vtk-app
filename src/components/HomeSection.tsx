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
 * Een kop op Home: een klein woord in kapitalen ("JE VOLGENDE LESSEN") en
 * eventueel een link rechts. Bewust stiller dan `SectionHeading`: op Home dragen
 * de foto's en de kaarten het scherm, en een gele lijn onder elke kop deed daar
 * te veel.
 */
export function HomeSection({
  title,
  link,
  children,
}: {
  title: string;
  link?: { label: string; accessibilityLabel: string; onPress: () => void };
  children: React.ReactNode;
}) {
  return (
    <View style={styles.section}>
      <View style={styles.head}>
        <Text accessibilityRole="header" style={styles.title}>
          {title.toUpperCase()}
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
  section: { marginTop: SPACING.xl + 2, paddingHorizontal: SPACING.lg, gap: SPACING.md },
  head: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.xs,
  },
  title: { fontFamily: FONTS.semibold, fontSize: 11, letterSpacing: 1.4, color: COLORS.muted },
  link: { fontFamily: FONTS.semibold, fontSize: 14, color: COLORS.navy },
});
