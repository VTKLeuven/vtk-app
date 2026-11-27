import { type ImageSource } from 'expo-image';
import { useFocusEffect, useRouter } from 'expo-router';
import { setStatusBarStyle } from 'expo-status-bar';
import { ChevronLeft } from 'lucide-react-native';
import { useCallback } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { COLORS, FONTS, RADIUS, SPACING } from '../theme/tokens';
import type { AppImageCrop } from '../api/contract';
import { CroppedPhoto } from './CroppedPhoto';
import { CARD_SHADOW } from './HomeSection';

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
 * technische patroon en een gele onderlijn van 5 px. Daarna even een lichte kop
 * op papier (voorstel F1). **Sinds eind november 2026 is elke kop geel**, zoals
 * Home, Kalender en de tabs (`YellowHead`): een geel vlak met een afgeronde
 * onderkant, de titel in navy, een navy terugknop met een geel pijltje, en de
 * tabbladen als pillen (navy met geel voor wat open staat, een navy waas voor de
 * rest). Een knop rechts (`HeadButton`) blijft een wit rondje. Zo kreeg elk
 * scherm de gele kop zonder dat elk scherm herschreven moest worden.
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
 * Wat in `right` of `children` staat, staat op het geel: navy en wit lezen
 * daar, grijs niet. Voor een ronde knop rechts is er `HeadButton`.
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
  inline = false,
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
  /**
   * De kleinste kop: de terugknop en de titel op één regel, zonder regel erboven
   * of eronder. Voor een scherm dat elke pixel nodig heeft, zoals Beheer.
   */
  inline?: boolean;
  /** Extra inhoud onderaan de kop, op papier. */
  children?: React.ReactNode;
}) {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const showBack = back && router.canGoBack();
  useStatusBar('dark');

  if (inline) {
    return (
      <View style={[styles.head, styles.headInline, { paddingTop: insets.top + SPACING.xs }]}>
        <View style={styles.inlineRow}>
          {showBack ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={backLabel}
              onPress={() => router.back()}
              hitSlop={8}
              style={({ pressed }) => [styles.back, styles.backInline, pressed && styles.pressed]}
            >
              <ChevronLeft color={COLORS.yellow} size={21} strokeWidth={2.4} />
            </Pressable>
          ) : null}
          <Text accessibilityRole="header" numberOfLines={1} style={[styles.title, styles.titleInline]}>
            {title}
          </Text>
          {right ? <View style={styles.right}>{right}</View> : null}
        </View>
        {children ? <View style={styles.inlineChildren}>{children}</View> : null}
      </View>
    );
  }

  return (
    <View
      style={[
        styles.head,
        compact && styles.headCompact,
        { paddingTop: insets.top + (compact ? SPACING.xs : SPACING.sm) },
      ]}
    >
      {showBack ? (
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
          <ChevronLeft color={COLORS.yellow} size={21} strokeWidth={2.4} />
          {backLabel !== 'Terug' ? <Text style={styles.backLabel}>{backLabel}</Text> : null}
        </Pressable>
      ) : compact ? null : (
        <View style={styles.noBack} />
      )}

      <View style={[styles.row, compact && styles.rowCompact]}>
        <View style={styles.text}>
          {kicker && !compact ? <Text style={styles.kicker}>{kicker}</Text> : null}
          <Text
            accessibilityRole="header"
            style={[
              styles.title,
              !compact && title.length > LONG_TITLE && styles.titleLong,
              compact && styles.titleCompact,
            ]}
          >
            {title}
          </Text>
          {subtitle && !compact ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
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
 * De statusbalk volgt de kop van het scherm dat in beeld is: donker op papier,
 * licht op een foto of op navy. Elk scherm zet hem zelf wanneer het in beeld komt,
 * zodat terugkeren naar een scherm met een foto hem weer licht maakt.
 */
export function useStatusBar(style: 'light' | 'dark') {
  useFocusEffect(
    useCallback(() => {
      setStatusBarStyle(style);
    }, [style]),
  );
}

/**
 * Een kop met een foto over de volle breedte, zoals op Home: de foto bovenaan,
 * de terugknop erop, en de titel op papier dat met ronde hoeken over de foto
 * schuift. Voor een scherm dat een eigen beeld heeft: een evenement met zijn
 * affiche, een ticket, de broodjes met het Theokot. Zonder beeld hoort het
 * gewone `PageHead`.
 */
export function PhotoHead({
  image,
  title,
  kicker,
  subtitle,
  pin,
  back = true,
  backLabel = 'Terug',
  height = 260,
  crop,
  children,
}: {
  image: ImageSource | number;
  /** De uitsnede van een eventfoto; zonder snijdt de foto rond het midden. */
  crop?: AppImageCrop | null;
  title: string;
  kicker?: string | null;
  subtitle?: string | null;
  /** Iets dat op de rand van foto en papier hangt, zoals een `DatePin`. */
  pin?: React.ReactNode;
  back?: boolean;
  backLabel?: string;
  height?: number;
  children?: React.ReactNode;
}) {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const showBack = back && router.canGoBack();
  useStatusBar('light');

  return (
    <View>
      <View style={[photo.frame, { height: height + insets.top }]}>
        {/* Een foto uit de app zelf staat er meteen; enkel een foto van het net vloeit in. */}
        <CroppedPhoto source={image} crop={crop} kind="hero" />
        {showBack ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={backLabel}
            onPress={() => router.back()}
            hitSlop={8}
            style={({ pressed }) => [photo.back, { top: insets.top + SPACING.sm }, pressed && styles.pressed]}
          >
            <ChevronLeft color={COLORS.yellow} size={21} strokeWidth={2.4} />
          </Pressable>
        ) : null}
      </View>
      <View style={photo.sheet}>
        {pin ? <View style={photo.pin}>{pin}</View> : null}
        {kicker ? <Text style={[styles.kicker, pin ? photo.besidePin : null]}>{kicker}</Text> : null}
        <Text
          accessibilityRole="header"
          style={[styles.title, title.length > LONG_TITLE && styles.titleLong, !kicker && pin ? photo.besidePin : null]}
        >
          {title}
        </Text>
        {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
        {children}
      </View>
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
        <View style={[styles.badge, active && styles.badgeActive]}>
          <Text style={[styles.badgeText, active && styles.badgeTextActive]}>{option.badge}</Text>
        </View>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  head: {
    backgroundColor: COLORS.yellow,
    paddingHorizontal: SPACING.xl - 4,
    paddingBottom: SPACING.xl - 4,
    borderBottomLeftRadius: 32,
    borderBottomRightRadius: 32,
  },
  headCompact: { paddingBottom: SPACING.md },
  headInline: { paddingBottom: SPACING.md, borderBottomLeftRadius: 26, borderBottomRightRadius: 26 },
  inlineRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.md, minHeight: 44 },
  inlineChildren: { marginTop: SPACING.md },
  backInline: { marginBottom: 0 },
  titleInline: { flex: 1, fontSize: 26, lineHeight: 30, letterSpacing: -0.8 },
  back: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    alignSelf: 'flex-start',
    width: 44,
    height: 44,
    marginBottom: SPACING.md,
    borderRadius: RADIUS.pill,
    backgroundColor: COLORS.navy,
  },
  backWithLabel: { width: undefined, paddingLeft: 10, paddingRight: 16 },
  backLabel: { fontFamily: FONTS.bold, fontSize: 14, color: COLORS.yellow },
  noBack: { height: SPACING.lg },
  pressed: { opacity: 0.6 },
  disabled: { opacity: 0.4 },
  row: { flexDirection: 'row', alignItems: 'flex-end', gap: SPACING.md },
  text: { flex: 1, gap: 6 },
  rowCompact: { alignItems: 'center' },
  right: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, paddingBottom: 2 },
  rightCompact: { paddingBottom: 0 },
  kicker: { fontFamily: FONTS.semibold, fontSize: 13, color: COLORS.navy },
  title: { fontFamily: FONTS.bold, fontSize: 32, lineHeight: 36, letterSpacing: -1.1, color: COLORS.navy },
  titleCompact: { fontSize: 24, lineHeight: 28, letterSpacing: -0.7 },
  titleLong: { fontSize: 24, lineHeight: 28, letterSpacing: -0.6 },
  subtitle: { fontFamily: FONTS.semibold, fontSize: 14, lineHeight: 20, color: COLORS.navy },
  tabs: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.sm, marginTop: SPACING.lg },
  tabsCompact: { marginTop: SPACING.md },
  // Tot tegen de rand van het scherm, zodat de laatste pil zichtbaar doorloopt.
  // Lucht boven en onder in de strook zelf, met een negatieve marge eromheen: anders
  // knipt de rand van de strook de schaduw van de pillen af tot een grijze band.
  tabsScroll: { flexGrow: 0, marginTop: SPACING.lg - 12, marginBottom: -12, marginHorizontal: -(SPACING.xl - 4) },
  tabsScrollContent: { gap: SPACING.sm, paddingHorizontal: SPACING.xl - 4, paddingVertical: 12 },
  tab: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    minHeight: 38,
    paddingHorizontal: 16,
    borderRadius: RADIUS.pill,
    backgroundColor: 'rgba(14, 26, 54, 0.08)',
  },
  tabActive: { backgroundColor: COLORS.navy },
  tabLabel: { fontFamily: FONTS.semibold, fontSize: 14, color: COLORS.navy },
  tabLabelActive: { color: COLORS.yellow, fontFamily: FONTS.bold },
  tabCount: { fontFamily: FONTS.medium, fontSize: 13, color: COLORS.navy, opacity: 0.6 },
  tabCountActive: { color: COLORS.yellow, opacity: 0.8 },
  badge: {
    minWidth: 22,
    height: 22,
    paddingHorizontal: 6,
    borderRadius: RADIUS.pill,
    backgroundColor: COLORS.navy,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeActive: { backgroundColor: COLORS.yellow },
  badgeText: { fontFamily: FONTS.bold, fontSize: 12, color: COLORS.yellow },
  badgeTextActive: { color: COLORS.navy },
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

const photo = StyleSheet.create({
  frame: { backgroundColor: COLORS.navy, overflow: 'hidden' },
  back: {
    position: 'absolute',
    left: SPACING.lg,
    width: 44,
    height: 44,
    borderRadius: RADIUS.pill,
    backgroundColor: 'rgba(255,255,255,0.92)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sheet: {
    marginTop: -30,
    paddingTop: SPACING.xl - 2,
    paddingHorizontal: SPACING.xl - 4,
    paddingBottom: SPACING.md,
    gap: 6,
    backgroundColor: COLORS.paper,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
  },
  pin: { position: 'absolute', right: SPACING.xl - 4, top: -30 },
  // Naast de pin blijft er plaats vrij, zodat de tekst er niet onder loopt.
  besidePin: { paddingRight: 72 },
});
