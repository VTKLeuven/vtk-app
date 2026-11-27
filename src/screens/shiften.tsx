import { Check, Globe, Plus } from 'lucide-react-native';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
  type ScrollViewInstance,
} from 'react-native';

import { ApiError } from '../api/client';
import type { AppShift } from '../api/contract';
import {
  fetchShifts,
  registerForShift,
  setShiftReplaceable,
  unregisterFromShift,
} from '../api/endpoints';
import { messageFor, useResource } from '../api/useResource';
import { RewardCoins } from '../components/RewardCoins';
import { Prose } from '../components/Prose';
import { Button, Card, Empty, ErrorState, Loading, StaleNotice } from '../components/ui';
import { YellowHead } from '../components/YellowHead';
import { formatDay, formatTime } from '../format';
import { dayKeyOf, todayKey } from '../monthGrid';
import { addDays } from '../planning/grid';
import { useApp } from '../state/app';
import { useTabRouter } from '../navigation';
import { COLORS, FONTS, RADIUS, SPACING, TYPE } from '../theme/tokens';

const SIDE = SPACING.xl - 4;
/** Tot zoveel plaatsen tonen we bolletjes; daarboven "3/12". */
const MAX_PIPS = 6;

/**
 * Shiften: de agenda van /shift.
 *
 * Sinds eind november 2026 een register (voorstel B): per dag de datum in de
 * marge en de gele lijn ernaast, en daar de shiften onder elkaar met het uur, de
 * naam, de plaats, wat ze opleveren, bolletjes voor de bezette plaatsen en een
 * ronde knop om in te schrijven. Geen witte kaart per dag meer: dat was druk en
 * herhaalde zichzelf. Alles staat op één pagina; de dagen staan als vierkantjes
 * in de gele kop (zoals bij Alma en Piano), en een tik erop schuift naar die dag.
 * Bij het scrollen volgt het vierkantje de dag die bovenaan staat.
 *
 * Je eigen shiften staan ertussen, met "Jij" in het geel. Tik een rij aan voor
 * de uitleg, wie er nog op staat, de keuze om je plaats af te staan en
 * uitschrijven.
 *
 * Alle regels staan op de server. Of je nog kan uitschrijven is een veld dat de
 * API meestuurt (`canUnregister`) en geen berekening hier: de 24-uursgrens en de
 * bedenktijd na een misklik horen op één plek te leven, en dat is de plek die ze
 * ook afdwingt.
 */
