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
import { PageHead } from '../components/PageHead';
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
 * Het restaurant kies je met de pillen in de kop, de dag met de rij eronder. De
 * prijs is die voor studenten en personeel van KU Leuven; de twee andere staan op
 * alma.be. De gegevens komen van vtk.be, dat alma.be leest (`lib/alma/` op de
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
      <PageHead
        title="Alma"
        subtitle="Arenberg, het centrum en Gasthuisberg"
        tabs={{
          value: slug,
          onChange: setSlug,
          scroll: true,
          options: (data?.restaurants ?? []).map((candidate) => ({
            value: candidate.slug,
            label: candidate.shortName,
          })),
        }}
      />
    </View>
  );

  if (base.loading && !data) {
    return (
      <>
        {head}
        <Loading />
      </>
    );
  }
  if (!data || !restaurant) {
    return (
      <>
        {head}
        <ErrorState message={messageFor(base.error)} onRetry={() => void base.refresh()} />
      </>
    );
  }

  return (
    <View style={styles.root}>
      {head}
      {base.stale ? <StaleNotice onRetry={() => void base.refresh()} /> : null}
      <Status restaurant={restaurant} />
      <Days dates={pages} selected={pages[index] ?? data.date} onSelect={(date) => goTo(pages.indexOf(date))} />

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
          <Menu restaurant={restaurant} date={date} key={`${restaurant.slug}:${date}`} />
          <Hours restaurant={restaurant} />
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

function Status({ restaurant }: { restaurant: AppAlmaRestaurant }) {
  return (
    <View style={styles.status}>
      <View style={[styles.statusPill, restaurant.openNow && styles.statusPillOpen]}>
        <Text style={[styles.statusText, restaurant.openNow && styles.statusOpen]}>{almaStatusLine(restaurant)}</Text>
      </View>
      {restaurant.today.length > 0 ? (
        <Text style={styles.statusToday} numberOfLines={1}>
          {restaurant.today
            .map((window) => `${almaClock(window.start)}–${almaClock(window.end ?? window.start)}`)
            .join(', ')}
        </Text>
      ) : null}
    </View>
  );
}

/** "Vandaag", "Morgen", of "do 26". */
function dayLabel(date: string): string {
  const todayKey = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Brussels',
  }).format(new Date());
  if (date === todayKey) return 'Vandaag';
  const tomorrow = new Date(`${todayKey}T12:00:00Z`);
  tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
  if (date === tomorrow.toISOString().slice(0, 10)) return 'Morgen';
  return new Intl.DateTimeFormat('nl-BE', {
    timeZone: 'UTC',
    weekday: 'short',
    day: 'numeric',
  })
    .format(new Date(`${date}T12:00:00Z`))
    .replace('.', '');
}

