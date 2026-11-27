import { Image } from 'expo-image';
import { Ticket } from 'lucide-react-native';
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { AppCalendarEvent, AppEventMoment, AppLocale } from '../api/contract';
import { formatDay, formatTime } from '../format';
import { dayKeyOf } from '../monthGrid';
import { eventDayKeys } from '../moments';
import { addDays } from '../planning/grid';
import { COLORS, FONTS, RADIUS, SPACING } from '../theme/tokens';
import { CroppedPhoto } from './CroppedPhoto';
import { useStatusBar } from './PageHead';

/** Zoveel dagen toont de strook, vandaag inbegrepen. */
export const WEEK_DAYS = 7;
const SIDE = SPACING.xl - 4;
const GAP = 10;
/** Zoveel van de volgende kaart blijft zichtbaar, zodat je ziet dat er te vegen valt. */
const PEEK = 38;
const PHOTO_HEIGHT = 206;

/**
 * De kop van Home, voorstel G.1 van november 2026: een geel vlak met het logo en
 * je naam, "Deze week bij VTK", een strook met de komende zeven dagen en de
 * evenementen van de gekozen dag als kaarten die je opzij veegt.
 *
 * Tot dan opende Home met de evenementen als foto over de volle breedte die om de
 * zeven seconden doorschoof (voorstel F1). Die kop zei enkel wat er
 * aankwam, niet wanneer; de strook zegt in één oogopslag welke dagen iets hebben.
 *
 * De eerste dag met een evenement staat open: is er vandaag niets (meer), dan
 * staat het eerstvolgende er meteen. Zonder evenementen in de komende zeven dagen
 * staat er onder de strook niets. Een dag zonder evenementen is vaag maar blijft
 * aantikbaar, en zegt dan dat er niets gepland is. De kaarten staan niet vanzelf te draaien:
 * wat je niet zelf beweegt, beweegt niet.
 */
export function WeekHero({
  events,
  today,
  locale,
  greeting,
  actions,
  onOpen,
}: {
  /** De evenementen van deze week; per dag wordt hier gekozen. */
  events: AppCalendarEvent[];
  /** Vandaag als `YYYY-MM-DD` in Brussel, op de klok van de server. */
  today: string;
  locale: AppLocale;
  greeting: string;
  actions?: React.ReactNode;
  onOpen: (id: string) => void;
}) {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  // `null` zolang je zelf niets aantikte.
  const [selected, setSelected] = useState<string | null>(null);
  const days = useMemo(() => Array.from({ length: WEEK_DAYS }, (_, i) => addDays(today, i)), [today]);

  // Op geel hoort een donkere statusbalk.
  useStatusBar('dark');

  const byDay = useMemo(() => {
    const map = new Map<string, DayItem[]>();
    for (const event of events) {
      for (const key of eventDayKeys(event)) {
        if (!days.includes(key)) continue;
        const moment = (event.moments ?? []).find((m) => dayKeyOf(m.start) === key) ?? null;
        const list = map.get(key) ?? [];
        list.push({ event, moment });
        map.set(key, list);
      }
    }
    for (const list of map.values()) {
      list.sort((a, b) => startOf(a).localeCompare(startOf(b)));
    }
    return map;
  }, [events, days]);

  // Wat openstaat: de dag die je aantikte, en anders de eerste dag met een
  // evenement. Is vandaag al voorbij, dan staat het eerstvolgende evenement er
  // meteen, en niet "niets gepland". Na middernacht of een verversing kan een
  // aangetikte dag uit de strook vallen; dan geldt weer de eerste.
  const firstBusy = days.find((key) => (byDay.get(key)?.length ?? 0) > 0) ?? null;
  const day = selected && days.includes(selected) ? selected : firstBusy;
  const items = day ? (byDay.get(day) ?? []) : [];
  const single = items.length === 1;
  const cardWidth = single ? width - SIDE * 2 : width - SIDE * 2 - PEEK;

  return (
    <View style={[styles.hero, { paddingTop: insets.top + SPACING.sm }]}>
      <View style={styles.top}>
        <View style={styles.brand}>
          <Image
            source={require('../../assets/vtk-logo.png')}
            style={styles.logo}
            contentFit="contain"
            tintColor={COLORS.navy}
            accessibilityLabel="VTK"
          />
          <Text style={styles.greeting} numberOfLines={1}>
            {greeting}
          </Text>
        </View>
        {actions}
      </View>

      <Text accessibilityRole="header" style={styles.title}>
        Deze week bij VTK
      </Text>

      <View style={styles.strip}>
        {days.map((key) => {
          const count = byDay.get(key)?.length ?? 0;
          const active = key === day;
          return (
            <Pressable
              key={key}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
              accessibilityLabel={`${dayTitle(key, today, locale)}, ${countLabel(count)}`}
              onPress={() => setSelected(key)}
              style={({ pressed }) => [
                styles.day,
                count > 0 && styles.dayBusy,
                active && styles.dayActive,
                pressed && styles.pressed,
              ]}
            >
              <Text style={[styles.dayName, count === 0 && styles.dayQuiet, active && styles.dayNameActive]}>
                {weekdayShort(key, locale)}
              </Text>
              <Text style={[styles.dayNumber, count === 0 && styles.dayQuiet, active && styles.dayNumberActive]}>
                {Number(key.slice(8))}
              </Text>
              <View style={styles.dots}>
                {Array.from({ length: Math.min(count, 3) }, (_, i) => (
                  <View key={i} style={[styles.dot, active && styles.dotActive]} />
                ))}
              </View>
            </Pressable>
          );
        })}
      </View>

      {/* Geen enkel evenement in de komende zeven dagen: dan staat hier niets,
          ook geen "niets gepland". */}
      {day ? (
        <View style={styles.dayHead}>
          <Text style={styles.dayTitle}>{dayTitle(day, today, locale)}</Text>
          <Text style={styles.dayCount}>{countLabel(items.length)}</Text>
        </View>
      ) : null}

      {!day ? null : items.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyText}>Niets gepland op deze dag.</Text>
        </View>
      ) : (
        <ScrollView
          // Een nieuwe dag begint weer bij de eerste kaart.
          key={day}
          horizontal
          showsHorizontalScrollIndicator={false}
          snapToInterval={cardWidth + GAP}
          decelerationRate="fast"
          scrollEnabled={!single}
          style={styles.pager}
          contentContainerStyle={styles.pagerContent}
        >
          {items.map((item) => (
            <EventCard
              key={`${item.event.id}-${item.moment?.start ?? ''}`}
              item={item}
              width={cardWidth}
              locale={locale}
              onPress={() => onOpen(item.event.id)}
            />
          ))}
        </ScrollView>
      )}
    </View>
  );
}

