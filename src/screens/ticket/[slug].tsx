import { Clock, MapPin } from 'lucide-react-native';
import { useLocalSearchParams } from 'expo-router';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import type { AppTicketEventDetail } from '../../api/contract';
import { fetchCalendar, fetchTicketEvent } from '../../api/endpoints';
import { messageFor, useResource } from '../../api/useResource';
import { DatePin } from '../../components/DatePin';
import { PageHead, PhotoHead } from '../../components/PageHead';
import { Prose } from '../../components/Prose';
import { ShopHeading, TicketOrderBar, TicketTypes, useTicketSelection } from '../../components/TicketShop';
import { Card, CardList, ErrorState, Loading } from '../../components/ui';
import { formatEventWhen } from '../../format';
import { dayKeyOf } from '../../monthGrid';
import { addDays } from '../../planning/grid';
import { useApp } from '../../state/app';
import { useTabRouter } from '../../navigation';
import { encodeQuantities } from '../../ticketOrder';
import { COLORS, SPACING, TYPE } from '../../theme/tokens';
import { EventView } from '../evenement/[id]';
import { t } from '../../i18n';

/**
 * Tickets kopen, stap één: welke tickets en hoeveel.
 *
 * **Hangt de verkoop aan een evenement in de kalender, dan is dit die pagina**
 * (november 2026), zoals op de site: het evenement met de tickets erin
 * (`EventView`). Een aparte ticketpagina naast een evenementpagina voor
 * hetzelfde feest was twee keer dezelfde affiche met elk de helft van de
 * informatie. Het evenement zoeken we in de kalender van die dag, want het
 * contract zegt het niet rechtstreeks; een verkoop zonder evenement blijft deze
 * ticketpagina.
 *
 * Zodra er iets gekozen is, staat onderaan een zwevende balk met het totaal en
 * "Bestellen". Die opent `ticket-bestellen/[slug]`, waar je de namen en je
 * gegevens invult en betaalt.
 */
export default function TicketShopScreen() {
  const router = useTabRouter();
  const { locale } = useApp();
  const { slug } = useLocalSearchParams<{ slug: string }>();

  const resource = useResource(`ticket:${slug}`, () => fetchTicketEvent(locale, slug), `${locale}:${slug}`);
  const day = resource.data ? dayKeyOf(resource.data.startsAt) : '';
  const linked = useResource(
    'ticket-evenement',
    () =>
      fetchCalendar(locale, { van: day, tot: addDays(day, 1), audience: 'all' }).then((calendar) => ({
        id: calendar.events.find((event) => event.ticketSlug === slug)?.id ?? null,
      })),
    `${locale}:${slug}:${day}`,
    day !== '',
  );

  if (resource.loading || (linked.loading && !linked.data)) return <Loading />;
  if (!resource.data) {
    return <ErrorState message={messageFor(resource.error)} onRetry={() => void resource.refresh()} />;
  }
  if (linked.data?.id) return <EventView id={linked.data.id} />;

  return (
    <Shop
      event={resource.data}
      locale={locale}
      onNeedsLogin={() => router.push('/inloggen')}
      onOrder={(quantities) =>
        router.push({
          pathname: `/ticket-bestellen/${slug}`,
          params: { aantallen: encodeQuantities(quantities) },
        })
      }
    />
  );
}

function Shop({
  event,
  locale,
  onNeedsLogin,
  onOrder,
}: {
  event: AppTicketEventDetail;
  locale: 'nl' | 'en';
  onNeedsLogin: () => void;
  onOrder: (quantities: Record<string, number>) => void;
}) {
  const selection = useTicketSelection(event);

  return (
    <View style={styles.root}>
      <ScrollView contentContainerStyle={styles.content} style={styles.root}>
        {event.imageUrl ? null : (
          <View style={styles.bleed}>
            <PageHead title={event.title} subtitle={event.ownerGroupName} />
          </View>
        )}
        {event.imageUrl ? (
          // De banner van /tickets over de volle breedte, met de gele datumpin.
          <View style={styles.bleed}>
            <PhotoHead
              image={{ uri: event.imageUrl }}
              title={event.title}
              subtitle={event.ownerGroupName}
              pin={<DatePin iso={event.startsAt} locale={locale} shadow />}
            />
          </View>
        ) : null}

        {/* Wanneer en waar in één kaart, met een haarlijn ertussen. */}
        <CardList>
          <View style={styles.fact}>
            <Clock color={COLORS.muted} size={17} />
            <Text style={styles.factText}>{formatEventWhen(event.startsAt, event.endsAt, false, locale)}</Text>
          </View>
          {event.location ? (
            <View style={styles.fact}>
              <MapPin color={COLORS.muted} size={17} />
              <Text style={styles.factText}>{event.location}</Text>
            </View>
          ) : null}
        </CardList>

        {/* Eerst de tickets en dan de uitleg: wie hier komt, wil kopen. */}
        <TicketTypes event={event} selection={selection} onNeedsLogin={onNeedsLogin} />

        {event.description ? (
          <>
            <ShopHeading>{t('Over dit event', 'About this event')}</ShopHeading>
            <Card>
              <Prose>{event.description}</Prose>
            </Card>
          </>
        ) : null}
      </ScrollView>

      <TicketOrderBar selection={selection} onOrder={() => onOrder(selection.quantities)} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.paper },
  content: { padding: SPACING.lg, gap: SPACING.md, paddingBottom: SPACING.xxl },
  // De kop met de foto loopt tot tegen de randen, buiten de marge van de inhoud.
  bleed: { marginHorizontal: -SPACING.lg, marginTop: -SPACING.lg },
  fact: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 13 },
  factText: { ...TYPE.body, color: COLORS.body, flexShrink: 1 },
});
