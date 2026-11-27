import { Image } from 'expo-image';
import { CalendarClock, ChevronRight, Sandwich } from 'lucide-react-native';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { AppLocale, AppServiceStatus } from '../api/contract';
import { fetchCudiTimeslots, fetchTheokot } from '../api/endpoints';
import { useResource } from '../api/useResource';
import { formatDayShort, formatTime } from '../format';
import { dayKeyOf, todayKey } from '../monthGrid';
import { useTabRouter } from '../navigation';
import { addDays } from '../planning/grid';
import { useApp } from '../state/app';
import { COLORS, FONTS, RADIUS, SPACING, TYPE } from '../theme/tokens';
import { CARD_SHADOW } from './HomeSection';

/**
 * De logo's van de drie diensten, zoals de openingsurenband op de site ze toont
 * (`apps/web/public/openingsuren/`), maar ingekleurd voor wit: daar staan ze wit op
 * navy. Het wit werd navy, het rood van Theokot bleef rood. Dat van 't ElixIr komt
 * uit de grote versie van de fakbar (`apps/fakbar/public/elixir-logo.png`), omdat
 * het kleine op deze maat korrelig werd.
 */
const LOGOS: Record<AppServiceStatus['key'], { source: number; ratio: number }> = {
  theokot: { source: require('../../assets/openingsuren/theokot.png'), ratio: 125 / 76 },
  cursusdienst: { source: require('../../assets/openingsuren/cursusdienst.png'), ratio: 128 / 92 },
  elixir: { source: require('../../assets/openingsuren/elixir.png'), ratio: 208 / 120 },
};

const LOGO_HEIGHT = 34;

/**
 * Theokot, cursusdienst en 't ElixIr: open of niet, en tot hoe laat.
 *
 * Drie witte tegels onder de gele kop van Home (voorstel G.1 van november 2026),
 * met in elke tegel het logo van de plek en daaronder de toestand, alles in het
 * midden. De naam staat al in het logo en staat er in het Nederlands dus niet nog
 * eens onder. **In het Engels wel**: een international weet niet dat "cudi" de
 * course shop is, en de naam van de server zegt het ("Course Shop").
 *
 * Open staat in het groen ("Open tot 18:00"), dicht in het grijs. Tik een tegel
 * aan en de week klapt eronder open. Bij het Theokot staat daar ook je broodje
 * (wanneer je het kan halen) of anders een knop naar Broodjes, bij de cursusdienst
 * je tijdslot of anders een knop om er een te kiezen (november 2026).
 *
 * **Het rekenwerk gebeurt op de server** (`lib/app-api/serviceStatus.ts`), op de
 * klok van Brussel; hier wordt enkel de regel getoond die de server stuurt.
 */
