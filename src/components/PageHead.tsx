import { useRouter } from 'expo-router';
import { ChevronLeft } from 'lucide-react-native';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { COLORS, FONTS, RADIUS, SPACING, TYPE } from '../theme/tokens';
import { CARD_SHADOW } from './HomeSection';
import { PatternBand } from './PatternBand';

export type HeadTab<T extends string> = {
  value: T;
  label: string;
  badge?: number;
  /**
   * Een gedempt getal achter het label, zoals het aantal foto's in een deel van
   * een album. Geen `badge`: die is geel en vraagt aandacht, dit is enkel info.
   */
  count?: number;
};

/**
 * De paginakop: de titel van een scherm op papier, met eventueel een terugknop,
 * een kleine regel erboven, een ondertitel, een actie rechts en tabbladen.
 *
 * Tot november 2026 was dit `.vtk-page-head` van de site: full-bleed navy met het
 * technische patroon en een gele onderlijn van 5 px. Sinds voorstel F1 (de nieuwe
 * Home) is de app licht: de titel staat op de grond van het scherm, knoppen zijn
 * witte ronde vlakjes met een zachte schaduw, en de tabbladen zijn pillen, zwart
 * voor wat open staat en wit voor de rest. **Bouw geen tweede soort
 * schermopener**; Home is de enige uitzondering (`HomeHero`).
 *
 * **De terugknop hoort hier en nergens anders.** De schermen draaien met
 * `headerShown: false`, dus er is geen systeemkop die er een tekent. Zonder deze
 * knop kwam je op iOS nergens meer weg zodra je één keer doorklikte. Hij staat
 * boven de titel en verschijnt enkel wanneer er iets is om naar terug te keren;
 * een tabscherm zet `back={false}`.
 *
 * **`compact`** is voor een scherm dat zijn hoogte zelf nodig heeft, zoals de
 * planning onder Kalender: een kleinere titel, geen ondertitel en minder lucht.
 *
 * Wat in `right` of `children` staat, staat op papier: geen `onDark`-kleuren meer.
 * Voor een ronde knop rechts is er `HeadButton`.
 *
 * **`navy`** tekent nog de oude kop (navy, patroon, gele lijn). Enkel voor de
 * transportplanning, die bewust de telefoonweergave van logistiek.vtk.be volgt
 * en daarom in het oude ontwerp blijft.
 */
/**
 * Vanaf deze lengte is de titel een naam en geen kop: een vak ("Elektrische
 * aandrijvingen; aanvullingen elektrische machines") of een lang evenement. Op 32
 * pt liep zo'n naam over drie regels en duwde hij de inhoud van het scherm weg.
 */
const LONG_TITLE = 30;

