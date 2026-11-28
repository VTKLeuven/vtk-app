import * as WebBrowser from 'expo-web-browser';
import {
  BookOpen,
  CalendarCheck,
  Check,
  ChevronDown,
  ChevronUp,
  Clock,
  Eye,
  EyeOff,
  Flag,
  Link2,
  MapPin,
  RefreshCw,
  Repeat,
  ExternalLink,
  Trash2,
  Unlink,
  User,
  Users,
  X,
} from 'lucide-react-native';
import { useState } from 'react';
import {
  Alert,
  Linking,
  Modal,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { AppPlanning, AppPlanningSession } from '../../api/contract';
import { mondayOf, shortDay, TYPE_LABELS, type Ref } from '../../planning/grid';
import type { PlanningHandle } from '../../planning/usePlanning';
import { COLORS, FONTS, PLANNING, RADIUS, SPACING, TYPE } from '../../theme/tokens';
import { Button } from '../ui';
import { CARD_SHADOW } from '../HomeSection';
import { t } from '../../i18n';

/** Een blad dat van onder inschuift, op papier, zoals de rest van de app. */
export function Sheet({
  visible,
  title,
  onClose,
  children,
}: {
  visible: boolean;
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.root}>
        <Pressable style={styles.scrim} onPress={onClose} accessibilityLabel={t('Sluiten', 'Close')} />
        <View style={[styles.sheet, { paddingBottom: insets.bottom + SPACING.lg }]}>
          <View style={styles.header}>
            <Text style={styles.title} numberOfLines={3}>
              {title}
            </Text>
            <Pressable onPress={onClose} hitSlop={12} accessibilityLabel={t('Sluiten', 'Close')} accessibilityRole="button">
              <X size={20} color={COLORS.muted} />
            </Pressable>
          </View>
          <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
            {children}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

/** Een regel met een actie: icoon, tekst, en eventueel een korte uitleg eronder. */
function ActionRow({
  icon: Icon,
  label,
  hint,
  onPress,
  disabled,
  destructive,
}: {
  icon: typeof Check;
  label: string;
  hint?: string;
  onPress: () => void;
  disabled?: boolean;
  destructive?: boolean;
}) {
  const colour = destructive ? PLANNING.dangerText : COLORS.ink;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={hint}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [styles.row, pressed && styles.pressed, disabled && styles.disabled]}
    >
      <Icon size={18} color={colour} />
      <View style={styles.rowText}>
        <Text style={[styles.rowLabel, { color: colour }]}>{label}</Text>
        {hint ? <Text style={styles.rowHint}>{hint}</Text> : null}
      </View>
    </Pressable>
  );
}

function Fact({ label, value }: { label: string; value: string | null | undefined }) {
  if (!value) return null;
  return (
    <View style={styles.fact}>
      <Text style={styles.factLabel}>{label}</Text>
      <Text style={styles.factValue}>{value}</Text>
    </View>
  );
}

/** Wat er geselecteerd is, opgezocht in de nieuwste planning zodat het blad meeverandert. */
export type Selection = { kind: 'session' | 'item' | 'vtk'; id: string; occurrence?: string } | null;

export function selectionOf(ref: Ref): Selection {
  // Een privé item opent zijn eigen blad (`PersonalSheet`), niet dit.
  if (ref.kind === 'personal') return null;
  if (ref.kind === 'session') return { kind: 'session', id: ref.session.uid };
  if (ref.kind === 'item') return { kind: 'item', id: ref.item.id };
  return { kind: 'vtk', id: ref.event.id, occurrence: ref.occurrence.key };
}

function resolve(planning: AppPlanning, selection: Selection): Ref | null {
  if (!selection) return null;
  if (selection.kind === 'session') {
    const session = planning.sessions.find((s) => s.uid === selection.id);
    return session ? { kind: 'session', session } : null;
  }
  if (selection.kind === 'item') {
    const item = planning.items.find((i) => i.id === selection.id);
    return item ? { kind: 'item', item } : null;
  }
  const event = planning.vtkEvents.find((v) => v.id === selection.id);
  const occurrence = event?.occurrences.find((o) => o.key === selection.occurrence) ?? event?.occurrences[0];
  return event && occurrence ? { kind: 'vtk', event, occurrence } : null;
}

