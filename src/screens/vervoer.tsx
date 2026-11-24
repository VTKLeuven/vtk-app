import * as WebBrowser from 'expo-web-browser';
import { Bike, Minus, Plus, Truck, X } from 'lucide-react-native';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import {
  Animated,
  Linking,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
  type ScrollViewInstance,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle, Defs, Line, Pattern, Rect } from 'react-native-svg';

import type { AppLocale, AppTransportTrip, AppTransportVehicle, AppTransportWeek } from '../api/contract';
import { fetchTransportWeek } from '../api/endpoints';
import { messageFor, useResource } from '../api/useResource';
import { PageHead } from '../components/PageHead';
import { ErrorState, Loading, StaleNotice } from '../components/ui';
import { formatTime } from '../format';
import { dayKeyOf, todayKey } from '../monthGrid';
import { useApp } from '../state/app';
import { COLORS, FONTS, RADIUS, SPACING, TRANSPORT, TYPE } from '../theme/tokens';
import { CARD_SHADOW } from '../components/HomeSection';

const DAY_MS = 24 * 60 * 60 * 1000;
const HOURS = 24;
/** De urenkolom, 3.25rem op logistiek.vtk.be. */
const GUTTER = 52;
/** Zoveel dagen staan er naast elkaar in beeld, zoals daar op een telefoon. */
const VISIBLE_DAYS = 3;
/** De hoogte van de dagkop (`.tg-dayhead`): naam, nummer en maand, en eronder het aantal ritten. */
const HEAD_HEIGHT = 54;
/** De kleinste uurhoogte, `MIN_HOUR_PX` daar. */
const MIN_HOUR_PX = 18;
/** De marge links en rechts van de witte kaart rond het raster. */
const GRID_MARGIN = 12;
/** De strook rechts naast de blokken, zodat ze niet tegen de rand plakken. */
const BLOCK_GUTTER = 6;
/** Zo ver kan je inzoomen: vier keer de uurhoogte waarop de hele dag past, zes uur in beeld. */
const MAX_ZOOM = 4;

type Placed = { trip: AppTransportTrip; from: number; to: number; lane: number; lanes: number };

