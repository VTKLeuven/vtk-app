import * as WebBrowser from 'expo-web-browser';
import { Bike, ChevronLeft, ChevronRight, Truck, X } from 'lucide-react-native';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type GestureResponderEvent,
  type ScrollViewInstance,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle, Defs, Line, Pattern, Rect } from 'react-native-svg';

import type { AppLocale, AppTransportTrip, AppTransportVehicle } from '../api/contract';
import { fetchTransportWeek } from '../api/endpoints';
import { messageFor, useResource } from '../api/useResource';
import { PageHead } from '../components/PageHead';
import { ErrorState, Loading, StaleNotice } from '../components/ui';
import { formatTime } from '../format';
import { dayKeyOf, todayKey } from '../monthGrid';
import { useApp } from '../state/app';
import { COLORS, DARK_GLASS, FONTS, RADIUS, SPACING, TRANSPORT, TYPE } from '../theme/tokens';

const DAY_MS = 24 * 60 * 60 * 1000;
const HOURS = 24;
/** De uurhoogte en de urenkolom van de telefoonweergave op logistiek.vtk.be. */
const HOUR_PX = 56;
const GUTTER = 46;
/** Hoe ver je horizontaal moet vegen voor het een dagwissel is, zoals daar. */
const SWIPE_PX = 56;
/** De strook rechts naast de blokken, zodat ze niet tegen de rand plakken. */
const BLOCK_GUTTER = 10;

type Placed = { trip: AppTransportTrip; from: number; to: number; lane: number; lanes: number };

/**
 * Transport: de planning van Logistiek, precies zoals logistiek.vtk.be ze op een
 * telefoon toont (`MobileCalendar` in apps/logistiek): **één dag over de volle
 * breedte**, met de week als dagstrip erboven.
 *
 * - De kop zegt welke week ("Week 48") en het datumbereik, met vorige, vandaag
 *   en volgende, zoals `CalendarNav` naast de titel daar.
 * - De dagstrip toont de zeven dagen met een gele stip als er iets staat;
 *   aantikken springt naar die dag. Vegen gaat naar de dag ernaast, en voorbij
 *   zondag of maandag naar de week ernaast.
 * - Het rooster heeft de uren links en de ritten als blokken op hun uur. **De
 *   vulkleur is de chauffeur, de arcering het voertuig, de rand de staat**: een
 *   streepjesrand zonder chauffeur, een streep bovenaan wat nog beslist moet
 *   worden, een rail links voor je eigen post. De kleuren rekent de site uit met
 *   dezelfde functies als logistiek (`AppTransportTrip.fill`).
 * - Aantikken opent de rit; onderaan staat welke arcering bij welk voertuig hoort.
 *
 * Wie hier komt, mag het zien: de server geeft deze week enkel aan een
 * praesidiumpost, een werkgroep, een jaarwerking of het team. Telefoonnummers,
 * het ophaaladres en de nota's staan er niet in. Aanvragen gebeurt op
 * logistiek.vtk.be.
 */
