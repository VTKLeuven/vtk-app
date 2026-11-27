import { CalendarClock } from 'lucide-react-native';
import { useState } from 'react';
import { ActivityIndicator, Alert, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';

import type { AppCudiTimeslot, AppCudiTimeslots } from '../api/contract';
import { fetchCudiTimeslots, releaseCudiTimeslot, reserveCudiTimeslot } from '../api/endpoints';
import { messageFor, useResource } from '../api/useResource';
import { YellowHead } from '../components/YellowHead';
import { CardList, Empty, ErrorState, Loading, StaleNotice } from '../components/ui';
import { formatDay, formatTime } from '../format';
import { useApp } from '../state/app';
import { COLORS, FONTS, RADIUS, SPACING, TYPE } from '../theme/tokens';
import { CARD_SHADOW } from '../components/HomeSection';

/**
 * Een tijdslot kiezen om je cursussen af te halen, zoals *Tijdslot reserveren* op
 * cudi: per dag de vrije momenten, met hoeveel plaatsen er nog zijn.
 *
 * De regels zijn die van cudi (`lib/student-timeslots.ts` daar): niet voorbij,
 * niet volzet, één slot per dag als de cursusdienst dat vraagt, en verwijderen tot
 * een aantal uur voor de start. Dit scherm schakelt enkel knoppen uit; weigert
 * cudi toch, dan zegt een melding waarom.
 *
 * Sinds eind november 2026 in de gele kop: daarin staat je tijdslot (of de uitleg
 * wanneer je er nog geen hebt), en per dag staan de momenten als rijen in één
 * witte kaart, met hoeveel er nog vrij zijn en een knop om te kiezen. Tot dan
 * waren het drie tegels naast elkaar per dag, en die lazen als een rooster.
 */
export default function CudiTijdslotenScreen() {
  const { locale, viewer } = useApp();
  const resource = useResource(
    'cudi-tijdsloten',
    () => fetchCudiTimeslots(locale),
    `${locale}:${viewer?.id ?? 'anon'}`,
    Boolean(viewer),
  );
  const [state, setState] = useState<AppCudiTimeslots | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const data = state ?? resource.data;
  const head = (extra?: React.ReactNode) => (
    <YellowHead title="Tijdslot" subtitle="Je cursussen afhalen bij de cursusdienst" back>
      {extra}
    </YellowHead>
  );

  if (resource.loading && !data) {
    return (
      <View style={styles.root}>
        {head()}
        <Loading />
      </View>
    );
  }
  if (!data) {
    return (
      <View style={styles.root}>
        {head()}
        <ErrorState message={messageFor(resource.error)} onRetry={() => void resource.refresh()} />
      </View>
    );
  }
  if (!data.enabled) {
    return (
      <View style={styles.root}>
        {head()}
        <Empty
          title="Geen tijdsloten nodig"
          hint="De cursusdienst werkt nu zonder tijdsloten. Kom gewoon langs tijdens de openingsuren."
        />
      </View>
    );
  }

  const reserve = async (slot: AppCudiTimeslot) => {
    setBusy(slot.id);
    try {
      const result = await reserveCudiTimeslot(locale, slot.id);
      if (result.ok) setState(result);
      else {
        Alert.alert('Niet gereserveerd', timeslotError(result.code, result.message));
        void resource.reload().then(() => setState(null));
      }
    } catch (error) {
      Alert.alert('Niet gereserveerd', messageFor(error instanceof Error ? error : null));
    } finally {
      setBusy(null);
    }
  };

  // Meteen verwijderen, zonder te vragen: een tijdslot neem je zo weer opnieuw.
  const release = async (registrationId: string) => {
    setBusy(registrationId);
    try {
      const result = await releaseCudiTimeslot(locale, registrationId);
      if (result.ok) setState(result);
      else Alert.alert('Niet verwijderd', timeslotError(result.code, result.message));
    } catch (error) {
      Alert.alert('Niet verwijderd', messageFor(error instanceof Error ? error : null));
    } finally {
      setBusy(null);
    }
  };

  const slotLabel = (start: string, end: string) =>
    `${formatDay(start, locale)}, ${formatTime(start, locale)} - ${formatTime(end, locale)}`;

  // In het geel: je tijdslot, of wat je hier doet als je er nog geen hebt.
  const mineCard =
    data.mine.length > 0 ? (
      <View style={styles.mine}>
        <View style={styles.mineHead}>
          <CalendarClock size={18} color={COLORS.okInk} />
          <Text style={[styles.title, styles.flex]}>{data.mine.length === 1 ? 'Je tijdslot' : 'Je tijdsloten'}</Text>
        </View>
        {data.mine.map((mine) => (
          <View key={mine.registrationId} style={styles.mineRow}>
            <Text style={[styles.body, styles.flex]}>{slotLabel(mine.start, mine.end)}</Text>
            {mine.cancelable ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`${slotLabel(mine.start, mine.end)} verwijderen`}
                disabled={busy !== null}
                onPress={() => void release(mine.registrationId)}
                style={({ pressed }) => [styles.release, pressed && styles.pressed]}
              >
                {busy === mine.registrationId ? (
                  <ActivityIndicator size="small" color={COLORS.strong} />
                ) : (
                  <Text style={styles.releaseLabel}>Verwijderen</Text>
                )}
              </Pressable>
            ) : (
              <Text style={styles.hint}>Staat vast</Text>
            )}
          </View>
        ))}
        {data.cutoffHours > 0 ? (
          <Text style={styles.hint}>
            Vanaf {data.cutoffHours} uur voor de start staat een tijdslot vast. Kom je niet, dan telt dat als niet
            opgedaagd.
          </Text>
        ) : null}
      </View>
    ) : (
      <Text style={styles.headHint}>
        Kies wanneer je je cursussen komt halen.
        {data.oneTimeslotPerDay ? ' Eén tijdslot per dag.' : ''}
      </Text>
    );

  return (
    <View style={styles.root}>
      <ScrollView
        style={styles.root}
        contentContainerStyle={styles.scroll}
        refreshControl={
          <RefreshControl
            refreshing={resource.refreshing}
            tintColor={COLORS.strong}
            onRefresh={() => void resource.refresh().then(() => setState(null))}
          />
        }
      >
        <View style={styles.overscroll} />
        {head(mineCard)}
        <View style={styles.content}>
          {resource.stale ? <StaleNotice onRetry={() => void resource.refresh()} /> : null}

          {data.days.length === 0 ? (
            <Text style={styles.hint}>Er staan nog geen tijdsloten open. Kijk later opnieuw.</Text>
          ) : (
            data.days.map((day) => (
              <View key={day.date} style={styles.day}>
                <Text accessibilityRole="header" style={styles.dayName}>
                  {formatDay(`${day.date}T12:00:00Z`, locale)}
                </Text>
                <CardList>
                  {day.slots.map((slot) => {
                    const free = slot.capacity - slot.taken;
                    const off = (slot.full || slot.blockedByOtherSlot) && !slot.mine;
                    const disabled = slot.mine || slot.full || slot.blockedByOtherSlot || busy !== null;
                    return (
                      <Pressable
                        key={slot.id}
                        accessibilityRole="button"
                        accessibilityState={{ disabled, selected: slot.mine, busy: busy === slot.id }}
                        accessibilityLabel={`${formatTime(slot.start, locale)} tot ${formatTime(slot.end, locale)}, ${
                          slot.mine ? 'jouw tijdslot' : slot.full ? 'volzet' : `${free} vrij`
                        }`}
                        disabled={disabled}
                        onPress={() => void reserve(slot)}
                        style={({ pressed }) => [styles.slot, pressed && styles.pressed]}
                      >
                        <View style={styles.flex}>
                          <Text style={[styles.slotTime, off && styles.slotTimeOff]}>
                            {formatTime(slot.start, locale)} - {formatTime(slot.end, locale)}
                          </Text>
                          <Text
                            style={[
                              styles.slotFree,
                              slot.full ? styles.slotFreeFull : free <= 2 ? styles.slotFreeLow : null,
                            ]}
                          >
                            {slot.full
                              ? 'Volzet'
                              : slot.blockedByOtherSlot && !slot.mine
                                ? `${free} vrij, je hebt al een tijdslot op deze dag`
                                : `${free} vrij`}
                          </Text>
                        </View>
                        {busy === slot.id ? (
                          <ActivityIndicator size="small" color={COLORS.strong} />
                        ) : slot.mine ? (
                          <View style={[styles.choose, styles.chooseMine]}>
                            <Text style={[styles.chooseLabel, styles.chooseLabelMine]}>Jouw slot</Text>
                          </View>
                        ) : !off ? (
                          <View style={styles.choose}>
                            <Text style={styles.chooseLabel}>Kies</Text>
                          </View>
                        ) : null}
                      </Pressable>
                    );
                  })}
                </CardList>
              </View>
            ))
          )}
        </View>
      </ScrollView>
    </View>
  );
}

