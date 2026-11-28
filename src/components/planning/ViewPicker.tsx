import { Pressable, StyleSheet, Text, View } from 'react-native';

import { COLORS, FONTS, RADIUS, SPACING } from '../../theme/tokens';
import { CARD_SHADOW } from '../HomeSection';
import { t } from '../../i18n';

/** De vier weergaven van de planner, zoals de tabbladen Week, Per vak, Semester en Blok op Burgieclan. */
export type PlanningMode = 'week' | 'vak' | 'semester' | 'blok';

export const PLANNING_MODES: readonly PlanningMode[] = ['week', 'vak', 'semester', 'blok'];

const MODES: { value: PlanningMode; label: string; hint: string }[] = [
  { value: 'week', label: 'Week', hint: t('Je lessen, deadlines en VTK-evenementen, drie dagen naast elkaar.', 'Your classes, deadlines and VTK events, three days side by side.') },
  { value: 'vak', label: t('Per vak', 'Per course'), hint: t('Per vak wat je afvinkte, wat je nog moet inhalen en wat nog komt.', 'Per course what you checked off, what you still need to catch up on and what is still to come.') },
  { value: 'semester', label: 'Semester', hint: t('Al je vakken en alle weken van het semester in één raster.', 'All your courses and all weeks of the semester in one grid.') },
  { value: 'blok', label: t('Blok', 'Exams'), hint: t('Je examens, en per dag wat je wil doen. Werkt ook zonder lessenrooster.', 'Your exams, and per day what you want to do. Also works without a timetable.') },
];

/**
 * De weergave van de planner als witte balk met vier delen, onder de gele kop van
 * Kalender (voorstel G.1, november 2026). Tot dan was het een titel met een
 * pijltje die een blad opende; met de tabbladen nu in het geel staan twee rijen
 * keuzes niet meer als een menu in een menu op elkaar.
 *
 * `children` komt rechts ernaast: de ronde knoppen van de weergave (exporteren,
 * instellingen).
 */
export function ModeBar({
  mode,
  onChange,
  children,
}: {
  mode: PlanningMode;
  onChange: (mode: PlanningMode) => void;
  children?: React.ReactNode;
}) {
  return (
    <View style={styles.row}>
      <View style={styles.tabs} accessibilityRole="tablist" accessibilityLabel={t('Weergave', 'View')}>
        {MODES.map((option) => {
          const active = option.value === mode;
          return (
            <Pressable
              key={option.value}
              accessibilityRole="tab"
              accessibilityState={{ selected: active }}
              accessibilityHint={option.hint}
              onPress={() => onChange(option.value)}
              style={[styles.tab, active && styles.tabActive]}
            >
              <Text style={[styles.tabLabel, active && styles.tabLabelActive]} numberOfLines={1}>
                {option.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
      {children}
    </View>
  );
}

/** Een ronde witte knop naast de weergave, zoals `HeadButton`. */
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
      style={({ pressed }) => [styles.button, pressed && styles.pressed, disabled && styles.disabled]}
    >
      {children}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    paddingHorizontal: SPACING.xl - 4,
    paddingTop: SPACING.lg,
    paddingBottom: SPACING.md,
  },
  tabs: {
    flex: 1,
    flexDirection: 'row',
    padding: 4,
    borderRadius: RADIUS.pill,
    backgroundColor: COLORS.surface,
    ...CARD_SHADOW,
  },
  tab: { flex: 1, height: 36, alignItems: 'center', justifyContent: 'center', borderRadius: RADIUS.pill },
  tabActive: { backgroundColor: COLORS.selected },
  tabLabel: { fontFamily: FONTS.semibold, fontSize: 12.5, color: COLORS.body },
  tabLabelActive: { fontFamily: FONTS.bold, color: COLORS.onSelected },
  button: {
    width: 44,
    height: 44,
    borderRadius: RADIUS.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.surface,
    ...CARD_SHADOW,
  },
  pressed: { opacity: 0.6 },
  disabled: { opacity: 0.35 },
});