/**
 * Transport: de planning van Logistiek.
 *
 * De pagina spreekt de taal van de rest van de app (lichte kop, witte kaart), maar
 * **de agenda zelf is die van logistiek.vtk.be** (`TimeGrid` in apps/logistiek),
 * zoals die op een telefoon opent: de week als kolommen naast elkaar, waarvan er
 * drie in beeld staan, en de hele dag van 00:00 tot 24:00 in één scherm (zoom 1
 * daar: de uurhoogte volgt uit de hoogte van het raster). Vegen schuift door de
 * week; vorige en volgende wisselen van week.
 *
 * - De dagkop zoals `.tg-dayhead`: "MA 23 nov" met het aantal ritten, vandaag met
 *   het nummer in een gele cirkel. Vandaag krijgt een warme tint, het weekend een
 *   lichte.
 * - **De vulkleur is de chauffeur, de arcering het voertuig, de rand de staat**:
 *   een streepjesrand zonder chauffeur, een streep bovenaan wat nog beslist moet
 *   worden, een rail links voor je eigen post. De kleuren rekent de site uit met
 *   dezelfde functies als logistiek (`AppTransportTrip.fill`).
 * - De rode lijn van nu, met het uur als pil in de urenkolom (`.tg-now-pill`).
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
  const { width } = useWindowDimensions();
  const [open, setOpen] = useState<AppTransportTrip | null>(null);
  const [paneHeight, setPaneHeight] = useState(0);
  const [zoom, setZoom] = useState(1);
  const [, setTick] = useState(0);
  // De weken die al binnen zijn, per maandag. De huidige komt via `useResource`
  // (met de leescache); de rest wordt erbij gehaald wanneer je ernaartoe veegt.
  const [weeks, setWeeks] = useState<Record<string, AppTransportWeek>>({});
  const loading = useRef(new Set<string>());
  const [firstVisible, setFirstVisible] = useState<string | null>(null);
  const horizontal = useRef<ScrollViewInstance>(null);
  const vertical = useRef<ScrollViewInstance>(null);
  const verticalY = useRef(0);
  const [scrollX] = useState(() => new Animated.Value(0));
  const resource = useResource('vervoer-nu', () => fetchTransportWeek(locale), locale);

  // De nu-lijn schuift mee met de klok.
  useEffect(() => {
    const id = setInterval(() => setTick((n) => n + 1), 60_000);
    return () => clearInterval(id);
  }, []);

  const current = resource.data;
  const all = useMemo(
    () => (current ? { ...weeks, [current.weekStart]: current } : weeks),
    [current, weeks],
  );
  const weekKeys = useMemo(() => Object.keys(all).sort(), [all]);
  const days = useMemo(
    () => weekKeys.flatMap((start) => Array.from({ length: 7 }, (_, i) => shiftKey(start, i))),
    [weekKeys],
  );
  const placed = useMemo(() => {
    const map = new Map<string, Placed[]>();
    for (const start of weekKeys) {
      for (let i = 0; i < 7; i++) {
        const key = shiftKey(start, i);
        map.set(key, placeForDay(all[start].trips, key));
      }
    }
    return map;
  }, [all, weekKeys]);
  const vehicles = useMemo(() => new Map((current?.vehicles ?? []).map((v) => [v.id, v])), [current]);

  const load = useCallback(
    (start: string) => {
      if (all[start] || loading.current.has(start)) return;
      loading.current.add(start);
      fetchTransportWeek(locale, start)
        .then((week) => setWeeks((known) => ({ ...known, [week.weekStart]: week })))
        .catch(() => undefined)
        .finally(() => loading.current.delete(start));
    },
    [all, locale],
  );

  // Rond de huidige week meteen de week ervoor en erna, zodat vegen niet wacht.
  useEffect(() => {
    if (!current) return;
    load(shiftKey(current.weekStart, -7));
    load(shiftKey(current.weekStart, 7));
  }, [current, load]);

  const today = todayKey();
  // Drie dagen in beeld, zoals op een telefoon op logistiek.vtk.be.
  const column = (width - GRID_MARGIN * 2 - GUTTER) / VISIBLE_DAYS;
  // Zoom 1: de hele dag past in het raster, zoals daar (`fitHourPx`); inzoomen maakt een uur hoger.
  const fitHour = Math.max(MIN_HOUR_PX, (paneHeight - HEAD_HEIGHT) / HOURS);
  const hourPx = fitHour * zoom;

  // Waar de agenda staat: de eerste dag in beeld. Bij het openen is dat vandaag.
  const anchor = firstVisible ?? (days.includes(today) ? today : (current?.weekStart ?? null));
  const anchorIndex = anchor ? Math.max(0, days.indexOf(anchor)) : 0;

  // De agenda schuift enkel zelf in twee gevallen: bij het openen (naar vandaag)
  // en wanneer er een week vóór bijkomt (alles schuift dan zeven kolommen op, en de
  // agenda springt mee terug). Nooit na een veeg: dat zette hem vroeger vast op
  // waar je losliet, midden in het uitglijden, en dan stopte een veeg na één dag.
  const offsetX = useRef(0);
  const shownFirstDay = useRef<string | null>(null);
  const firstDay = days[0] ?? null;
  useLayoutEffect(() => {
    if (paneHeight === 0 || !firstDay) return;
    if (shownFirstDay.current === null) {
      offsetX.current = anchorIndex * column;
      horizontal.current?.scrollTo({ x: offsetX.current, animated: false });
    } else if (firstDay < shownFirstDay.current) {
      offsetX.current += days.indexOf(shownFirstDay.current) * column;
      horizontal.current?.scrollTo({ x: offsetX.current, animated: false });
    }
    shownFirstDay.current = firstDay;
    // Enkel bij een nieuwe eerste dag of een andere kolombreedte; niet bij elke veeg.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [firstDay, column, paneHeight]);

  // Een veeg schuift drie dagen op, zoals er drie in beeld staan. De stappen
  // vertrekken van de dag waarmee de agenda opende, zodat je altijd op een rand van
  // drie dagen uitkomt.
  const snapBase = anchorIndex % VISIBLE_DAYS;
  const snapOffsets = useMemo(() => {
    const offsets: number[] = [];
    for (let i = snapBase; i <= days.length - VISIBLE_DAYS; i += VISIBLE_DAYS) offsets.push(i * column);
    return offsets;
  }, [snapBase, days.length, column]);

  const settle = (x: number) => {
    offsetX.current = x;
    const index = Math.max(0, Math.min(days.length - 1, Math.round(x / column)));
    const key = days[index];
    if (!key) return;
    setFirstVisible(key);
    // Dicht bij de rand van wat er is: de week ernaast erbij halen.
    if (index < 7) load(shiftKey(weekKeys[0], -7));
    if (index + VISIBLE_DAYS > days.length - 7) load(shiftKey(weekKeys[weekKeys.length - 1], 7));
  };

  // Inzoomen houdt het midden van wat je ziet op zijn plek.
  const zoomTo = useCallback(
    (next: number) => {
      const clamped = Math.min(MAX_ZOOM, Math.max(1, next));
      setZoom((old) => {
        if (old === clamped) return old;
        const middle = paneHeight / 2;
        const y = ((verticalY.current + middle) * clamped) / old - middle;
        requestAnimationFrame(() => vertical.current?.scrollTo({ y: Math.max(0, y), animated: false }));
        return clamped;
      });
    },
    [paneHeight],
  );
  const pinchStart = useRef(1);
  const pinch = Gesture.Pinch()
    .runOnJS(true)
    .onStart(() => {
      pinchStart.current = zoom;
    })
    .onUpdate((event) => zoomTo(pinchStart.current * event.scale));

  // De week bovenaan volgt wat er in beeld staat.
  const shownWeekStart = anchor ? weekKeys.filter((start) => start <= anchor).pop() : undefined;
  const shownWeek = (shownWeekStart && all[shownWeekStart]) || current;

  const head = (
    <PageHead
      title={shownWeek?.weekNumber ? `Week ${shownWeek.weekNumber}` : 'Transport'}
      subtitle={shownWeek ? weekLabel(shownWeek.weekStart, locale) : 'De ritten van Logistiek'}
      right={
        current ? (
          <Pressable
            accessibilityRole="link"
            accessibilityLabel="Een rit aanvragen, opent logistiek.vtk.be"
            onPress={() => void WebBrowser.openBrowserAsync(current.logistiekUrl)}
            style={({ pressed }) => [styles.request, pressed && styles.pressed]}
          >
            <Text style={styles.requestLabel}>Rit aanvragen ↗</Text>
          </Pressable>
        ) : undefined
      }
    />
  );

  if (resource.loading && !current) {
    return (
      <>
        {head}
        <Loading />
      </>
    );
  }
  if (!current) {
    return (
      <>
        {head}
        <ErrorState message={messageFor(resource.error)} onRetry={() => void resource.refresh()} />
      </>
    );
  }

  const nowMinutes = days.includes(today) ? minutesOfDay(new Date().toISOString()) : null;
  const ready = paneHeight > 0;

  return (
    <View style={styles.root}>
      {head}
      {resource.stale ? (
        <View style={styles.stale}>
          <StaleNotice onRetry={() => void resource.refresh()} />
        </View>
      ) : null}

      <GestureDetector gesture={pinch}>
        <View style={styles.pane} onLayout={(event) => setPaneHeight(event.nativeEvent.layout.height)}>
          {ready ? (
            <>
              {/* De dagkoppen schuiven mee met de dagen eronder, op de native thread. */}
              <View style={[styles.headRow, { height: HEAD_HEIGHT }]}>
                <View style={{ width: GUTTER }} />
                <View style={styles.headClip}>
                  <Animated.View
                    style={{
                      flexDirection: 'row',
                      width: column * days.length,
                      transform: [{ translateX: Animated.multiply(scrollX, -1) }],
                    }}
                  >
                    {days.map((key) => {
                      const count = placed.get(key)?.length ?? 0;
                      const isToday = key === today;
                      return (
                        <View
                          key={key}
                          style={[styles.dayHead, { width: column, height: HEAD_HEIGHT }]}
                          accessibilityLabel={`${dayName(key, locale)}, ${tripCount(count)}`}
                        >
                          <View style={styles.dayHeadRow}>
                            <Text style={styles.dayHeadName}>{weekday(key, locale).toUpperCase()}</Text>
                            <View style={[styles.dayHeadNum, isToday && styles.dayHeadNumToday]}>
                              <Text style={[styles.dayHeadNumText, isToday && styles.dayHeadNumTextToday]}>
                                {Number(key.slice(8))}
                              </Text>
                            </View>
                            {!isToday ? <Text style={styles.dayHeadMuted}>{monthShort(key, locale)}</Text> : null}
                          </View>
                          <Text style={styles.dayHeadMuted}>{tripCount(count)}</Text>
                        </View>
                      );
                    })}
                  </Animated.View>
                </View>
              </View>

              <ScrollView
                ref={vertical}
                scrollEnabled={zoom > 1}
                showsVerticalScrollIndicator={zoom > 1}
                scrollEventThrottle={16}
                onScroll={(event) => {
                  verticalY.current = event.nativeEvent.contentOffset.y;
                }}
              >
                <View style={styles.paneRow}>
                  {/* De urenkolom staat vast; de dagen schuiven ernaast. */}
                  <View style={{ width: GUTTER, height: HOURS * hourPx }} importantForAccessibility="no-hide-descendants">
                    {Array.from({ length: HOURS - 1 }, (_, i) => i + 1).map((hour) => (
                      <Text key={hour} style={[styles.hour, { top: hour * hourPx - 7 }]} accessibilityElementsHidden>
                        {String(hour).padStart(2, '0')}:00
                      </Text>
                    ))}
                    {nowMinutes !== null ? (
                      <View style={[styles.nowPill, { top: (nowMinutes / 60) * hourPx - 8 }]}>
                        <Text style={styles.nowPillText}>{formatTime(new Date().toISOString(), locale)}</Text>
                      </View>
                    ) : null}
                  </View>

                  <Animated.ScrollView
                    ref={horizontal}
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    snapToOffsets={snapOffsets}
                    disableIntervalMomentum
                    decelerationRate="fast"
                    scrollEventThrottle={16}
                    onScroll={Animated.event([{ nativeEvent: { contentOffset: { x: scrollX } } }], {
                      useNativeDriver: true,
                    })}
                    onMomentumScrollEnd={(event) => settle(event.nativeEvent.contentOffset.x)}
                  >
                    {days.map((key, at) => {
                      const blocks = placed.get(key) ?? [];
                      const isToday = key === today;
                      const weekend = at % 7 >= 5;
                      return (
                        <View
                          key={key}
                          style={[
                            styles.dayBody,
                            { width: column, height: HOURS * hourPx },
                            isToday && styles.dayToday,
                            weekend && !isToday && styles.dayWeekend,
                          ]}
                        >
                          {Array.from({ length: HOURS - 1 }, (_, i) => i + 1).map((hour) => (
                            <View key={hour} style={[styles.line, { top: hour * hourPx }]} />
                          ))}
                          {blocks.map((block) => (
                            <TripBlock
                              key={block.trip.id}
                              block={block}
                              hourPx={hourPx}
                              vehicle={vehicles.get(block.trip.vehicleId) ?? null}
                              dayKey={key}
                              locale={locale}
                              onPress={() => setOpen(block.trip)}
                            />
                          ))}
                          {isToday && nowMinutes !== null ? (
                            <View style={[styles.now, { top: (nowMinutes / 60) * hourPx }]} />
                          ) : null}
                        </View>
                      );
                    })}
                  </Animated.ScrollView>
                </View>
              </ScrollView>

              {/* Zoomen ook zonder twee vingers, zoals bij een kaart. */}
              <View style={styles.zoom}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Inzoomen, minder uren in beeld"
                  accessibilityState={{ disabled: zoom >= MAX_ZOOM }}
                  disabled={zoom >= MAX_ZOOM}
                  onPress={() => zoomTo(zoom * 1.5)}
                  style={({ pressed }) => [styles.zoomButton, (pressed || zoom >= MAX_ZOOM) && styles.pressed]}
                >
                  <Plus size={18} color={COLORS.ink} />
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Uitzoomen, meer uren in beeld"
                  accessibilityState={{ disabled: zoom <= 1 }}
                  disabled={zoom <= 1}
                  onPress={() => zoomTo(zoom / 1.5)}
                  style={({ pressed }) => [styles.zoomButton, (pressed || zoom <= 1) && styles.pressed]}
                >
                  <Minus size={18} color={COLORS.ink} />
                </Pressable>
              </View>
            </>
          ) : null}
        </View>
      </GestureDetector>

      {current.vehicles.length > 0 ? (
        <View style={[styles.footer, { paddingBottom: SPACING.sm + insets.bottom }]}>
          <View style={styles.legend}>
            {current.vehicles.map((vehicle) => (
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
        </View>
      ) : null}

      <TripSheet
        trip={open}
        vehicle={open ? (vehicles.get(open.vehicleId) ?? null) : null}
        locale={locale}
        onClose={() => setOpen(null)}
      />
    </View>
  );
}

/** "vrij", "1 rit", "4 ritten", zoals `tripCount` op logistiek. */
function tripCount(count: number): string {
  return count === 0 ? 'vrij' : count === 1 ? '1 rit' : `${count} ritten`;
}

/** "nov" */
function monthShort(key: string, locale: AppLocale): string {
  return new Intl.DateTimeFormat(tagOf(locale), { timeZone: 'Europe/Brussels', month: 'short' })
    .format(noonOf(key))
    .replace('.', '');
}

/** Eén rit op zijn uur, met de regels van `BlockContent` op logistiek. */
function TripBlock({
  block,
  hourPx,
  vehicle,
  dayKey,
  locale,
  onPress,
}: {
  block: Placed;
  /** De uurhoogte van het raster; die volgt uit de hoogte van het scherm. */
  hourPx: number;
  vehicle: AppTransportVehicle | null;
  dayKey: string;
  locale: AppLocale;
  onPress: () => void;
}) {
  const { trip } = block;
  const awaitsDriver = !trip.driver && (vehicle?.needsDriver ?? true);
  const continuesBefore = dayKeyOf(trip.start) !== dayKey;
  const continuesAfter = endKey(trip) !== dayKey;
  // Een smalle kolom gedeeld door twee of meer: enkel het beginuur, zoals daar.
  const compact = block.lanes > 1;
  const height = Math.max(18, ((block.to - block.from) / 60) * hourPx);
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
          top: (block.from / 60) * hourPx,
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
                    <Linked text={value} />
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
 * Een waarde met links erin (een Google Sheet bij "Mee te nemen", een kaart bij
 * "Naar"): de links worden aantikbaar. Een link naar Google Maps opent de kaart-app,
 * de rest de browser in de app.
 */
function Linked({ text }: { text: string }) {
  const parts = text.split(/(https?:\/\/[^\s]+)/g);
  return (
    <>
      {parts.map((part, index) =>
        /^https?:\/\//.test(part) ? (
          <Text
            key={index}
            accessibilityRole="link"
            style={styles.link}
            onPress={() =>
              /(maps\.app\.goo\.gl|google\.[a-z.]+\/maps|maps\.google\.)/i.test(part)
                ? void Linking.openURL(part)
                : void WebBrowser.openBrowserAsync(part)
            }
          >
            {part}
          </Text>
        ) : (
          part
        ),
      )}
    </>
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

  // "Rit aanvragen" rechts van de week, als pil zoals de knoppen in de kop.
  request: {
    height: 44,
    justifyContent: 'center',
    paddingHorizontal: SPACING.lg,
    borderRadius: RADIUS.pill,
    backgroundColor: COLORS.surface,
    ...CARD_SHADOW,
  },
  requestLabel: { fontFamily: FONTS.semibold, fontSize: 14, color: COLORS.ink },
  headRow: { flexDirection: 'row', backgroundColor: COLORS.surface, zIndex: 2 },
  headClip: { flex: 1, overflow: 'hidden' },
  zoom: { position: 'absolute', right: SPACING.sm, bottom: SPACING.sm, gap: SPACING.sm, zIndex: 4 },
  zoomButton: {
    width: 40,
    height: 40,
    borderRadius: RADIUS.pill,
    backgroundColor: COLORS.surface,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: COLORS.line2,
    ...CARD_SHADOW,
  },
  link: { color: COLORS.navy, textDecorationLine: 'underline' },

  // Het raster als witte kaart; onderaan loopt hij tot tegen de legende.
  pane: {
    flex: 1,
    marginHorizontal: GRID_MARGIN,
    marginTop: SPACING.xs,
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    backgroundColor: COLORS.surface,
    overflow: 'hidden',
  },
  paneRow: { flexDirection: 'row' },
  hour: {
    position: 'absolute',
    right: 6,
    fontSize: 10.5,
    lineHeight: 14,
    fontFamily: FONTS.regular,
    color: COLORS.muted,
    fontVariant: ['tabular-nums'],
  },
  // `.tg-now-pill`: het uur van nu, op de hoogte van de rode lijn.
  nowPill: {
    position: 'absolute',
    right: 2,
    paddingHorizontal: 5,
    borderRadius: RADIUS.pill,
    backgroundColor: TRANSPORT.now,
    zIndex: 3,
  },
  nowPillText: { fontSize: 10, lineHeight: 16, fontFamily: FONTS.bold, color: COLORS.surface, fontVariant: ['tabular-nums'] },
  // `.tg-dayhead`
  dayHead: {
    justifyContent: 'center',
    gap: 1,
    paddingHorizontal: 8,
    borderLeftWidth: 1,
    borderLeftColor: COLORS.line,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.line2,
  },
  dayHeadRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  dayHeadName: { fontSize: 11, fontFamily: FONTS.semibold, letterSpacing: 0.7, color: COLORS.muted },
  dayHeadNum: { minWidth: 28, height: 28, alignItems: 'center', justifyContent: 'center' },
  dayHeadNumToday: { borderRadius: RADIUS.pill, backgroundColor: COLORS.yellow, paddingHorizontal: 4 },
  dayHeadNumText: { fontSize: 18, fontFamily: FONTS.bold, letterSpacing: -0.3, color: COLORS.ink, fontVariant: ['tabular-nums'] },
  dayHeadNumTextToday: { fontSize: 15 },
  dayHeadMuted: { fontSize: 11, fontFamily: FONTS.regular, color: COLORS.muted },
  dayBody: { borderLeftWidth: 1, borderLeftColor: COLORS.line },
  // Vandaag warm getint, het weekend licht, zoals daar.
  dayToday: { backgroundColor: TRANSPORT.today },
  dayWeekend: { backgroundColor: 'rgba(239, 242, 248, 0.45)' },
  line: { position: 'absolute', left: 0, right: 0, height: 1, backgroundColor: COLORS.line },
  now: { position: 'absolute', left: 0, right: 0, height: 2, backgroundColor: TRANSPORT.now, zIndex: 2 },

  blockBox: { position: 'absolute', paddingHorizontal: 2, paddingRight: BLOCK_GUTTER / 2, paddingBottom: 1 },
  block: {
    flex: 1,
    overflow: 'hidden',
    borderRadius: 8,
    paddingHorizontal: 5,
    paddingVertical: 3,
    gap: 0,
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
    marginHorizontal: GRID_MARGIN,
    paddingHorizontal: 12,
    paddingTop: 10,
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