type DayItem = { event: AppCalendarEvent; moment: AppEventMoment | null };

function startOf(item: DayItem): string {
  return item.moment?.start ?? item.event.start;
}

function EventCard({
  item,
  width,
  locale,
  onPress,
}: {
  item: DayItem;
  width: number;
  locale: AppLocale;
  onPress: () => void;
}) {
  const { event, moment } = item;
  const start = moment?.start ?? event.start;
  const end = moment?.end ?? event.end;
  const when = event.allDay ? 'Hele dag' : `${formatTime(start, locale)} – ${formatTime(end, locale)}`;
  const title = moment?.label ? `${event.title}: ${moment.label}` : event.title;
  const location = moment?.location ?? event.location;
  const meta = [location, event.ticketSlug ? 'tickets' : null].filter(Boolean).join(' · ');

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={[title, when, location, event.ticketSlug ? 'tickets te koop' : null]
        .filter(Boolean)
        .join(', ')}
      onPress={onPress}
      style={({ pressed }) => [styles.card, { width }, pressed && styles.cardPressed]}
    >
      <View style={styles.photo}>
        {event.imageUrl ? (
          <CroppedPhoto source={{ uri: event.imageUrl }} crop={event.imageCrop} kind="hero" transition={150} />
        ) : null}
      </View>
      <View style={styles.cardBody}>
        <View style={styles.cardText}>
          <Text style={styles.cardWhen}>{when}</Text>
          <Text style={styles.cardTitle} numberOfLines={1}>
            {title}
          </Text>
          {meta ? (
            <Text style={styles.cardMeta} numberOfLines={1}>
              {meta}
            </Text>
          ) : null}
        </View>
        {event.ticketSlug ? (
          <View style={styles.ticket}>
            <Ticket color={COLORS.navy} size={20} />
          </View>
        ) : null}
      </View>
    </Pressable>
  );
}

function countLabel(count: number): string {
  if (count === 0) return 'geen evenementen';
  return count === 1 ? '1 evenement' : `${count} evenementen`;
}