export default function VervoerScreen() {
  const { locale } = useApp();
  const insets = useSafeAreaInsets();
  const [week, setWeek] = useState<string | undefined>(undefined);
  const [day, setDay] = useState<string>(() => todayKey());
  const [open, setOpen] = useState<AppTransportTrip | null>(null);
  const scroll = useRef<ScrollViewInstance>(null);
  const resource = useResource(
    `vervoer-${week ?? 'nu'}`,
    () => fetchTransportWeek(locale, week),
    `${locale}:${week ?? 'nu'}`,
  );

  const data = resource.data;
  const days = useMemo(() => (data ? Array.from({ length: 7 }, (_, i) => shiftKey(data.weekStart, i)) : []), [data]);
  // Zit de gekozen dag niet in de week die er staat (net gewisseld), dan de eerste
  // dag ervan, of vandaag als die erin zit.
  const shownDay = days.includes(day) ? day : days.includes(todayKey()) ? todayKey() : (days[0] ?? day);
  const placed = useMemo(() => (data ? placeForDay(data.trips, shownDay) : []), [data, shownDay]);
  const perDay = useMemo(() => days.map((key) => (data ? placeForDay(data.trips, key).length : 0)), [data, days]);
  const vehicles = useMemo(() => new Map((data?.vehicles ?? []).map((v) => [v.id, v])), [data]);

  // Bij elke dagwissel naar het eerste dat er staat, min een half uur; anders 08:00.
  const earliest = placed.reduce((soonest, block) => Math.min(soonest, block.from), Number.POSITIVE_INFINITY);
  const scrollTarget = ((Number.isFinite(earliest) ? Math.max(0, earliest - 30) : 8 * 60) / 60) * HOUR_PX;
  useEffect(() => {
    scroll.current?.scrollTo({ y: scrollTarget, animated: false });
  }, [shownDay, scrollTarget]);

  const goWeek = (delta: number, landOn: 'first' | 'last' | 'today') => {
    if (!data) return;
    const start = shiftKey(data.weekStart, delta * 7);
    setOpen(null);
    setWeek(start);
    setDay(landOn === 'last' ? shiftKey(start, 6) : landOn === 'first' ? start : todayKey());
  };

  const goDay = (delta: number) => {
    const at = days.indexOf(shownDay) + delta;
    if (at < 0) return goWeek(-1, 'last');
    if (at > 6) return goWeek(1, 'first');
    setDay(days[at]);
  };

  // Vegen: enkel een duidelijk horizontale beweging, anders is het gewoon scrollen.
  const touch = useRef<{ x: number; y: number } | null>(null);
  const swipe = {
    onTouchStart: (event: GestureResponderEvent) => {
      const { pageX, pageY } = event.nativeEvent;
      touch.current = { x: pageX, y: pageY };
    },
    onTouchEnd: (event: GestureResponderEvent) => {
      const start = touch.current;
      touch.current = null;
      if (!start) return;
      const dx = event.nativeEvent.pageX - start.x;
      const dy = event.nativeEvent.pageY - start.y;
      if (Math.abs(dx) > SWIPE_PX && Math.abs(dx) > Math.abs(dy) * 1.5) goDay(dx < 0 ? 1 : -1);
    },
  };

  const thisWeek = data ? days.includes(todayKey()) : true;
  const head = (
    <PageHead
      navy
      title={data?.weekNumber ? `Week ${data.weekNumber}` : 'Transport'}
      subtitle={data ? weekLabel(data.weekStart, locale) : 'De ritten van Logistiek'}
    >
      <View style={styles.weekNav}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Vorige week"
          onPress={() => goWeek(-1, 'first')}
          style={({ pressed }) => [styles.navButton, pressed && styles.pressed]}
        >
          <ChevronLeft size={18} color={COLORS.onDark} />
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Vandaag"
          accessibilityState={{ selected: thisWeek && shownDay === todayKey() }}
          onPress={() => {
            setOpen(null);
            setWeek(undefined);
            setDay(todayKey());
          }}
          style={({ pressed }) => [
            styles.navToday,
            thisWeek && shownDay === todayKey() && styles.navTodayActive,
            pressed && styles.pressed,
          ]}
        >
          <Text style={[styles.navTodayLabel, thisWeek && shownDay === todayKey() && styles.navTodayLabelActive]}>
            Vandaag
          </Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Volgende week"
          onPress={() => goWeek(1, 'first')}
          style={({ pressed }) => [styles.navButton, pressed && styles.pressed]}
        >
          <ChevronRight size={18} color={COLORS.onDark} />
        </Pressable>
      </View>
    </PageHead>
  );

  if (resource.loading && !data) {
    return (
      <>
        {head}
        <Loading />
      </>
    );
  }
  if (!data) {
    return (
      <>
        {head}
        <ErrorState message={messageFor(resource.error)} onRetry={() => void resource.refresh()} />
      </>
    );
  }

  const today = todayKey();
  const nowMinutes = shownDay === today ? minutesOfDay(new Date().toISOString()) : null;

  return (
    <View style={styles.root}>
      {head}
      {resource.stale ? (
        <View style={styles.stale}>
          <StaleNotice onRetry={() => void resource.refresh()} />
        </View>
      ) : null}

      <View style={styles.bar}>
        <Text style={styles.barDay} numberOfLines={1}>
          {dayName(shownDay, locale)}
        </Text>
        <Pressable
          accessibilityRole="link"
          accessibilityLabel="Een rit aanvragen, opent logistiek.vtk.be"
          onPress={() => void WebBrowser.openBrowserAsync(data.logistiekUrl)}
          hitSlop={8}
          style={({ pressed }) => [styles.barButton, pressed && styles.pressed]}
        >
          <Text style={styles.barButtonLabel}>Aanvragen ↗</Text>
        </Pressable>
      </View>

      <View style={styles.days} accessibilityRole="tablist">
        {days.map((key, at) => {
          const active = key === shownDay;
          const isToday = key === today;
          return (
            <Pressable
              key={key}
              accessibilityRole="tab"
              accessibilityState={{ selected: active }}
              accessibilityLabel={`${dayName(key, locale)}${perDay[at] > 0 ? `, ${perDay[at]} ritten` : ''}`}
              onPress={() => setDay(key)}
              style={[styles.day, active && styles.dayActive]}
            >
              <Text style={[styles.dayName, active && styles.dayTextActive]}>{weekday(key, locale)}</Text>
              <Text style={[styles.dayNumber, isToday && styles.dayNumberToday, active && styles.dayTextActive]}>
                {Number(key.slice(8))}
              </Text>
              <View style={[styles.dot, perDay[at] > 0 && styles.dotOn]} />
            </Pressable>
          );
        })}
      </View>

      <View style={styles.body} {...swipe}>
        <ScrollView ref={scroll} contentContainerStyle={styles.gridPad} contentOffset={{ x: 0, y: scrollTarget }}>
          <View style={{ height: HOURS * HOUR_PX }}>
            <View style={[styles.gutter, { width: GUTTER }]} importantForAccessibility="no-hide-descendants">
              {Array.from({ length: HOURS }, (_, hour) => (
                <Text
                  key={hour}
                  style={[styles.hour, { top: hour * HOUR_PX - (hour === 0 ? 0 : 7) }]}
                  accessibilityElementsHidden
                >
                  {String(hour).padStart(2, '0')}:00
                </Text>
              ))}
            </View>
            <View style={[styles.column, { marginLeft: GUTTER }]}>
              {Array.from({ length: HOURS }, (_, hour) => (
                <View key={hour} style={[styles.line, { top: hour * HOUR_PX }]} />
              ))}
              {placed.length === 0 ? (
                <Text style={[styles.empty, { top: 8 * HOUR_PX + SPACING.sm }]}>Geen ritten op deze dag.</Text>
              ) : null}
              {placed.map((block) => (
                <TripBlock
                  key={block.trip.id}
                  block={block}
                  vehicle={vehicles.get(block.trip.vehicleId) ?? null}
                  dayKey={shownDay}
                  locale={locale}
                  onPress={() => setOpen(block.trip)}
                />
              ))}
              {nowMinutes !== null ? <View style={[styles.now, { top: (nowMinutes / 60) * HOUR_PX }]} /> : null}
            </View>
          </View>
        </ScrollView>
      </View>

      <View style={[styles.footer, { paddingBottom: SPACING.sm + insets.bottom }]}>
        {data.vehicles.length > 0 ? (
          <View style={styles.legend}>
            {data.vehicles.map((vehicle) => (
              <View key={vehicle.id} style={styles.legendItem}>
                {vehicle.pattern ? (
                  <View style={styles.swatch}>
                    <Hatch pattern={vehicle.pattern} id={`legend-${vehicle.id}`} />
                  </View>
                ) : null}
                <VehicleIcon vehicle={vehicle} size={13} />
                <Text style={styles.legendLabel}>{vehicle.name}</Text>
              </View>
            ))}
          </View>
        ) : null}
        <Text style={styles.hint}>Veeg opzij voor de vorige of volgende dag.</Text>
      </View>

      <TripSheet
        trip={open}
        vehicle={open ? (vehicles.get(open.vehicleId) ?? null) : null}
        locale={locale}
        onClose={() => setOpen(null)}
      />
    </View>
  );
}

