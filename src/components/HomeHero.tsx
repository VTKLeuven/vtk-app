import { Image } from 'expo-image';
import { useFocusEffect } from 'expo-router';
import { MapPin } from 'lucide-react-native';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  AppState,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { AppCalendarEvent, AppLocale } from '../api/contract';
import { formatDay, formatTime } from '../format';
import { leadMoment } from '../moments';
import { addDays } from '../planning/grid';
import { COLORS, FONTS, RADIUS, SPACING } from '../theme/tokens';
import { useStatusBar } from './PageHead';
import { PatternBand } from './PatternBand';

/** Zo lang staat één evenement in beeld voor het volgende komt. */
const INTERVAL = 7000;
const PHOTO_HEIGHT = 330;
/** Zo ver schuift het papier van de tekst over de foto. */
const OVERLAP = 30;
/** Meer dan dit wordt een diavoorstelling waar niemand het einde van ziet. */
const MAX_SLIDES = 6;

/**
 * De kop van Home: de aankomende evenementen als foto over de volle breedte, met
 * de titel op papier dat over de foto schuift en de gele pin van de eventkaart op
 * de rand. Voorstel F1 van november 2026; tot dan opende Home met de navy kop en
 * de openingsuren erin.
 *
 * Om de zeven seconden schuift het volgende evenement in beeld, en je kan zelf
 * vegen of op een puntje tikken. Het draaien stopt terwijl je sleept, wanneer
 * Home niet in beeld is (een andere tab, een scherm erbovenop), wanneer de app op
 * de achtergrond staat, en helemaal voor wie een schermlezer of "beperk beweging"
 * aan heeft: inhoud die vanzelf verspringt, leest niet voor en maakt sommige
 * mensen misselijk (WCAG 2.2.2). Vegen werkt dan nog altijd.
 *
 * De groet en de knoppen staan vast bovenop en schuiven niet mee.
 */
export function HomeHero({
  events,
  locale,
  greeting,
  initial,
  actions,
  onOpen,
}: {
  events: AppCalendarEvent[];
  locale: AppLocale;
  greeting: string;
  /** De eerste letter van je voornaam, of `null` voor wie niet ingelogd is. */
  initial: string | null;
  actions?: React.ReactNode;
  onOpen: (id: string) => void;
}) {
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const listRef = useRef<FlatList<AppCalendarEvent>>(null);
  const slides = events.slice(0, MAX_SLIDES);
  const count = slides.length;

  const [index, setIndex] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [focused, setFocused] = useState(true);
  const [foreground, setForeground] = useState(AppState.currentState === 'active');
  const [still, setStill] = useState(false);
  // Na een verversing kunnen er minder evenementen zijn dan het puntje waar we stonden.
  const current = count === 0 ? 0 : Math.min(index, count - 1);

  // Over een foto is een donkere statusbalk onleesbaar; de rest van de app is licht.
  useStatusBar('light');
  useFocusEffect(
    useCallback(() => {
      setFocused(true);
      return () => setFocused(false);
    }, []),
  );

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => setForeground(state === 'active'));
    return () => subscription.remove();
  }, []);

  useEffect(() => {
    let reader = false;
    let reduce = false;
    const update = () => setStill(reader || reduce);
    void AccessibilityInfo.isScreenReaderEnabled().then((value) => {
      reader = value;
      update();
    });
    void AccessibilityInfo.isReduceMotionEnabled().then((value) => {
      reduce = value;
      update();
    });
    const readerSub = AccessibilityInfo.addEventListener('screenReaderChanged', (value) => {
      reader = value;
      update();
    });
    const reduceSub = AccessibilityInfo.addEventListener('reduceMotionChanged', (value) => {
      reduce = value;
      update();
    });
    return () => {
      readerSub.remove();
      reduceSub.remove();
    };
  }, []);

  const goTo = useCallback(
    (next: number) => {
      listRef.current?.scrollToOffset({ offset: next * width, animated: true });
      setIndex(next);
    },
    [width],
  );

  // Eén timer per evenement in beeld: wie zelf veegt of tikt, krijgt de volle
  // zeven seconden bij het nieuwe, en niet de rest van die van het vorige.
  useEffect(() => {
    if (count < 2 || dragging || !focused || !foreground || still) return;
    const timer = setTimeout(() => goTo((current + 1) % count), INTERVAL);
    return () => clearTimeout(timer);
  }, [count, current, dragging, focused, foreground, still, goTo]);

  const settle = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    setDragging(false);
    setIndex(Math.round(event.nativeEvent.contentOffset.x / width));
  };

  return (
    <View>
      <FlatList
        ref={listRef}
        data={slides}
        keyExtractor={(event) => event.id}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        // De uren ("begint over 6 min") worden zo bij elke wissel opnieuw gelezen.
        extraData={current}
        getItemLayout={(_, i) => ({ length: width, offset: width * i, index: i })}
        onScrollBeginDrag={() => setDragging(true)}
        onScrollEndDrag={() => setDragging(false)}
        onMomentumScrollEnd={settle}
        renderItem={({ item }) => (
          <Slide event={item} width={width} locale={locale} onPress={() => onOpen(item.id)} />
        )}
      />

      <View pointerEvents="box-none" style={[styles.top, { top: insets.top + SPACING.sm }]}>
        <View style={styles.greeting}>
          {initial ? (
            <View style={styles.initial}>
              <Text style={styles.initialText}>{initial}</Text>
            </View>
          ) : null}
          <Text style={styles.greetingText} numberOfLines={1}>
            {greeting}
          </Text>
        </View>
        {actions}
      </View>

      {count > 1 ? (
        <View style={styles.dots}>
          {slides.map((event, i) => (
            <Pressable
              key={event.id}
              accessibilityRole="button"
              accessibilityLabel={`Evenement ${i + 1} van ${count}`}
              accessibilityState={{ selected: i === current }}
              onPress={() => goTo(i)}
              hitSlop={{ top: 12, bottom: 12, left: 4, right: 4 }}
              style={[styles.dot, i === current && styles.dotActive]}
            />
          ))}
        </View>
      ) : null}
    </View>
  );
}

