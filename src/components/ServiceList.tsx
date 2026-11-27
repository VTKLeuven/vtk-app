import { Image } from 'expo-image';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { AppLocale, AppServiceStatus } from '../api/contract';
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
 * aan en de week klapt eronder open.
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
});
