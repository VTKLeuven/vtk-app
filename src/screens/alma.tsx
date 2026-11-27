import { Image } from 'expo-image';
import { useLocalSearchParams, useNavigation, useRouter } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  FlatList,
  Linking,
  PanResponder,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
  type ScrollViewInstance,
} from 'react-native';

import type { AppAlma, AppAlmaDish, AppAlmaRestaurant } from '../api/contract';
import { fetchAlma } from '../api/endpoints';
import { messageFor, useResource, type Resource } from '../api/useResource';
import { almaClock, almaPrice, almaStatusLine } from '../alma';
import { YellowHead } from '../components/YellowHead';
import { PhotoViewer, type ViewerPhoto } from '../components/PhotoViewer';
import { CardList, Empty, ErrorState, Loading, MarginRegister, SectionHeading, StaleNotice } from '../components/ui';
import { useApp } from '../state/app';
import { COLORS, FONTS, RADIUS, SPACING, TYPE } from '../theme/tokens';

type Slug = AppAlmaRestaurant['slug'];

const SLUGS: Slug[] = ['alma-3', 'alma-quadrivium', 'de-moete', 'esat2', 'alma-1', 'alma-2', 'alma-gasthuisberg'];

/** Zoveel dagen staan er in de rij om te kiezen; Alma zet soms tot twee maanden online. */
const SHOWN_DAYS = 10;
/** Zo ver moet je over de kop naar rechts vegen om terug te gaan. */
const BACK_SWIPE_PX = 80;

/** Zoveel gerechten toont een lange sectie (drank, broodjes) voor "Toon alle". */
const FOLD = 5;

const DIET: Record<NonNullable<AppAlmaDish['diet']>, string | null> = {
  vegan: 'Vegan',
  vegetarian: 'Vegetarisch',
  meat: null,
};

/**
 * De Alma's: de vier op campus Arenberg, Alma 1 en 2 in het centrum en
 * Gasthuisberg. Per restaurant het menu van een dag en de uren van de week, zoals
 * op de pagina van dat restaurant op alma.be. Een tik op een gerecht toont de
 * foto in het groot. Home toont enkel de vier van Arenberg (`AlmaToday`).
 *
 * Sinds eind november 2026 met de gele kop (voorstel 4): het restaurant kies je
 * met de pillen in het geel, de dag met de vierkantjes eronder, en elke dag opent
 * met de openingsuren van de hele week. De prijs is die voor studenten en
 * personeel van KU Leuven; de twee andere staan op alma.be. De gegevens komen van vtk.be, dat alma.be leest (`lib/alma/` op de
 * site); de app praat zelf niet met Alma.
 */