export function PageHead<T extends string = string>({
  title,
  subtitle,
  kicker,
  right,
  back = true,
  backLabel = 'Terug',
  tabs,
  compact = false,
  navy = false,
  children,
}: {
  title: string;
  subtitle?: string | null;
  /** Een korte regel boven de titel, zoals de datum op Home. */
  kicker?: string | null;
  /** Een enkele actie rechts van de titel, bv. een zoekknop. */
  right?: React.ReactNode;
  back?: boolean;
  /** Wat er naast het pijltje staat; standaard "Terug". */
  backLabel?: string;
  tabs?: { options: HeadTab<T>[]; value: T; onChange: (next: T) => void; scroll?: boolean };
  /** Een lagere kop; zie hierboven. */
  compact?: boolean;
  /** De oude navy kop; enkel voor de transportplanning, zie hierboven. */
  navy?: boolean;
  /** Extra inhoud onderaan de kop, op papier. */
  children?: React.ReactNode;
}) {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const showBack = back && router.canGoBack();

  return (
    <View
      style={[
        styles.head,
        compact && styles.headCompact,
        navy && dark.head,
        { paddingTop: insets.top + (compact ? SPACING.xs : SPACING.sm) },
      ]}
    >
      {navy ? <PatternBand offset={[-240, -120]} /> : null}
      {showBack && navy ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={backLabel}
          onPress={() => router.back()}
          hitSlop={12}
          style={({ pressed }) => [dark.back, pressed && styles.pressed]}
        >
          <ChevronLeft color={COLORS.onDarkMuted} size={18} />
          <Text style={dark.backLabel}>{backLabel}</Text>
        </Pressable>
      ) : showBack ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={backLabel}
          onPress={() => router.back()}
          hitSlop={8}
          style={({ pressed }) => [
            styles.back,
            backLabel !== 'Terug' && styles.backWithLabel,
            pressed && styles.pressed,
          ]}
        >
          <ChevronLeft color={COLORS.ink} size={20} />
          {backLabel !== 'Terug' ? <Text style={styles.backLabel}>{backLabel}</Text> : null}
        </Pressable>
      ) : compact ? null : (
        <View style={styles.noBack} />
      )}

      <View style={[styles.row, compact && styles.rowCompact]}>
        <View style={styles.text}>
          {kicker && !compact ? <Text style={[styles.kicker, navy && dark.muted]}>{kicker}</Text> : null}
          <Text
            accessibilityRole="header"
            style={[
              styles.title,
              !compact && title.length > LONG_TITLE && styles.titleLong,
              compact && styles.titleCompact,
              navy && dark.title,
            ]}
          >
            {title}
          </Text>
          {subtitle && !compact ? <Text style={[styles.subtitle, navy && dark.muted]}>{subtitle}</Text> : null}
        </View>
        {right ? <View style={[styles.right, compact && styles.rightCompact]}>{right}</View> : null}
      </View>

      {tabs ? (
        tabs.scroll ? (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={[styles.tabsScroll, compact && styles.tabsCompact]}
            contentContainerStyle={styles.tabsScrollContent}
          >
            {tabs.options.map((option) => (
              <TabPill
                key={option.value}
                option={option}
                active={option.value === tabs.value}
                onPress={() => tabs.onChange(option.value)}
              />
            ))}
          </ScrollView>
        ) : (
          <View style={[styles.tabs, compact && styles.tabsCompact]}>
            {tabs.options.map((option) => (
              <TabPill
                key={option.value}
                option={option}
                active={option.value === tabs.value}
                onPress={() => tabs.onChange(option.value)}
              />
            ))}
          </View>
        )
      ) : null}

      {children}
    </View>
  );
}

/**
 * Een ronde knop voor `right` in de kop: wit, met de zachte schaduw van de kaarten
 * op Home en een icoon in inkt. Altijd met een `accessibilityLabel`, want er staat
 * geen tekst in.
 */
export function HeadButton({
  accessibilityLabel,
  onPress,
  children,
  disabled = false,
  selected,
}: {
  accessibilityLabel: string;
  onPress: () => void;
  children: React.ReactNode;
  disabled?: boolean;
  /** Voor een knop die aan of uit staat, zoals een ster. */
  selected?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled, selected }}
      disabled={disabled}
      onPress={onPress}
      hitSlop={4}
      style={({ pressed }) => [styles.headButton, pressed && styles.pressed, disabled && styles.disabled]}
    >
      {children}
    </Pressable>
  );
}

