import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from 'lucide-react-native';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { addDays, shortDay } from '../../planning/grid';
import type { PlanningHandle } from '../../planning/usePlanning';
import { COLORS, FONTS, RADIUS, SPACING, TYPE } from '../../theme/tokens';
import { Button } from '../ui';
import { Sheet } from './PlanningSheets';

type Kind = 'deadline' | 'mandatory';

/** Het blok dat iemand in de week neerzette: de dag en de uren, in minuten sinds middernacht. */
export type ItemDraft = { date: string; startMin: number; endMin: number };

const hhmm = (minutes: number) => `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;

const TIME = /^([01]?\d|2[0-3])[:.u]([0-5]\d)$/;
const toTime = (value: string): string | null => {
  const match = TIME.exec(value.trim());
  return match ? `${match[1].padStart(2, '0')}:${match[2]}` : null;
};

/**
 * Zelf iets in je planning zetten: een **verplichte sessie** (een labo, een
 * presentatie) of een **deadline** (een taak, een verslag), bij een vak uit je
 * lessenrooster. Dat is wat de planner van Burgieclan zelf kent ("Deadline
 * toevoegen"); het komt in de week als blok of als strook bovenaan de dag, gaat
 * mee in de geëxporteerde agenda en staat ook op burgieclan.be.
 *
 * Het blad opent nadat je in de week lang drukte en een blok neerzette, zoals een
 * nieuw evenement in Agenda op iOS: de dag en de uren staan al ingevuld en het
 * begint als sessie, want een blok met een begin en een einde is een sessie.
 *
 * Een vak is verplicht: Burgieclan hangt elk item aan een vak uit je rooster.
 * Een datum kies je met pijltjes per dag en per week. Een datumkiezer zou een
 * native module vragen die niet in Expo Go zit, en een deadline valt meestal
 * binnen een paar weken.
 */
export function ItemSheet({
  draft,
  handle,
  onClose,
}: {
  draft: ItemDraft;
  handle: PlanningHandle;
  onClose: () => void;
}) {
  const subjects = handle.data?.subjects ?? [];
  const [kind, setKind] = useState<Kind>('mandatory');
  const [subject, setSubject] = useState<string | null>(subjects.length === 1 ? subjects[0].key : null);
  const [title, setTitle] = useState('');
  const [date, setDate] = useState(draft.date);
  const [time, setTime] = useState(hhmm(draft.startMin));
  const [end, setEnd] = useState(draft.endMin >= 24 * 60 ? '' : hhmm(draft.endMin));
  const [note, setNote] = useState('');

  const start = time.trim() === '' ? null : toTime(time);
  const finish = end.trim() === '' ? null : toTime(end);
  const timeInvalid = time.trim() !== '' && !start;
  const endInvalid = kind === 'mandatory' && end.trim() !== '' && (!finish || !start || finish <= start);
  const ready = subject !== null && title.trim() !== '' && !timeInvalid && !endInvalid;

  const save = async () => {
    if (!ready || !subject) return;
    const ok = await handle.run({
      op: 'addItem',
      item: {
        subject,
        kind,
        title: title.trim(),
        date,
        time: start,
        end: kind === 'mandatory' && start ? finish : null,
        note: note.trim(),
      },
    });
    if (ok) onClose();
  };

  return (
    <Sheet visible title={`Nieuw op ${shortDay(date)}`} onClose={onClose}>
      <View style={styles.segmented} accessibilityRole="radiogroup">
        {(['mandatory', 'deadline'] as const).map((value) => {
          const active = kind === value;
          return (
            <Pressable
              key={value}
              accessibilityRole="radio"
              accessibilityState={{ selected: active }}
              onPress={() => setKind(value)}
              style={[styles.segment, active && styles.segmentActive]}
            >
              <Text style={[styles.segmentLabel, active && styles.segmentLabelActive]}>
                {value === 'deadline' ? 'Deadline' : 'Verplichte sessie'}
              </Text>
            </Pressable>
          );
        })}
      </View>
      <Text style={styles.hint}>
        {kind === 'deadline'
          ? 'Iets dat af moet zijn: een verslag, een taak, een inschrijving. Het staat bovenaan de dag.'
          : 'Iets waar je bij moet zijn en dat niet in je lessenrooster staat: een labo, een presentatie.'}
      </Text>

      <Text style={styles.label}>Vak</Text>
      {subjects.length === 0 ? (
        <Text style={styles.hint}>Je lessenrooster heeft nog geen vakken.</Text>
      ) : (
        <View style={styles.chips}>
          {subjects.map((s) => {
            const active = subject === s.key;
            return (
              <Pressable
                key={s.key}
                accessibilityRole="radio"
                accessibilityState={{ selected: active }}
                onPress={() => setSubject(s.key)}
                style={({ pressed }) => [styles.chip, active && styles.chipActive, pressed && styles.pressed]}
              >
                <Text style={[styles.chipText, active && styles.chipTextActive]} numberOfLines={2}>
                  {s.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
      )}

      <Text style={styles.label}>Titel</Text>
      <TextInput
        value={title}
        onChangeText={setTitle}
        maxLength={200}
        placeholder={kind === 'deadline' ? 'bv. Verslag labo 3 indienen' : 'bv. Labo elektronica'}
        placeholderTextColor={COLORS.muted}
        style={styles.input}
        accessibilityLabel="Titel"
      />

      <Text style={styles.label}>Dag</Text>
      <View style={styles.dateRow}>
        <StepButton label="Een week vroeger" onPress={() => setDate(addDays(date, -7))}>
          <ChevronsLeft size={18} color={COLORS.ink} />
        </StepButton>
        <StepButton label="Een dag vroeger" onPress={() => setDate(addDays(date, -1))}>
          <ChevronLeft size={18} color={COLORS.ink} />
        </StepButton>
        <Text style={styles.date} accessibilityLiveRegion="polite">
          {shortDay(date)}
        </Text>
        <StepButton label="Een dag later" onPress={() => setDate(addDays(date, 1))}>
          <ChevronRight size={18} color={COLORS.ink} />
        </StepButton>
        <StepButton label="Een week later" onPress={() => setDate(addDays(date, 7))}>
          <ChevronsRight size={18} color={COLORS.ink} />
        </StepButton>
      </View>

      <View style={styles.times}>
        <View style={styles.flex}>
          <Text style={styles.label}>{kind === 'mandatory' ? 'Begin (optioneel)' : 'Uur (optioneel)'}</Text>
          <TextInput
            value={time}
            onChangeText={setTime}
            placeholder={kind === 'deadline' ? '23:59' : '14:00'}
            placeholderTextColor={COLORS.muted}
            keyboardType="numbers-and-punctuation"
            style={[styles.input, timeInvalid && styles.invalid]}
            accessibilityLabel={kind === 'mandatory' ? 'Begin' : 'Uur'}
          />
        </View>
        {kind === 'mandatory' ? (
          <View style={styles.flex}>
            <Text style={styles.label}>Einde (optioneel)</Text>
            <TextInput
              value={end}
              onChangeText={setEnd}
              placeholder="16:00"
              placeholderTextColor={COLORS.muted}
              keyboardType="numbers-and-punctuation"
              style={[styles.input, endInvalid && styles.invalid]}
              accessibilityLabel="Einde"
            />
          </View>
        ) : null}
      </View>
      {timeInvalid ? <Text style={styles.error}>Schrijf het uur als 14:00.</Text> : null}
      {endInvalid ? <Text style={styles.error}>Het einde moet na het begin liggen.</Text> : null}

      <Text style={styles.label}>Notitie (optioneel)</Text>
      <TextInput
        value={note}
        onChangeText={setNote}
        maxLength={2000}
        multiline
        placeholder="Waar, wat meebrengen, een link"
        placeholderTextColor={COLORS.muted}
        style={[styles.input, styles.note]}
        accessibilityLabel="Notitie"
      />

      <Button
        label={kind === 'deadline' ? 'Deadline bewaren' : 'Sessie bewaren'}
        busy={handle.busy}
        disabled={!ready}
        onPress={() => void save()}
      />
      <Text style={styles.hint}>Het komt ook in je planning op Burgieclan en in je geëxporteerde agenda.</Text>
    </Sheet>
  );
}

function StepButton({ label, onPress, children }: { label: string; onPress: () => void; children: React.ReactNode }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      hitSlop={4}
      style={({ pressed }) => [styles.step, pressed && styles.pressed]}
    >
      {children}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, gap: SPACING.sm },
  pressed: { opacity: 0.65 },
  label: { fontFamily: FONTS.semibold, fontSize: 12, letterSpacing: 0.6, textTransform: 'uppercase', color: COLORS.muted },
  hint: { ...TYPE.small, color: COLORS.muted },
  error: { ...TYPE.small, color: COLORS.dangerInk },

  segmented: { flexDirection: 'row', padding: 3, borderRadius: RADIUS.pill, backgroundColor: COLORS.surface, alignSelf: 'flex-start' },
  segment: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: RADIUS.pill },
  segmentActive: { backgroundColor: COLORS.ink },
  segmentLabel: { ...TYPE.small, fontFamily: FONTS.semibold, color: COLORS.body },
  segmentLabelActive: { color: COLORS.paper },

  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.sm },
  chip: {
    maxWidth: '100%',
    paddingHorizontal: SPACING.md,
    paddingVertical: 8,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: COLORS.line2,
    backgroundColor: COLORS.surface,
  },
  chipActive: { backgroundColor: COLORS.ink, borderColor: COLORS.ink },
  chipText: { fontFamily: FONTS.medium, fontSize: 13, color: COLORS.ink },
  chipTextActive: { color: COLORS.paper },

  input: {
    minHeight: 44,
    paddingHorizontal: SPACING.md,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.controlBorder,
    backgroundColor: COLORS.surface,
    ...TYPE.body,
    color: COLORS.ink,
  },
  invalid: { borderColor: COLORS.dangerLine },
  note: { minHeight: 80, paddingTop: 10, textAlignVertical: 'top' },

  dateRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.xs },
  step: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.surface,
  },
  date: { flex: 1, textAlign: 'center', fontFamily: FONTS.semibold, fontSize: 15, color: COLORS.ink },
  times: { flexDirection: 'row', gap: SPACING.md },
});
