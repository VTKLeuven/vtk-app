import { MapPin } from 'lucide-react-native';
import { useMemo, useState } from 'react';
import { Alert, Pressable, StyleSheet, Switch, Text, TextInput, View } from 'react-native';

import type { AppPlanningPersonal } from '../../api/contract';
import { addDays, shortDay } from '../../planning/grid';
import type { PlanningHandle } from '../../planning/usePlanning';
import { COLORS, FONTS, PLANNING, RADIUS, SPACING, TYPE } from '../../theme/tokens';
import { Button } from '../ui';
import { Sheet } from './PlanningSheets';
import { Wheel } from './Wheel';

/** Het blok dat iemand in de week neerzette: de dag en de uren, in minuten sinds middernacht. */
export type ItemDraft = { date: string; startMin: number; endMin: number };

export type PersonalTarget = { kind: 'new'; draft: ItemDraft } | { kind: 'edit'; item: AppPlanningPersonal };

const HOURS = Array.from({ length: 24 }, (_, h) => h);
const MINUTES = Array.from({ length: 12 }, (_, i) => i * 5);
const LAST = 23 * 60 + 55;
const two = (n: number) => String(n).padStart(2, '0');
const hhmm = (minutes: number) => `${two(Math.floor(minutes / 60))}:${two(minutes % 60)}`;
const toMinutes = (time: string | null, fallback: number) => {
  if (!time) return fallback;
  const [h, m] = time.split(':').map(Number);
  return Number.isFinite(h) && Number.isFinite(m) ? h * 60 + m : fallback;
};
/** Op vijf minuten, zoals het wiel. */
const round5 = (minutes: number) => Math.min(LAST, Math.round(minutes / 5) * 5);

/**
 * Een eigen, privé item in je planning, zoals een nieuw evenement in Agenda op
 * iOS: een titel, een locatie, wanneer het begint en eindigt (met een draaiwiel)
 * of de hele dag, en een notitie. Het hoort bij geen vak en geen VTK-evenement,
 * en enkel jij ziet het. vtk.be bewaart het (Burgieclan kent enkel items bij een
 * vak), dus het staat niet op burgieclan.be.
 *
 * Een nieuw item komt hier nadat je in de week lang drukte en een blok neerzette;
 * dag en uren staan dan al juist. Een bestaand item opent hier met een tik.
 */