function Days({ dates, selected, onSelect }: { dates: string[]; selected: string; onSelect: (date: string) => void }) {
  // Twee weken vooruit is genoeg; Alma zet soms tot twee maanden online.
  const shown = dates;
  const strip = useRef<ScrollViewInstance>(null);
  const offsets = useRef<Record<string, number>>({});
  // Na een veeg over het menu: de gekozen dag in beeld houden.
  useEffect(() => {
    const x = offsets.current[selected];
    if (x !== undefined) strip.current?.scrollTo({ x: Math.max(0, x - SPACING.xl), animated: true });
  }, [selected]);
  if (shown.length === 0) return null;
  return (
    <ScrollView
      ref={strip}
      horizontal
      showsHorizontalScrollIndicator={false}
      style={styles.daysStrip}
      contentContainerStyle={styles.days}
    >
      {shown.map((date) => {
        const active = date === selected;
        return (
          <Pressable
            key={date}
            onLayout={(event) => {
              offsets.current[date] = event.nativeEvent.layout.x;
            }}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
            onPress={() => onSelect(date)}
            style={({ pressed }) => [styles.day, active && styles.dayActive, pressed && !active && styles.dayPressed]}
          >
            <Text style={[styles.dayText, active && styles.dayTextActive]}>{dayLabel(date)}</Text>
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
      <Text style={styles.priceNote}>Prijzen voor studenten en personeel van KU Leuven.</Text>
      {restaurant.menu.map((section) => {
        const all = section.groups.flatMap((group) => group.dishes);
        const folded = all.length > FOLD + 1 && !unfolded.has(section.title);
        let budget = folded ? FOLD : Infinity;
        return (
          <View key={section.title} style={styles.section}>
            <SectionHeading>{section.title}</SectionHeading>
            {section.groups.map((group, groupIndex) => {
              if (budget <= 0) return null;
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
      <View style={styles.thumb}>
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

function Hours({ restaurant }: { restaurant: AppAlmaRestaurant }) {
  if (restaurant.hours.length === 0) return null;
  const todayKey = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Brussels',
  }).format(new Date());

  return (
    <View style={styles.section}>
      <SectionHeading>Openingsuren</SectionHeading>
      {restaurant.hours.map((kind) => (
        <View key={kind.kind} style={styles.group}>
          <Text style={styles.groupTitle}>{kind.kind.toUpperCase()}</Text>
          <CardList>
            {kind.days.map((day) => {
              const isToday = day.date === todayKey;
              return (
                <View key={day.date} style={styles.hoursRow}>
                  <Text style={[styles.hoursDay, isToday && styles.hoursToday]}>{hoursDay(day.date)}</Text>
                  <Text
                    style={[
                      styles.hoursValue,
                      day.windows.length === 0 && styles.hoursClosed,
                      isToday && styles.hoursToday,
                    ]}
                  >
                    {day.windows.length === 0
                      ? 'Gesloten'
                      : day.windows
                          .map((window) => `${almaClock(window.start)}–${almaClock(window.end ?? window.start)}`)
                          .join(' en ')}
                  </Text>
                </View>
              );
            })}
          </CardList>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  pressed: { opacity: 0.7 },
  pager: { flex: 1 },
  // Enkel zo hoog als de pillen: buiten een verticale lijst rekte de rij anders uit
  // tot de hele vrije hoogte.
  daysStrip: { flexGrow: 0, flexShrink: 0 },
  root: { flex: 1, backgroundColor: COLORS.paper },
  content: { paddingTop: SPACING.sm, paddingBottom: SPACING.xxl * 2, gap: SPACING.xl },
  status: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 8,
    paddingHorizontal: SPACING.lg,
    paddingTop: SPACING.lg,
  },
  // Open in het groen, dicht in het grijs; geen geel bolletje meer.
  statusPill: {
    paddingHorizontal: SPACING.md,
    paddingVertical: 5,
    borderRadius: RADIUS.pill,
    backgroundColor: COLORS.paper2,
  },
  statusPillOpen: { backgroundColor: COLORS.okBg },
  statusText: { fontFamily: FONTS.semibold, fontSize: 14, color: COLORS.body },
  statusOpen: { color: COLORS.okInk },
  statusToday: {
    ...TYPE.small,
    color: COLORS.muted,
    fontVariant: ['tabular-nums'],
  },
  days: {
    gap: SPACING.sm,
    paddingHorizontal: SPACING.lg,
    paddingTop: SPACING.md,
  },
  day: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: RADIUS.pill,
    borderWidth: 1,
    borderColor: COLORS.controlBorder,
  },
  dayActive: { backgroundColor: COLORS.ink, borderColor: COLORS.ink },
  dayPressed: { backgroundColor: COLORS.paper2 },
  dayText: { fontFamily: FONTS.semibold, fontSize: 13, color: COLORS.ink },
  dayTextActive: { color: COLORS.surface },
  menu: { paddingTop: SPACING.sm },
  priceNote: {
    ...TYPE.small,
    color: COLORS.muted,
    paddingHorizontal: SPACING.lg,
    paddingTop: SPACING.md,
  },
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
    backgroundColor: COLORS.paper,
    overflow: 'hidden',
  },
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
    justifyContent: 'space-between',
    gap: SPACING.md,
    paddingVertical: 11,
  },
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
