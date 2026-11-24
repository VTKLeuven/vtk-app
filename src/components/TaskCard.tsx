import {
  CalendarCheck,
  ChevronRight,
  MessageSquareText,
  Music,
  Sandwich,
  ScanLine,
  TicketCheck,
  TriangleAlert,
  Wrench,
} from 'lucide-react-native';
import { Image } from 'expo-image';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { AppTodayTask } from '../api/contract';
import { useTabRouter } from '../navigation';
import { COLORS, FONTS, RADIUS, SPACING, TYPE } from '../theme/tokens';
import { CARD_SHADOW } from './HomeSection';

/**
 * Eén ding dat op jou wacht: je broodje, je shift van vanavond, je ticket.
 *
 * De volgorde en de dringendheid komen van de server; die weet welke van deze
 * dingen een deadline heeft. Wat hier gebeurt is enkel tekenen, en dat is met
 * opzet: zou de app zelf beslissen wat dringend is, dan zou die regel op twee
 * plaatsen staan en vroeg of laat uit elkaar lopen.
 *
 * Sinds voorstel F1 (november 2026) is elke taak een witte kaart op Home. De
 * broodjes dragen de foto van het Theokot-team, de rest een icoon in een vlakje;
 * een dringende taak krijgt dat vlakje in het geel, en de actie staat als gele
 * pil rechts.
 */
const THEOKOT_PHOTO = require('../../assets/snel/theokot.jpg');

const ICONS: Record<AppTodayTask['kind'], React.ComponentType<{ color: string; size: number }>> = {
  gate: TriangleAlert,
  'theokot-pickup': Sandwich,
  'theokot-order': Sandwich,
  ticket: TicketCheck,
  shift: Wrench,
  piano: Music,
  poll: MessageSquareText,
  scan: ScanLine,
};

export function TaskCard({ task }: { task: AppTodayTask }) {
  const router = useTabRouter();
  const Icon = ICONS[task.kind] ?? CalendarCheck;
  const photo = task.kind === 'theokot-order' || task.kind === 'theokot-pickup';

  /**
   * De server geeft een pad met soms een querystring (`/poort?gate=onboarding`).
   * `router.push` wil dat als twee stukken, anders belandt de query in het pad en
   * vindt de router niets.
   *
   * `useTabRouter` zet het daarna in de tab waar de kaart staat, zodat teruggaan
   * je weer op die tab afzet. Zie src/navigation.ts.
   */
  const go = () => {
    const [pathname, query] = task.path.split('?');
    const params = Object.fromEntries(new URLSearchParams(query ?? ''));
    router.push({ pathname, params });
  };

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={[task.title, task.detail, task.actionLabel].filter(Boolean).join(', ')}
      onPress={go}
      style={({ pressed }) => [styles.card, photo && styles.cardPhoto, pressed && styles.pressed]}
    >
      {photo ? (
        <Image cachePolicy="memory-disk" source={THEOKOT_PHOTO} style={styles.photo} contentFit="cover" contentPosition={{ top: '60%', left: '50%' }} />
      ) : (
        <View style={[styles.icon, task.highlight && styles.iconHighlight]}>
          <Icon color={COLORS.ink} size={20} />
        </View>
      )}
      <View style={[styles.text, photo && styles.textPhoto]}>
        <Text style={styles.title} numberOfLines={2}>
          {task.title}
        </Text>
        {task.detail ? (
          <Text style={styles.detail} numberOfLines={2}>
            {task.detail}
          </Text>
        ) : null}
        {task.actionLabel && photo ? (
          <View style={styles.action}>
            <Text style={styles.actionText}>{task.actionLabel}</Text>
          </View>
        ) : null}
      </View>
      {task.actionLabel && !photo ? (
        <View style={[styles.action, styles.actionSide]}>
          <Text style={styles.actionText}>{task.actionLabel}</Text>
        </View>
      ) : !photo ? (
        <ChevronRight color={COLORS.muted} size={18} />
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md + 2,
    padding: SPACING.md,
    borderRadius: 20,
    backgroundColor: COLORS.surface,
    ...CARD_SHADOW,
  },
  cardPhoto: { padding: 0, overflow: 'hidden', minHeight: 104, alignItems: 'stretch' },
  pressed: { opacity: 0.85 },
  photo: { width: 120, backgroundColor: COLORS.paper2 },
  icon: {
    width: 48,
    height: 48,
    borderRadius: 14,
    backgroundColor: COLORS.paper2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconHighlight: { backgroundColor: COLORS.yellow },
  text: { flex: 1, gap: 3 },
  textPhoto: { justifyContent: 'center', paddingVertical: SPACING.md, paddingRight: SPACING.md },
  title: { fontFamily: FONTS.bold, fontSize: 16, lineHeight: 21, letterSpacing: -0.3, color: COLORS.ink },
  detail: { ...TYPE.small, color: COLORS.muted },
  action: {
    alignSelf: 'flex-start',
    marginTop: 6,
    paddingHorizontal: SPACING.md,
    paddingVertical: 6,
    borderRadius: RADIUS.pill,
    backgroundColor: COLORS.yellow,
  },
  actionSide: { alignSelf: 'center', marginTop: 0 },
  actionText: { fontFamily: FONTS.bold, fontSize: 13, color: COLORS.ink },
});
