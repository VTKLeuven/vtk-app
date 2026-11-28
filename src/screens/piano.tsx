import { ChevronDown, Music } from 'lucide-react-native';
import { useState } from 'react';
import { Alert, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';

import { ApiError } from '../api/client';
import type { AppPiano, AppPianoSlot } from '../api/contract';
import { cancelPianoSlot, fetchPiano, reservePianoSlot } from '../api/endpoints';
import { messageFor, useResource } from '../api/useResource';
import { CARD_SHADOW } from '../components/HomeSection';
import { Prose } from '../components/Prose';
import { Button, Card, ErrorState, Loading, StaleNotice } from '../components/ui';
import { YellowHead } from '../components/YellowHead';
import { formatDay, formatTime } from '../format';
import { useTabRouter } from '../navigation';
import { useApp } from '../state/app';
import { IS_DARK } from '../theme/mode';
import { COLORS, FONTS, RADIUS, SPACING, TYPE } from '../theme/tokens';
import { t } from '../i18n';

/**
 * De piano in het kasteel reserveren.
 *
 * Sinds eind november 2026 zoals Alma: een gele kop met hoeveel uren je deze week
 * nog mag nemen en de dagen als vierkantjes, en daaronder de uren van de gekozen
 * dag als één lijst. Tot dan was elke dag een kaart vol knopjes met een naam
 * eronder, en zag je pas na lang scrollen welke uren van jou waren. Wat van jou is,
 * staat nu bovenaan ("Jouw uren"), los van de dag die je bekijkt.
 *
 * De naam van wie een slot heeft, staat erbij. Dat is een keuze van de site en
 * geen lek: zo weet je met wie je kan ruilen. Daarom vraagt dit scherm ook een
 * login.
 */
export default function PianoScreen() {
  const router = useTabRouter();
  const { locale, viewer } = useApp();
  const resource = useResource('piano', () => fetchPiano(locale), locale, viewer !== null);
  const [busy, setBusy] = useState<string | null>(null);
  const [chosenDay, setChosenDay] = useState<string | null>(null);
  const [infoOpen, setInfoOpen] = useState(false);

  const piano = resource.data;
  const days = piano?.days ?? [];
  // De gekozen dag, of anders de eerste dag waarop nog iets vrij is.
  const day =
    days.find((candidate) => candidate.date === chosenDay) ??
    days.find((candidate) => candidate.slots.some((slot) => slot.bookable)) ??
    days[0] ??
    null;

  const head = (
    <YellowHead title="Piano" subtitle={t('Het pianolokaal in het kasteel', 'The piano room in the castle')} back>
      {piano ? (
        <>
          <Quota piano={piano} />
          {days.length > 0 ? (
            <DaySquares piano={piano} selected={day?.date ?? null} onSelect={setChosenDay} />
          ) : null}
        </>
      ) : null}
    </YellowHead>
  );

  if (!viewer) {
    return (
      <ScrollView contentContainerStyle={styles.scroll} style={styles.root}>
        <View style={styles.overscroll} />
        {head}
        <View style={styles.content}>
          <Card>
            <Text style={styles.title}>{t('Log eerst in', 'Log in first')}</Text>
            <Text style={styles.body}>{t('De agenda toont wie welk uur heeft, dus die staat achter een login.', 'The schedule shows who has which slot, so it is behind a login.')}</Text>
            <Button label={t('Inloggen', 'Log in')} onPress={() => router.push('/inloggen')} />
          </Card>
        </View>
      </ScrollView>
    );
  }

  if (resource.loading && !piano) {
    return (
      <View style={styles.root}>
        {head}
        <Loading label={t('Agenda ophalen', 'Loading schedule')} />
      </View>
    );
  }
  if (!piano) {
    return (
      <View style={styles.root}>
        {head}
        <ErrorState message={messageFor(resource.error)} onRetry={() => void resource.refresh()} />
      </View>
    );
  }

  const press = async (slot: AppPianoSlot) => {
    setBusy(slot.startsAt);
    try {
      if (slot.state === 'MINE') {
        if (!slot.reservationId) return;
        await cancelPianoSlot(slot.reservationId);
      } else {
        await reservePianoSlot(slot.startsAt);
      }
      void resource.reload();
    } catch (error) {
      Alert.alert(t('Dat lukte niet', 'That did not work'), pianoErrorText(error));
      void resource.reload();
    } finally {
      setBusy(null);
    }
  };

  const confirmCancel = (slot: AppPianoSlot) => {
    Alert.alert(
      t('Reservatie loslaten', 'Release booking'),
      t(
        `Je laat ${formatDay(slot.startsAt, locale)} om ${formatTime(slot.startsAt, locale)} los. Het uur komt weer vrij voor iemand anders.`,
        `You release ${formatDay(slot.startsAt, locale)} at ${formatTime(slot.startsAt, locale)}. The slot becomes available for someone else.`,
      ),
      [
        { text: t('Houden', 'Keep'), style: 'cancel' },
        { text: t('Loslaten', 'Release'), style: 'destructive', onPress: () => void press(slot) },
      ],
    );
  };

  const full = piano.usedThisWeek >= piano.maxPerWeek;
  const mine = days.flatMap((candidate) => candidate.slots.filter((slot) => slot.state === 'MINE'));
  const free = day ? day.slots.filter((slot) => slot.bookable).length : 0;

  return (
    <ScrollView
      style={styles.root}
      contentContainerStyle={styles.scroll}
      refreshControl={
        <RefreshControl refreshing={resource.refreshing} tintColor={COLORS.strong} onRefresh={() => void resource.refresh()} />
      }
    >
      <View style={styles.overscroll} />
      {head}
      {resource.stale ? <StaleNotice onRetry={() => void resource.refresh()} /> : null}

      <View style={styles.content}>
        {mine.length > 0 ? (
          <View style={styles.section}>
            <Text accessibilityRole="header" style={styles.sectionTitle}>
              {t('Jouw uren', 'Your slots')}
            </Text>
            <View style={styles.card}>
              {mine.map((slot, index) => (
                <View key={slot.startsAt} style={[styles.row, index > 0 && styles.divider]}>
                  <View style={styles.mineMark}>
                    <Music size={16} color={COLORS.onYellow} />
                  </View>
                  <View style={styles.flex}>
                    <Text style={styles.rowTitle}>{capitalize(formatDay(slot.startsAt, locale))}</Text>
                    <Text style={styles.rowDetail}>
                      {formatTime(slot.startsAt, locale)} tot {formatTime(slot.endsAt, locale)}
                    </Text>
                  </View>
                  <SlotAction
                    label={t('Loslaten', 'Release')}
                    kind="quiet"
                    disabled={busy !== null}
                    onPress={() => confirmCancel(slot)}
                    accessibilityLabel={t(
                      `${formatDay(slot.startsAt, locale)} om ${formatTime(slot.startsAt, locale)} loslaten`,
                      `Release ${formatDay(slot.startsAt, locale)} at ${formatTime(slot.startsAt, locale)}`,
                    )}
                  />
                </View>
              ))}
            </View>
          </View>
        ) : null}

        {day ? (
          <View style={styles.section}>
            <View style={styles.dayHead}>
              <Text accessibilityRole="header" style={styles.dayTitle}>
                {capitalize(formatDay(`${day.date}T12:00:00.000Z`, locale))}
              </Text>
              <Text style={styles.dayCount}>{free === 0 ? t('Niets vrij', 'Nothing free') : free === 1 ? t('1 uur vrij', '1 slot free') : t(`${free} uur vrij`, `${free} slots free`)}</Text>
            </View>
            <View style={styles.card}>
              {day.slots.map((slot, index) => (
                <SlotRow
                  key={slot.startsAt}
                  slot={slot}
                  first={index === 0}
                  locale={locale}
                  full={full}
                  busy={busy}
                  onReserve={() => void press(slot)}
                  onCancel={() => confirmCancel(slot)}
                />
              ))}
            </View>
          </View>
        ) : (
          <View style={styles.section}>
            <Text style={styles.title}>{t('Geen uren beschikbaar', 'No slots available')}</Text>
            <Text style={styles.body}>
              {t('Er staan momenteel geen tijdsloten open. Dat kan aan een sluitingsperiode liggen.', 'There are no time slots open at the moment. That may be due to a closing period.')}
            </Text>
          </View>
        )}

        {piano.info ? (
          <View style={styles.card}>
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ expanded: infoOpen }}
              onPress={() => setInfoOpen(!infoOpen)}
              style={({ pressed }) => [styles.row, pressed && styles.pressed]}
            >
              <Text style={[styles.rowTitle, styles.flex]}>{t('Afspraken bij de piano', 'Piano rules')}</Text>
              <ChevronDown color={COLORS.strong} size={20} style={infoOpen ? styles.chevronOpen : undefined} />
            </Pressable>
            {infoOpen ? (
              <View style={styles.info}>
                <Prose>{piano.info}</Prose>
              </View>
            ) : null}
          </View>
        ) : null}
      </View>
    </ScrollView>
  );
}

