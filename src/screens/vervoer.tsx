import * as WebBrowser from 'expo-web-browser';
import { ChevronLeft, ChevronRight } from 'lucide-react-native';
import { useMemo, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';

import type { AppLocale, AppTransportTrip, AppTransportWeek } from '../api/contract';
import { fetchTransportWeek } from '../api/endpoints';
import { messageFor, useResource } from '../api/useResource';
import { PageHead } from '../components/PageHead';
import { ErrorState, Loading, StaleNotice } from '../components/ui';
import { formatTime } from '../format';
import { dayKeyOf, todayKey } from '../monthGrid';
import { useApp } from '../state/app';
import { COLORS, DARK_GLASS, FONTS, RADIUS, SPACING, TYPE } from '../theme/tokens';

const DAY_MS = 24 * 60 * 60 * 1000;
const ALL = 'alle';

/**
 * Transport: de planning van Logistiek, zoals logistiek.vtk.be/vervoer/bezetting
 * ze toont aan het praesidium.
 *
 * Wie hier komt, mag het zien: de server geeft deze week enkel aan een
 * praesidiumpost, een werkgroep, een jaarwerking of het team
 * (`canSeeTransport`), en de knop onder Meer staat er enkel voor hen. Een gewone
 * student ziet hem niet.
 *
 * Per dag, in de volgorde van de dag, met wat een post wil weten: wat de rit is,
 * met welk voertuig, wie rijdt en wie meerijdt, voor welke post. Een rit van jou
 * of je post krijgt de gele rail. Telefoonnummers, het ophaaladres en de nota's
 * staan er bewust niet in; die horen bij Logistiek. Een rit aanvragen of
 * wijzigen gebeurt op logistiek.vtk.be.
 */
export default function VervoerScreen() {
  const { locale } = useApp();
  const [week, setWeek] = useState<string | undefined>(undefined);
  const [vehicle, setVehicle] = useState(ALL);
  const [open, setOpen] = useState<string | null>(null);
  const resource = useResource(
    `vervoer-${week ?? 'nu'}`,
    () => fetchTransportWeek(locale, week),
    `${locale}:${week ?? 'nu'}`,
  );

  const data = resource.data;
  const days = useMemo(() => (data ? groupByDay(data, vehicle) : []), [data, vehicle]);

  const move = (delta: number) => {
    if (!data) return;
    setOpen(null);
    setWeek(shiftKey(data.weekStart, delta * 7));
  };

  const head = (
    <PageHead
      title="Transport"
      subtitle={data ? weekLabel(data.weekStart, locale) : 'De ritten van Logistiek'}
      tabs={
        data && data.vehicles.length > 1
          ? {
              scroll: true,
              value: vehicle,
              onChange: setVehicle,
              options: [
                { value: ALL, label: 'Alles' },
                ...data.vehicles.map((v) => ({
                  value: v.id,
                  label: v.name,
                  count: data.trips.filter((trip) => trip.vehicleId === v.id).length,
                })),
              ],
            }
          : undefined
      }
    >
      <View style={styles.weekNav}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Vorige week"
          onPress={() => move(-1)}
          style={({ pressed }) => [styles.navButton, pressed && styles.pressed]}
        >
          <ChevronLeft size={18} color={COLORS.onDark} />
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Deze week"
          onPress={() => {
            setOpen(null);
            setWeek(undefined);
          }}
          style={({ pressed }) => [styles.navToday, pressed && styles.pressed]}
        >
          <Text style={styles.navTodayLabel}>Deze week</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Volgende week"
          onPress={() => move(1)}
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

  const vehicles = new Map(data.vehicles.map((v) => [v.id, v]));
  const today = todayKey();

  return (
    <>
      {head}
      <ScrollView
        style={styles.root}
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={resource.refreshing} onRefresh={() => void resource.refresh()} />}
      >
        {resource.stale ? <StaleNotice onRetry={() => void resource.refresh()} /> : null}

        {days.every((day) => day.trips.length === 0) ? (
          <Text style={styles.hint}>Geen ritten deze week.</Text>
        ) : null}

        {days.map((day) =>
          day.trips.length === 0 ? null : (
            <View key={day.key} style={styles.day}>
              <View style={styles.dayHead}>
                <Text style={styles.dayName}>{dayName(day.key, locale)}</Text>
                {day.key === today ? <Text style={styles.todayTag}>Vandaag</Text> : null}
              </View>
              <View style={styles.register}>
                {day.trips.map((trip) => (
                  <TripRow
                    key={`${day.key}-${trip.id}`}
                    trip={trip}
                    vehicle={vehicles.get(trip.vehicleId)?.name ?? ''}
                    needsDriver={vehicles.get(trip.vehicleId)?.needsDriver ?? true}
                    dayKey={day.key}
                    locale={locale}
                    expanded={open === trip.id}
                    onToggle={() => setOpen(open === trip.id ? null : trip.id)}
                  />
                ))}
              </View>
            </View>
          ),
        )}

        <Pressable
          accessibilityRole="link"
          accessibilityLabel="Een rit aanvragen, opent logistiek.vtk.be"
          onPress={() => void WebBrowser.openBrowserAsync(data.logistiekUrl)}
          style={({ pressed }) => [styles.footer, pressed && styles.pressed]}
        >
          <Text style={styles.body}>Een rit aanvragen of wijzigen</Text>
          <Text style={styles.hint}>logistiek.vtk.be ↗</Text>
        </Pressable>
      </ScrollView>
    </>
  );
}

function TripRow({
  trip,
  vehicle,
  needsDriver,
  dayKey,
  locale,
  expanded,
  onToggle,
}: {
  trip: AppTransportTrip;
  vehicle: string;
  /** De bakfiets neemt de aanvrager zelf mee; daar ontbreekt geen chauffeur. */
  needsDriver: boolean;
  dayKey: string;
  locale: AppLocale;
  expanded: boolean;
  onToggle: () => void;
}) {
  const startsToday = dayKeyOf(trip.start) === dayKey;
  const endsToday = dayKeyOf(trip.end) === dayKey;
  const from = startsToday ? formatTime(trip.start, locale) : '…';
  const to = endsToday ? formatTime(trip.end, locale) : '…';
  const missingDriver = !trip.driver && needsDriver;
  const crew = [trip.driver ?? (needsDriver ? 'Nog geen chauffeur' : null), ...trip.helpers]
    .filter(Boolean)
    .join(', ');
  const details = [
    trip.purpose ? ['Waarvoor', trip.purpose] : null,
    trip.cargo ? ['Mee te nemen', trip.cargo] : null,
    trip.destination ? ['Naar', trip.destination] : null,
    trip.submittedBy ? ['Aangevraagd door', trip.submittedBy] : null,
    trip.helpers.length > 0 ? ['Bijrijders', trip.helpers.join(', ')] : null,
  ].filter(Boolean) as [string, string][];

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ expanded }}
      onPress={onToggle}
      style={({ pressed }) => [
        styles.trip,
        trip.mine && styles.tripMine,
        trip.status === 'COMPLETED' && styles.tripDone,
        pressed && styles.pressedRow,
      ]}
    >
      <View style={styles.time}>
        <Text style={styles.timeText}>{from}</Text>
        <Text style={styles.timeEnd}>{to}</Text>
      </View>
      <View style={styles.flex}>
        <View style={styles.tripHead}>
          <Text style={[styles.tripTitle, styles.flex]} numberOfLines={expanded ? undefined : 2}>
            {trip.title}
            {trip.leg ? <Text style={styles.leg}>  {trip.leg === 'HEEN' ? 'heen' : 'terug'}</Text> : null}
          </Text>
          {trip.status === 'REQUESTED' ? <Text style={styles.requested}>Aangevraagd</Text> : null}
        </View>
        <Text style={styles.meta} numberOfLines={expanded ? undefined : 1}>
          {[vehicle, trip.requester].filter(Boolean).join(' · ')}
        </Text>
        {crew ? (
          <Text style={[styles.meta, missingDriver && styles.noDriver]} numberOfLines={expanded ? undefined : 1}>
            {crew}
          </Text>
        ) : null}
        {expanded && details.length > 0 ? (
          <View style={styles.details}>
            {details.map(([label, value]) => (
              <View key={label} style={styles.detail}>
                <Text style={styles.detailLabel}>{label}</Text>
                <Text style={styles.detailValue}>{value}</Text>
              </View>
            ))}
          </View>
        ) : null}
      </View>
    </Pressable>
  );
}

