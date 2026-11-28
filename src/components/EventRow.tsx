import { Star } from 'lucide-react-native';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { AppCalendarEvent, AppLocale } from '../api/contract';
import { formatDayShort, formatTime } from '../format';
import { dayKeyOf } from '../monthGrid';
import { leadMoment } from '../moments';
import { daysBetween } from '../planning/grid';
import { COLORS, FONTS, RADIUS, SPACING, TYPE } from '../theme/tokens';
import { CroppedPhoto } from './CroppedPhoto';
import { CARD_SHADOW } from './HomeSection';
import { t } from '../i18n';

/** Het moment van een evenement op een gekozen dag, of het eerstvolgende. */
function momentOf(event: AppCalendarEvent, at?: string) {
  const moment = at ? (event.moments?.find((m) => m.start === at) ?? null) : leadMoment(event);
  return {
    start: moment?.start ?? at ?? event.start,
    end: moment?.end ?? event.end,
    location: moment?.location ?? event.location,
    label: moment?.label ?? null,
  };
}

/** "11:15 – 13:30", of enkel het begin wanneer het einde op een andere dag valt. */
function hours(event: AppCalendarEvent, start: string, end: string, locale: AppLocale): string {
  if (event.allDay) return t('Hele dag', 'All day');
  const from = formatTime(start, locale);
  return dayKeyOf(start) === dayKeyOf(end) ? `${from} – ${formatTime(end, locale)}` : from;
}

/**
 * Eén evenement in de lijst of de agenda van Kalender: de affiche links tot tegen
 * de rand van de kaart, daarnaast wanneer, wat en waar, en rechts de ster. Elk
 * evenement is even groot (voorstel van november 2026): de lijst zegt niet welk
 * evenement belangrijker is.
 *
 * **De ster is geen inschrijving**: ze zet het evenement in Mijn lijst, met de
 * herinnering van de dag ervoor. Zie `tab-kalender.tsx`.
 */
export function EventRow({
  event,
  at,
  locale,
  onPress,
  onToggleInterest,
}: {
  event: AppCalendarEvent;
  /** Bij een reeks: het moment van de getoonde dag. */
  at?: string;
  locale: AppLocale;
  onPress: () => void;
  onToggleInterest?: (next: boolean) => void;
}) {
  const moment = momentOf(event, at);
  const when = hours(event, moment.start, moment.end, locale);
  const title = moment.label ? `${event.title}: ${moment.label}` : event.title;
  const meta = [moment.location, event.ticketSlug ? 'tickets' : null].filter(Boolean).join(' · ');

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={[title, when, moment.location].filter(Boolean).join(', ')}
      onPress={onPress}
      style={({ pressed }) => [styles.row, pressed && styles.pressed]}
    >
      <View style={styles.photo}>
        {event.imageUrl ? (
          <CroppedPhoto source={{ uri: event.imageUrl }} crop={event.imageCrop} kind="focus" transition={120} />
        ) : null}
      </View>
      <View style={styles.text}>
        <Text style={styles.when}>{when}</Text>
        <Text style={styles.title} numberOfLines={2}>
          {title}
        </Text>
        {meta ? (
          <Text style={styles.meta} numberOfLines={1}>
            {meta}
          </Text>
        ) : null}
      </View>
      {onToggleInterest ? (
        <StarButton event={event} title={title} onToggle={onToggleInterest} />
      ) : null}
    </Pressable>
  );
}

function StarButton({
  event,
  title,
  onToggle,
}: {
  event: AppCalendarEvent;
  title: string;
  onToggle: (next: boolean) => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: event.interested }}
      accessibilityLabel={event.interested ? t(`${title} niet meer volgen`, `Stop following ${title}`) : t(`${title} in mijn lijst zetten`, `Add ${title} to my list`)}
      onPress={() => onToggle(!event.interested)}
      hitSlop={6}
      style={({ pressed }) => [styles.star, event.interested && styles.starOn, pressed && styles.pressed]}
    >
      <Star
        size={20}
        color={event.interested ? COLORS.onYellow : COLORS.strong}
        fill={event.interested ? COLORS.onYellow : 'transparent'}
        strokeWidth={event.interested ? 1.6 : 1.8}
      />
    </Pressable>
  );
}

/** "Nu bezig", "Vandaag", "Morgen", "Over 3 dagen", of de datum. */
function countdown(start: string, end: string, today: string, now: Date, locale: AppLocale): string {
  const startDate = new Date(start);
  if (startDate <= now && now < new Date(end)) return t('Nu bezig', 'Happening now');
  const days = daysBetween(today, dayKeyOf(start));
  if (days <= 0) return t('Vandaag', 'Today');
  if (days === 1) return t('Morgen', 'Tomorrow');
  if (days < 7) return t(`Over ${days} dagen`, `In ${days} days`);
  return formatDayShort(start, locale).replace(/\./g, '');
}

