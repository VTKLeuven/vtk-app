import { CalendarRange, Check, ChevronDown, GraduationCap, LayoutGrid, ListChecks } from 'lucide-react-native';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { COLORS, FONTS, RADIUS, SPACING, TYPE } from '../../theme/tokens';
import { CARD_SHADOW } from '../HomeSection';
import { Sheet } from './PlanningSheets';

/** De vier weergaven van de planner, zoals de tabbladen Week, Per vak, Semester en Blok op Burgieclan. */
export type PlanningMode = 'week' | 'vak' | 'semester' | 'blok';

export const PLANNING_MODES: readonly PlanningMode[] = ['week', 'vak', 'semester', 'blok'];

const MODES: { value: PlanningMode; label: string; hint: string; icon: typeof Check }[] = [
  {
    value: 'week',
    label: 'Week',
    hint: 'Je lessen, deadlines en VTK-evenementen, drie dagen naast elkaar.',
    icon: CalendarRange,
  },
  {
    value: 'vak',
    label: 'Per vak',
    hint: 'Per vak wat je afvinkte, wat je nog moet inhalen en wat nog komt.',
    icon: ListChecks,
  },
  {
    value: 'semester',
    label: 'Semester',
    hint: 'Al je vakken en alle weken van het semester in één raster.',
    icon: LayoutGrid,
  },
  {
    value: 'blok',
    label: 'Blok',
    hint: 'Je examens, en per dag wat je wil doen. Werkt ook zonder lessenrooster.',
    icon: GraduationCap,
  },
];

export function modeLabel(mode: PlanningMode): string {
  return MODES.find((m) => m.value === mode)?.label ?? 'Week';
}

/**
 * De titel van de planner: wat je ziet, met een pijltje dat zegt dat je kan
 * wisselen. Het is de knop voor de weergave.
 *
 * **Waarom geen pillen.** In de kop staan al de pillen Planning, Evenementen en
 * Mijn evenementen. Een tweede rij pillen eronder (Week, Per vak, Semester, Blok)
 * vraagt een plek die de week niet heeft, en twee rijen tabbladen boven elkaar
 * lezen als een menu in een menu. Zoals de maand in een agenda-app: de titel zegt
 * waar je bent, en een tik erop laat je kiezen.
 */
export function ViewTitle({
  mode,
  subtitle,
  onPress,
}: {
  mode: PlanningMode;
  subtitle: string | null;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Weergave: ${modeLabel(mode)}${subtitle ? `, ${subtitle}` : ''}`}
      accessibilityHint="Kies tussen week, per vak, semester en blok"
      onPress={onPress}
      hitSlop={6}
      style={({ pressed }) => [styles.title, pressed && styles.pressed]}
    >
      <View style={styles.titleRow}>
        <Text style={styles.titleText} numberOfLines={1}>
          {modeLabel(mode)}
        </Text>
        <View style={styles.chevron}>
          <ChevronDown size={15} color={COLORS.ink} strokeWidth={2.4} />
        </View>
      </View>
      {subtitle ? (
        <Text style={styles.subtitle} numberOfLines={1}>
          {subtitle}
        </Text>
      ) : null}
    </Pressable>
  );
}

export function ViewSheet({
  visible,
  mode,
  onChange,
  onClose,
}: {
  visible: boolean;
  mode: PlanningMode;
  onChange: (mode: PlanningMode) => void;
  onClose: () => void;
}) {
  return (
    <Sheet visible={visible} title="Weergave" onClose={onClose}>
      <View style={styles.list}>
        {MODES.map((option, index) => {
          const active = option.value === mode;
          const Icon = option.icon;
          return (
            <Pressable
              key={option.value}
              accessibilityRole="radio"
              accessibilityState={{ selected: active }}
              onPress={() => {
                onChange(option.value);
                onClose();
              }}
              style={({ pressed }) => [styles.option, index > 0 && styles.optionLine, pressed && styles.pressed]}
            >
              <View style={[styles.icon, active && styles.iconActive]}>
                <Icon size={18} color={active ? COLORS.paper : COLORS.ink} />
              </View>
              <View style={styles.optionText}>
                <Text style={styles.optionLabel}>{option.label}</Text>
                <Text style={styles.optionHint}>{option.hint}</Text>
              </View>
              {active ? <Check size={18} color={COLORS.ink} /> : null}
            </Pressable>
          );
        })}
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  pressed: { opacity: 0.6 },
  title: { flexShrink: 1, minHeight: 44, justifyContent: 'center' },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  titleText: { fontFamily: FONTS.bold, fontSize: 18, letterSpacing: -0.4, color: COLORS.ink, flexShrink: 1 },
  chevron: {
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.paper2,
  },
  subtitle: { ...TYPE.small, color: COLORS.muted, fontVariant: ['tabular-nums'] },
  list: { backgroundColor: COLORS.surface, borderRadius: RADIUS.md, overflow: 'hidden' },
  option: { flexDirection: 'row', alignItems: 'center', gap: SPACING.md, padding: SPACING.md },
  optionLine: { borderTopWidth: 1, borderTopColor: COLORS.line },
  icon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.paper,
  },
  iconActive: { backgroundColor: COLORS.ink },
  optionText: { flex: 1, gap: 2 },
  optionLabel: { fontFamily: FONTS.semibold, fontSize: 15, color: COLORS.ink },
  optionHint: { ...TYPE.small, color: COLORS.muted },
});

/** De werkbalk boven elke weergave: de titel links, knoppen rechts. */
export function PlanningToolbar({ left, children }: { left: React.ReactNode; children?: React.ReactNode }) {
  return (
    <View style={toolbar.row}>
      <View style={toolbar.left}>{left}</View>
      {children}
    </View>
  );
}

/** Een ronde witte knop in de werkbalk, zoals `HeadButton`. */
export function ToolbarButton({
  label,
  onPress,
  disabled,
  children,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      hitSlop={6}
      style={({ pressed }) => [toolbar.button, pressed && styles.pressed, disabled && toolbar.disabled]}
    >
      {children}
    </Pressable>
  );
}

const toolbar = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    paddingLeft: SPACING.xl - 4,
    paddingRight: SPACING.lg,
    paddingTop: SPACING.sm,
    paddingBottom: SPACING.md,
  },
  left: { flex: 1, alignItems: 'flex-start' },
  button: {
    width: 44,
    height: 44,
    borderRadius: RADIUS.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.surface,
    ...CARD_SHADOW,
  },
  disabled: { opacity: 0.35 },
});