/** Eén rit op zijn uur, met de regels van `BlockContent` op logistiek. */
function TripBlock({
  block,
  vehicle,
  dayKey,
  locale,
  onPress,
}: {
  block: Placed;
  vehicle: AppTransportVehicle | null;
  dayKey: string;
  locale: AppLocale;
  onPress: () => void;
}) {
  const { trip } = block;
  const awaitsDriver = !trip.driver && (vehicle?.needsDriver ?? true);
  const continuesBefore = dayKeyOf(trip.start) !== dayKey;
  const continuesAfter = endKey(trip) !== dayKey;
  const compact = block.lanes > 2;
  const height = Math.max(26, ((block.to - block.from) / 60) * HOUR_PX);
  const width = `${100 / block.lanes}%` as const;
  const time = `${continuesBefore ? '↑ ' : ''}${formatTime(trip.start, locale)}${
    compact ? '' : `-${formatTime(trip.end, locale)}`
  }${continuesAfter ? ' ↓' : ''}`;
  const label = [
    trip.title,
    trip.requester,
    vehicle?.name,
    `${formatTime(trip.start, locale)} tot ${formatTime(trip.end, locale)}`,
    trip.driver ? `chauffeur ${trip.driver}` : awaitsDriver ? 'nog geen chauffeur' : 'de aanvrager rijdt zelf',
    trip.destination ? `naar ${trip.destination}` : null,
  ]
    .filter(Boolean)
    .join(', ');

  return (
    <View
      style={[
        styles.blockBox,
        {
          top: (block.from / 60) * HOUR_PX,
          height,
          left: `${(100 / block.lanes) * block.lane}%`,
          width,
        },
      ]}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={label}
        onPress={onPress}
        style={({ pressed }) => [
          styles.block,
          { backgroundColor: trip.fill ?? COLORS.paper2 },
          awaitsDriver ? styles.blockNoDriver : styles.blockBorder,
          trip.status === 'REQUESTED' && styles.blockRequested,
          trip.mine && styles.blockMine,
          trip.status === 'COMPLETED' && styles.blockDone,
          pressed && styles.pressed,
        ]}
      >
        {vehicle?.pattern ? <Hatch pattern={vehicle.pattern} id={`trip-${trip.id}-${dayKey}`} /> : null}
        <View style={styles.blockTime}>
          <Text style={styles.blockTimeText} numberOfLines={1}>
            {time}
          </Text>
          {trip.driver && trip.driverInitials ? (
            <View style={[styles.chip, { backgroundColor: trip.tone ?? COLORS.yellow }]}>
              <Text style={styles.chipText}>{trip.driverInitials}</Text>
            </View>
          ) : awaitsDriver ? (
            <View style={[styles.chip, styles.chipOpen]}>
              <Text style={styles.chipOpenText}>+</Text>
            </View>
          ) : null}
        </View>
        <Text style={styles.blockLine} numberOfLines={1}>
          {trip.title}
        </Text>
        {vehicle ? (
          <View style={styles.blockVehicle}>
            <VehicleIcon vehicle={vehicle} size={12} />
            <Text style={styles.blockLine} numberOfLines={1}>
              {vehicle.name}
            </Text>
          </View>
        ) : null}
        {trip.driver ? (
          <Text style={[styles.blockLine, styles.blockDriver]} numberOfLines={1}>
            {trip.driver}
          </Text>
        ) : awaitsDriver ? (
          <Text style={[styles.blockLine, styles.blockNoDriverText]} numberOfLines={1}>
            Nog geen chauffeur
          </Text>
        ) : (
          <Text style={[styles.blockLine, styles.blockMuted]} numberOfLines={1}>
            Rijdt zelf
          </Text>
        )}
        {trip.destination ? (
          <Text style={[styles.blockLine, styles.blockMuted]} numberOfLines={1}>
            → {trip.destination}
          </Text>
        ) : null}
      </Pressable>
    </View>
  );
}