export function PersonalSheet({
  target,
  handle,
  onClose,
}: {
  target: PersonalTarget;
  handle: PlanningHandle;
  onClose: () => void;
}) {
  const editing = target.kind === 'edit' ? target.item : null;
  const initialDate = editing ? editing.date : target.kind === 'new' ? target.draft.date : '';
  const [title, setTitle] = useState(editing?.title ?? '');
  const [location, setLocation] = useState(editing?.location ?? '');
  const [note, setNote] = useState(editing?.note ?? '');
  const [allDay, setAllDay] = useState(editing?.allDay ?? false);
  const [date, setDate] = useState(initialDate);
  const [start, setStart] = useState(() =>
    round5(editing ? toMinutes(editing.start, 9 * 60) : target.kind === 'new' ? target.draft.startMin : 9 * 60),
  );
  const [end, setEnd] = useState(() =>
    round5(editing ? toMinutes(editing.end, 10 * 60) : target.kind === 'new' ? Math.min(target.draft.endMin, LAST) : 10 * 60),
  );
  const [open, setOpen] = useState<'start' | 'end' | null>(null);

  // Een half jaar heen en terug rond de gekozen dag; genoeg voor een agenda.
  const dates = useMemo(() => Array.from({ length: 365 }, (_, i) => addDays(initialDate, i - 182)), [initialDate]);
  const today = handle.data?.today ?? '';
  const dayText = (d: string) => (d === today ? 'Vandaag' : shortDay(d));

  const valid = title.trim() !== '' && (allDay || end > start);

  /** Het begin verschuiven neemt het einde mee, zoals in Agenda: de duur blijft. */
  const moveStart = (next: number) => {
    const duration = Math.max(5, end - start);
    setStart(next);
    setEnd(Math.min(LAST, next + duration));
  };

  const save = async () => {
    if (!valid) return;
    const item = {
      title: title.trim(),
      location: location.trim() || null,
      note: note.trim(),
      date,
      allDay,
      start: allDay ? null : hhmm(start),
      end: allDay ? null : hhmm(end),
    };
    const ok = await handle.run(editing ? { op: 'updatePersonal', id: editing.id, item } : { op: 'addPersonal', item });
    if (ok) onClose();
  };

  const remove = () => {
    if (!editing) return;
    Alert.alert('Item verwijderen?', `"${editing.title}" verdwijnt uit je planning. Je lessen en VTK-evenementen blijven staan.`, [
      { text: 'Behouden', style: 'cancel' },
      {
        text: 'Verwijderen',
        style: 'destructive',
        onPress: () => void handle.run({ op: 'deletePersonal', id: editing.id }).then((ok) => ok && onClose()),
      },
    ]);
  };

  return (
    <Sheet visible title={editing ? 'Item wijzigen' : 'Nieuw item'} onClose={onClose}>
      <View style={styles.group}>
        <TextInput
          value={title}
          onChangeText={setTitle}
          placeholder="Titel"
          placeholderTextColor={COLORS.muted}
          autoFocus={!editing}
          maxLength={200}
          style={[styles.field, styles.title]}
          accessibilityLabel="Titel"
        />
        <View style={styles.line} />
        <View style={styles.locationRow}>
          <MapPin size={17} color={COLORS.muted} />
          <TextInput
            value={location}
            onChangeText={setLocation}
            placeholder="Locatie"
            placeholderTextColor={COLORS.muted}
            maxLength={200}
            style={[styles.field, styles.flex]}
            accessibilityLabel="Locatie"
          />
        </View>
      </View>

      <View style={styles.group}>
        <View style={styles.row}>
          <Text style={styles.rowLabel}>Hele dag</Text>
          <Switch
            value={allDay}
            onValueChange={(value) => {
              setAllDay(value);
              setOpen(null);
            }}
            trackColor={{ true: COLORS.ink, false: COLORS.line2 }}
            accessibilityLabel="Hele dag"
          />
        </View>
        <View style={styles.line} />
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ expanded: open === 'start' }}
          onPress={() => setOpen(open === 'start' ? null : 'start')}
          style={styles.row}
        >
          <Text style={styles.rowLabel}>{allDay ? 'Dag' : 'Begint'}</Text>
          <View style={styles.values}>
            <Text style={[styles.pill, open === 'start' && styles.pillOpen]}>{dayText(date)}</Text>
            {!allDay ? <Text style={[styles.pill, open === 'start' && styles.pillOpen]}>{hhmm(start)}</Text> : null}
          </View>
        </Pressable>
        {open === 'start' ? (
          <View style={styles.wheels}>
            <Wheel values={dates} value={date} onChange={setDate} width={allDay ? 220 : 150} render={dayText} accessibilityLabel="Dag" />
            {!allDay ? (
              <>
                <Wheel
                  values={HOURS}
                  value={Math.floor(start / 60)}
                  onChange={(h) => moveStart(h * 60 + (start % 60))}
                  width={56}
                  render={two}
                  accessibilityLabel="Uur van het begin"
                />
                <Wheel
                  values={MINUTES}
                  value={start % 60}
                  onChange={(m) => moveStart(Math.floor(start / 60) * 60 + m)}
                  width={56}
                  render={two}
                  accessibilityLabel="Minuten van het begin"
                />
              </>
            ) : null}
          </View>
        ) : null}
        {!allDay ? (
          <>
            <View style={styles.line} />
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ expanded: open === 'end' }}
              onPress={() => setOpen(open === 'end' ? null : 'end')}
              style={styles.row}
            >
              <Text style={styles.rowLabel}>Eindigt</Text>
              <Text style={[styles.pill, open === 'end' && styles.pillOpen, end <= start && styles.pillInvalid]}>{hhmm(end)}</Text>
            </Pressable>
            {open === 'end' ? (
              <View style={styles.wheels}>
                <Wheel
                  values={HOURS}
                  value={Math.floor(end / 60)}
                  onChange={(h) => setEnd(h * 60 + (end % 60))}
                  width={56}
                  render={two}
                  accessibilityLabel="Uur van het einde"
                />
                <Wheel
                  values={MINUTES}
                  value={end % 60}
                  onChange={(m) => setEnd(Math.floor(end / 60) * 60 + m)}
                  width={56}
                  render={two}
                  accessibilityLabel="Minuten van het einde"
                />
              </View>
            ) : null}
          </>
        ) : null}
      </View>
      {!allDay && end <= start ? <Text style={styles.error}>Het einde moet na het begin liggen.</Text> : null}

      <View style={styles.group}>
        <TextInput
          value={note}
          onChangeText={setNote}
          placeholder="Notitie"
          placeholderTextColor={COLORS.muted}
          multiline
          maxLength={2000}
          style={[styles.field, styles.note]}
          accessibilityLabel="Notitie"
        />
      </View>

      <Button label={editing ? 'Bewaren' : 'Toevoegen'} busy={handle.busy} disabled={!valid} onPress={() => void save()} />
      {editing ? (
        <Pressable accessibilityRole="button" onPress={remove} disabled={handle.busy} style={styles.delete}>
          <Text style={styles.deleteText}>Item verwijderen</Text>
        </Pressable>
      ) : null}
      <Text style={styles.hint}>
        Enkel jij ziet dit. Het staat in je planning in de app, naast je lessen en VTK-evenementen.
        Een item verplaats je door het lang in te drukken en te slepen.
      </Text>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  group: { backgroundColor: COLORS.surface, borderRadius: RADIUS.md, overflow: 'hidden' },
  line: { height: 1, backgroundColor: COLORS.line, marginLeft: SPACING.md },
  field: { minHeight: 48, paddingHorizontal: SPACING.md, ...TYPE.body, color: COLORS.ink },
  title: { fontFamily: FONTS.semibold, fontSize: 17 },
  locationRow: { flexDirection: 'row', alignItems: 'center', paddingLeft: SPACING.md },
  note: { minHeight: 90, paddingTop: 12, textAlignVertical: 'top' },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 50, paddingHorizontal: SPACING.md },
  rowLabel: { ...TYPE.body, color: COLORS.ink },
  values: { flexDirection: 'row', gap: SPACING.sm },
  pill: {
    fontFamily: FONTS.medium,
    fontSize: 15,
    color: COLORS.ink,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    overflow: 'hidden',
    backgroundColor: COLORS.paper2,
    fontVariant: ['tabular-nums'],
  },
  pillOpen: { color: PLANNING.lectureText, backgroundColor: PLANNING.lectureBg },
  pillInvalid: { color: COLORS.dangerInk, textDecorationLine: 'line-through' },
  wheels: { flexDirection: 'row', justifyContent: 'center', gap: SPACING.sm, paddingVertical: SPACING.sm },
  error: { ...TYPE.small, color: COLORS.dangerInk },
  hint: { ...TYPE.small, color: COLORS.muted },
  delete: { alignItems: 'center', paddingVertical: SPACING.md },
  deleteText: { fontFamily: FONTS.semibold, fontSize: 15, color: COLORS.dangerInk },
});
