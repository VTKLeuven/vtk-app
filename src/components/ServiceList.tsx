import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { AppServiceStatus } from '../api/contract';
import { COLORS, FONTS, SPACING, TYPE } from '../theme/tokens';
import { CARD_SHADOW } from './HomeSection';

/**
 * Theokot, cursusdienst en 't ElixIr: open of niet, en tot hoe laat.
 *
 * Eén witte balk met drie kolommen onder de kop van Home (voorstel F1 van november
 * 2026). Tot dan stonden ze als tijdlijn op een gedeelde as in de navy kop; die las
 * moeilijk en nam het halve scherm. Open staat in het groen ("Open tot 18:00"),
 * dicht in het grijs; geen bolletjes. Tik een dienst aan en de week klapt open, in
 * dezelfde balk.
 *
 * **Het rekenwerk gebeurt op de server** (`lib/app-api/serviceStatus.ts`), op de
 * klok van Brussel; hier wordt enkel de regel getoond die de server stuurt.
 */
export function ServiceList({ services }: { services: AppServiceStatus[] }) {
  const [open, setOpen] = useState<string | null>(null);
  const expanded = services.find((service) => service.key === open) ?? null;

  if (services.length === 0) return null;

  return (
    <View style={styles.card}>
      <View style={styles.row}>
        {services.map((service, index) => {
          const hasSchedule = service.entries.length > 0;
          const isOpen = open === service.key;
          return (
            <Pressable
              key={service.key}
              accessibilityRole={hasSchedule ? 'button' : 'text'}
              accessibilityState={hasSchedule ? { expanded: isOpen } : undefined}
              accessibilityLabel={`${service.name}, ${statusLine(service)}`}
              disabled={!hasSchedule}
              onPress={() => setOpen(isOpen ? null : service.key)}
              style={({ pressed }) => [
                styles.cell,
                index > 0 && styles.cellDivider,
                isOpen && styles.cellOpen,
                pressed && styles.pressed,
              ]}
            >
              <Text style={styles.name} numberOfLines={1}>
                {shortName(service)}
              </Text>
              <Text style={[styles.status, service.openNow && styles.statusOpen]} numberOfLines={1}>
                {statusLine(service)}
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
            <Text style={styles.note}>Live gemeten; dat kan van het rooster afwijken.</Text>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

/** In een derde van de breedte past "Cursusdienst" niet; iedereen zegt toch cudi. */
function shortName(service: AppServiceStatus): string {
  return service.key === 'cursusdienst' ? 'Cudi' : service.name;
}

/** "Open tot 14:00", "Opent 18:00", "Opent do 12:00": de regel van de server, als zin. */
function statusLine(service: AppServiceStatus): string {
  const detail = service.detail.trim();
  if (service.unavailable) return detail;
  if (service.openNow) {
    return detail.startsWith('tot') ? `Open ${detail}` : 'Nu open';
  }
  if (detail === 'gesloten') return 'Gesloten';
  if (detail.startsWith('opent')) return `O${detail.slice(1)}`;
  return `Opent ${detail}`;
}

const styles = StyleSheet.create({
  card: { backgroundColor: COLORS.surface, borderRadius: 18, ...CARD_SHADOW },
  row: { flexDirection: 'row' },
  cell: { flex: 1, gap: 2, paddingVertical: SPACING.md, paddingHorizontal: 14 },
  cellDivider: { borderLeftWidth: 1, borderLeftColor: COLORS.line },
  cellOpen: { backgroundColor: COLORS.paper2 },
  pressed: { opacity: 0.7 },
  name: { fontFamily: FONTS.bold, fontSize: 14, color: COLORS.ink },
  status: { fontFamily: FONTS.medium, fontSize: 12, color: COLORS.muted },
  statusOpen: { fontFamily: FONTS.semibold, color: COLORS.okInk },
  schedule: {
    gap: 6,
    paddingHorizontal: SPACING.lg,
    paddingTop: SPACING.md,
    paddingBottom: SPACING.lg,
    borderTopWidth: 1,
    borderTopColor: COLORS.line,
  },
  scheduleTitle: { fontFamily: FONTS.semibold, fontSize: 14, color: COLORS.ink, marginBottom: 2 },
  scheduleRow: { flexDirection: 'row', justifyContent: 'space-between', gap: SPACING.md },
  scheduleDay: { ...TYPE.small, color: COLORS.body },
  scheduleHours: { ...TYPE.small, color: COLORS.ink, fontVariant: ['tabular-nums'] },
  note: { ...TYPE.small, fontSize: 12, color: COLORS.muted, marginTop: 4 },
});