/**
 * Een evenement in Mijn lijst: de affiche groot met hoe lang het nog duurt erop,
 * daaronder wanneer en waar, en de knop naar de tickets wanneer die er zijn. Hier
 * mogen ze groter dan in de lijst: het zijn er enkel die je zelf aanduidde.
 */
export function MyEventCard({
  event,
  today,
  locale,
  onPress,
  onTickets,
  onToggleInterest,
}: {
  event: AppCalendarEvent;
  today: string;
  locale: AppLocale;
  onPress: () => void;
  onTickets?: () => void;
  onToggleInterest?: (next: boolean) => void;
}) {
  const moment = momentOf(event);
  const now = new Date();
  const badge = countdown(moment.start, moment.end, today, now, locale);
  const soon = badge === t('Nu bezig', 'Happening now') || badge === t('Vandaag', 'Today');
  const day = formatDayShort(moment.start, locale).replace(/\./g, '');
  const when = `${day.charAt(0).toUpperCase()}${day.slice(1)} · ${hours(event, moment.start, moment.end, locale)}`;
  const title = moment.label ? `${event.title}: ${moment.label}` : event.title;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={[title, badge, when, moment.location].filter(Boolean).join(', ')}
      onPress={onPress}
      style={({ pressed }) => [styles.card, pressed && styles.pressed]}
    >
      <View style={styles.cardPhoto}>
        {event.imageUrl ? (
          <CroppedPhoto source={{ uri: event.imageUrl }} crop={event.imageCrop} kind="hero" transition={150} />
        ) : null}
        <View style={[styles.badge, soon && styles.badgeSoon]}>
          <Text style={[styles.badgeText, soon && styles.badgeTextSoon]}>{badge.toUpperCase()}</Text>
        </View>
      </View>
      <View style={styles.cardBody}>
        <View style={styles.text}>
          <Text style={styles.when}>{when}</Text>
          <Text style={styles.cardTitle} numberOfLines={2}>
            {title}
          </Text>
          {moment.location ? (
            <Text style={styles.meta} numberOfLines={1}>
              {moment.location}
            </Text>
          ) : null}
        </View>
        {onTickets ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t(`Tickets voor ${title}`, `Tickets for ${title}`)}
            onPress={onTickets}
            hitSlop={6}
            style={({ pressed }) => [styles.tickets, pressed && styles.pressed]}
          >
            <Text style={styles.ticketsLabel}>Tickets</Text>
          </Pressable>
        ) : null}
        {onToggleInterest ? <StarButton event={event} title={title} onToggle={onToggleInterest} /> : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  pressed: { opacity: 0.75 },
  row: {
    flexDirection: 'row',
    alignItems: 'stretch',
    minHeight: 84,
    borderRadius: 20,
    overflow: 'hidden',
    backgroundColor: COLORS.surface,
    ...CARD_SHADOW,
  },
  photo: { width: 118, backgroundColor: COLORS.paper2, overflow: 'hidden' },
  text: { flex: 1, justifyContent: 'center', gap: 2, paddingVertical: SPACING.md, paddingLeft: 14, paddingRight: SPACING.sm },
  when: { fontFamily: FONTS.bold, fontSize: 12, color: COLORS.strong, fontVariant: ['tabular-nums'] },
  title: { fontFamily: FONTS.semibold, fontSize: 15, lineHeight: 20, color: COLORS.ink },
  meta: { ...TYPE.small, color: COLORS.muted },
  star: {
    alignSelf: 'center',
    marginRight: 10,
    width: 44,
    height: 44,
    borderRadius: RADIUS.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.paper,
  },
  starOn: { backgroundColor: COLORS.yellow },

  card: { borderRadius: 20, overflow: 'hidden', backgroundColor: COLORS.surface, ...CARD_SHADOW },
  cardPhoto: { height: 150, backgroundColor: COLORS.paper2, overflow: 'hidden' },
  badge: {
    position: 'absolute',
    top: 10,
    left: 10,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    backgroundColor: COLORS.yellow,
  },
  badgeSoon: { backgroundColor: COLORS.band },
  badgeText: { fontFamily: FONTS.bold, fontSize: 12, letterSpacing: 0.3, color: COLORS.onYellow },
  badgeTextSoon: { color: COLORS.yellow },
  cardBody: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, paddingRight: 4 },
  cardTitle: { fontFamily: FONTS.semibold, fontSize: 16, lineHeight: 21, color: COLORS.ink },
  tickets: {
    height: 40,
    justifyContent: 'center',
    paddingHorizontal: 14,
    borderRadius: RADIUS.pill,
    borderWidth: 1.5,
    borderColor: COLORS.strong,
  },
  ticketsLabel: { fontFamily: FONTS.bold, fontSize: 13, color: COLORS.strong },
});