export default function ShiftenScreen() {
  const router = useTabRouter();
  const { locale, viewer } = useApp();
  const resource = useResource('shiften', () => fetchShifts(locale), locale, viewer !== null);
  const days = useMemo(() => {
    const all = [...(resource.data?.mine ?? []), ...(resource.data?.available ?? [])].sort((a, b) =>
      a.start.localeCompare(b.start),
    );
    return groupByDay(all);
  }, [resource.data]);

  const scroller = useRef<ScrollViewInstance>(null);
  const offsets = useRef<Record<string, number>>({});
  const [current, setCurrent] = useState<string | null>(null);
  // Een tik op een dag scrolt; tot dat scrollen gedaan is, telt de stand van de
  // scroll niet als keuze, anders springt het vierkantje over de tussenliggende dagen.
  const jumping = useRef(false);
  const selected = current && days.some((day) => day.key === current) ? current : (days[0]?.key ?? null);

  const jumpTo = (key: string) => {
    const y = offsets.current[key];
    if (y === undefined) return;
    jumping.current = true;
    setCurrent(key);
    scroller.current?.scrollTo({ y: Math.max(0, y - SPACING.md), animated: true });
  };

  const onScroll = (y: number) => {
    if (jumping.current) return;
    let found = days[0]?.key ?? null;
    for (const day of days) {
      const top = offsets.current[day.key];
      if (top !== undefined && top - SPACING.xl <= y) found = day.key;
    }
    if (found && found !== selected) setCurrent(found);
  };

  const head = (
    <YellowHead title="Shiften" subtitle="Help mee en verdien bonnetjes" back>
      {days.length > 0 ? <DaySquares days={days} selected={selected} locale={locale} onSelect={jumpTo} /> : null}
    </YellowHead>
  );

  if (!viewer) {
    return (
      <View style={styles.root}>
        {head}
        <View style={styles.padded}>
          <Card>
            <Text style={styles.title}>Log eerst in</Text>
            <Text style={styles.body}>Inschrijven op een shift hangt aan je account.</Text>
            <Button label="Inloggen" onPress={() => router.push('/inloggen')} />
          </Card>
        </View>
      </View>
    );
  }

  if (resource.loading && !resource.data) {
    return (
      <View style={styles.root}>
        {head}
        <Loading label="Shiften ophalen" />
      </View>
    );
  }
  if (!resource.data) {
    return (
      <View style={styles.root}>
        {head}
        <ErrorState message={messageFor(resource.error)} onRetry={() => void resource.refresh()} />
      </View>
    );
  }

  return (
    <View style={styles.root}>
      {head}
      <ScrollView
        ref={scroller}
        style={styles.root}
        contentContainerStyle={styles.content}
        scrollEventThrottle={64}
        onScroll={(event) => onScroll(event.nativeEvent.contentOffset.y)}
        onMomentumScrollEnd={() => {
          jumping.current = false;
        }}
        onScrollEndDrag={() => {
          jumping.current = false;
        }}
        onScrollBeginDrag={() => {
          jumping.current = false;
        }}
        refreshControl={
          <RefreshControl refreshing={resource.refreshing} tintColor={COLORS.navy} onRefresh={() => void resource.refresh()} />
        }
      >
        {resource.stale ? <StaleNotice onRetry={() => void resource.refresh()} /> : null}

        {days.length === 0 ? (
          <Empty
            flush
            title="Geen shiften"
            hint="Er staat nu niets open. Nieuwe shiften verschijnen hier zodra ze ingepland zijn."
          />
        ) : null}

        {days.map((day) => (
          <View
            key={day.key}
            style={styles.day}
            onLayout={(event) => {
              offsets.current[day.key] = event.nativeEvent.layout.y;
            }}
          >
            <DayMargin dayKey={day.key} iso={day.shifts[0].start} locale={locale} />
            <View style={styles.dayRows}>
              {day.shifts.map((shift, index) => (
                <ShiftRow
                  key={shift.id}
                  shift={shift}
                  first={index === 0}
                  locale={locale}
                  onChanged={() => void resource.reload()}
                />
              ))}
            </View>
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

function groupByDay(shifts: AppShift[]): { key: string; shifts: AppShift[] }[] {
  const days = new Map<string, AppShift[]>();
  for (const shift of shifts) {
    const key = dayKeyOf(shift.start);
    days.set(key, [...(days.get(key) ?? []), shift]);
  }
  return [...days.entries()].map(([key, items]) => ({ key, shifts: items }));
}

const brussels = (locale: 'nl' | 'en', options: Intl.DateTimeFormatOptions) =>
  new Intl.DateTimeFormat(locale === 'en' ? 'en-GB' : 'nl-BE', { timeZone: 'Europe/Brussels', ...options });

/** De datum in de marge: "MA", "30", "nov"; vandaag en morgen met een woord. */
function DayMargin({ dayKey, iso, locale }: { dayKey: string; iso: string; locale: 'nl' | 'en' }) {
  const date = new Date(iso);
  const today = todayKey();
  const tomorrow = addDays(today, 1);
  const word =
    dayKey === today
      ? locale === 'en' ? 'today' : 'vandaag'
      : dayKey === tomorrow
        ? locale === 'en' ? 'tomorrow' : 'morgen'
        : brussels(locale, { month: 'short' }).format(date).replace('.', '');
  return (
    <View style={styles.margin} accessible accessibilityRole="header" accessibilityLabel={formatDay(iso, locale)}>
      <Text style={styles.marginWeekday}>{brussels(locale, { weekday: 'short' }).format(date).replace('.', '').toUpperCase()}</Text>
      <Text style={styles.marginDay}>{brussels(locale, { day: 'numeric' }).format(date)}</Text>
      <Text style={styles.marginMonth}>{word}</Text>
    </View>
  );
}

/**
 * De dagen met shiften als vierkantjes in het geel. Eronder een stip waar je zelf
 * op staat, anders hoeveel shiften er nog plaats hebben, of "vol".
 */
function DaySquares({
  days,
  selected,
  locale,
  onSelect,
}: {
  days: { key: string; shifts: AppShift[] }[];
  selected: string | null;
  locale: 'nl' | 'en';
  onSelect: (key: string) => void;
}) {
  const strip = useRef<ScrollViewInstance>(null);
  const offsets = useRef<Record<string, number>>({});
  useEffect(() => {
    const x = selected ? offsets.current[selected] : undefined;
    if (x !== undefined) strip.current?.scrollTo({ x: Math.max(0, x - SPACING.xl), animated: true });
  }, [selected]);

  return (
    <ScrollView
      ref={strip}
      horizontal
      showsHorizontalScrollIndicator={false}
      style={styles.strip}
      contentContainerStyle={styles.squares}
    >
      {days.map((day) => {
        const date = new Date(day.shifts[0].start);
        const active = day.key === selected;
        const mine = day.shifts.some((shift) => shift.registered);
        const open = day.shifts.filter((shift) => shift.canRegister).length;
        return (
          <Pressable
            key={day.key}
            onLayout={(event) => {
              offsets.current[day.key] = event.nativeEvent.layout.x;
            }}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
            accessibilityLabel={[
              formatDay(day.shifts[0].start, locale),
              mine ? 'je staat op een shift' : null,
              open === 0 ? 'alles volzet' : `${open} met plaats`,
            ]
              .filter(Boolean)
              .join(', ')}
            onPress={() => onSelect(day.key)}
            style={[styles.square, open === 0 && !mine && styles.squareOff, active && styles.squareActive]}
          >
            <Text style={[styles.squareWeekday, active && styles.squareTextActive]}>
              {brussels(locale, { weekday: 'short' }).format(date).replace('.', '')}
            </Text>
            <Text style={[styles.squareDay, active && styles.squareTextActive]}>
              {brussels(locale, { day: 'numeric' }).format(date)}
            </Text>
            {mine ? (
              <View style={[styles.squareDot, active && styles.squareDotActive]} />
            ) : (
              <Text style={[styles.squareCount, active && styles.squareTextActive]}>{open === 0 ? 'vol' : open}</Text>
            )}
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

/** Een bolletje per plaats, gevuld wat bezet is; bij veel plaatsen "3/12". */
function Spots({ shift }: { shift: AppShift }) {
  const label = `${shift.takenSpots} van ${shift.maxParticipants} plaatsen bezet`;
  if (shift.maxParticipants > MAX_PIPS) {
    return (
      <Text style={styles.spotsText} accessibilityLabel={label}>
        {shift.takenSpots}/{shift.maxParticipants}
      </Text>
    );
  }
  return (
    <View style={styles.pips} accessible accessibilityLabel={label}>
      {Array.from({ length: shift.maxParticipants }, (_, index) => (
        <View key={index} style={[styles.pip, index < shift.takenSpots && styles.pipTaken]} />
      ))}
    </View>
  );
}

function ShiftRow({
  shift,
  first,
  locale,
  onChanged,
}: {
  shift: AppShift;
  first: boolean;
  locale: 'nl' | 'en';
  onChanged: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);
  // Voor het inschrijven: mag een student deze plaats later innemen? Op een
  // shift waar je al op staat, is het de opgeslagen keuze.
  const [replaceable, setReplaceable] = useState(shift.replaceable ?? false);

  const act = async (kind: 'register' | 'unregister') => {
    setBusy(true);
    try {
      if (kind === 'register') {
        await registerForShift(shift.id, { replaceable: shift.replaceableOption && replaceable });
      } else await unregisterFromShift(shift.id);
      onChanged();
    } catch (error) {
      Alert.alert(
        kind === 'register' ? 'Inschrijven lukte niet' : 'Uitschrijven lukte niet',
        shiftErrorText(error),
      );
      // Ook bij een fout opnieuw ophalen: "vol" en "al begonnen" betekenen
      // allebei dat dit scherm achterloopt.
      onChanged();
    } finally {
      setBusy(false);
    }
  };

  const confirmUnregister = () => {
    Alert.alert(
      'Uitschrijven',
      `Je schrijft je uit voor ${shift.name} op ${formatDay(shift.start, locale)}. De plaats komt weer vrij voor iemand anders.`,
      [
        { text: 'Blijven staan', style: 'cancel' },
        { text: 'Uitschrijven', style: 'destructive', onPress: () => void act('unregister') },
      ],
    );
  };

  /**
   * Achteraf omzetten: meteen tonen, en bij een fout terugzetten en het zeggen.
   * Er is geen apart opslaan; de schakelaar ís de keuze.
   */
  const toggleReplaceable = async (next: boolean) => {
    setReplaceable(next);
    try {
      await setShiftReplaceable(shift.id, next);
      onChanged();
    } catch (error) {
      setReplaceable(!next);
      Alert.alert('Niet opgeslagen', shiftErrorText(error));
    }
  };

  const full = shift.takenSpots >= shift.maxParticipants;

  return (
    <View style={[styles.shift, !first && styles.shiftDivider]}>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        accessibilityLabel={`${shift.name}, ${formatTime(shift.start, locale)} tot ${formatTime(shift.end, locale)}, ${shift.location}`}
        onPress={() => setOpen(!open)}
        style={({ pressed }) => [styles.shiftRow, pressed && styles.pressed]}
      >
        <View style={styles.flex}>
          <Text style={styles.time}>
            {formatTime(shift.start, locale)} - {formatTime(shift.end, locale)}
          </Text>
          <Text style={[styles.shiftName, shift.registered && styles.shiftNameMine]} numberOfLines={2}>
            {shift.name}
          </Text>
          <View style={styles.meta}>
            <Text style={[styles.hint, styles.metaText]} numberOfLines={1}>
              {[shift.location, shift.openToInternationals ? 'English ok' : null].filter(Boolean).join(' · ')}
            </Text>
            {shift.reward > 0 ? (
              <RewardCoins
                display={String(shift.reward)}
                label={`${shift.reward} ${shift.reward === 1 ? 'bonnetje' : 'bonnetjes'}`}
                size="sm"
              />
            ) : null}
          </View>
        </View>
        {shift.registered ? (
          <View style={styles.mineTag}>
            <Check size={14} color={COLORS.navy} strokeWidth={2.8} />
            <Text style={styles.mineTagText}>Jij</Text>
          </View>
        ) : (
          <>
            <Spots shift={shift} />
            {shift.canRegister ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Inschrijven voor ${shift.name}`}
                disabled={busy}
                onPress={() => void act('register')}
                hitSlop={6}
                style={({ pressed }) => [styles.go, (busy || pressed) && styles.pressed]}
              >
                <Plus size={18} color={COLORS.yellow} strokeWidth={2.6} />
              </Pressable>
            ) : (
              <Text style={styles.closed}>{full ? 'Volzet' : 'Gesloten'}</Text>
            )}
          </>
        )}
      </Pressable>

      {open ? (
        <View style={styles.details}>
          {shift.openToInternationals ? (
            <View style={styles.factRow}>
              <Globe color={COLORS.muted} size={14} />
              <Text style={styles.hint}>Ook zonder Nederlands</Text>
            </View>
          ) : null}
          {shift.description ? <Text style={styles.body}>{shift.description}</Text> : null}
          {shift.instructions ? <Prose>{shift.instructions}</Prose> : null}

          <View style={styles.factRow}>
            <Text style={styles.factLabel}>Levert op</Text>
            {shift.reward > 0 ? (
              <RewardCoins
                display={String(shift.reward)}
                label={`${shift.reward} ${shift.reward === 1 ? 'bonnetje' : 'bonnetjes'}`}
              />
            ) : (
              // Nul is wat de shift jou oplevert, meestal omdat je dat werkingsjaar in
              // het praesidium zit; de server zegt niet waarom, dus de app ook niet.
              <Text style={styles.hint}>Levert jou geen bonnetjes op</Text>
            )}
          </View>

          {/* Wie er al op staat: enkel namen, geen foto's, zoals op /shift. */}
          {shift.roster ? (
            <View style={styles.roster}>
              <Text style={styles.factLabel}>
                Ingeschreven ({shift.takenSpots}/{shift.maxParticipants})
              </Text>
              {shift.roster.length === 0 ? (
                <Text style={styles.hint}>Nog niemand.</Text>
              ) : (
                <View style={styles.people}>
                  {shift.roster.map((person, index) => (
                    <View
                      key={`${index}-${person.name}`}
                      style={[styles.person, person.isSelf && styles.personSelf]}
                    >
                      <View style={styles.initial}>
                        <Text style={styles.initialText}>
                          {person.name.trim().slice(0, 1).toUpperCase() || '?'}
                        </Text>
                      </View>
                      <Text style={styles.personName} numberOfLines={1}>
                        {person.name}
                        {person.isSelf ? <Text style={styles.hint}> (jij)</Text> : null}
                      </Text>
                    </View>
                  ))}
                </View>
              )}
            </View>
          ) : null}

          {shift.replaceableOption && (shift.registered || shift.canRegister) ? (
            <View style={styles.switchRow}>
              <View style={styles.flex}>
                <Text style={styles.switchLabel}>Een student mag mijn plaats innemen</Text>
                <Text style={styles.hint}>
                  Schrijft er zich een student in terwijl de shift vol is, dan neemt die je plaats
                  in. Je krijgt dan een mail en hoeft niet meer te komen.
                </Text>
              </View>
              <Switch
                value={replaceable}
                onValueChange={(next) =>
                  shift.registered ? void toggleReplaceable(next) : setReplaceable(next)
                }
                trackColor={{ true: COLORS.yellow, false: COLORS.line2 }}
                thumbColor={COLORS.surface}
                accessibilityLabel="Een student mag mijn plaats innemen"
              />
            </View>
          ) : null}

          {shift.registered ? (
            shift.canUnregister ? (
              <Button label="Uitschrijven" variant="ghost" busy={busy} onPress={confirmUnregister} />
            ) : (
              <Text style={styles.hint}>
                Uitschrijven kan niet meer: de shift begint binnen het etmaal. Kan je echt niet,
                laat het dan weten aan de verantwoordelijke.
              </Text>
            )
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

/**
 * De melding bij een geweigerde in- of uitschrijving.
 *
 * De bestaande route antwoordt met Engelse zinnen en geen codes, dus dit leest de
 * status en de tekst. Zou die route ooit codes krijgen, dan hoort dit mee te
 * veranderen; tot dan is de status het betrouwbaarste deel.
 */
function shiftErrorText(error: unknown): string {
  if (!(error instanceof ApiError)) {
    return 'Geen verbinding met vtk.be. Probeer het straks opnieuw.';
  }
  const text = error.message.toLowerCase();
  if (text.includes('overlap')) return 'Je staat al op een shift die hiermee overlapt.';
  if (text.includes('full')) return 'Deze shift is intussen volzet.';
  if (text.includes('started')) return 'Deze shift is al begonnen.';
  if (text.includes('already registered')) return 'Je stond hier al op ingeschreven.';
  if (text.includes('only praesidium')) return 'Enkel een praesidiumlid kan vervangen worden.';
  if (text.includes('not registered')) return 'Je staat niet (meer) op deze shift.';
  if (text.includes('closed')) return 'Deze shift is al begonnen.';
  if (error.status === 409) {
    return 'Uitschrijven kan niet meer: de shift begint binnen het etmaal.';
  }
  if (error.isNotFound) return 'Deze shift bestaat niet meer.';
  return error.message;
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.paper },
  padded: { padding: SPACING.lg },
  content: { paddingHorizontal: SIDE, paddingTop: SPACING.xl - 2, gap: SPACING.xl, paddingBottom: SPACING.xxl * 2 },
  flex: { flex: 1 },
  title: { ...TYPE.cardTitle, color: COLORS.ink },
  body: { ...TYPE.body, color: COLORS.body },
  hint: { ...TYPE.small, color: COLORS.muted },
  pressed: { opacity: 0.7 },

  // De dagen in het geel, zoals bij Alma en Piano.
  strip: { flexGrow: 0, flexShrink: 0, marginHorizontal: -SIDE },
  squares: { gap: 6, paddingHorizontal: SIDE },
  square: {
    width: 48,
    height: 62,
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
  squareCount: { fontFamily: FONTS.semibold, fontSize: 10, color: COLORS.body },
  squareTextActive: { color: COLORS.yellow },
  squareDot: { width: 6, height: 6, borderRadius: 3, marginTop: 3, backgroundColor: COLORS.navy },
  squareDotActive: { backgroundColor: COLORS.yellow },

  // Een dag: de datum in de marge, de shiften achter de gele lijn.
  day: { flexDirection: 'row', gap: 14 },
  margin: { width: 46, paddingTop: 2 },
  marginWeekday: { fontFamily: FONTS.bold, fontSize: 11, letterSpacing: 1.2, color: COLORS.muted },
  marginDay: { fontFamily: FONTS.bold, fontSize: 26, lineHeight: 30, color: COLORS.navy, fontVariant: ['tabular-nums'] },
  marginMonth: { fontFamily: FONTS.semibold, fontSize: 11, color: COLORS.muted },
  dayRows: { flex: 1, borderLeftWidth: 3, borderLeftColor: COLORS.yellow, paddingLeft: 14 },

  shift: {},
  shiftDivider: { borderTopWidth: 1, borderTopColor: COLORS.line },
  shiftRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 12 },
  time: { fontFamily: FONTS.semibold, fontSize: 12.5, color: COLORS.body, fontVariant: ['tabular-nums'] },
  shiftName: { fontFamily: FONTS.semibold, fontSize: 16, lineHeight: 21, color: COLORS.ink, marginTop: 1 },
  shiftNameMine: { fontFamily: FONTS.bold, color: COLORS.navy },
  meta: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, marginTop: 2 },
  metaText: { flexShrink: 1 },
  pips: { flexDirection: 'row', gap: 3 },
  pip: { width: 8, height: 8, borderRadius: 4, borderWidth: 1.5, borderColor: COLORS.navy },
  pipTaken: { backgroundColor: COLORS.navy },
  spotsText: { fontFamily: FONTS.semibold, fontSize: 13, color: COLORS.body, fontVariant: ['tabular-nums'] },
  go: {
    width: 36,
    height: 36,
    borderRadius: RADIUS.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.navy,
  },
  closed: { ...TYPE.small, fontFamily: FONTS.semibold, color: COLORS.muted },
  mineTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    height: 30,
    paddingHorizontal: 10,
    borderRadius: RADIUS.pill,
    backgroundColor: COLORS.yellow,
  },
  mineTagText: { fontFamily: FONTS.bold, fontSize: 12.5, color: COLORS.navy },
  details: { paddingBottom: SPACING.md, gap: SPACING.sm },
  factRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm },
  factLabel: { ...TYPE.kicker, color: COLORS.muted, textTransform: 'uppercase' },
  roster: { gap: SPACING.sm, marginTop: SPACING.xs },
  people: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.sm },
  person: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    maxWidth: '100%',
    borderWidth: 1,
    borderColor: COLORS.line,
    borderRadius: RADIUS.pill,
    paddingLeft: 3,
    paddingRight: 10,
    paddingVertical: 3,
  },
  // Jezelf: de gele rand.
  personSelf: { borderColor: COLORS.yellow },
  initial: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: COLORS.paper2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  initialText: { fontFamily: FONTS.semibold, fontSize: 11, color: COLORS.ink },
  personName: { ...TYPE.small, color: COLORS.ink, flexShrink: 1 },
  switchRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.md },
  switchLabel: { fontFamily: FONTS.semibold, fontSize: 14, color: COLORS.ink },
});