const range = (start: string | null, end: string | null) => (start ? (end ? `${start} - ${end}` : start) : null);

/**
 * Wat je met één les, deadline of VTK-evenement kan doen. Dezelfde handelingen
 * als het dialoogvenster op Burgieclan; wat je hier doet, staat daar ook.
 */
export function DetailSheet({
  handle,
  selection,
  onClose,
  onOpenEvent,
}: {
  handle: PlanningHandle;
  selection: Selection;
  onClose: () => void;
  onOpenEvent: (id: string) => void;
}) {
  const planning = handle.data;
  const ref = planning ? resolve(planning, selection) : null;
  const busy = handle.busy;

  if (!planning || !ref) {
    return <Sheet visible={false} title="" onClose={onClose}>{null}</Sheet>;
  }

  if (ref.kind === 'vtk') {
    const { event, occurrence } = ref;
    return (
      <Sheet visible title={event.title} onClose={onClose}>
        <Text style={styles.kicker}>{t('VTK-evenement', 'VTK event')}</Text>
        <Fact label={t('Wanneer', 'When')} value={`${shortDay(occurrence.date)}${occurrence.allDay ? '' : `, ${range(occurrence.start, occurrence.end)}`}${occurrence.endDate !== occurrence.date ? t(` tot ${shortDay(occurrence.endDate)}`, ` to ${shortDay(occurrence.endDate)}`) : ''}`} />
        <Fact label="Moment" value={occurrence.label} />
        <Fact label={t('Waar', 'Where')} value={occurrence.location ?? event.location} />
        <View style={styles.actions}>
          <ActionRow
            icon={CalendarCheck}
            label={t('Bekijk het evenement', 'View the event')}
            onPress={() => {
              onClose();
              onOpenEvent(event.id);
            }}
          />
          <ActionRow
            icon={Trash2}
            label={t('Uit mijn planning halen', 'Remove from my planning')}
            hint={t('Het evenement blijft op de kalender staan; het verdwijnt enkel uit je planning en je geëxporteerde agenda.', 'The event stays on the calendar; it is only removed from your planning and your exported calendar.')}
            disabled={busy}
            destructive
            onPress={() => {
              void handle.run({ op: 'removeVtkEvent', vtkEventId: event.id }).then((ok) => ok && onClose());
            }}
          />
        </View>
      </Sheet>
    );
  }

  if (ref.kind === 'item') {
    const { item } = ref;
    return (
      <Sheet visible title={item.title} onClose={onClose}>
        <Text style={styles.kicker}>{item.kind === 'deadline' ? 'Deadline' : t('Verplichte sessie', 'Mandatory session')}</Text>
        <Fact label={t('Vak', 'Course')} value={item.subjectLabel} />
        <Fact
          label={item.kind === 'deadline' ? t('Tegen', 'Due') : t('Wanneer', 'When')}
          value={`${shortDay(item.date)}${item.time ? `, ${range(item.time, item.end)}` : item.kind === 'deadline' ? t(', einde van de dag', ', end of the day') : ''}`}
        />
        <Fact label={t('Notitie', 'Note')} value={item.note} />
        <View style={styles.actions}>
          <ActionRow
            icon={Check}
            label={item.done ? t('Niet meer afgevinkt', 'Uncheck') : t('Afvinken', 'Check off')}
            disabled={busy}
            onPress={() => void handle.run({ op: 'itemDone', id: item.id, value: !item.done })}
          />
          <ActionRow
            icon={Trash2}
            label={t('Verwijderen', 'Remove')}
            disabled={busy}
            destructive
            onPress={() =>
              Alert.alert(
                t('Deze deadline verwijderen?', 'Remove this deadline?'),
                t(
                  `"${item.title}" verdwijnt uit je planning, ook op Burgieclan en uit je geëxporteerde agenda. Je lessen en je andere deadlines blijven staan.`,
                  `"${item.title}" will be removed from your planning, also on Burgieclan and from your exported calendar. Your classes and other deadlines stay.`,
                ),
                [
                  { text: t('Annuleren', 'Cancel'), style: 'cancel' },
                  {
                    text: t('Verwijderen', 'Remove'),
                    style: 'destructive',
                    onPress: () => void handle.run({ op: 'deleteItem', id: item.id }).then((ok) => ok && onClose()),
                  },
                ],
              )
            }
          />
        </View>
      </Sheet>
    );
  }

  if (ref.kind === 'personal') return <Sheet visible={false} title="" onClose={onClose}>{null}</Sheet>;

  return (
    <SessionSheet key={ref.session.uid} handle={handle} session={ref.session} planning={planning} onClose={onClose} />
  );
}