export function ServiceList({ services, locale }: { services: AppServiceStatus[]; locale: AppLocale }) {
  const [open, setOpen] = useState<string | null>(null);
  const expanded = services.find((service) => service.key === open) ?? null;

  if (services.length === 0) return null;

  return (
    <View style={styles.wrap}>
      <View style={styles.row}>
        {services.map((service) => {
          const hasSchedule = service.entries.length > 0;
          const isOpen = open === service.key;
          const logo = LOGOS[service.key];
          const status = statusLine(service, locale);
          return (
            <Pressable
              key={service.key}
              accessibilityRole={hasSchedule ? 'button' : 'text'}
              accessibilityState={hasSchedule ? { expanded: isOpen } : undefined}
              accessibilityLabel={`${service.name}, ${status}`}
              disabled={!hasSchedule}
              onPress={() => setOpen(isOpen ? null : service.key)}
              style={({ pressed }) => [styles.tile, isOpen && styles.tileOpen, pressed && styles.pressed]}
            >
              {logo ? (
                <Image
                  source={logo.source}
                  style={{ height: LOGO_HEIGHT, width: LOGO_HEIGHT * logo.ratio }}
                  contentFit="contain"
                  accessible={false}
                />
              ) : null}
              {!logo || locale === 'en' ? (
                <Text style={styles.name} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>
                  {service.name}
                </Text>
              ) : null}
              <Text style={[styles.status, service.openNow && styles.statusOpen]} numberOfLines={1}>
                {status}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {expanded ? (
        <View style={styles.schedule}>
          <Text style={styles.scheduleTitle}>{expanded.name}</Text>
          {expanded.entries.map((entry) => (
            <View key={entry.day} style={styles.scheduleRow}>
              <Text style={styles.scheduleDay} numberOfLines={1}>
                {entry.day}
              </Text>
              <Text style={styles.scheduleHours} numberOfLines={1}>
                {entry.hours}
              </Text>
            </View>
          ))}
          {expanded.note ? <Text style={styles.note}>{expanded.note}</Text> : null}
          {expanded.key === 'theokot' ? <TheokotNext locale={locale} /> : null}
          {expanded.key === 'cursusdienst' ? <CudiSlot locale={locale} /> : null}
          {expanded.live ? (
            <Text style={styles.note}>
              {locale === 'en'
                ? 'Measured live; this can differ from the schedule.'
                : 'Live gemeten; dat kan van het rooster afwijken.'}
            </Text>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

/** "vandaag", "morgen" of "di 2 dec", voor een afhaalmoment of een tijdslot. */
function dayWord(iso: string, locale: AppLocale): string {
  const key = dayKeyOf(iso);
  const today = todayKey();
  if (key === today) return locale === 'en' ? 'today' : 'vandaag';
  if (key === addDays(today, 1)) return locale === 'en' ? 'tomorrow' : 'morgen';
  return formatDayShort(iso, locale).replace(/\./g, '');
}

/**
 * Je eerstvolgende broodje, met wanneer je het kan halen; zonder bestelling een
 * knop naar Broodjes. Dezelfde gegevens en cache als het scherm Broodjes.
 */
function TheokotNext({ locale }: { locale: AppLocale }) {
  const router = useTabRouter();
  const { viewer } = useApp();
  const resource = useResource('theokot', () => fetchTheokot(locale), locale, viewer !== null);
  const now = Date.now();
  const next =
    resource.data?.sessions
      .filter((session) => session.order && new Date(session.pickupEnd).getTime() > now)
      .sort((a, b) => a.pickupStart.localeCompare(b.pickupStart))[0] ?? null;

  if (next?.order) {
    const count = next.order.lines.reduce((sum, line) => sum + line.quantity, 0);
    const what = count === 1 ? 'Je broodje' : `Je ${count} broodjes`;
    return (
      <ExtraLink
        icon={<Sandwich size={18} color={COLORS.navy} />}
        title={`${what}: ${dayWord(next.pickupStart, locale)} van ${formatTime(next.pickupStart, locale)} tot ${formatTime(next.pickupEnd, locale)}`}
        detail="Af te halen aan het Theokot met je studentenkaart"
        onPress={() => router.push('/broodjes')}
      />
    );
  }
  return (
    <ExtraLink
      icon={<Sandwich size={18} color={COLORS.navy} />}
      title="Broodjes bestellen"
      detail={viewer ? 'Bestel en haal af met je studentenkaart' : 'Log in om te bestellen'}
      onPress={() => router.push('/broodjes')}
    />
  );
}

/**
 * Je tijdslot bij de cursusdienst, of een knop om er een te kiezen. Werkt de
 * cursusdienst zonder tijdsloten, dan staat hier niets.
 */
function CudiSlot({ locale }: { locale: AppLocale }) {
  const router = useTabRouter();
  const { viewer } = useApp();
  const resource = useResource(
    'cudi-tijdsloten',
    () => fetchCudiTimeslots(locale),
    `${locale}:${viewer?.id ?? 'anon'}`,
    viewer !== null,
  );
  const data = resource.data;
  if (viewer && (!data || !data.available || !data.enabled)) return null;

  const mine = data?.mine.find((slot) => new Date(slot.end).getTime() > Date.now()) ?? null;
  return (
    <ExtraLink
      icon={<CalendarClock size={18} color={COLORS.navy} />}
      title={
        mine
          ? `Je tijdslot: ${dayWord(mine.start, locale)} van ${formatTime(mine.start, locale)} tot ${formatTime(mine.end, locale)}`
          : 'Nog geen tijdslot gereserveerd'
      }
      detail={mine ? 'Tik om een ander uur te kiezen' : 'Kies een tijdslot om je cursussen af te halen'}
      action={mine ? undefined : 'Reserveer'}
      onPress={() => router.push(viewer ? '/cudi-tijdsloten' : '/inloggen')}
    />
  );
}

/** Een regel onder de uren die naar een scherm leidt. */
function ExtraLink({
  icon,
  title,
  detail,
  action,
  onPress,
}: {
  icon: React.ReactNode;
  title: string;
  detail: string;
  /** Een navy knop rechts in plaats van het pijltje. */
  action?: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${title}. ${detail}`}
      onPress={onPress}
      style={({ pressed }) => [styles.extra, pressed && styles.pressed]}
    >
      <View style={styles.extraIcon}>{icon}</View>
      <View style={styles.extraText}>
        <Text style={styles.extraTitle}>{title}</Text>
        <Text style={styles.extraDetail}>{detail}</Text>
      </View>
      {action ? (
        <View style={styles.extraButton}>
          <Text style={styles.extraButtonLabel}>{action}</Text>
        </View>
      ) : (
        <ChevronRight size={18} color={COLORS.muted} />
      )}
    </Pressable>
  );
}

/**
 * "Open tot 14:00", "Opent 18:00", "Opent do 12:00": de regel van de server, als
 * zin. In het Engels stuurt de server "until 18:00" en "tue 12:35".
 */
function statusLine(service: AppServiceStatus, locale: AppLocale): string {
  const detail = service.detail.trim();
  if (service.unavailable) return detail;
  if (locale === 'en') {
    if (service.openNow) return detail.startsWith('until') ? `Open ${detail}` : 'Open now';
    if (detail === 'closed') return 'Closed';
    if (detail.startsWith('opens')) return `O${detail.slice(1)}`;
    return `Opens ${detail}`;
  }
  if (service.openNow) {
    return detail.startsWith('tot') ? `Open ${detail}` : 'Nu open';
  }
  if (detail === 'gesloten') return 'Gesloten';
  if (detail.startsWith('opent')) return `O${detail.slice(1)}`;
  return `Opent ${detail}`;
}

const styles = StyleSheet.create({
  wrap: { gap: SPACING.sm },
  row: { flexDirection: 'row', gap: SPACING.sm },
  tile: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.sm,
    paddingVertical: 14,
    paddingHorizontal: SPACING.sm,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: COLORS.surface,
    backgroundColor: COLORS.surface,
    ...CARD_SHADOW,
  },
  // De tegel waarvan de week openstaat, krijgt een navy rand.
  tileOpen: { borderColor: COLORS.navy },
  pressed: { opacity: 0.7 },
  name: { fontFamily: FONTS.semibold, fontSize: 13, color: COLORS.ink, textAlign: 'center', marginBottom: -4 },
  status: { fontFamily: FONTS.medium, fontSize: 12, color: COLORS.muted, textAlign: 'center' },
  statusOpen: { fontFamily: FONTS.semibold, color: COLORS.okInk },
  schedule: {
    gap: 6,
    padding: SPACING.lg,
    paddingTop: SPACING.md,
    borderRadius: RADIUS.md + 2,
    backgroundColor: COLORS.surface,
    ...CARD_SHADOW,
  },
  scheduleTitle: { fontFamily: FONTS.semibold, fontSize: 14, color: COLORS.ink, marginBottom: 2 },
  scheduleRow: { flexDirection: 'row', justifyContent: 'space-between', gap: SPACING.md },
  scheduleDay: { ...TYPE.small, color: COLORS.body },
  scheduleHours: { ...TYPE.small, color: COLORS.ink, fontVariant: ['tabular-nums'] },
  note: { ...TYPE.small, fontSize: 12, color: COLORS.muted, marginTop: 4 },
  extra: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
    marginTop: SPACING.sm,
    paddingTop: SPACING.md,
    borderTopWidth: 1,
    borderTopColor: COLORS.line,
  },
  extraIcon: {
    width: 36,
    height: 36,
    borderRadius: RADIUS.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.yellow,
  },
  extraText: { flex: 1, gap: 2 },
  extraTitle: { fontFamily: FONTS.semibold, fontSize: 14, lineHeight: 19, color: COLORS.ink },
  extraDetail: { ...TYPE.small, fontSize: 12, color: COLORS.muted },
  extraButton: {
    height: 34,
    paddingHorizontal: 14,
    borderRadius: RADIUS.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.navy,
  },
  extraButtonLabel: { fontFamily: FONTS.bold, fontSize: 13, color: COLORS.yellow },
});