export default function AlmaScreen() {
  const { locale } = useApp();
  const router = useRouter();
  const navigation = useNavigation();
  const { width } = useWindowDimensions();
  const params = useLocalSearchParams<{ restaurant?: string }>();
  const [slug, setSlug] = useState<Slug>(
    SLUGS.includes(params.restaurant as Slug) ? (params.restaurant as Slug) : 'alma-3',
  );
  // Vandaag: de status, de pillen, de dagen met een menu en het menu van vandaag.
  const base = useResource('alma', () => fetchAlma(locale, undefined, true), `${locale}:alle:`);
  const data = base.data;
  const restaurant = data?.restaurants.find((candidate) => candidate.slug === slug) ?? null;

  // De pagina's: vandaag en de dagen met een menu, zoals de rij met dagen ze toont.
  const pages = useMemo(
    () =>
      data
        ? [...new Set([data.date, ...data.dates])]
            .filter((date) => date >= data.date)
            .sort()
            .slice(0, SHOWN_DAYS)
        : [],
    [data],
  );
  const [index, setIndex] = useState(0);
  const pager = useRef<FlatList<string>>(null);
  const goTo = (next: number) => {
    if (next < 0 || next >= pages.length) return;
    pager.current?.scrollToIndex({ index: next, animated: true });
    setIndex(next);
  };

  // Opzij vegen over de dagen bladert, dus de iOS-veeg terug staat hier uit: die
  // nam een veeg naar rechts over en bracht je terug naar Home. Terug kan met de
  // knop, of door naar rechts te vegen over de kop (titel en pillen).
  useLayoutEffect(() => {
    navigation.setOptions({ gestureEnabled: false });
  }, [navigation]);
  const [backSwipe] = useState(() =>
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, gesture) => gesture.dx > 16 && Math.abs(gesture.dx) > Math.abs(gesture.dy) * 2,
      onPanResponderRelease: (_, gesture) => {
        if (gesture.dx > BACK_SWIPE_PX && router.canGoBack()) router.back();
      },
    }),
  );

  const head = (
    <View {...backSwipe.panHandlers}>
      <YellowHead
        title="Alma"
        subtitle={restaurant ? almaStatusLine(restaurant) : null}
        back
        tabs={{
          value: slug,
          onChange: setSlug,
          scroll: true,
          options: (data?.restaurants ?? []).map((candidate) => ({
            value: candidate.slug,
            label: candidate.shortName,
          })),
        }}
      >
        {data ? (
          <DaySquares
            from={data.date}
            pages={pages}
            selected={pages[index] ?? data.date}
            onSelect={(date) => goTo(pages.indexOf(date))}
          />
        ) : null}
      </YellowHead>
    </View>
  );

  if (base.loading && !data) {
    return (
      <View style={styles.root}>
        {head}
        <Loading />
      </View>
    );
  }
  if (!data || !restaurant) {
    return (
      <View style={styles.root}>
        {head}
        <ErrorState message={messageFor(base.error)} onRetry={() => void base.refresh()} />
      </View>
    );
  }

  return (
    <View style={styles.root}>
      {head}
      {base.stale ? <StaleNotice onRetry={() => void base.refresh()} /> : null}

      {/* Eén pagina per dag. De pagina volgt je vinger, dus halverwege zie je de
          helft van beide dagen; loslaten schuift door naar de dag waar je het
          meest naartoe trok. */}
      <FlatList
        ref={pager}
        style={styles.pager}
        data={pages}
        keyExtractor={(date) => date}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        getItemLayout={(_, at) => ({ length: width, offset: width * at, index: at })}
        initialNumToRender={2}
        windowSize={3}
        onMomentumScrollEnd={(event) => setIndex(Math.round(event.nativeEvent.contentOffset.x / width))}
        renderItem={({ item }) => (
          <DayPage date={item} width={width} slug={slug} today={item === data.date ? base : null} />
        )}
      />
    </View>
  );
}

/**
 * Eén dag: het menu van het gekozen restaurant, de uren en de links. Een andere
 * dag dan vandaag haalt zijn eigen menu op (met de leescache per dag).
 */
function DayPage({
  date,
  width,
  slug,
  today,
}: {
  date: string;
  width: number;
  slug: Slug;
  /** De gegevens van vandaag, al opgehaald; `null` voor een andere dag. */
  today: Resource<AppAlma> | null;
}) {
  const { locale } = useApp();
  const own = useResource('alma', () => fetchAlma(locale, date, true), `${locale}:alle:${date}`, today === null);
  const resource = today ?? own;
  const restaurant = resource.data?.restaurants.find((candidate) => candidate.slug === slug) ?? null;

  return (
    <ScrollView
      style={{ width }}
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl refreshing={resource.refreshing} onRefresh={() => void resource.refresh()} tintColor={COLORS.navy} />
      }
    >
      {resource.loading && !resource.data ? (
        <Loading />
      ) : !restaurant ? (
        <ErrorState message={messageFor(resource.error)} onRetry={() => void resource.refresh()} />
      ) : (
        <>
          <WeekHours restaurant={restaurant} selected={date} />
          <Text accessibilityRole="header" style={styles.dayHeading}>
            {dayHeading(date)}
          </Text>
          <Menu restaurant={restaurant} date={date} key={`${restaurant.slug}:${date}`} />
          <MarginRegister
            title="Meer"
            style={styles.register}
            links={[
              ...(restaurant.location
                ? [
                    {
                      label: 'Route',
                      hint: restaurant.address ?? undefined,
                      external: true,
                      onPress: () =>
                        void Linking.openURL(
                          `https://www.google.com/maps/dir/?api=1&destination=${restaurant.location!.lat},${restaurant.location!.lng}&travelmode=walking`,
                        ),
                    },
                  ]
                : []),
              {
                label: 'Op alma.be',
                hint: 'Allergenen en alle prijzen',
                external: true,
                onPress: () => void WebBrowser.openBrowserAsync(restaurant.url),
              },
            ]}
          />
        </>
      )}
    </ScrollView>
  );
}

