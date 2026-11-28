import { useFocusEffect } from 'expo-router';
import { ChevronRight } from 'lucide-react-native';
import { useCallback, useRef, useState } from 'react';
import { Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';

import { fetchScanEvents } from '../api/endpoints';
import { messageFor, useResource } from '../api/useResource';
import { PageHead } from '../components/PageHead';
import { Button, CardList, Empty, ErrorState, Loading } from '../components/ui';
import { formatDayShort, formatTime } from '../format';
import { useTabRouter } from '../navigation';
import { queueSizes } from '../scanner/storage';
import { useApp } from '../state/app';
import { COLORS, SPACING, TYPE } from '../theme/tokens';
import { HeadScroll } from '../components/HeadScroll';
import { t } from '../i18n';

/**
 * Tickets scannen (vroeger "Aan de deur"): de evenementen die jij mag scannen.
 *
 * Hier landen het scanicoon in de kop van Tickets en de regel onder Meer, en
 * beide bestaan enkel voor wie iets te scannen heeft (`abilities.scanTickets`).
 * Een gewone student ziet dit scherm dus niet, tot een organisator hem de
 * uitnodigings-QR toont; daarna staat dat event hier, tot twaalf uur na afloop.
 * Welke events dat zijn, beslist de server (`listScannableTicketEvents`), met
 * dezelfde regels als `/scan` op de site.
 *
 * Een tik opent de scanner zelf (`/scan/<id>`), die als volledig scherm over de
 * tabbalk ligt. Bij het terugkeren komen de stand en de wachtrij opnieuw binnen:
 * die zijn net veranderd.
 */
export default function DeurScreen() {
  const router = useTabRouter();
  const { locale, viewer } = useApp();
  const [waiting, setWaiting] = useState<Map<string, number>>(() => queueSizes());

  const events = useResource(
    'scan-events',
    () => (viewer ? fetchScanEvents(locale) : Promise.resolve([])),
    `${locale}:${viewer?.id ?? 'anon'}`,
  );

  // Terug uit de scanner: de stand en de wachtrij zijn net veranderd. De eerste
  // keer niet, want dan haalt `useResource` zelf al op.
  const { reload } = events;
  const firstFocus = useRef(true);
  useFocusEffect(
    useCallback(() => {
      if (firstFocus.current) {
        firstFocus.current = false;
        return;
      }
      setWaiting(queueSizes());
      void reload();
    }, [reload]),
  );

  if (!viewer) {
    return (
      <>
        <PageHead title={t('Tickets scannen', 'Scan tickets')} />
        <View style={styles.root}>
          <Empty
            title={t('Log eerst in', 'Log in first')}
            hint={t('Scanrechten hangen aan je account.', 'Scan rights are linked to your account.')}
            action={{ label: t('Inloggen', 'Log in'), onPress: () => router.push('/inloggen') }}
          />
        </View>
      </>
    );
  }

  return (
    <>
      <HeadScroll head={<PageHead title={t('Tickets scannen', 'Scan tickets')} subtitle={t('Kies het evenement waar je scant', 'Choose the event you are scanning')} />}
        style={styles.root}
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl refreshing={events.refreshing} onRefresh={() => void events.refresh()} />
        }
      >
        {events.loading ? (
          <Loading label={t('Evenementen ophalen', 'Loading events')} />
        ) : !events.data ? (
          <ErrorState message={messageFor(events.error)} onRetry={() => void events.refresh()} />
        ) : events.data.length === 0 ? (
          <View style={styles.empty}>
            <Empty
              title={t('Niets om te scannen', 'Nothing to scan')}
              hint={t('Kom je helpen aan de deur? Vraag wie het evenement organiseert om de uitnodigings-QR te tonen in de scanner, en scan die hier.', 'Coming to help at the door? Ask the event organiser to show the invitation QR in the scanner, and scan it here.')}
            />
            <Button label={t('Uitnodiging scannen', 'Scan invitation')} onPress={() => router.push('/scannen')} />
          </View>
        ) : (
          <CardList inset={0} style={styles.cardList}>
            {events.data.map((event) => {
              const pending = waiting.get(event.id) ?? 0;
              return (
                <Pressable
                  key={event.id}
                  accessibilityRole="button"
                  accessibilityLabel={`Scannen: ${event.title}`}
                  onPress={() => router.push(`/scan/${event.id}`)}
                  style={({ pressed }) => [styles.row, pressed && styles.pressed]}
                >
                  <View style={styles.text}>
                    <Text style={styles.kicker}>
                      {formatDayShort(event.startsAt, locale).toUpperCase()},{' '}
                      {formatTime(event.startsAt, locale)}
                    </Text>
                    <Text style={styles.title}>{event.title}</Text>
                    {event.location ? <Text style={styles.detail}>{event.location}</Text> : null}
                    <Text style={styles.detail}>
                      {event.checkedIn} van {event.total} binnen
                    </Text>
                    {pending > 0 ? (
                      <Text style={styles.pending}>
                        {pending === 1 ? t('1 scan wacht op dit toestel', '1 scan waiting on this device') : t(`${pending} scans wachten op dit toestel`, `${pending} scans waiting on this device`)}
                      </Text>
                    ) : null}
                  </View>
                  <ChevronRight color={COLORS.muted} size={18} />
                </Pressable>
              );
            })}
          </CardList>
        )}
      </HeadScroll>
    </>
  );
}

/**
 * Een register zoals de takenlijst op Home: haarlijnen ertussen, geen witte
 * kaart per event.
 */
const styles = StyleSheet.create({
  cardList: { marginHorizontal: SPACING.lg },
  root: { flex: 1, backgroundColor: COLORS.paper },
  content: { paddingTop: SPACING.lg, paddingBottom: SPACING.xxl },
  empty: { padding: SPACING.lg, gap: SPACING.md },

  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
    paddingVertical: SPACING.md + 2,
    paddingHorizontal: SPACING.lg,
  },
  pressed: { backgroundColor: COLORS.paper2 },
  text: { flex: 1, gap: 2 },
  kicker: { ...TYPE.kicker, color: COLORS.muted },
  title: { ...TYPE.cardTitle, color: COLORS.ink },
  detail: { ...TYPE.small, color: COLORS.muted },
  pending: { ...TYPE.small, fontFamily: TYPE.cardTitle.fontFamily, color: COLORS.strong },
});