/** De leeskaart van een rit, zoals `TripCard` op logistiek, zonder nummers of nota's. */
function TripSheet({
  trip,
  vehicle,
  locale,
  onClose,
}: {
  trip: AppTransportTrip | null;
  vehicle: AppTransportVehicle | null;
  locale: AppLocale;
  onClose: () => void;
}) {
  const insets = useSafeAreaInsets();
  const awaitsDriver = trip ? !trip.driver && (vehicle?.needsDriver ?? true) : false;
  const rows = trip
    ? ([
        ['Wanneer', `${dayName(dayKeyOf(trip.start), locale)}, ${formatTime(trip.start, locale)} tot ${
          endKey(trip) === dayKeyOf(trip.start) ? '' : `${dayName(endKey(trip), locale)} `
        }${formatTime(trip.end, locale)}`],
        vehicle ? ['Voertuig', vehicle.name] : null,
        ['Chauffeur', trip.driver ?? (awaitsDriver ? 'Nog geen chauffeur' : 'De aanvrager rijdt zelf')],
        trip.helpers.length > 0 ? ['Bijrijders', trip.helpers.join(', ')] : null,
        trip.requester ? ['Post', trip.requester] : null,
        trip.submittedBy ? ['Aangevraagd door', trip.submittedBy] : null,
        trip.purpose ? ['Waarvoor', trip.purpose] : null,
        trip.cargo ? ['Mee te nemen', trip.cargo] : null,
        trip.destination ? ['Naar', trip.destination] : null,
      ].filter(Boolean) as [string, string][])
    : [];

  return (
    <Modal visible={trip !== null} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.sheetRoot}>
        <Pressable style={styles.scrim} onPress={onClose} accessibilityLabel="Sluiten" />
        {trip ? (
          <View style={[styles.sheet, { paddingBottom: insets.bottom + SPACING.lg }]}>
            <View style={styles.sheetHead}>
              <View style={[styles.sheetSwatch, { backgroundColor: trip.fill ?? COLORS.paper2 }]} />
              <View style={styles.flex}>
                <Text style={styles.sheetTitle}>{trip.title}</Text>
                <Text style={styles.hint}>
                  {[
                    trip.status === 'REQUESTED' ? 'Nog te beslissen' : trip.status === 'COMPLETED' ? 'Afgerond' : 'Goedgekeurd',
                    trip.leg === 'HEEN' ? 'heen' : trip.leg === 'TERUG' ? 'terug' : null,
                    trip.mine ? 'van jouw post' : null,
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </Text>
              </View>
              <Pressable onPress={onClose} hitSlop={12} accessibilityRole="button" accessibilityLabel="Sluiten">
                <X size={20} color={COLORS.muted} />
              </Pressable>
            </View>
            <ScrollView contentContainerStyle={styles.sheetBody}>
              {rows.map(([label, value]) => (
                <View key={label} style={styles.detail}>
                  <Text style={styles.detailLabel}>{label}</Text>
                  <Text style={[styles.detailValue, label === 'Chauffeur' && awaitsDriver && styles.noDriver]}>
                    {value}
                  </Text>
                </View>
              ))}
            </ScrollView>
          </View>
        ) : null}
      </View>
    </Modal>
  );
}

/**
 * De arcering van een voertuig (`.trip-pattern-*` op logistiek): een alfa op de
 * vulling, dus ze ligt over de kleur van de chauffeur heen.
 */
function Hatch({ pattern, id }: { pattern: NonNullable<AppTransportVehicle['pattern']>; id: string }) {
  const pid = `hatch-${id}`.replace(/[^a-zA-Z0-9_-]/g, '');
  return (
    <Svg style={StyleSheet.absoluteFill} pointerEvents="none">
      <Defs>
        {pattern === 'diagonal' ? (
          <Pattern id={pid} patternUnits="userSpaceOnUse" width={10} height={10} patternTransform="rotate(45)">
            <Rect x={0} y={0} width={4} height={10} fill={TRANSPORT.pattern} />
          </Pattern>
        ) : pattern === 'vertical' ? (
          <Pattern id={pid} patternUnits="userSpaceOnUse" width={9} height={9}>
            <Rect x={0} y={0} width={3} height={9} fill={TRANSPORT.pattern} />
          </Pattern>
        ) : pattern === 'dots' ? (
          <Pattern id={pid} patternUnits="userSpaceOnUse" width={7} height={7}>
            <Circle cx={3.5} cy={3.5} r={1.25} fill={TRANSPORT.patternStrong} />
          </Pattern>
        ) : (
          <Pattern id={pid} patternUnits="userSpaceOnUse" width={8} height={8}>
            <Line x1={0} y1={0.5} x2={8} y2={0.5} stroke={TRANSPORT.patternFaint} strokeWidth={1} />
            <Line x1={0.5} y1={0} x2={0.5} y2={8} stroke={TRANSPORT.patternFaint} strokeWidth={1} />
          </Pattern>
        )}
      </Defs>
      <Rect x={0} y={0} width="100%" height="100%" fill={`url(#${pid})`} />
    </Svg>
  );
}

function VehicleIcon({ vehicle, size }: { vehicle: AppTransportVehicle; size: number }) {
  return /fiets|bike/i.test(vehicle.name) || !vehicle.needsDriver ? (
    <Bike size={size} color={COLORS.ink} />
  ) : (
    <Truck size={size} color={COLORS.ink} />
  );
}

/**
 * De ritten die een dag raken, met hun minuten op die dag en hun baan: wie
 * overlapt, deelt de breedte, zoals `placeForDay` en `laneBox` op logistiek.
 */
function placeForDay(trips: AppTransportTrip[], key: string): Placed[] {
  const items = trips
    .filter((trip) => dayKeyOf(trip.start) <= key && endKey(trip) >= key)
    .map((trip) => ({
      trip,
      from: dayKeyOf(trip.start) === key ? minutesOfDay(trip.start) : 0,
      to: endKey(trip) === key && dayKeyOf(trip.end) === key ? minutesOfDay(trip.end) : HOURS * 60,
      lane: 0,
      lanes: 1,
    }))
    .sort((a, b) => a.from - b.from || b.to - a.to);

  // Groepen die elkaar raken krijgen samen hun banen.
  let group: Placed[] = [];
  let groupEnd = -1;
  const flush = () => {
    const lanes = Math.max(1, ...group.map((item) => item.lane + 1));
    for (const item of group) item.lanes = lanes;
    group = [];
  };
  for (const item of items) {
    if (item.from >= groupEnd && group.length > 0) flush();
    const taken = new Set(group.filter((other) => other.to > item.from).map((other) => other.lane));
    let lane = 0;
    while (taken.has(lane)) lane += 1;
    item.lane = lane;
    group.push(item);
    groupEnd = Math.max(groupEnd, item.to);
  }
  if (group.length > 0) flush();
  return items;
}

/** De laatste dag die een rit raakt; een rit tot middernacht eindigt de dag ervoor. */
function endKey(trip: AppTransportTrip): string {
  return dayKeyOf(new Date(new Date(trip.end).getTime() - 1).toISOString());
}

const minuteFormatter = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Europe/Brussels',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

function minutesOfDay(iso: string): number {
  const [hour, minute] = minuteFormatter.format(new Date(iso)).split(':').map(Number);
  return hour * 60 + minute;
}

function noonOf(key: string): Date {
  const [year, month, day] = key.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day, 12));
}

