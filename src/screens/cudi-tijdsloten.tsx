import { CalendarClock } from 'lucide-react-native';
import { useState } from 'react';
import { ActivityIndicator, Alert, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';

import type { AppCudiTimeslot, AppCudiTimeslots } from '../api/contract';
import { fetchCudiTimeslots, releaseCudiTimeslot, reserveCudiTimeslot } from '../api/endpoints';
import { messageFor, useResource } from '../api/useResource';
import { PageHead } from '../components/PageHead';
import { Card, Empty, ErrorState, Loading, StaleNotice } from '../components/ui';
import { formatDay, formatTime } from '../format';
import { useApp } from '../state/app';
import { COLORS, FONTS, RADIUS, SPACING, TYPE } from '../theme/tokens';
import { CARD_SHADOW } from '../components/HomeSection';

/**
 * Een tijdslot kiezen om je cursussen af te halen, zoals *Tijdslot reserveren* op
 * cudi: per dag de vrije momenten, met hoeveel plaatsen er nog zijn.
 *
 * De regels zijn die van cudi (`lib/student-timeslots.ts` daar): niet voorbij,
 * niet volzet, één slot per dag als de cursusdienst dat vraagt, en vrijgeven tot
 * een aantal uur voor de start. Dit scherm schakelt enkel knoppen uit; weigert
 * cudi toch, dan zegt een melding waarom.
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

  const head = <PageHead title="Tijdslot" subtitle="Je cursussen afhalen bij de cursusdienst" />;
  const data = state ?? resource.data;

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
  if (!data.enabled) {
    return (
      <>
        {head}
        <Empty
          title="Geen tijdsloten nodig"
          hint="De cursusdienst werkt nu zonder tijdsloten. Kom gewoon langs tijdens de openingsuren."
        />
      </>
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

  const release = (registrationId: string, label: string) => {
    Alert.alert('Tijdslot vrijgeven?', label, [
      { text: 'Behouden', style: 'cancel' },
      {
        text: 'Vrijgeven',
        style: 'destructive',
        onPress: async () => {
          setBusy(registrationId);
          try {
            const result = await releaseCudiTimeslot(locale, registrationId);
            if (result.ok) setState(result);
            else Alert.alert('Niet vrijgegeven', timeslotError(result.code, result.message));
          } catch (error) {
            Alert.alert('Niet vrijgegeven', messageFor(error instanceof Error ? error : null));
          } finally {
            setBusy(null);
          }
        },
      },
    ]);
  };

  const slotLabel = (start: string, end: string) =>
    `${formatDay(start, locale)}, ${formatTime(start, locale)} - ${formatTime(end, locale)}`;

  return (
    <>
      {head}
      <ScrollView
        style={styles.root}
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={resource.refreshing}
            onRefresh={() => void resource.refresh().then(() => setState(null))}
          />
        }
      >
        {resource.stale ? <StaleNotice onRetry={() => void resource.refresh()} /> : null}

        {data.mine.length > 0 ? (
          <Card featured>
            <View style={styles.mineHead}>
              <CalendarClock size={18} color={COLORS.okInk} />
              <Text style={[styles.title, styles.flex]}>
                {data.mine.length === 1 ? 'Je tijdslot' : 'Je tijdsloten'}
              </Text>
            </View>
            {data.mine.map((mine) => (
              <View key={mine.registrationId} style={styles.mineRow}>
                <Text style={[styles.body, styles.flex]}>{slotLabel(mine.start, mine.end)}</Text>
                {mine.cancelable ? (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`${slotLabel(mine.start, mine.end)} vrijgeven`}
                    disabled={busy !== null}
                    onPress={() => release(mine.registrationId, slotLabel(mine.start, mine.end))}
                    style={({ pressed }) => [styles.release, pressed && styles.pressed]}
                  >
                    {busy === mine.registrationId ? (
                      <ActivityIndicator size="small" color={COLORS.navy} />
                    ) : (
                      <Text style={styles.releaseLabel}>Vrijgeven</Text>
                    )}
                  </Pressable>
                ) : (
                  <Text style={styles.hint}>Staat vast</Text>
                )}
              </View>
            ))}
            {data.cutoffHours > 0 ? (
              <Text style={styles.hint}>
                Vanaf {data.cutoffHours} uur voor de start staat een tijdslot vast. Kom je niet, dan telt
                dat als niet opgedaagd.
              </Text>
            ) : null}
          </Card>
        ) : (
          <Text style={styles.body}>
            Kies wanneer je je cursussen komt halen.
            {data.oneTimeslotPerDay ? ' Eén tijdslot per dag.' : ''}
          </Text>
        )}

        {data.days.length === 0 ? (
          <Text style={styles.hint}>Er staan nog geen tijdsloten open. Kijk later opnieuw.</Text>
        ) : (
          data.days.map((day) => (
            <View key={day.date} style={styles.day}>
              <Text style={styles.dayName}>{formatDay(`${day.date}T12:00:00Z`, locale)}</Text>
              <View style={styles.slots}>
                {day.slots.map((slot) => {
                  const free = slot.capacity - slot.taken;
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
                      style={({ pressed }) => [
                        styles.slot,
                        slot.mine && styles.slotMine,
                        (slot.full || slot.blockedByOtherSlot) && !slot.mine && styles.slotOff,
                        pressed && styles.pressed,
                      ]}
                    >
                      {busy === slot.id ? (
                        <ActivityIndicator size="small" color={COLORS.navy} />
                      ) : (
                        <>
                          <Text style={[styles.slotTime, slot.mine && styles.slotTimeMine]}>
                            {formatTime(slot.start, locale)}
                          </Text>
                          <Text
                            style={[
                              styles.slotFree,
                              slot.mine ? styles.slotFreeMine : slot.full ? styles.slotFreeFull : free <= 2 ? styles.slotFreeLow : null,
                            ]}
                          >
                            {slot.mine ? 'Jouw slot' : slot.full ? 'Volzet' : `${free} vrij`}
                          </Text>
                        </>
                      )}
                    </Pressable>
                  );
                })}
              </View>
            </View>
          ))
        )}

      </ScrollView>
    </>
  );
}

function timeslotError(code: string, message: string): string {
  switch (code) {
    case 'FULL':
      return 'Dit tijdslot is intussen volzet. Kies een ander.';
    case 'SAME_DAY':
      return 'Je hebt al een tijdslot op deze dag. Geef dat eerst vrij.';
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
  content: { padding: SPACING.xl - 4, gap: SPACING.xl, paddingBottom: SPACING.xxl },
  flex: { flex: 1 },
  pressed: { opacity: 0.6 },
  title: { ...TYPE.cardTitle, color: COLORS.ink },
  body: { ...TYPE.body, color: COLORS.body },
  hint: { ...TYPE.small, color: COLORS.muted },
  mineHead: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm },
  mineRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
    paddingVertical: SPACING.sm,
    borderTopWidth: 1,
    borderTopColor: COLORS.line2,
  },
  release: {
    minHeight: 44,
    minWidth: 92,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: COLORS.line2,
    borderRadius: RADIUS.pill,
    paddingHorizontal: SPACING.md,
  },
  releaseLabel: { ...TYPE.small, fontFamily: FONTS.medium, color: COLORS.ink },
  day: { gap: SPACING.sm },
  dayName: { ...TYPE.cardTitle, fontSize: 17, color: COLORS.ink, textTransform: 'capitalize' },
  slots: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.sm },
  slot: {
    width: '31.5%',
    minHeight: 60,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
    backgroundColor: COLORS.surface,
    borderRadius: 20,
    ...CARD_SHADOW,
  },
  slotMine: { backgroundColor: COLORS.navy, borderColor: COLORS.navy },
  slotOff: { backgroundColor: COLORS.paper2, borderColor: COLORS.line },
  slotTime: { fontFamily: FONTS.semibold, fontSize: 16, color: COLORS.ink, fontVariant: ['tabular-nums'] },
  slotTimeMine: { color: COLORS.onDark },
  slotFree: { ...TYPE.small, fontSize: 12, color: COLORS.okInk },
  slotFreeLow: { color: COLORS.lowInk },
  slotFreeFull: { color: COLORS.muted },
  slotFreeMine: { color: COLORS.yellow, fontFamily: FONTS.semibold },
});