/** De zeven dagen van de week, met per dag de ritten die die dag raken. */
function groupByDay(data: AppTransportWeek, vehicle: string) {
  const days = Array.from({ length: 7 }, (_, index) => ({
    key: shiftKey(data.weekStart, index),
    trips: [] as AppTransportTrip[],
  }));
  for (const trip of data.trips) {
    if (vehicle !== ALL && trip.vehicleId !== vehicle) continue;
    const first = dayKeyOf(trip.start);
    const last = dayKeyOf(new Date(new Date(trip.end).getTime() - 1).toISOString());
    for (const day of days) {
      if (day.key >= first && day.key <= last) day.trips.push(trip);
    }
  }
  return days;
}

function noonOf(key: string): Date {
  const [year, month, day] = key.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day, 12));
}

function shiftKey(key: string, days: number): string {
  return new Date(noonOf(key).getTime() + days * DAY_MS).toISOString().slice(0, 10);
}

function dayName(key: string, locale: AppLocale): string {
  return new Intl.DateTimeFormat(locale === 'en' ? 'en-GB' : 'nl-BE', {
    timeZone: 'UTC',
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  }).format(noonOf(key));
}

function weekLabel(weekStart: string, locale: AppLocale): string {
  const tag = locale === 'en' ? 'en-GB' : 'nl-BE';
  const monday = noonOf(weekStart);
  const sunday = new Date(monday.getTime() + 6 * DAY_MS);
  const full = new Intl.DateTimeFormat(tag, { timeZone: 'UTC', day: 'numeric', month: 'long' });
  const dayOnly = new Intl.DateTimeFormat(tag, { timeZone: 'UTC', day: 'numeric' });
  const from = monday.getUTCMonth() === sunday.getUTCMonth() ? dayOnly.format(monday) : full.format(monday);
  return `${from} tot ${full.format(sunday)}`;
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.paper },
  content: { padding: SPACING.xl - 4, gap: SPACING.xl, paddingBottom: SPACING.xxl },
  flex: { flex: 1 },
  pressed: { opacity: 0.6 },
  pressedRow: { backgroundColor: COLORS.paper2 },
  body: { ...TYPE.body, color: COLORS.body },
  hint: { ...TYPE.small, color: COLORS.muted },
  meta: { ...TYPE.small, color: COLORS.body },

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
  navTodayLabel: { ...TYPE.small, fontFamily: FONTS.semibold, color: COLORS.onDark },

  day: { gap: SPACING.sm },
  dayHead: { flexDirection: 'row', alignItems: 'baseline', gap: SPACING.sm },
  dayName: { ...TYPE.cardTitle, fontSize: 17, color: COLORS.ink, textTransform: 'capitalize' },
  todayTag: {
    ...TYPE.small,
    fontSize: 12,
    fontFamily: FONTS.semibold,
    color: COLORS.ink,
    backgroundColor: COLORS.yellow,
    borderRadius: RADIUS.pill,
    paddingHorizontal: 8,
    overflow: 'hidden',
  },
  register: { borderTopWidth: 1, borderTopColor: COLORS.line2 },
  trip: {
    flexDirection: 'row',
    gap: SPACING.md,
    paddingVertical: 12,
    paddingLeft: SPACING.sm,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.line2,
    borderLeftWidth: 3,
    borderLeftColor: 'transparent',
  },
  tripMine: { borderLeftColor: COLORS.yellow },
  tripDone: { opacity: 0.55 },
  time: { width: 46 },
  timeText: { fontFamily: FONTS.semibold, fontSize: 14, color: COLORS.ink, fontVariant: ['tabular-nums'] },
  timeEnd: { ...TYPE.small, color: COLORS.muted, fontVariant: ['tabular-nums'] },
  tripHead: { flexDirection: 'row', alignItems: 'flex-start', gap: SPACING.sm },
  tripTitle: { fontFamily: FONTS.semibold, fontSize: 15, lineHeight: 20, color: COLORS.ink },
  leg: { fontFamily: FONTS.medium, fontSize: 12, color: COLORS.muted },
  requested: {
    ...TYPE.small,
    fontSize: 12,
    fontFamily: FONTS.medium,
    color: COLORS.navy,
    borderWidth: 1,
    borderColor: COLORS.line2,
    borderRadius: RADIUS.pill,
    paddingHorizontal: 8,
    overflow: 'hidden',
  },
  noDriver: { color: COLORS.dangerInk },
  details: { marginTop: SPACING.sm, gap: 6 },
  detail: { gap: 1 },
  detailLabel: {
    fontFamily: FONTS.semibold,
    fontSize: 11,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    color: COLORS.muted,
  },
  detailValue: { ...TYPE.body, color: COLORS.ink },

  footer: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    paddingTop: SPACING.md,
    borderTopWidth: 1,
    borderTopColor: COLORS.line,
  },
});