/**
 * Eén les. Dit was eerst een lijst van zeven gelijke regels (afvinken, verplicht,
 * elke week verplicht, naar deze groep, verbergen, elke week verbergen, het vak),
 * en dat was te veel voor wat je meestal wil: afvinken, of deze ene les
 * verbergen. Nu staan die drie als knoppen bovenaan, met hun stand erin, en
 * zitten de wekelijkse regels achter "Elke week op dit uur". Wat je doet, blijft
 * hetzelfde als op Burgieclan.
 */
function SessionSheet({
  handle,
  session,
  planning,
  onClose,
}: {
  handle: PlanningHandle;
  session: AppPlanningSession;
  planning: AppPlanning;
  onClose: () => void;
}) {
  const busy = handle.busy;
  const run = handle.run;
  const week = mondayOf(session.date);
  const parallel = planning.sessions.some(
    (other) => other.uid !== session.uid && other.course === session.course && mondayOf(other.date) === week,
  );
  const hasRule = session.mandatory === 'rule' || session.hidden === 'rule';
  const [weekly, setWeekly] = useState(hasRule);

  const toggleMandatory = () => {
    if (session.mandatory === 'rule' && session.mandatoryRule) {
      void run({ op: 'removeRule', id: session.mandatoryRule });
    } else {
      void run({ op: 'mandatory', uid: session.uid, value: session.mandatory === null });
    }
  };
  const toggleHidden = () => {
    if (session.hidden === 'rule' && session.hiddenRule) {
      void run({ op: 'removeRule', id: session.hiddenRule });
    } else {
      void run({ op: 'hide', uid: session.uid, value: session.hidden === null });
    }
  };

  return (
    <Sheet visible title={session.course} onClose={onClose}>
      <Text style={styles.kicker}>
        {TYPE_LABELS[session.type] ?? TYPE_LABELS.other}
        {session.code ? `, ${session.code}` : ''}
      </Text>
      <View style={styles.meta}>
        <MetaLine icon={Clock} text={`${shortDay(session.date)}, ${range(session.start, session.end)}`} />
        <MetaLine icon={MapPin} text={session.location} />
        <MetaLine icon={User} text={session.people} muted />
      </View>

      <View style={styles.toggles}>
        <Toggle
          icon={Check}
          label={session.done ? t('Afgevinkt', 'Checked off') : t('Afvinken', 'Check off')}
          active={session.done}
          disabled={busy}
          onPress={() => void run({ op: 'done', uid: session.uid, value: !session.done })}
        />
        <Toggle
          icon={Flag}
          label={t('Verplicht', 'Mandatory')}
          note={session.mandatory === 'rule' ? t('elke week', 'every week') : undefined}
          active={session.mandatory !== null}
          disabled={busy}
          onPress={toggleMandatory}
        />
        <Toggle
          icon={EyeOff}
          label={session.hidden ? t('Verborgen', 'Hidden') : t('Verbergen', 'Hide')}
          note={session.hidden === 'rule' ? t('elke week', 'every week') : undefined}
          active={session.hidden !== null}
          disabled={busy}
          onPress={toggleHidden}
        />
      </View>

      <View style={styles.actions}>
        {parallel && session.hidden === null ? (
          <ActionRow
            icon={Users}
            label={t('Ik ga naar deze groep', 'I go to this group')}
            hint={t('Verbergt de andere groepen van dit vak deze week.', 'Hides the other groups of this course this week.')}
            disabled={busy}
            onPress={() => void run({ op: 'keepOnly', uid: session.uid })}
          />
        ) : null}

        <Pressable
          accessibilityRole="button"
          accessibilityState={{ expanded: weekly }}
          onPress={() => setWeekly(!weekly)}
          style={({ pressed }) => [styles.row, styles.disclosure, pressed && styles.pressed]}
        >
          <Repeat size={18} color={COLORS.ink} />
          <View style={styles.rowText}>
            <Text style={styles.rowLabel}>{t('Elke week op dit uur', 'Every week at this time')}</Text>
          </View>
          {weekly ? <ChevronUp size={18} color={COLORS.muted} /> : <ChevronDown size={18} color={COLORS.muted} />}
        </Pressable>

        {weekly ? (
          <View style={styles.nested}>
            <Text style={styles.hint}>{t('Voor elke les van dit vak op deze dag, dit uur en in dit lokaal.', 'For every class of this course on this day, at this time and in this room.')}</Text>
            {session.mandatory === 'rule' && session.mandatoryRule ? (
              <ActionRow
                icon={Flag}
                label={t('Niet meer elke week verplicht', 'No longer mandatory every week')}
                disabled={busy}
                onPress={() => void run({ op: 'removeRule', id: session.mandatoryRule as string })}
              />
            ) : (
              <ActionRow
                icon={Flag}
                label={t('Elke week verplicht', 'Mandatory every week')}
                disabled={busy}
                onPress={() => void run({ op: 'addRule', uid: session.uid, action: 'mandatory' })}
              />
            )}
            {session.hidden === 'rule' && session.hiddenRule ? (
              <ActionRow
                icon={Eye}
                label={t('Niet meer elke week verbergen', 'Stop hiding every week')}
                disabled={busy}
                onPress={() => void run({ op: 'removeRule', id: session.hiddenRule as string })}
              />
            ) : (
              <ActionRow
                icon={EyeOff}
                label={t('Elke week verbergen', 'Hide every week')}
                disabled={busy}
                onPress={() => void run({ op: 'addRule', uid: session.uid, action: 'hide' })}
              />
            )}
          </View>
        ) : null}

        {session.courseUrl ? (
          <ActionRow
            icon={BookOpen}
            label={t('Vak op Burgieclan', 'Course on Burgieclan')}
            hint={t('Cursussen, examens en samenvattingen.', 'Course notes, exams and summaries.')}
            onPress={() => void WebBrowser.openBrowserAsync(session.courseUrl as string)}
          />
        ) : null}
      </View>
    </Sheet>
  );
}