function shiftKey(key: string, days: number): string {
  return new Date(noonOf(key).getTime() + days * DAY_MS).toISOString().slice(0, 10);
}

function tagOf(locale: AppLocale) {
  return locale === 'en' ? 'en-GB' : 'nl-BE';
}

function dayName(key: string, locale: AppLocale): string {
  const text = new Intl.DateTimeFormat(tagOf(locale), {
    timeZone: 'UTC',
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  }).format(noonOf(key));
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function weekday(key: string, locale: AppLocale): string {
  const text = new Intl.DateTimeFormat(tagOf(locale), { timeZone: 'UTC', weekday: 'short' })
    .format(noonOf(key))
    .replace('.', '');
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function weekLabel(weekStart: string, locale: AppLocale): string {
  const tag = tagOf(locale);
  const monday = noonOf(weekStart);
  const sunday = new Date(monday.getTime() + 6 * DAY_MS);
  const full = new Intl.DateTimeFormat(tag, { timeZone: 'UTC', day: 'numeric', month: 'long' });
  const dayOnly = new Intl.DateTimeFormat(tag, { timeZone: 'UTC', day: 'numeric' });
  const from = monday.getUTCMonth() === sunday.getUTCMonth() ? dayOnly.format(monday) : full.format(monday);
  return `${from} tot ${full.format(sunday)}`;
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.paper },
  flex: { flex: 1 },
  pressed: { opacity: 0.6 },
  hint: { ...TYPE.small, fontSize: 11.5, color: COLORS.muted },
  stale: { paddingHorizontal: SPACING.md, paddingTop: SPACING.sm },

  weekNav: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, marginTop: SPACING.md },
  navButton: {
    width: 36,
    height: 36,
    borderRadius: RADIUS.pill,
    borderWidth: 1,
    borderColor: COLORS.onDarkControlBorder,
    alignItems: 'center',
    justifyContent: 'center',
  },
  navToday: {
    height: 36,
    paddingHorizontal: SPACING.lg,
    borderRadius: RADIUS.pill,
    backgroundColor: DARK_GLASS.background,
    borderWidth: 1,
    borderColor: DARK_GLASS.border,
    justifyContent: 'center',
  },
  navTodayActive: { backgroundColor: COLORS.yellow, borderColor: COLORS.yellow },
  navTodayLabel: { ...TYPE.small, fontFamily: FONTS.semibold, color: COLORS.onDark },
  navTodayLabelActive: { color: COLORS.ink },

  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.line,
    backgroundColor: COLORS.surface,
  },
  barDay: { flex: 1, fontFamily: FONTS.semibold, fontSize: 14, color: COLORS.ink },
  barButton: {
    height: 36,
    paddingHorizontal: 12,
    borderRadius: RADIUS.pill,
    borderWidth: 1,
    borderColor: TRANSPORT.border,
    backgroundColor: COLORS.surface,
    justifyContent: 'center',
  },
  barButtonLabel: { fontFamily: FONTS.semibold, fontSize: 12, color: COLORS.ink },

  days: {
    flexDirection: 'row',
    gap: 4,
    paddingHorizontal: 8,
    paddingTop: 8,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.line,
    backgroundColor: COLORS.surface,
  },
  day: {
    flex: 1,
    alignItems: 'center',
    gap: 2,
    minHeight: 44,
    paddingTop: 4,
    paddingBottom: 6,
    borderRadius: 12,
  },
  dayActive: { backgroundColor: TRANSPORT.emphasis },
  dayName: { fontSize: 11, lineHeight: 12, fontFamily: FONTS.regular, color: COLORS.muted },
  dayNumber: { fontSize: 15, lineHeight: 18, fontFamily: FONTS.semibold, color: COLORS.ink, fontVariant: ['tabular-nums'] },
  dayNumberToday: { color: TRANSPORT.emphasis, textDecorationLine: 'underline' },
  dayTextActive: { color: COLORS.paper },
  dot: { width: 5, height: 5, borderRadius: 3, backgroundColor: 'transparent' },
  dotOn: { backgroundColor: COLORS.yellow },

  body: { flex: 1, backgroundColor: COLORS.surface },
  gridPad: { paddingTop: 8, paddingRight: 10, paddingBottom: 24 },
  gutter: { position: 'absolute', top: 0, left: 0, bottom: 0 },
  hour: {
    position: 'absolute',
    right: 8,
    fontSize: 11,
    lineHeight: 14,
    fontFamily: FONTS.regular,
    color: COLORS.muted,
    fontVariant: ['tabular-nums'],
  },
  column: { position: 'relative', flex: 1, height: '100%' },
  line: { position: 'absolute', left: 0, right: 0, height: 1, backgroundColor: COLORS.line },
  empty: { position: 'absolute', left: SPACING.sm, ...TYPE.small, color: COLORS.muted },
  now: { position: 'absolute', left: 0, right: 0, height: 2, backgroundColor: TRANSPORT.now },

  blockBox: { position: 'absolute', paddingRight: BLOCK_GUTTER / 2, paddingBottom: 1 },
  block: {
    flex: 1,
    overflow: 'hidden',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 5,
    gap: 1,
  },
  blockBorder: { borderWidth: 1, borderColor: TRANSPORT.border },
  blockNoDriver: { borderWidth: 2, borderStyle: 'dashed', borderColor: TRANSPORT.edge },
  blockRequested: { borderTopWidth: 3, borderTopColor: TRANSPORT.emphasis, borderStyle: 'solid' },
  blockMine: { borderLeftWidth: 4, borderLeftColor: TRANSPORT.emphasis },
  blockDone: { opacity: 0.6 },
  blockTime: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  blockTimeText: {
    flex: 1,
    fontFamily: FONTS.semibold,
    fontSize: 11,
    lineHeight: 14,
    color: COLORS.ink,
    fontVariant: ['tabular-nums'],
  },
  blockLine: { fontSize: 11, lineHeight: 14, fontFamily: FONTS.regular, color: COLORS.ink, flexShrink: 1 },
  blockVehicle: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  blockDriver: { fontFamily: FONTS.medium },
  blockNoDriverText: { fontFamily: FONTS.semibold, color: COLORS.dangerInk },
  blockMuted: { color: COLORS.muted },
  chip: { width: 18, height: 18, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  chipText: { fontSize: 8, fontFamily: FONTS.bold, color: COLORS.ink },
  chipOpen: { backgroundColor: 'transparent', borderWidth: 1.25, borderColor: TRANSPORT.edge },
  chipOpenText: { fontSize: 11, lineHeight: 13, fontFamily: FONTS.semibold, color: COLORS.muted },

  footer: {
    gap: 6,
    paddingHorizontal: 12,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: COLORS.line,
    backgroundColor: COLORS.surface,
    alignItems: 'center',
  },
  legend: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', columnGap: SPACING.lg, rowGap: 4 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  legendLabel: { fontSize: 12, fontFamily: FONTS.regular, color: COLORS.muted },
  swatch: {
    width: 14,
    height: 14,
    borderRadius: 3,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(14, 26, 54, 0.2)',
    backgroundColor: COLORS.paper,
  },

  sheetRoot: { flex: 1, justifyContent: 'flex-end' },
  scrim: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(10, 15, 31, 0.45)' },
  sheet: {
    maxHeight: '80%',
    backgroundColor: COLORS.paper,
    borderTopLeftRadius: RADIUS.lg,
    borderTopRightRadius: RADIUS.lg,
  },
  sheetHead: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: SPACING.md,
    paddingHorizontal: SPACING.xl - 4,
    paddingTop: SPACING.lg,
    paddingBottom: SPACING.md,
  },
  sheetSwatch: { width: 14, height: 14, borderRadius: 4, marginTop: 6, borderWidth: 1, borderColor: TRANSPORT.border },
  sheetTitle: { ...TYPE.heading, color: COLORS.ink },
  sheetBody: { paddingHorizontal: SPACING.xl - 4, gap: SPACING.md, paddingBottom: SPACING.md },
  detail: { gap: 2 },
  detailLabel: {
    fontFamily: FONTS.semibold,
    fontSize: 11,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    color: COLORS.muted,
  },
  detailValue: { ...TYPE.body, color: COLORS.ink },
  noDriver: { color: COLORS.dangerInk },
});
