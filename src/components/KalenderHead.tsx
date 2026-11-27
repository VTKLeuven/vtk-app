import { Bell } from 'lucide-react-native';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { COLORS, FONTS, RADIUS, SPACING } from '../theme/tokens';

const SIDE = SPACING.xl - 4;

/**
 * De kop van Kalender in de stijl van Home (voorstel G.1, november 2026): een geel
 * vlak met de titel, rechts de bel voor de meldingen, en de tabbladen als pillen.
 * Navy met gele letters voor wat open staat, een navy waas voor de rest.
 *
 * `children` komt onderaan in het geel: wat bij het tabblad hoort (de week van de
 * planning, de voortgang per vak, Lijst of Agenda).
 */
export function KalenderHead<T extends string>({
  tabs,
  onBell,
  children,
}: {
  tabs: { value: T; options: { value: T; label: string }[]; onChange: (next: T) => void };
  /** Zonder login is er geen bel. */
  onBell?: () => void;
  children?: React.ReactNode;
}) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.head, { paddingTop: insets.top + SPACING.sm }]}>
      <View style={styles.top}>
        <Text accessibilityRole="header" style={styles.title}>
          Kalender
        </Text>
        {onBell ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Meldingen instellen"
            onPress={onBell}
            hitSlop={6}
            style={({ pressed }) => [styles.bell, pressed && styles.pressed]}
          >
            <Bell color={COLORS.yellow} size={19} />
          </Pressable>
        ) : null}
      </View>
      <View style={styles.pills} accessibilityRole="tablist">
        {tabs.options.map((option) => {
          const active = option.value === tabs.value;
          return (
            <Pressable
              key={option.value}
              accessibilityRole="tab"
              accessibilityState={{ selected: active }}
              onPress={() => tabs.onChange(option.value)}
              style={({ pressed }) => [styles.pill, active && styles.pillActive, pressed && styles.pressed]}
            >
              <Text style={[styles.pillLabel, active && styles.pillLabelActive]}>{option.label}</Text>
            </Pressable>
          );
        })}
      </View>
      {children}
    </View>
  );
}

/**
 * Een keuze tussen twee of drie weergaven op het geel (Lijst of Agenda): een navy
 * waas met de gekozen weergave in het wit.
 */
export function YellowSegmented<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (next: T) => void;
}) {
  return (
    <View style={styles.segmented} accessibilityRole="tablist">
      {options.map((option) => {
        const active = option.value === value;
        return (
          <Pressable
            key={option.value}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            onPress={() => onChange(option.value)}
            style={[styles.segment, active && styles.segmentActive]}
          >
            <Text style={[styles.segmentLabel, active && styles.segmentLabelActive]}>{option.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/** Een ronde knop op het geel (vorige, volgende), een navy waas met het icoon in navy. */
export function YellowRoundButton({
  label,
  onPress,
  disabled,
  children,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      hitSlop={8}
      style={({ pressed }) => [styles.round, pressed && styles.pressed, disabled && styles.disabled]}
    >
      {children}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  head: {
    paddingHorizontal: SIDE,
    paddingBottom: SIDE,
    gap: SPACING.lg,
    backgroundColor: COLORS.yellow,
    borderBottomLeftRadius: 32,
    borderBottomRightRadius: 32,
  },
  top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 44 },
  title: { fontFamily: FONTS.bold, fontSize: 34, lineHeight: 38, letterSpacing: -1.3, color: COLORS.navy },
  bell: {
    width: 44,
    height: 44,
    borderRadius: RADIUS.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.navy,
  },
  pressed: { opacity: 0.7 },
  disabled: { opacity: 0.35 },
  pills: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.sm },
  pill: {
    height: 38,
    justifyContent: 'center',
    paddingHorizontal: SPACING.lg,
    borderRadius: RADIUS.pill,
    backgroundColor: 'rgba(14, 26, 54, 0.08)',
  },
  pillActive: { backgroundColor: COLORS.navy },
  pillLabel: { fontFamily: FONTS.semibold, fontSize: 14, color: COLORS.navy },
  pillLabelActive: { fontFamily: FONTS.bold, color: COLORS.yellow },

  segmented: {
    flexDirection: 'row',
    padding: 3,
    borderRadius: RADIUS.pill,
    backgroundColor: 'rgba(14, 26, 54, 0.08)',
  },
  segment: { height: 32, justifyContent: 'center', paddingHorizontal: 14, borderRadius: RADIUS.pill },
  segmentActive: { backgroundColor: COLORS.surface },
  segmentLabel: { fontFamily: FONTS.semibold, fontSize: 13, color: COLORS.navy },
  segmentLabelActive: { fontFamily: FONTS.bold },

  round: {
    width: 32,
    height: 32,
    borderRadius: RADIUS.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(14, 26, 54, 0.08)',
  },
});