/** Eén feit van een les op één regel, met een icoon in plaats van een label. */
function MetaLine({ icon: Icon, text, muted }: { icon: typeof Check; text: string | null; muted?: boolean }) {
  if (!text) return null;
  return (
    <View style={styles.metaLine}>
      <Icon size={15} color={COLORS.muted} />
      <Text style={[styles.metaText, muted && styles.metaMuted]} numberOfLines={muted ? 2 : undefined}>
        {text}
      </Text>
    </View>
  );
}

/** Een knop die een stand draagt: aan is geel, zoals de ster bij een evenement. */
function Toggle({
  icon: Icon,
  label,
  note,
  active,
  disabled,
  onPress,
}: {
  icon: typeof Check;
  label: string;
  note?: string;
  active: boolean;
  disabled?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: active, disabled }}
      accessibilityLabel={note ? `${label}, ${note}` : label}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.toggle,
        active && styles.toggleActive,
        (pressed || disabled) && styles.pressed,
      ]}
    >
      <Icon size={18} color={active ? COLORS.onYellow : COLORS.ink} />
      <Text style={[styles.toggleLabel, active && styles.toggleTextActive]} numberOfLines={1}>
        {label}
      </Text>
      {note ? <Text style={[styles.toggleNote, active && styles.toggleTextActive]}>{note}</Text> : null}
    </Pressable>
  );
}