function timeslotError(code: string, message: string): string {
  switch (code) {
    case 'FULL':
      return 'Dit tijdslot is intussen volzet. Kies een ander.';
    case 'SAME_DAY':
      return 'Je hebt al een tijdslot op deze dag. Verwijder dat eerst.';
    case 'PASSED':
      return 'Dit tijdslot is al voorbij.';
    case 'NOT_FOUND':
      return 'Dit tijdslot bestaat niet meer.';
    case 'ALREADY':
      return 'Je had dit tijdslot al.';
    default:
      return message;
  }
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.paper },
  scroll: { paddingBottom: SPACING.xxl },
  // Wat boven de kop verschijnt als je op iOS omlaag trekt: geel, zoals de kop.
  overscroll: {
    position: 'absolute',
    top: -1000,
    left: 0,
    right: 0,
    height: 1000,
    backgroundColor: COLORS.head,
  },
  content: { paddingHorizontal: SPACING.xl - 4, paddingTop: SPACING.xl - 2, gap: SPACING.xl },
  flex: { flex: 1 },
  pressed: { opacity: 0.6 },
  title: { ...TYPE.cardTitle, color: COLORS.ink },
  body: { ...TYPE.body, color: COLORS.body },
  hint: { ...TYPE.small, color: COLORS.muted },
  headHint: { fontFamily: FONTS.semibold, fontSize: 14, lineHeight: 20, color: COLORS.strong },

  // Je tijdslot: een witte kaart in het geel.
  mine: { backgroundColor: COLORS.surface, borderRadius: 20, padding: SPACING.lg, gap: SPACING.sm, ...CARD_SHADOW },
  mineHead: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm },
  mineRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
    paddingVertical: SPACING.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: COLORS.line2,
  },
  release: {
    minHeight: 40,
    minWidth: 92,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: RADIUS.pill,
    paddingHorizontal: SPACING.md,
    backgroundColor: COLORS.paper,
  },
  releaseLabel: { fontFamily: FONTS.semibold, fontSize: 13, color: COLORS.strong },

  day: { gap: SPACING.sm },
  dayName: {
    fontFamily: FONTS.bold,
    fontSize: 20,
    letterSpacing: -0.4,
    color: COLORS.strong,
    textTransform: 'capitalize',
    paddingHorizontal: SPACING.xs,
  },
  slot: { flexDirection: 'row', alignItems: 'center', gap: SPACING.md, minHeight: 60, paddingVertical: SPACING.sm },
  slotTime: { fontFamily: FONTS.semibold, fontSize: 16, color: COLORS.ink, fontVariant: ['tabular-nums'] },
  slotTimeOff: { color: COLORS.muted },
  slotFree: { ...TYPE.small, color: COLORS.okInk, marginTop: 2 },
  slotFreeLow: { color: COLORS.lowInk },
  slotFreeFull: { color: COLORS.muted },
  choose: {
    height: 36,
    justifyContent: 'center',
    paddingHorizontal: SPACING.lg,
    borderRadius: RADIUS.pill,
    backgroundColor: COLORS.band,
  },
  chooseMine: { backgroundColor: COLORS.yellow },
  chooseLabel: { fontFamily: FONTS.bold, fontSize: 13, color: COLORS.yellow },
  chooseLabelMine: { color: COLORS.onYellow },
});
