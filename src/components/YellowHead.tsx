import { useRouter } from 'expo-router';
import { ChevronLeft } from 'lucide-react-native';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { COLORS, FONTS, RADIUS, SPACING } from '../theme/tokens';
import { t } from '../i18n';

const SIDE = SPACING.xl - 4;

/**
 * De kop van een tab in de stijl van Home (voorstel G.1, november 2026): een geel
 * vlak met de titel, rechts een ronde navy knop, en de tabbladen als pillen. Navy
 * met gele letters voor wat open staat, een navy waas voor de rest. Kalender en
 * Studies openen ermee.
 *
 * `children` komt onderaan in het geel: wat bij het tabblad hoort (de week van de
 * planning, de voortgang per vak, Lijst of Agenda, wanneer cudi open is).
 */
export function YellowHead<T extends string>({
  title,
  subtitle,
  tabs,
  right,
  back = false,
  children,
}: {
  title: string;
  /** Een regel onder de titel, zoals de code en de studiepunten van een vak. */
  subtitle?: string | null;
  tabs?: {
    value: T;
    /** `badge` is een aantal in een bolletje, zoals de tickets die nog komen. */
    options: { value: T; label: string; badge?: number }[];
    onChange: (next: T) => void;
    /** Eén rij die opzij scrolt in plaats van af te breken, voor veel pillen (de Alma's). */
    scroll?: boolean;
  };
  /** Een `YellowHeadButton`, zoals de bel van Kalender. */
  right?: React.ReactNode;
  /**
   * Een doorklikscherm (een vak): een ronde terugknop links, en de titel op een
   * eigen regel eronder, zodat een lange naam de knoppen niet wegduwt.
   */
  back?: boolean;
  children?: React.ReactNode;
}) {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const showBack = back && router.canGoBack();
  const titleText = (
    <Text accessibilityRole="header" style={[styles.title, back && styles.titleDetail]}>
      {title}
    </Text>
  );
  const pills = tabs?.options.map((option) => {
    const active = option.value === tabs?.value;
    return (
      <Pressable
        key={option.value}
        accessibilityRole="tab"
        accessibilityState={{ selected: active }}
        accessibilityLabel={option.badge ? `${option.label}, ${option.badge}` : undefined}
        onPress={() => tabs?.onChange(option.value)}
        style={({ pressed }) => [
          styles.pill,
          option.badge ? styles.pillWithBadge : null,
          active && styles.pillActive,
          pressed && styles.pressed,
        ]}
      >
        <Text style={[styles.pillLabel, active && styles.pillLabelActive]}>{option.label}</Text>
        {option.badge ? (
          <View style={[styles.badge, active && styles.badgeActive]}>
            <Text style={[styles.badgeLabel, active && styles.badgeLabelActive]}>{option.badge}</Text>
          </View>
        ) : null}
      </Pressable>
    );
  });
  return (
    <View style={[styles.head, { paddingTop: insets.top + SPACING.sm }]}>
      {back ? (
        // De titel naast de terugknop (eind november 2026, zoals Beheer): geen
        // aparte regel meer voor de knop. De regel eronder staat over de volle breedte.
        <>
          <View style={styles.inlineRow}>
            {showBack ? (
              <YellowHeadButton label={t('Terug', 'Back')} onPress={() => router.back()}>
                <ChevronLeft color={COLORS.yellow} size={21} strokeWidth={2.4} />
              </YellowHeadButton>
            ) : null}
            <View style={styles.inlineText}>
              <Text
                accessibilityRole="header"
                numberOfLines={3}
                style={[styles.title, styles.titleInline, title.length > 30 && styles.titleInlineLong]}
              >
                {title}
              </Text>
              {/* Onder de titel, naast de terugknop: links gelijk met de titel. */}
              {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
            </View>
            {right}
          </View>
        </>
      ) : (
        <View style={styles.top}>
          <View style={styles.titleBlock}>
            {titleText}
            {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
          </View>
          {right}
        </View>
      )}
      {tabs ? (
        tabs.scroll ? (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.pillScroll}
            contentContainerStyle={styles.pillRow}
            accessibilityRole="tablist"
          >
            {pills}
          </ScrollView>
        ) : (
          <View style={styles.pills} accessibilityRole="tablist">
            {pills}
          </View>
        )
      ) : null}
      {children}
    </View>
  );
}

/** De ronde navy knop rechts in de gele kop, met het icoon in het geel. */
export function YellowHeadButton({
  label,
  onPress,
  children,
}: {
  label: string;
  onPress: () => void;
  children: React.ReactNode;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      hitSlop={6}
      style={({ pressed }) => [styles.bell, pressed && styles.pressed]}
    >
      {children}
    </Pressable>
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
    backgroundColor: COLORS.head,
    borderBottomLeftRadius: 32,
    borderBottomRightRadius: 32,
  },
  top: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 44,
  },
  title: {
    fontFamily: FONTS.bold,
    fontSize: 34,
    lineHeight: 38,
    letterSpacing: -1.3,
    color: COLORS.headTitle,
  },
  titleDetail: { fontSize: 30, lineHeight: 34, letterSpacing: -1 },
  inlineRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.md, minHeight: 44 },
  inlineText: { flex: 1, gap: 2 },
  titleInline: { fontSize: 26, lineHeight: 30, letterSpacing: -0.8 },
  titleInlineLong: { fontSize: 21, lineHeight: 25, letterSpacing: -0.5 },
  titleBlock: { flexShrink: 1, gap: 4 },
  subtitle: { fontFamily: FONTS.semibold, fontSize: 13, color: COLORS.strong },
  bell: {
    width: 44,
    height: 44,
    borderRadius: RADIUS.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.band,
  },
  pressed: { opacity: 0.7 },
  disabled: { opacity: 0.35 },
  pills: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.sm },
  // Tot tegen de randen van het scherm, zodat je ziet dat er nog meer pillen zijn.
  pillScroll: { flexGrow: 0, marginHorizontal: -SIDE },
  pillRow: { gap: SPACING.sm, paddingHorizontal: SIDE },
  pill: {
    height: 38,
    justifyContent: 'center',
    paddingHorizontal: SPACING.lg,
    borderRadius: RADIUS.pill,
    backgroundColor: COLORS.wash,
  },
  pillWithBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    paddingRight: SPACING.sm,
  },
  pillActive: { backgroundColor: COLORS.selected },
  // Het bolletje draait de kleuren van de pil om: navy op het waas, geel op navy.
  badge: {
    minWidth: 22,
    height: 22,
    paddingHorizontal: 6,
    borderRadius: RADIUS.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.selected,
  },
  badgeActive: { backgroundColor: COLORS.onSelectedAccent },
  badgeLabel: {
    fontFamily: FONTS.bold,
    fontSize: 12,
    color: COLORS.onSelectedAccent,
    fontVariant: ['tabular-nums'],
  },
  badgeLabelActive: { color: COLORS.selected },
  pillLabel: { fontFamily: FONTS.semibold, fontSize: 14, color: COLORS.strong },
  pillLabelActive: { fontFamily: FONTS.bold, color: COLORS.onSelectedAccent },

  segmented: {
    flexDirection: 'row',
    padding: 3,
    borderRadius: RADIUS.pill,
    backgroundColor: COLORS.wash,
  },
  segment: {
    height: 32,
    justifyContent: 'center',
    paddingHorizontal: 14,
    borderRadius: RADIUS.pill,
  },
  segmentActive: { backgroundColor: COLORS.raised },
  segmentLabel: {
    fontFamily: FONTS.semibold,
    fontSize: 13,
    color: COLORS.strong,
  },
  segmentLabelActive: { fontFamily: FONTS.bold },

  round: {
    width: 32,
    height: 32,
    borderRadius: RADIUS.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.wash,
  },
});
