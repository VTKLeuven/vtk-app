import {
  BookMarked,
  BookOpen,
  CalendarDays,
  CalendarRange,
  Check,
  GraduationCap,
  HandHeart,
  MapPin,
  Music,
  Sandwich,
  ScanLine,
  Ticket,
  UtensilsCrossed,
  type LucideIcon,
} from 'lucide-react-native';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useTabRouter, type TabTarget } from '../navigation';
import { useApp } from '../state/app';
import { getPref, setPref } from '../storage';
import { COLORS, FONTS, RADIUS, SPACING, TYPE } from '../theme/tokens';
import { Sheet } from './planning/PlanningSheets';

const KEY = 'home-snelknop';

type Choice = {
  key: string;
  label: string;
  icon: LucideIcon;
  /** Het adres; een functie voor wat elke keer een nieuw volgnummer vraagt. */
  to: () => TabTarget;
  /** Enkel tonen voor wie dit mag. */
  needs?: 'scanTickets';
};

/**
 * Wat de ronde knop in de gele kop van Home kan openen. Tot eind november 2026
 * opende hij altijd "Code scannen", en enkel voor wie iets te scannen had; dat
 * werd niet gebruikt. Nu kiest iedereen zelf.
 */
const CHOICES: Choice[] = [
  { key: 'broodjes', label: 'Broodjes', icon: Sandwich, to: () => '/broodjes' },
  {
    key: 'planning',
    label: 'Planning',
    icon: CalendarDays,
    to: () => ({ pathname: '/kalender', params: { tab: 'planning', week: '1', les: '', n: String(Date.now()) } }),
  },
  { key: 'evenementen', label: 'Evenementen', icon: CalendarRange, to: () => ({ pathname: '/kalender', params: { tab: 'agenda' } }) },
  { key: 'blokken', label: 'Samen blokken', icon: BookOpen, to: () => ({ pathname: '/studies', params: { tab: 'blokken' } }) },
  { key: 'cudi', label: 'Cursusdienst', icon: BookMarked, to: () => ({ pathname: '/studies', params: { tab: 'cudi' } }) },
  { key: 'burgieclan', label: 'Burgieclan', icon: GraduationCap, to: () => ({ pathname: '/studies', params: { tab: 'burgieclan' } }) },
  { key: 'tickets', label: 'Mijn tickets', icon: Ticket, to: () => ({ pathname: '/tickets', params: { tab: 'mijne' } }) },
  { key: 'shiften', label: 'Shiften', icon: HandHeart, to: () => '/shiften' },
  { key: 'alma', label: 'Alma', icon: UtensilsCrossed, to: () => '/alma' },
  { key: 'lokalen', label: 'Lokalen', icon: MapPin, to: () => '/lokalen' },
  { key: 'piano', label: 'Piano', icon: Music, to: () => '/piano' },
  { key: 'deur', label: 'Tickets scannen', icon: ScanLine, to: () => '/deur', needs: 'scanTickets' },
];

const DEFAULT = 'broodjes';

/**
 * De ronde navy knop links van je bonnetjes in de kop van Home: één tik opent
 * wat je koos, lang drukken laat je kiezen. Je keuze blijft op dit toestel.
 */
export function HomeShortcut() {
  const router = useTabRouter();
  const { bootstrap } = useApp();
  const [chosen, setChosen] = useState(() => getPref(KEY) ?? DEFAULT);
  const [picking, setPicking] = useState(false);

  const allowed = CHOICES.filter((choice) => !choice.needs || bootstrap?.abilities?.[choice.needs]);
  const current = allowed.find((choice) => choice.key === chosen) ?? allowed[0];
  const Icon = current.icon;

  const pick = (key: string) => {
    setPref(KEY, key);
    setChosen(key);
    setPicking(false);
  };

  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={current.label}
        accessibilityHint="Lang drukken om te kiezen wat deze knop opent"
        onPress={() => router.push(current.to())}
        onLongPress={() => setPicking(true)}
        delayLongPress={350}
        hitSlop={6}
        style={({ pressed }) => [styles.round, pressed && styles.pressed]}
      >
        <Icon color={COLORS.yellow} size={19} />
      </Pressable>

      <Sheet visible={picking} title="Wat opent deze knop?" onClose={() => setPicking(false)}>
        <Text style={styles.hint}>Kies wat je het vaakst opent. Je kan dit altijd wijzigen door lang op de knop te drukken.</Text>
        <View style={styles.list}>
          {allowed.map((choice, index) => {
            const ChoiceIcon = choice.icon;
            const active = choice.key === current.key;
            return (
              <Pressable
                key={choice.key}
                accessibilityRole="radio"
                accessibilityState={{ selected: active }}
                onPress={() => pick(choice.key)}
                style={({ pressed }) => [styles.row, index > 0 && styles.divider, pressed && styles.rowPressed]}
              >
                <View style={[styles.icon, active && styles.iconActive]}>
                  <ChoiceIcon color={active ? COLORS.yellow : COLORS.strong} size={18} />
                </View>
                <Text style={[styles.label, active && styles.labelActive]}>{choice.label}</Text>
                {active ? <Check color={COLORS.strong} size={18} strokeWidth={2.6} /> : null}
              </Pressable>
            );
          })}
        </View>
      </Sheet>
    </>
  );
}

const styles = StyleSheet.create({
  round: {
    width: 44,
    height: 44,
    borderRadius: RADIUS.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.band,
  },
  pressed: { opacity: 0.7 },
  hint: { ...TYPE.small, color: COLORS.muted },
  list: { marginTop: SPACING.sm },
  row: { flexDirection: 'row', alignItems: 'center', gap: SPACING.md, paddingVertical: 10 },
  rowPressed: { opacity: 0.6 },
  divider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: COLORS.line2 },
  icon: {
    width: 36,
    height: 36,
    borderRadius: RADIUS.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.paper2,
  },
  iconActive: { backgroundColor: COLORS.band },
  label: { flex: 1, fontFamily: FONTS.medium, fontSize: 15, color: COLORS.ink },
  labelActive: { fontFamily: FONTS.bold },
});