/** "Deze week 1 van 3", met een bolletje per uur dat je mag nemen. */
function Quota({ piano }: { piano: AppPiano }) {
  const left = Math.max(0, piano.maxPerWeek - piano.usedThisWeek);
  return (
    <View
      style={styles.quota}
      accessible
      accessibilityLabel={t(
        `Deze week ${piano.usedThisWeek} van ${piano.maxPerWeek} uur genomen`,
        `${piano.usedThisWeek} of ${piano.maxPerWeek} slots taken this week`,
      )}
    >
      <View style={styles.pips}>
        {Array.from({ length: piano.maxPerWeek }, (_, index) => (
          <View key={index} style={[styles.pip, index < piano.usedThisWeek && styles.pipUsed]} />
        ))}
      </View>
      <Text style={styles.quotaText}>
        {left === 0
          ? t('Je zit aan je maximum voor deze week', 'You have reached your maximum for this week')
          : t(
              `Nog ${left} van ${piano.maxPerWeek} deze week, ${piano.slotMinutes} minuten elk`,
              `${left} of ${piano.maxPerWeek} left this week, ${piano.slotMinutes} minutes each`,
            )}
      </Text>
    </View>
  );
}

/** De dagen als vierkantjes op het geel, zoals bij Alma; een stip waar je een uur hebt. */
function DaySquares({
  piano,
  selected,
  onSelect,
}: {
  piano: AppPiano;
  selected: string | null;
  onSelect: (date: string) => void;
}) {
  const format = (options: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat(t('nl-BE', 'en-GB'), { timeZone: 'UTC', ...options });
  const weekday = format({ weekday: 'short' });
  const dayOfMonth = format({ day: 'numeric' });
  const full = format({ weekday: 'long', day: 'numeric', month: 'long' });
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.strip} contentContainerStyle={styles.squares}>
      {piano.days.map((day) => {
        const noon = new Date(`${day.date}T12:00:00Z`);
        const active = day.date === selected;
        const own = day.slots.some((slot) => slot.state === 'MINE');
        const open = day.slots.some((slot) => slot.bookable);
        return (
          <Pressable
            key={day.date}
            accessibilityRole="button"
            accessibilityLabel={[full.format(noon), own ? t('je hebt hier een uur', 'you have a slot here') : null, open ? null : t('niets vrij', 'nothing free')]
              .filter(Boolean)
              .join(', ')}
            accessibilityState={{ selected: active }}
            onPress={() => onSelect(day.date)}
            style={[styles.square, !open && !own && styles.squareOff, active && styles.squareActive]}
          >
            <Text style={[styles.squareWeekday, active && styles.squareTextActive]}>
              {weekday.format(noon).replace('.', '')}
            </Text>
            <Text style={[styles.squareDay, active && styles.squareTextActive]}>{dayOfMonth.format(noon)}</Text>
            <View style={[styles.squareDot, own && (active ? styles.squareDotActive : styles.squareDotOwn)]} />
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

function SlotRow({
  slot,
  first,
  locale,
  full,
  busy,
  onReserve,
  onCancel,
}: {
  slot: AppPianoSlot;
  first: boolean;
  locale: 'nl' | 'en';
  full: boolean;
  busy: string | null;
  onReserve: () => void;
  onCancel: () => void;
}) {
  const start = formatTime(slot.startsAt, locale);
  const end = formatTime(slot.endsAt, locale);
  const mine = slot.state === 'MINE';
  const taken = slot.state === 'TAKEN';
  const status = mine ? t('Van jou', 'Yours') : taken ? (slot.takenByName ?? t('Bezet', 'Taken')) : slot.bookable ? t('Vrij', 'Free') : t('Nog niet te boeken', 'Not bookable yet');

  return (
    <View style={[styles.row, !first && styles.divider, mine && styles.rowMine]}>
      <View style={styles.time}>
        <Text style={[styles.timeStart, taken && styles.dim]}>{start}</Text>
        <Text style={styles.timeEnd}>{end}</Text>
      </View>
      <Text
        style={[styles.status, mine && styles.statusMine, (taken || (!slot.bookable && !mine)) && styles.dim]}
        numberOfLines={1}
      >
        {status}
      </Text>
      {mine ? (
        <SlotAction
          label={t('Loslaten', 'Release')}
          kind="quiet"
          disabled={busy !== null}
          onPress={onCancel}
          accessibilityLabel={t(`${start} loslaten`, `Release ${start}`)}
        />
      ) : slot.bookable ? (
        <SlotAction
          label={busy === slot.startsAt ? t('Even...', 'One moment...') : t('Neem', 'Take')}
          kind="primary"
          disabled={busy !== null || full}
          onPress={onReserve}
          accessibilityLabel={full ? t(`${start}, je zit aan je maximum`, `${start}, you have reached your maximum`) : t(`${start} tot ${end} nemen`, `Take ${start} to ${end}`)}
        />
      ) : null}
    </View>
  );
}

function SlotAction({
  label,
  kind,
  disabled,
  onPress,
  accessibilityLabel,
}: {
  label: string;
  kind: 'primary' | 'quiet';
  disabled: boolean;
  onPress: () => void;
  accessibilityLabel: string;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      hitSlop={6}
      style={({ pressed }) => [
        styles.action,
        kind === 'primary' ? styles.actionPrimary : styles.actionQuiet,
        pressed && styles.pressed,
        disabled && styles.disabled,
      ]}
    >
      <Text style={[styles.actionLabel, kind === 'primary' && styles.actionLabelPrimary]}>{label}</Text>
    </Pressable>
  );
}

const capitalize = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

/** De melding bij een geweigerde reservatie; de codes komen van de server. */
function pianoErrorText(error: unknown): string {
  if (!(error instanceof ApiError)) {
    return t('Geen verbinding met vtk.be. Probeer het straks opnieuw.', 'No connection to vtk.be. Try again later.');
  }
  switch (error.code) {
    case 'TAKEN':
      return t('Iemand was je net voor met dit uur.', 'Someone just beat you to this slot.');
    case 'WEEK_LIMIT':
      return t('Je zit aan je maximum voor deze week. Laat eerst een ander uur los.', 'You have reached your maximum for this week. Release another slot first.');
    case 'PAST':
      return t('Dat uur is voorbij.', 'That slot has passed.');
    case 'BEYOND_HORIZON':
      return t('Zo ver vooruit kan je nog niet boeken.', 'You cannot book that far ahead yet.');
    case 'NOT_FOUND':
      return t('Dat uur bestaat niet meer in de agenda.', 'That slot no longer exists in the schedule.');
    default:
      return error.message;
  }
}

const SIDE = SPACING.xl - 4;

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.paper },
  scroll: { paddingBottom: SPACING.xxl },
  // Wat boven de kop verschijnt als je op iOS omlaag trekt: geel, zoals de kop.
  overscroll: { position: 'absolute', top: -1000, left: 0, right: 0, height: 1000, backgroundColor: COLORS.head },
  content: { paddingHorizontal: SPACING.lg, paddingTop: SPACING.xl - 2, gap: SPACING.xl },
  flex: { flex: 1 },
  pressed: { opacity: 0.7 },
  disabled: { opacity: 0.4 },
  title: { ...TYPE.cardTitle, color: COLORS.ink },
  body: { ...TYPE.body, color: COLORS.body },

  quota: { gap: SPACING.sm },
  pips: { flexDirection: 'row', gap: 6 },
  pip: { flex: 1, maxWidth: 56, height: 8, borderRadius: 4, backgroundColor: IS_DARK ? 'rgba(255, 255, 255, 0.14)' : 'rgba(14, 26, 54, 0.12)' },
  pipUsed: { backgroundColor: COLORS.strong },
  quotaText: { fontFamily: FONTS.semibold, fontSize: 14, color: COLORS.strong },

  strip: { flexGrow: 0, flexShrink: 0, marginHorizontal: -SIDE },
  squares: { gap: 6, paddingHorizontal: SIDE },
  // Echt vierkant; de stip zweeft onderaan en duwt de dag niet omhoog.
  square: {
    width: 52,
    height: 52,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 1,
    backgroundColor: COLORS.surface,
  },
  squareOff: { backgroundColor: COLORS.wash },
  squareActive: { backgroundColor: COLORS.selected },
  squareWeekday: {
    fontFamily: FONTS.semibold,
    fontSize: 10,
    letterSpacing: 1,
    textTransform: 'uppercase',
    color: COLORS.strong,
  },
  squareDay: { fontFamily: FONTS.bold, fontSize: 18, color: COLORS.strong, fontVariant: ['tabular-nums'] },
  squareTextActive: { color: COLORS.onSelectedAccent },
  squareDot: { position: 'absolute', bottom: 6, width: 5, height: 5, borderRadius: 3 },
  squareDotOwn: { backgroundColor: COLORS.strong },
  squareDotActive: { backgroundColor: COLORS.onSelectedAccent },

  section: { gap: SPACING.md },
  sectionTitle: { fontFamily: FONTS.bold, fontSize: 20, letterSpacing: -0.4, color: COLORS.strong, paddingHorizontal: 4 },
  dayHead: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: SPACING.sm, paddingHorizontal: 4 },
  dayTitle: { flexShrink: 1, fontFamily: FONTS.bold, fontSize: 20, letterSpacing: -0.4, color: COLORS.strong },
  dayCount: { fontFamily: FONTS.semibold, fontSize: 13, color: COLORS.muted },

  card: { backgroundColor: COLORS.surface, borderRadius: 20, overflow: 'hidden', ...CARD_SHADOW },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
    minHeight: 60,
    paddingVertical: 10,
    paddingHorizontal: SPACING.lg,
  },
  rowMine: { backgroundColor: COLORS.lowBg },
  divider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: COLORS.line2 },
  rowTitle: { fontFamily: FONTS.semibold, fontSize: 15, color: COLORS.ink },
  rowDetail: { ...TYPE.small, color: COLORS.muted, fontVariant: ['tabular-nums'] },
  mineMark: {
    width: 34,
    height: 34,
    borderRadius: RADIUS.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.yellow,
  },

  time: { width: 50 },
  timeStart: { fontFamily: FONTS.bold, fontSize: 16, color: COLORS.ink, fontVariant: ['tabular-nums'] },
  timeEnd: { ...TYPE.small, fontSize: 12, color: COLORS.muted, fontVariant: ['tabular-nums'] },
  status: { flex: 1, fontFamily: FONTS.medium, fontSize: 15, color: COLORS.body },
  statusMine: { fontFamily: FONTS.bold, color: COLORS.strong },
  dim: { color: COLORS.muted },

  action: { height: 34, paddingHorizontal: 16, borderRadius: RADIUS.pill, alignItems: 'center', justifyContent: 'center' },
  actionPrimary: { backgroundColor: COLORS.selected },
  actionQuiet: { backgroundColor: COLORS.wash },
  actionLabel: { fontFamily: FONTS.semibold, fontSize: 14, color: COLORS.strong },
  actionLabelPrimary: { color: COLORS.onSelectedAccent, fontFamily: FONTS.bold },

  info: { paddingHorizontal: SPACING.lg, paddingBottom: SPACING.lg },
  chevronOpen: { transform: [{ rotate: '180deg' }] },
});