/** "Vandaag", "Morgen", of "Woensdag 2 december". */
function dayTitle(key: string, today: string, locale: AppLocale): string {
  if (key === today) return 'Vandaag';
  if (key === addDays(today, 1)) return 'Morgen';
  const label = formatDay(`${key}T12:00:00Z`, locale);
  return label.charAt(0).toUpperCase() + label.slice(1);
}

/** "MA", "DI": de dag in twee letters, op UTC-middag zodat geen tijdzone hem verschuift. */
function weekdayShort(key: string, locale: AppLocale): string {
  return new Intl.DateTimeFormat(locale === 'en' ? 'en-GB' : 'nl-BE', { timeZone: 'UTC', weekday: 'short' })
    .format(new Date(`${key}T12:00:00Z`))
    .replace('.', '')
    .slice(0, 2)
    .toUpperCase();
}

const styles = StyleSheet.create({
  hero: {
    paddingHorizontal: SIDE,
    paddingBottom: SIDE + 2,
    gap: SPACING.lg,
    backgroundColor: COLORS.yellow,
    borderBottomLeftRadius: 32,
    borderBottomRightRadius: 32,
  },
  top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: SPACING.sm },
  brand: { flexShrink: 1, flexDirection: 'row', alignItems: 'center', gap: SPACING.md },
  logo: { width: 52, height: 30 },
  greeting: { flexShrink: 1, fontFamily: FONTS.bold, fontSize: 19, letterSpacing: -0.3, color: COLORS.navy },
  title: { fontFamily: FONTS.bold, fontSize: 34, lineHeight: 38, letterSpacing: -1.3, color: COLORS.navy },

  strip: { flexDirection: 'row', gap: 6 },
  day: {
    flex: 1,
    aspectRatio: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 1,
    borderRadius: 12,
  },
  dayBusy: { backgroundColor: 'rgba(14, 26, 54, 0.08)' },
  dayActive: { backgroundColor: COLORS.navy },
  pressed: { opacity: 0.7 },
  dayName: { fontFamily: FONTS.bold, fontSize: 9, letterSpacing: 0.4, color: COLORS.navy },
  dayNameActive: { color: COLORS.yellow },
  dayNumber: {
    fontFamily: FONTS.bold,
    fontSize: 16,
    lineHeight: 19,
    color: COLORS.navy,
    fontVariant: ['tabular-nums'],
  },
  dayNumberActive: { color: COLORS.onDark },
  dayQuiet: { opacity: 0.55 },
  dots: { flexDirection: 'row', gap: 2, height: 4 },
  dot: { width: 4, height: 4, borderRadius: 2, backgroundColor: COLORS.navy },
  dotActive: { backgroundColor: COLORS.yellow },

  dayHead: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: -6 },
  dayTitle: { fontFamily: FONTS.bold, fontSize: 15, color: COLORS.navy },
  dayCount: { fontFamily: FONTS.semibold, fontSize: 13, color: COLORS.navy },

  empty: {
    paddingVertical: SPACING.xl,
    paddingHorizontal: SPACING.lg,
    borderRadius: 20,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: 'rgba(14, 26, 54, 0.3)',
    alignItems: 'center',
  },
  emptyText: { fontFamily: FONTS.medium, fontSize: 14, color: COLORS.navy },

  // Tot tegen de rand van het scherm, zodat de volgende kaart eronder uit piept.
  pager: { marginHorizontal: -SIDE },
  pagerContent: { paddingHorizontal: SIDE, gap: GAP },
  card: { borderRadius: 20, overflow: 'hidden', backgroundColor: COLORS.surface },
  cardPressed: { opacity: 0.92 },
  photo: { height: PHOTO_HEIGHT, backgroundColor: COLORS.paper2, overflow: 'hidden' },
  cardBody: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
    paddingHorizontal: 14,
    paddingVertical: SPACING.md,
  },
  cardText: { flex: 1, gap: 2 },
  cardWhen: { fontFamily: FONTS.bold, fontSize: 12, color: COLORS.navy, fontVariant: ['tabular-nums'] },
  cardTitle: { fontFamily: FONTS.semibold, fontSize: 16, color: COLORS.ink },
  cardMeta: { fontFamily: FONTS.regular, fontSize: 13, color: COLORS.muted },
  ticket: {
    width: 44,
    height: 44,
    borderRadius: RADIUS.pill,
    backgroundColor: COLORS.yellow,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