function Slide({
  event,
  width,
  locale,
  onPress,
}: {
  event: AppCalendarEvent;
  width: number;
  locale: AppLocale;
  onPress: () => void;
}) {
  const now = new Date();
  // Een evenement over meerdere dagen staat op zijn eerstvolgende moment.
  const moment = leadMoment(event, now);
  const start = moment?.start ?? event.start;
  const end = moment?.end ?? event.end;
  const when = whenLabel(start, end, event.allDay, locale, now);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={[event.title, when, event.location].filter(Boolean).join(', ')}
      onPress={onPress}
      style={({ pressed }) => [{ width }, pressed && styles.pressed]}
    >
      <View style={styles.photo}>
        {event.imageUrl ? (
          <Image cachePolicy="memory-disk" source={{ uri: event.imageUrl }} style={StyleSheet.absoluteFill} contentFit="cover" transition={200} />
        ) : (
          <PatternBand />
        )}
      </View>

      <View style={styles.sheet}>
        <View style={styles.pin}>
          <Text style={styles.pinDay}>{weekday(start, locale)}</Text>
          <Text style={styles.pinTime}>{event.allDay ? dayNumber(start) : formatTime(start, locale)}</Text>
        </View>
        <Text style={styles.when} numberOfLines={1}>
          {when}
        </Text>
        {/* Op één regel, en kleiner als het moet: met twee regels werd de kop zo hoog
            als de langste titel, en stond er onder een korte een gat. */}
        <Text style={styles.title} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.65}>
          {event.title}
        </Text>
        {event.location ? (
          <View style={styles.meta}>
            <MapPin color={COLORS.muted} size={15} />
            <Text style={styles.metaText} numberOfLines={1}>
              {event.location}
            </Text>
          </View>
        ) : null}
      </View>
    </Pressable>
  );
}

const leuvenDayFormat = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Europe/Brussels',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

/** "YYYY-MM-DD" in Leuven, zoals de planning dagen schrijft. */
function leuvenDay(date: Date): string {
  const parts = leuvenDayFormat.formatToParts(date);
  const part = (type: string) => parts.find((p) => p.type === type)?.value ?? '00';
  return `${part('year')}-${part('month')}-${part('day')}`;
}

/** "Nu bezig, tot 13:30", "Vandaag, begint over 6 min", "Morgen", "Donderdag 26 november". */
function whenLabel(startIso: string, endIso: string, allDay: boolean, locale: AppLocale, now: Date): string {
  const start = new Date(startIso);
  const end = new Date(endIso);
  if (!allDay && start <= now && now < end) return `Nu bezig, tot ${formatTime(endIso, locale)}`;

  const today = leuvenDay(now);
  const day = leuvenDay(start);
  if (day === today) {
    const minutes = Math.round((start.getTime() - now.getTime()) / 60000);
    return !allDay && minutes > 0 && minutes < 60 ? `Vandaag, begint over ${minutes} min` : 'Vandaag';
  }
  if (day === addDays(today, 1)) return 'Morgen';
  const label = formatDay(startIso, locale);
  return label.charAt(0).toUpperCase() + label.slice(1);
}