/** "2026-11-27" van vandaag in Brussel. */
function todayKey(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Brussels' }).format(new Date());
}

function addDays(date: string, days: number): string {
  const next = new Date(`${date}T12:00:00Z`);
  next.setUTCDate(next.getUTCDate() + days);
  return next.toISOString().slice(0, 10);
}

/** "Vandaag", "Morgen", of "Maandag 30 november". */
function dayHeading(date: string): string {
  const today = todayKey();
  if (date === today) return 'Vandaag';
  if (date === addDays(today, 1)) return 'Morgen';
  const label = new Intl.DateTimeFormat('nl-BE', {
    timeZone: 'UTC',
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  }).format(new Date(`${date}T12:00:00Z`));
  return label.charAt(0).toUpperCase() + label.slice(1);
}

/**
 * De dagen als vierkantjes in het geel, zoals de week op Home (voorstel 4,
 * november 2026): elke dag van vandaag tot de laatste dag met een menu, en een
 * dag zonder menu (het weekend) gedempt en niet aan te tikken.
 */
function DaySquares({
  from,
  pages,
  selected,
  onSelect,
}: {
  from: string;
  pages: string[];
  selected: string;
  onSelect: (date: string) => void;
}) {
  const strip = useRef<ScrollViewInstance>(null);
  const offsets = useRef<Record<string, number>>({});
  // Na een veeg over het menu: de gekozen dag in beeld houden.
  useEffect(() => {
    const x = offsets.current[selected];
    if (x !== undefined) strip.current?.scrollTo({ x: Math.max(0, x - SPACING.xl), animated: true });
  }, [selected]);

  const last = pages[pages.length - 1] ?? from;
  const days: string[] = [];
  for (let day = from; day <= last && days.length < 21; day = addDays(day, 1)) days.push(day);
  const withMenu = new Set(pages);
  const format = (options: Intl.DateTimeFormatOptions) =>
    new Intl.DateTimeFormat('nl-BE', { timeZone: 'UTC', ...options });
  const weekday = format({ weekday: 'short' });
  const dayOfMonth = format({ day: 'numeric' });
  const full = format({ weekday: 'long', day: 'numeric', month: 'long' });

  return (
    <ScrollView
      ref={strip}
      horizontal
      showsHorizontalScrollIndicator={false}
      style={styles.squaresStrip}
      contentContainerStyle={styles.squares}
    >
      {days.map((date) => {
        const noon = new Date(`${date}T12:00:00Z`);
        const active = date === selected;
        const open = withMenu.has(date);
        return (
          <Pressable
            key={date}
            onLayout={(event) => {
              offsets.current[date] = event.nativeEvent.layout.x;
            }}
            accessibilityRole="button"
            accessibilityLabel={open ? full.format(noon) : `${full.format(noon)}, geen menu`}
            accessibilityState={{ selected: active, disabled: !open }}
            disabled={!open}
            onPress={() => onSelect(date)}
            style={({ pressed }) => [
              styles.square,
              !open && styles.squareOff,
              active && styles.squareActive,
              pressed && styles.pressed,
            ]}
          >
            <Text style={[styles.squareWeekday, active && styles.squareTextActive]}>
              {weekday.format(noon).replace('.', '')}
            </Text>
            <Text style={[styles.squareDay, active && styles.squareTextActive]}>{dayOfMonth.format(noon)}</Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

function Menu({ restaurant, date }: { restaurant: AppAlmaRestaurant; date: string }) {
  const [unfolded, setUnfolded] = useState<Set<string>>(new Set());
  // Elke foto van dit menu, zodat je in de viewer naar het volgende gerecht veegt.
  const photos = useMemo<ViewerPhoto[]>(
    () =>
      restaurant.menu
        .flatMap((section) => section.groups.flatMap((group) => group.dishes))
        .filter((dish) => dish.imageUrl)
        .map((dish) => ({ id: dish.id, url: dish.imageUrl!, filename: dish.name })),
    [restaurant.menu],
  );
  const [viewing, setViewing] = useState<number | null>(null);
  const openPhoto = (dish: AppAlmaDish) => {
    const at = photos.findIndex((photo) => photo.id === dish.id);
    if (at >= 0) setViewing(at);
  };

  if (restaurant.unavailable) {
    return (
      <Empty
        title="Niet beschikbaar"
        hint="Het menu kon niet van alma.be gehaald worden. Probeer het straks opnieuw."
      />
    );
  }
  if (restaurant.menuDate !== date || restaurant.menu.length === 0) {
    return <Empty title="Geen menu" hint={`${restaurant.name} heeft voor deze dag geen menu online gezet.`} />;
  }

  return (
    <View style={styles.menu}>
      {restaurant.menu.map((section) => {
        const all = section.groups.flatMap((group) => group.dishes);
        // Een categorie zonder gerechten (Warm buffet op een dag zonder warme
        // maaltijd) staat er niet als lege kop.
        if (all.length === 0) return null;
        const folded = all.length > FOLD + 1 && !unfolded.has(section.title);
        let budget = folded ? FOLD : Infinity;
        return (
          <View key={section.title} style={styles.section}>
            <SectionHeading>{section.title}</SectionHeading>
            {section.groups.map((group, groupIndex) => {
              if (budget <= 0 || group.dishes.length === 0) return null;
              const dishes = group.dishes.slice(0, budget);
              budget -= dishes.length;
              return (
                <View key={`${group.title ?? ''}-${groupIndex}`} style={styles.group}>
                  {group.title ? <Text style={styles.groupTitle}>{group.title.toUpperCase()}</Text> : null}
                  <CardList>
                    {dishes.map((dish) => (
                      <Dish key={dish.id} dish={dish} onPress={dish.imageUrl ? () => openPhoto(dish) : undefined} />
                    ))}
                  </CardList>
                </View>
              );
            })}
            {folded ? (
              <Pressable
                accessibilityRole="button"
                onPress={() => setUnfolded((current) => new Set(current).add(section.title))}
                hitSlop={8}
                style={styles.more}
              >
                <Text style={styles.moreText}>Toon alle {all.length}</Text>
              </Pressable>
            ) : null}
          </View>
        );
      })}
      <PhotoViewer photos={photos} index={viewing} onIndexChange={setViewing} onClose={() => setViewing(null)} />
    </View>
  );
}

function Dish({ dish, onPress }: { dish: AppAlmaDish; onPress?: () => void }) {
  const price = almaPrice(dish.prices.kuleuven);
  const diet = dish.diet ? DIET[dish.diet] : null;
  const meta = dish.protein ?? '';

  return (
    <Pressable
      style={({ pressed }) => [styles.dish, pressed && onPress ? styles.pressed : null]}
      onPress={onPress}
      disabled={!onPress}
      accessibilityRole={onPress ? 'button' : undefined}
      accessibilityHint={onPress ? 'Toont de foto in het groot' : undefined}
      accessibilityLabel={[dish.name, price, diet, meta].filter(Boolean).join(', ')}
    >
      {/* Alma's foto's zijn meestal PNG's met een doorzichtige achtergrond: daar
          hoort geen grijs vlak achter. Zonder foto blijft het vakje leeg, zodat
          de namen onder elkaar blijven staan. */}
      <View style={[styles.thumb, dish.imageUrl && !/\.png(?:$|\?)/i.test(dish.imageUrl) ? styles.thumbFilled : null]}>
        {dish.imageUrl ? (
          <Image cachePolicy="memory-disk"
            source={{ uri: dish.imageUrl }}
            style={StyleSheet.absoluteFill}
            contentFit="contain"
            transition={120}
          />
        ) : null}
      </View>
      <View style={styles.dishText}>
        <Text style={styles.dishName}>{dish.name}</Text>
        {diet || meta ? (
          <View style={styles.metaRow}>
            {diet ? (
              <View style={styles.diet}>
                <Text style={styles.dietText}>{diet}</Text>
              </View>
            ) : null}
            {meta ? (
              <Text style={styles.meta} numberOfLines={1}>
                {meta}
              </Text>
            ) : null}
          </View>
        ) : null}
      </View>
      {price ? <Text style={styles.price}>{price}</Text> : null}
    </Pressable>
  );
}

/** "di 24/11", zoals Alma het onderaan zijn pagina schrijft. */
function hoursDay(date: string): string {
  const [, month, day] = date.split('-').map(Number);
  const weekday = new Intl.DateTimeFormat('nl-BE', {
    timeZone: 'UTC',
    weekday: 'short',
  })
    .format(new Date(`${date}T12:00:00Z`))
    .replace('.', '');
  return `${weekday.charAt(0).toUpperCase()}${weekday.slice(1)} ${day}/${month}`;
}

/**
 * De openingsuren van het gekozen restaurant voor de hele week, als één tabel
 * bovenaan elke dag: een rij per dag, een kolom per soort (warme maaltijden,
 * snacks). Tot november 2026 stonden ze onderaan, onder het hele menu, en vond
 * niemand ze. De dag die je bekijkt staat in het vet.
 */
function WeekHours({ restaurant, selected }: { restaurant: AppAlmaRestaurant; selected: string }) {
  const kinds = restaurant.hours.filter((kind) => kind.days.length > 0);
  if (kinds.length === 0) return null;
  const dates = [...new Set(kinds.flatMap((kind) => kind.days.map((day) => day.date)))].sort();

  return (
    <View style={styles.section}>
      <SectionHeading>Openingsuren</SectionHeading>
      <CardList>
        {kinds.length > 1 ? (
          <View key="kop" style={styles.hoursRow}>
            <View style={styles.hoursDayCell} />
            {kinds.map((kind) => (
              <Text key={kind.kind} style={[styles.hoursCell, styles.hoursKind]} numberOfLines={2}>
                {kind.kind}
              </Text>
            ))}
          </View>
        ) : null}
        {dates.map((date) => {
          const current = date === selected;
          return (
            <View key={date} style={styles.hoursRow}>
              <Text style={[styles.hoursDay, styles.hoursDayCell, current && styles.hoursToday]}>{hoursDay(date)}</Text>
              {kinds.map((kind) => {
                const windows = kind.days.find((day) => day.date === date)?.windows ?? [];
                return (
                  <Text
                    key={kind.kind}
                    style={[
                      styles.hoursCell,
                      styles.hoursValue,
                      windows.length === 0 && styles.hoursClosed,
                      current && styles.hoursToday,
                    ]}
                  >
                    {windows.length === 0
                      ? 'Gesloten'
                      : windows
                          .map((window) => `${almaClock(window.start)}–${almaClock(window.end ?? window.start)}`)
                          .join('\n')}
                  </Text>
                );
              })}
            </View>
          );
        })}
      </CardList>
      {kinds.length === 1 ? <Text style={styles.hoursNote}>{kinds[0].kind}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  pressed: { opacity: 0.7 },
  pager: { flex: 1 },
  // Enkel zo hoog als de pillen: buiten een verticale lijst rekte de rij anders uit
  // tot de hele vrije hoogte.
  // De dagen lopen tot tegen de randen van het scherm, zoals de pillen erboven.
  squaresStrip: { flexGrow: 0, flexShrink: 0, marginHorizontal: -(SPACING.xl - 4) },
  squares: { gap: 6, paddingHorizontal: SPACING.xl - 4 },
  square: {
    width: 48,
    height: 56,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 1,
    backgroundColor: COLORS.surface,
  },
  squareOff: { backgroundColor: 'rgba(14, 26, 54, 0.08)' },
  squareActive: { backgroundColor: COLORS.navy },
  squareWeekday: {
    fontFamily: FONTS.semibold,
    fontSize: 10,
    letterSpacing: 1,
    textTransform: 'uppercase',
    color: COLORS.navy,
  },
  squareDay: { fontFamily: FONTS.bold, fontSize: 18, color: COLORS.navy, fontVariant: ['tabular-nums'] },
  squareTextActive: { color: COLORS.yellow },
  dayHeading: {
    fontFamily: FONTS.bold,
    fontSize: 22,
    letterSpacing: -0.5,
    color: COLORS.navy,
    paddingHorizontal: SPACING.lg + SPACING.xs,
    // De eerste categorie van het menu brengt haar eigen lucht mee.
    marginBottom: -SPACING.xl,
  },
  root: { flex: 1, backgroundColor: COLORS.paper },
  content: { paddingTop: SPACING.sm, paddingBottom: SPACING.xxl * 2, gap: SPACING.xl },
  // Open in het groen, dicht in het grijs; geen geel bolletje meer.
  menu: {},
  section: {
    paddingHorizontal: SPACING.lg,
    paddingTop: SPACING.xl,
    gap: SPACING.sm,
  },
  group: { marginTop: SPACING.xs },
  groupTitle: {
    ...TYPE.kicker,
    color: COLORS.muted,
    paddingTop: SPACING.sm,
    paddingBottom: SPACING.xs,
  },
  dish: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
    paddingVertical: 12,
  },
  thumb: {
    width: 52,
    height: 40,
    borderRadius: RADIUS.sm,
    overflow: 'hidden',
  },
  thumbFilled: { backgroundColor: COLORS.paper },
  dishText: { flex: 1, gap: 3 },
  dishName: {
    fontFamily: FONTS.medium,
    fontSize: 15,
    lineHeight: 20,
    color: COLORS.ink,
  },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  diet: {
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: RADIUS.pill,
    backgroundColor: COLORS.okBg,
  },
  dietText: { fontFamily: FONTS.semibold, fontSize: 11, color: COLORS.okInk },
  meta: { ...TYPE.small, fontSize: 12, color: COLORS.muted, flexShrink: 1 },
  price: {
    fontFamily: FONTS.semibold,
    fontSize: 14,
    color: COLORS.ink,
    fontVariant: ['tabular-nums'],
  },
  more: { paddingVertical: SPACING.sm },
  moreText: { fontFamily: FONTS.semibold, fontSize: 14, color: COLORS.navy },
  hoursRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: SPACING.md,
    paddingVertical: 10,
  },
  hoursDayCell: { width: 72 },
  hoursCell: { flex: 1, textAlign: 'right' },
  hoursKind: { ...TYPE.small, fontSize: 12, color: COLORS.muted },
  hoursNote: { ...TYPE.small, fontSize: 12, color: COLORS.muted, paddingHorizontal: SPACING.xs },
  hoursDay: { ...TYPE.body, fontSize: 14, color: COLORS.body },
  hoursValue: {
    fontFamily: FONTS.semibold,
    fontSize: 14,
    color: COLORS.ink,
    fontVariant: ['tabular-nums'],
  },
  hoursClosed: { fontFamily: FONTS.regular, color: COLORS.muted },
  hoursToday: { color: COLORS.ink, fontFamily: FONTS.bold },
  register: { marginHorizontal: SPACING.lg, marginTop: SPACING.xl },
});