function TabPill<T extends string>({
  option,
  active,
  onPress,
}: {
  option: HeadTab<T>;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="tab"
      accessibilityState={{ selected: active }}
      accessibilityLabel={option.count === undefined ? option.label : `${option.label}, ${option.count}`}
      onPress={onPress}
      style={({ pressed }) => [styles.tab, active && styles.tabActive, pressed && styles.pressed]}
    >
      <Text style={[styles.tabLabel, active && styles.tabLabelActive]}>{option.label}</Text>
      {option.count !== undefined ? (
        <Text style={[styles.tabCount, active && styles.tabCountActive]}>{option.count}</Text>
      ) : null}
      {option.badge ? (
        <View style={styles.badge}>
          <Text style={styles.badgeText}>{option.badge}</Text>
        </View>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  head: {
    backgroundColor: COLORS.paper,
    paddingHorizontal: SPACING.xl - 4,
    paddingBottom: SPACING.md,
  },
  headCompact: { paddingBottom: SPACING.sm },
  back: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    alignSelf: 'flex-start',
    width: 40,
    height: 40,
    marginBottom: SPACING.md,
    borderRadius: RADIUS.pill,
    backgroundColor: COLORS.surface,
    ...CARD_SHADOW,
  },
  backWithLabel: { width: undefined, paddingLeft: 8, paddingRight: 14 },
  backLabel: { fontFamily: FONTS.semibold, fontSize: 14, color: COLORS.ink },
  noBack: { height: SPACING.lg },
  pressed: { opacity: 0.6 },
  disabled: { opacity: 0.4 },
  row: { flexDirection: 'row', alignItems: 'flex-end', gap: SPACING.md },
  text: { flex: 1, gap: 6 },
  rowCompact: { alignItems: 'center' },
  right: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, paddingBottom: 2 },
  rightCompact: { paddingBottom: 0 },
  kicker: { ...TYPE.small, fontSize: 14, color: COLORS.muted },
  title: { fontFamily: FONTS.bold, fontSize: 32, lineHeight: 36, letterSpacing: -1.1, color: COLORS.ink },
  titleCompact: { fontSize: 24, lineHeight: 28, letterSpacing: -0.7 },
  titleLong: { fontSize: 24, lineHeight: 28, letterSpacing: -0.6 },
  subtitle: { ...TYPE.body, color: COLORS.muted },
  tabs: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.sm, marginTop: SPACING.lg },
  tabsCompact: { marginTop: SPACING.md },
  // Tot tegen de rand van het scherm, zodat de laatste pil zichtbaar doorloopt.
  tabsScroll: { marginTop: SPACING.lg, marginHorizontal: -(SPACING.xl - 4) },
  tabsScrollContent: { gap: SPACING.sm, paddingHorizontal: SPACING.xl - 4, paddingBottom: 6 },
  tab: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    minHeight: 40,
    paddingHorizontal: 16,
    borderRadius: RADIUS.pill,
    backgroundColor: COLORS.surface,
    ...CARD_SHADOW,
  },
  tabActive: { backgroundColor: COLORS.ink },
  tabLabel: { fontFamily: FONTS.semibold, fontSize: 14, color: COLORS.ink },
  tabLabelActive: { color: COLORS.paper, fontFamily: FONTS.bold },
  tabCount: { fontFamily: FONTS.medium, fontSize: 13, color: COLORS.muted },
  tabCountActive: { color: COLORS.onDarkMuted },
  badge: {
    minWidth: 22,
    height: 22,
    paddingHorizontal: 6,
    borderRadius: RADIUS.pill,
    backgroundColor: COLORS.yellow,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: { fontFamily: FONTS.bold, fontSize: 12, color: COLORS.ink },
  headButton: {
    width: 44,
    height: 44,
    borderRadius: RADIUS.pill,
    backgroundColor: COLORS.surface,
    alignItems: 'center',
    justifyContent: 'center',
    ...CARD_SHADOW,
  },
});

/** De oude navy kop, enkel nog voor `navy` (de transportplanning). */
const dark = StyleSheet.create({
  head: {
    backgroundColor: COLORS.navy,
    paddingBottom: SPACING.xl,
    overflow: 'hidden',
    borderBottomWidth: 5,
    borderBottomColor: COLORS.yellow,
  },
  back: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    alignSelf: 'flex-start',
    marginLeft: -SPACING.xs,
    marginBottom: SPACING.md,
    paddingVertical: SPACING.xs,
    paddingRight: SPACING.sm,
  },
  backLabel: { ...TYPE.small, color: COLORS.onDarkMuted },
  title: { color: COLORS.onDark },
  muted: { color: COLORS.onDarkMuted },
});