function weekday(iso: string, locale: AppLocale): string {
  return new Intl.DateTimeFormat(locale === 'en' ? 'en-GB' : 'nl-BE', {
    timeZone: 'Europe/Brussels',
    weekday: 'short',
  })
    .format(new Date(iso))
    .replace('.', '')
    .toUpperCase();
}

function dayNumber(iso: string): string {
  return leuvenDay(new Date(iso)).slice(8).replace(/^0/, '');
}

const styles = StyleSheet.create({
  pressed: { opacity: 0.94 },
  photo: { height: PHOTO_HEIGHT, backgroundColor: COLORS.navy, overflow: 'hidden' },
  sheet: {
    marginTop: -OVERLAP,
    paddingTop: SPACING.xl - 2,
    paddingHorizontal: SPACING.xl - 4,
    paddingBottom: SPACING.xs,
    gap: 6,
    backgroundColor: COLORS.paper,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
  },
  // De datumpin van de eventkaart op de site (`.ev-card-pin`), hier met het uur.
  pin: {
    position: 'absolute',
    right: SPACING.xl - 4,
    top: -OVERLAP,
    width: 62,
    height: 62,
    borderRadius: 16,
    backgroundColor: COLORS.yellow,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: COLORS.ink,
    shadowOpacity: 0.35,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 8 },
    elevation: 6,
  },
  pinDay: { fontFamily: FONTS.semibold, fontSize: 10, letterSpacing: 1.2, color: COLORS.ink },
  pinTime: {
    fontFamily: FONTS.semibold,
    fontSize: 17,
    letterSpacing: -0.4,
    color: COLORS.ink,
    fontVariant: ['tabular-nums'],
  },
  when: { fontFamily: FONTS.regular, fontSize: 13, color: COLORS.muted, paddingRight: 80 },
  title: { fontFamily: FONTS.bold, fontSize: 28, lineHeight: 32, letterSpacing: -1, color: COLORS.ink },
  meta: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 2 },
  metaText: { flexShrink: 1, fontFamily: FONTS.regular, fontSize: 14, color: COLORS.body },

  top: {
    position: 'absolute',
    left: SPACING.lg,
    right: SPACING.lg,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: SPACING.sm,
  },
  greeting: {
    flexShrink: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    height: 40,
    paddingLeft: 5,
    paddingRight: 14,
    borderRadius: RADIUS.pill,
    backgroundColor: 'rgba(255,255,255,0.92)',
  },
  initial: {
    width: 30,
    height: 30,
    borderRadius: RADIUS.pill,
    backgroundColor: COLORS.yellow,
    alignItems: 'center',
    justifyContent: 'center',
  },
  initialText: { fontFamily: FONTS.bold, fontSize: 13, color: COLORS.ink },
  greetingText: { flexShrink: 1, fontFamily: FONTS.semibold, fontSize: 14, color: COLORS.ink },

  // Op de foto, net boven het papier; een donker pilletje zodat ze op elke affiche leesbaar blijven.
  dots: {
    position: 'absolute',
    left: SPACING.xl - 4,
    top: PHOTO_HEIGHT - OVERLAP - 34,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 9,
    height: 20,
    borderRadius: RADIUS.pill,
    backgroundColor: 'rgba(10,15,31,0.55)',
  },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: 'rgba(239,242,248,0.7)' },
  dotActive: { width: 18, backgroundColor: COLORS.yellow },
});

/** "Vandaag 20:00", "Morgen 19:00", "Do 26 nov 20:00": wanneer, kort, voor een rij onder de kop. */
export function shortWhen(event: AppCalendarEvent, locale: AppLocale, now: Date = new Date()): string {
  const moment = leadMoment(event, now);
  const start = moment?.start ?? event.start;
  const today = leuvenDay(now);
  const day = leuvenDay(new Date(start));
  const dayText =
    day === today
      ? 'Vandaag'
      : day === addDays(today, 1)
        ? 'Morgen'
        : new Intl.DateTimeFormat(locale === 'en' ? 'en-GB' : 'nl-BE', {
            timeZone: 'Europe/Brussels',
            weekday: 'short',
            day: 'numeric',
            month: 'short',
          })
            .format(new Date(start))
            .replace(/^./, (c) => c.toUpperCase());
  return event.allDay ? dayText : `${dayText} ${formatTime(start, locale)}`;
}
