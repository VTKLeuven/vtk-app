import { Image } from 'expo-image';
import { Check } from 'lucide-react-native';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { applyLanguage, type Lang } from '../i18n';
import { COLORS, FONTS, RADIUS, SPACING } from '../theme/tokens';

/**
 * De eerste vraag van de app: Nederlands of Engels. Nederlands staat al
 * gekozen; wie gewoon verdergaat, krijgt de app in het Nederlands. Engels
 * herstart de app, want elke tekst ligt bij de start vast (`src/i18n.ts`).
 *
 * Staat bewust in beide talen tegelijk: wie nog niets koos, leest misschien
 * geen Nederlands.
 */
export function LanguageChoice({ onDone }: { onDone: () => void }) {
  const insets = useSafeAreaInsets();
  const [choice, setChoice] = useState<Lang>('nl');

  const options: { value: Lang; label: string; hint: string }[] = [
    { value: 'nl', label: 'Nederlands', hint: 'De app in het Nederlands' },
    { value: 'en', label: 'English', hint: 'The app in English' },
  ];

  const go = () => {
    void applyLanguage(choice);
    // Bij Nederlands herstart er niets; dan gaat de app hier gewoon verder.
    if (choice === 'nl') onDone();
  };

  return (
    <View style={[StyleSheet.absoluteFill, styles.root]}>
      <View style={[styles.head, { paddingTop: insets.top + SPACING.xl }]}>
        <Image
          source={require('../../assets/vtk-logo.png')}
          style={styles.logo}
          contentFit="contain"
          tintColor={COLORS.headTitle}
          accessibilityLabel="VTK"
        />
        <Text accessibilityRole="header" style={styles.title}>
          Kies je taal
        </Text>
        <Text style={styles.subtitle}>Choose your language</Text>
      </View>

      <View style={styles.body}>
        <View accessibilityRole="radiogroup" style={styles.options}>
          {options.map((option) => {
            const active = option.value === choice;
            return (
              <Pressable
                key={option.value}
                accessibilityRole="radio"
                accessibilityState={{ selected: active }}
                onPress={() => setChoice(option.value)}
                style={({ pressed }) => [styles.option, active && styles.optionActive, pressed && styles.pressed]}
              >
                <View style={styles.optionText}>
                  <Text style={styles.optionLabel}>{option.label}</Text>
                  <Text style={styles.optionHint}>{option.hint}</Text>
                </View>
                <View style={[styles.radio, active && styles.radioActive]}>
                  {active ? <Check color={COLORS.onSelectedAccent} size={16} strokeWidth={3} /> : null}
                </View>
              </Pressable>
            );
          })}
        </View>
        <Text style={styles.note}>
          {'Je kan dit later wijzigen onder Meer.\nYou can change this later under More.'}
        </Text>
      </View>

      <View style={[styles.footer, { paddingBottom: insets.bottom + SPACING.lg }]}>
        <Pressable
          accessibilityRole="button"
          onPress={go}
          style={({ pressed }) => [styles.button, pressed && styles.pressed]}
        >
          <Text style={styles.buttonLabel}>{choice === 'en' ? 'Continue' : 'Verder'}</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { backgroundColor: COLORS.paper, zIndex: 10 },
  head: {
    backgroundColor: COLORS.head,
    paddingHorizontal: SPACING.xl,
    paddingBottom: SPACING.xl,
    gap: SPACING.sm,
    borderBottomLeftRadius: 32,
    borderBottomRightRadius: 32,
  },
  logo: { width: 64, height: 36, marginBottom: SPACING.lg },
  title: { fontFamily: FONTS.bold, fontSize: 34, lineHeight: 38, letterSpacing: -1.3, color: COLORS.headTitle },
  subtitle: { fontFamily: FONTS.semibold, fontSize: 17, color: COLORS.strong },
  body: { flex: 1, padding: SPACING.xl, gap: SPACING.lg },
  options: { gap: SPACING.md },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
    minHeight: 72,
    paddingHorizontal: SPACING.lg,
    borderRadius: 20,
    borderWidth: 2,
    borderColor: COLORS.line,
    backgroundColor: COLORS.surface,
  },
  optionActive: { borderColor: COLORS.strong },
  optionText: { flex: 1, gap: 2 },
  optionLabel: { fontFamily: FONTS.bold, fontSize: 18, color: COLORS.ink },
  optionHint: { fontFamily: FONTS.regular, fontSize: 14, color: COLORS.muted },
  radio: {
    width: 26,
    height: 26,
    borderRadius: 13,
    borderWidth: 2,
    borderColor: COLORS.controlBorder,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioActive: { backgroundColor: COLORS.selected, borderColor: COLORS.selected },
  note: { fontFamily: FONTS.regular, fontSize: 13, lineHeight: 19, color: COLORS.muted, textAlign: 'center' },
  footer: { paddingHorizontal: SPACING.xl },
  button: {
    minHeight: 54,
    borderRadius: RADIUS.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.selected,
  },
  buttonLabel: { fontFamily: FONTS.bold, fontSize: 16, color: COLORS.onSelected },
  pressed: { opacity: 0.75 },
});