/** De geëxporteerde agenda: lessen, deadlines en VTK-evenementen in één abonnement. */
export function ExportSheet({
  visible,
  handle,
  onClose,
}: {
  visible: boolean;
  handle: PlanningHandle;
  onClose: () => void;
}) {
  const planning = handle.data;
  const feed = planning?.feedUrl ?? null;
  const webcal = planning?.webcalUrl ?? null;

  return (
    <Sheet visible={visible} title={t('Je planning in je eigen agenda', 'Your planning in your own calendar')} onClose={onClose}>
      <Text style={styles.text}>
        {t('Een link waarop Apple Agenda, Google Agenda of Outlook zich kan abonneren. Je lessen zonder de verborgen, verplichte lessen als MANDATORY, je deadlines, en de VTK-evenementen die je in je planning zette. Het is dezelfde link als op Burgieclan.', 'A link that Apple Calendar, Google Calendar or Outlook can subscribe to. Your classes without the hidden ones, mandatory classes as MANDATORY, your deadlines, and the VTK events you added to your planning. It is the same link as on Burgieclan.')}
      </Text>
      {feed ? (
        <Text selectable style={styles.link}>
          {feed}
        </Text>
      ) : null}
      <View style={styles.buttons}>
        {webcal ? (
          <Button
            label={t('Abonneren in mijn agenda', 'Subscribe in my calendar')}
            onPress={() =>
              void Linking.openURL(webcal).catch(() =>
                Alert.alert(t('Geen agenda-app gevonden', 'No calendar app found'), t('Deel de link en voeg hem toe als agenda via URL.', 'Share the link and add it as a calendar by URL.')),
              )
            }
          />
        ) : null}
        {feed ? (
          <Button label={t('Link delen', 'Share link')} variant="ghost" onPress={() => void Share.share({ message: feed })} />
        ) : null}
      </View>
      <Text style={styles.hint}>
        {t('Zeg je abonnement op het KU Leuven-rooster op, anders staat elke les er twee keer. Google Agenda ververst een geabonneerde agenda maar om de paar uur.', 'Cancel your subscription to the KU Leuven timetable, or every class will show up twice. Google Calendar only refreshes a subscribed calendar every few hours.')}
      </Text>
      <View style={styles.actions}>
        <ActionRow
          icon={Link2}
          label={t('Maak een nieuwe link', 'Create a new link')}
          hint={t('Iedereen met de link kan je planning zien.', 'Anyone with the link can see your planning.')}
          disabled={handle.busy}
          onPress={() =>
            Alert.alert(
              t('Een nieuwe link maken?', 'Create a new link?'),
              t('De huidige link werkt meteen niet meer, ook niet in een agenda die erop geabonneerd is. Je planning zelf blijft zoals ze is.', 'The current link stops working right away, also in a calendar subscribed to it. Your planning itself stays as it is.'),
              [
                { text: t('Annuleren', 'Cancel'), style: 'cancel' },
                { text: t('Nieuwe link', 'New link'), style: 'destructive', onPress: () => void handle.rotateFeed() },
              ],
            )
          }
        />
      </View>
    </Sheet>
  );
}

/** Instellingen van de planning: synchroniseren, verborgen lessen, de link, ontkoppelen. */
export function SettingsSheet({
  visible,
  handle,
  showHidden,
  onToggleHidden,
  onChangeLink,
  onClose,
}: {
  visible: boolean;
  handle: PlanningHandle;
  showHidden: boolean;
  onToggleHidden: () => void;
  onChangeLink: () => void;
  onClose: () => void;
}) {
  const planning = handle.data;
  return (
    <Sheet visible={visible} title="Planning" onClose={onClose}>
      <View style={styles.actions}>
        <ActionRow
          icon={RefreshCw}
          label={t('Nu synchroniseren', 'Sync now')}
          hint={planning?.lastSync ? t(
                  `Laatst met KU Leuven: ${new Date(planning.lastSync).toLocaleString('nl-BE')}`,
                  `Last synced with KU Leuven: ${new Date(planning.lastSync).toLocaleString('en-GB')}`,
                ) : undefined}
          disabled={handle.busy}
          onPress={() => void handle.sync()}
        />
        <ActionRow
          icon={showHidden ? EyeOff : Eye}
          label={showHidden ? t('Verborgen lessen niet tonen', 'Do not show hidden classes') : t('Verborgen lessen tonen', 'Show hidden classes')}
          onPress={() => {
            onToggleHidden();
            onClose();
          }}
        />
        <ActionRow icon={Link2} label={t('Ander lessenrooster koppelen', 'Link another timetable')} onPress={onChangeLink} />
        {planning ? (
          <ActionRow
            icon={ExternalLink}
            label={t('Open op Burgieclan', 'Open on Burgieclan')}
            hint={t('Het overzicht per vak en deadlines toevoegen.', 'The overview per course and adding deadlines.')}
            onPress={() => void WebBrowser.openBrowserAsync(planning.burgieclanUrl)}
          />
        ) : null}
        <ActionRow
          icon={Unlink}
          label={t('Lessenrooster ontkoppelen', 'Unlink timetable')}
          destructive
          disabled={handle.busy}
          onPress={() =>
            Alert.alert(
              t('Je planning wissen?', 'Clear your planning?'),
              t('Je lessenrooster wordt ontkoppeld en je hele planning gaat weg, ook op Burgieclan: wat je afvinkte, je deadlines, je wekelijkse regels en de VTK-evenementen erin. De geëxporteerde agenda werkt niet meer. De evenementen zelf blijven op de VTK-kalender.', 'Your timetable is unlinked and your whole planning is removed, also on Burgieclan: what you checked off, your deadlines, your weekly rules and the VTK events in it. The exported calendar stops working. The events themselves stay on the VTK calendar.'),
              [
                { text: t('Annuleren', 'Cancel'), style: 'cancel' },
                {
                  text: t('Wissen', 'Clear'),
                  style: 'destructive',
                  onPress: () => void handle.unsubscribe().then((ok) => ok && onClose()),
                },
              ],
            )
          }
        />
      </View>
    </Sheet>
  );
}

/**
 * Een lessenrooster koppelen. Enkel de link van KU Leuven; Burgieclan kijkt na of
 * het er een is en de site vertaalt de fout.
 */
export function SetupForm({
  handle,
  initial,
  onDone,
}: {
  handle: PlanningHandle;
  initial?: string | null;
  onDone?: () => void;
}) {
  const [link, setLink] = useState(initial ?? '');
  return (
    <View style={styles.setup}>
      <View style={styles.steps}>
        <Text style={styles.step}>{t('1. Open je rooster op de KU Leuven-roosterwebsite (TimeEdit).', '1. Open your timetable on the KU Leuven timetable website (TimeEdit).')}</Text>
        <Text style={styles.step}>
          {t('2. Kies Abonneren en kopieer de link. Ze begint met webcal://cloud.timeedit.net/be_kuleuven/.', '2. Choose Subscribe and copy the link. It starts with webcal://cloud.timeedit.net/be_kuleuven/.')}
        </Text>
        <Text style={styles.step}>{t('3. Plak ze hieronder.', '3. Paste it below.')}</Text>
      </View>
      <TextInput
        value={link}
        onChangeText={setLink}
        placeholder="webcal://cloud.timeedit.net/be_kuleuven/..."
        placeholderTextColor={COLORS.muted}
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="url"
        accessibilityLabel={t('Abonnementslink van je KU Leuven-lessenrooster', 'Subscription link of your KU Leuven timetable')}
        style={styles.input}
      />
      <Button
        label={t('Rooster koppelen', 'Link timetable')}
        busy={handle.busy}
        disabled={link.trim() === ''}
        onPress={() => void handle.subscribe(link.trim()).then((ok) => ok && onDone?.())}
      />
      <Text style={styles.hint}>
        {t('Alleen jij ziet je planning. Ze is dezelfde als op Burgieclan, en Burgieclan kijkt ongeveer elk uur of je rooster veranderde.', 'Only you can see your planning. It is the same as on Burgieclan, and Burgieclan checks about every hour whether your timetable changed.')}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, justifyContent: 'flex-end' },
  scrim: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(10, 15, 31, 0.45)' },
  sheet: {
    maxHeight: '85%',
    backgroundColor: COLORS.paper,
    borderTopLeftRadius: RADIUS.lg,
    borderTopRightRadius: RADIUS.lg,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: SPACING.md,
    paddingHorizontal: SPACING.xl - 4,
    paddingTop: SPACING.lg,
    paddingBottom: SPACING.sm,
  },
  title: { ...TYPE.heading, color: COLORS.ink, flex: 1 },
  body: { paddingHorizontal: SPACING.xl - 4, gap: SPACING.md, paddingBottom: SPACING.md },
  kicker: { ...TYPE.kicker, color: COLORS.muted, textTransform: 'uppercase' },
  fact: { flexDirection: 'row', gap: SPACING.md },
  factLabel: {
    width: 78,
    paddingTop: 2,
    fontFamily: FONTS.semibold,
    fontSize: 11.5,
    letterSpacing: 0.7,
    textTransform: 'uppercase',
    color: COLORS.muted,
  },
  factValue: { ...TYPE.body, color: COLORS.ink, flex: 1 },
  actions: { borderTopWidth: 1, borderTopColor: COLORS.line2, marginTop: SPACING.xs },
  meta: { gap: 6 },
  metaLine: { flexDirection: 'row', alignItems: 'flex-start', gap: SPACING.sm },
  metaText: { ...TYPE.body, color: COLORS.ink, flex: 1, marginTop: -3 },
  metaMuted: { ...TYPE.small, color: COLORS.muted, marginTop: -1 },
  toggles: { flexDirection: 'row', gap: SPACING.sm, marginTop: SPACING.xs },
  toggle: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    minHeight: 64,
    paddingVertical: SPACING.sm,
    paddingHorizontal: 4,
    borderRadius: 20,
    backgroundColor: COLORS.surface,
    ...CARD_SHADOW,
  },
  toggleActive: { backgroundColor: COLORS.yellow, borderColor: COLORS.yellow },
  toggleLabel: { fontFamily: FONTS.semibold, fontSize: 13, color: COLORS.ink },
  toggleNote: { fontFamily: FONTS.medium, fontSize: 11, color: COLORS.ink, opacity: 0.7 },
  toggleTextActive: { color: COLORS.onYellow },
  disclosure: { alignItems: 'center' },
  nested: { paddingLeft: SPACING.xl, paddingTop: SPACING.sm },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: SPACING.md,
    paddingVertical: 13,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.line,
  },
  rowText: { flex: 1, gap: 2 },
  rowLabel: { fontFamily: FONTS.semibold, fontSize: 15, lineHeight: 20 },
  rowHint: { ...TYPE.small, color: COLORS.muted },
  pressed: { opacity: 0.6 },
  disabled: { opacity: 0.45 },
  text: { ...TYPE.body, color: COLORS.body },
  hint: { ...TYPE.small, color: COLORS.muted },
  link: {
    ...TYPE.small,
    color: COLORS.ink,
    backgroundColor: COLORS.surface,
    borderRadius: 20,
    padding: SPACING.md,
    ...CARD_SHADOW,
  },
  buttons: { gap: SPACING.sm },
  setup: { gap: SPACING.md },
  steps: { gap: SPACING.xs },
  step: { ...TYPE.body, color: COLORS.body },
  input: {
    ...TYPE.body,
    color: COLORS.ink,
    backgroundColor: COLORS.surface,
    borderRadius: 12,
    paddingHorizontal: SPACING.md,
    paddingVertical: 11,
    borderWidth: 1,
    borderColor: COLORS.controlBorder,
  },
});
