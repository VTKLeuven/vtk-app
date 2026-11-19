import { Image } from 'expo-image';
import { useLocalSearchParams } from 'expo-router';

import * as WebBrowser from 'expo-web-browser';
import { CalendarCheck, CalendarPlus, Smartphone, Star } from 'lucide-react-native';
import { useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { baseUrl } from '../../api/client';
import { fetchCalendarEvent, setEventInterest } from '../../api/endpoints';
import { messageFor, useResource } from '../../api/useResource';
import { Prose } from '../../components/Prose';
import { PageHead } from '../../components/PageHead';
import { Button, ErrorState, Loading, SectionHeading } from '../../components/ui';
import { addEventToDeviceCalendar, addResultMessage } from '../../deviceCalendar';
import { formatDayShort, formatEventWhen, formatTimeRange } from '../../format';
import { markdownToPlainText } from '../../markdown';
import { leadMoment } from '../../moments';
import { usePlanning } from '../../planning/usePlanning';
import { useApp } from '../../state/app';
import { useTabRouter } from '../../navigation';
import { COLORS, FONTS, RADIUS, SPACING, TYPE } from '../../theme/tokens';

/**
 * Eén evenement.
 *
 * Opgebouwd zoals de eventpagina van de site (`/kalender/<slug>`): de donkere
 * paginakop met de titel, de affiche als plaat zonder waas eronder, de feiten als
 * gelabelde rijen (geen kaart) en "Over dit event" met de gele lijn.
 *
 * Tickets openen het native verkoopscherm. Inschrijven gaat nog naar de site: een
 * formulier met eigen validatie is fase 4 werk, en een knop naar de echte pagina
 * is tot dan eerlijker dan geen knop.
 *
 * Twee knoppen die enkel een app kan hebben, en dus precies de reden dat dit
 * scherm bestaat naast de website:
 *
 * - **De ster** zet dit in je eigen lijst en levert de herinnering een dag
 *   vooraf. Het is geen inschrijving; de tekst eronder zegt dat ook, want een
 *   sterretje dat aanvoelt als een plaats reserveren is een misverstand met
 *   gevolgen.
 * - **In de agenda van je telefoon** schrijft de afspraak in de agenda van je
 *   telefoon, met plaats en een herinnering. Dat is iets anders dan de ICS-feed
 *   op de site: die abonneert je op álles, dit is dit ene ding.
 *
 * - **In je planning** zet het in de planning van Burgieclan, naast je lessen
 *   (Kalender, tabblad Planning) en in de agenda die die planning exporteert.
 *   Enkel zichtbaar wanneer je een lessenrooster koppelde: zonder is er geen
 *   planning om het in te zetten.
 *
 * Die twee staan als regels onder elkaar, elk met een zin uitleg, en niet als
 * twee knoppen naast elkaar: "Zet in agenda" en "Zet in mijn planning" lazen
 * als hetzelfde.
 *
 * Bij een **alumni-evenement** staat er onderaan wie er komt. Die lijst bevat
 * enkel wie op de site zelf aanvinkte zichtbaar te willen zijn; wie dat niet deed
 * telt mee in het getal en staat er niet in. Aanduiden dat je komt zonder account
 * kan enkel op de site: in de app ben je per definitie ingelogd, en dan is de
 * ster de juiste knop.
 */
/** Zoveel dagen van een reeks staan er meteen; zeven past een loopweek, zoals op de site. */
const MOMENTS_VISIBLE = 7;

export default function EventScreen() {
  const router = useTabRouter();
  const { locale, viewer, bootstrap } = useApp();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [addingToCalendar, setAddingToCalendar] = useState(false);
  const [allDays, setAllDays] = useState(false);
  const planning = usePlanning(locale);

  const resource = useResource(
    `evenement:${id}`,
    () => fetchCalendarEvent(locale, id),
    `${locale}:${id}`,
  );

  if (resource.loading) return <Loading />;
  if (!resource.data) {
    return (
      <ErrorState message={messageFor(resource.error)} onRetry={() => void resource.refresh()} />
    );
  }

  const event = resource.data;
  // Een reeks (een loopweek, drie filmavonden): de dagen die nog komen, zoals het
  // paneel op de eventpagina van de site. Wat voorbij is, telt niet meer mee.
  const now = new Date();
  const moments = event.moments ?? [];
  const upcomingMoments = moments.filter((moment) => new Date(moment.end) >= now);
  const series = moments.length >= 2;
  const shownMoments = allDays ? upcomingMoments : upcomingMoments.slice(0, MOMENTS_VISIBLE);
  const next = leadMoment(event, now);

  const toggleInterest = () => {
    void setEventInterest(event.id, !event.interested)
      .catch(() => undefined)
      .then(() => resource.refresh());
  };

  const addToCalendar = async () => {
    setAddingToCalendar(true);
    try {
      // Bij een reeks de eerstvolgende keer: een blok van een hele week in je
      // agenda zegt niets over wanneer je er moet zijn.
      const result = await addEventToDeviceCalendar({
        title: next?.label ? `${event.title}: ${next.label}` : event.title,
        start: next?.start ?? event.start,
        end: next?.end ?? event.end,
        allDay: event.allDay,
        location: next?.location ?? event.location,
        notes: event.description ? markdownToPlainText(event.description).slice(0, 600) : null,
      });
      if (result.ok) {
        Alert.alert('In je agenda gezet', `De afspraak staat in ${result.calendarTitle}.`);
      } else {
        Alert.alert('Niet gelukt', addResultMessage(result));
      }
    } finally {
      setAddingToCalendar(false);
    }
  };

  const plannable =
    viewer !== null &&
    bootstrap?.abilities?.planning === true &&
    planning.data?.available === true &&
    planning.data.subscribed;
  const inPlanning = planning.data?.vtkEvents.some((item) => item.id === event.id) ?? false;
  const togglePlanning = () =>
    void planning.run({ op: inPlanning ? 'removeVtkEvent' : 'addVtkEvent', vtkEventId: event.id });

  const themes = event.categories.map((category) => category.name).join(', ');

  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.content}>
      <View style={styles.overscroll} />
      <PageHead title={event.title} subtitle={event.groupName} />

      {event.imageUrl ? (
        // De affiche als plaat zonder waas, zoals op de eventpagina van de site:
        // er staat geen tekst op, dus er hoeft niets over.
        <View style={styles.plate}>
          <Image source={{ uri: event.imageUrl }} style={styles.photo} contentFit="cover" transition={150} />
        </View>
      ) : null}

      <View style={styles.body}>
        <View style={styles.facts}>
          <Fact label="Wanneer">
            {series && upcomingMoments.length > 0 ? (
              <View style={styles.moments}>
                {shownMoments.map((moment, index) => (
                  <View key={moment.start} style={styles.momentRow}>
                    <Text style={[styles.momentDay, index === 0 && styles.momentNext]}>
                      {formatDayShort(moment.start, locale)}
                    </Text>
                    <View style={styles.momentText}>
                      <Text style={styles.momentTime}>
                        {event.allDay ? '' : formatTimeRange(moment.start, moment.end, locale)}
                        {moment.label ? `${event.allDay ? '' : ', '}${moment.label}` : ''}
                      </Text>
                      {moment.location ? (
                        <Text style={styles.momentPlace}>{moment.location}</Text>
                      ) : null}
                    </View>
                  </View>
                ))}
                {upcomingMoments.length > MOMENTS_VISIBLE ? (
                  <Pressable accessibilityRole="button" onPress={() => setAllDays(!allDays)} hitSlop={8}>
                    <Text style={styles.momentsToggle}>
                      {allDays ? 'Minder dagen' : `Toon alle ${upcomingMoments.length} dagen`}
                    </Text>
                  </Pressable>
                ) : null}
              </View>
            ) : (
              <Text style={styles.factText}>
                {formatEventWhen(event.start, event.end, event.allDay, locale)}
              </Text>
            )}
          </Fact>
          {event.location ? (
            <Fact label="Waar">
              <Text style={styles.factText}>{event.location}</Text>
            </Fact>
          ) : null}
          {themes ? (
            <Fact label="Thema">
              <Text style={styles.factText}>{themes}</Text>
            </Fact>
          ) : null}
        </View>

        {event.ticketSlug ? (
          <Button label="Tickets" onPress={() => router.push(`/ticket/${event.ticketSlug}`)} />
        ) : null}
        {event.formSlug ? (
          <Button
            label="Inschrijven"
            variant={event.ticketSlug ? 'ghost' : 'primary'}
            onPress={() =>
              void WebBrowser.openBrowserAsync(`${baseUrl()}/formulieren/${event.formSlug}`)
            }
          />
        ) : null}

        {viewer ? (
          <View style={styles.actions}>
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ selected: event.interested }}
              accessibilityLabel={event.interested ? 'Uit mijn lijst halen' : 'In mijn lijst zetten'}
              onPress={toggleInterest}
              style={({ pressed }) => [
                styles.action,
                event.interested ? styles.actionActive : styles.actionPrimary,
                pressed && styles.actionPressed,
              ]}
            >
              <Star
                color={event.interested ? COLORS.ink : COLORS.paper}
                fill={event.interested ? COLORS.ink : 'transparent'}
                size={17}
              />
              <Text style={[styles.actionLabel, !event.interested && styles.actionLabelPrimary]}>
                {event.interested ? 'In mijn lijst' : 'Ik ga misschien'}
              </Text>
            </Pressable>
          </View>
        ) : null}

        {/* De server beslist over de drempel en stuurt hieronder niets mee zolang
            die niet gehaald is; zo tonen de app en de site hetzelfde getal. */}
        {event.interestedCount || (viewer && event.interested) ? (
          <Text style={styles.note}>
            {event.interestedCount
              ? locale === 'en'
                ? `${event.interestedCount} going. `
                : `${event.interestedCount} studenten komen. `
              : ''}
            {viewer && event.interested
              ? 'Je krijgt een dag vooraf een bericht. Dit is geen inschrijving en geen ticket.'
              : ''}
          </Text>
        ) : null}

        {/* Twee verschillende plaatsen, dus twee regels met elk een zin uitleg.
            Als twee knoppen naast elkaar ("Zet in agenda", "Zet in mijn
            planning") was niet te zien wat het verschil was. */}
        <View style={styles.saves}>
          <SaveRow
            icon={Smartphone}
            label="In de agenda van je telefoon"
            hint="Eén afspraak in Apple of Google Agenda, met een herinnering. Daarna staat ze los van de app."
            action="Toevoegen"
            busy={addingToCalendar}
            onPress={() => void addToCalendar()}
          />
          {plannable ? (
            <SaveRow
              icon={inPlanning ? CalendarCheck : CalendarPlus}
              label={inPlanning ? 'Staat in je planning' : 'In je planning, naast je lessen'}
              hint={
                inPlanning
                  ? 'Onder Kalender > Planning en in de agenda die je planning exporteert.'
                  : 'Komt onder Kalender > Planning tussen je lessen, en in de agenda die je planning exporteert.'
              }
              action={inPlanning ? 'Weghalen' : 'Toevoegen'}
              active={inPlanning}
              busy={planning.busy}
              onPress={togglePlanning}
            />
          ) : null}
        </View>

        {event.description ? (
          <View style={styles.about}>
            <SectionHeading>Over dit event</SectionHeading>
            <Prose>{event.description}</Prose>
          </View>
        ) : null}

        {event.isAlumniEvent && event.attendees.length > 0 ? (
          <View style={styles.about}>
            <SectionHeading>{locale === 'en' ? 'Who is coming' : 'Wie er komt'}</SectionHeading>
            <Text style={styles.note}>
              {locale === 'en'
                ? 'Only those who chose to be visible. The counter above counts everyone.'
                : 'Alleen wie zelf aangaf zichtbaar te willen zijn. De teller hierboven telt iedereen.'}
            </Text>
            <View style={styles.attendees}>
              {event.attendees.map((attendee) => (
                <View key={attendee.key} style={styles.attendee}>
                  <Text style={[styles.attendeeName, !attendee.name && styles.attendeeAnon]}>
                    {attendee.name ?? (locale === 'en' ? 'Anonymous' : 'Anoniem')}
                  </Text>
                  <Text style={styles.attendeeMeta}>
                    {[
                      attendee.graduationYear ? String(attendee.graduationYear) : null,
                      attendee.wasInVtk ? 'VTK' : null,
                    ]
                      .filter(Boolean)
                      .join(', ') || '-'}
                  </Text>
                </View>
              ))}
            </View>
          </View>
        ) : null}

        {event.url ? (
          // De redacteur kiest zelf wat er op deze knop staat ("Inschrijflink",
          // "Ticketverkoop"); de server stuurt ze al in de juiste taal mee.
          <Button
            label={event.urlLabel ?? 'Meer info'}
            variant="ghost"
            onPress={() => void WebBrowser.openBrowserAsync(event.url as string)}
          />
        ) : null}
      </View>
    </ScrollView>
  );
}

/** Een gelabelde rij, zoals een `dl` op de site: het label in kleine kapitalen links. */
function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View style={styles.fact}>
      <Text style={styles.factLabel}>{label}</Text>
      <View style={styles.factValue}>{children}</View>
    </View>
  );
}

/**
 * Een plaats waar je het evenement kan bewaren: wat het is, in één zin wat het
 * doet, en rechts de handeling. `active` zegt dat het er al staat.
 */
function SaveRow({
  icon: Icon,
  label,
  hint,
  action,
  active = false,
  busy = false,
  onPress,
}: {
  icon: typeof Star;
  label: string;
  hint: string;
  action: string;
  active?: boolean;
  busy?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${label}. ${action}`}
      accessibilityHint={hint}
      accessibilityState={{ selected: active, busy }}
      disabled={busy}
      onPress={onPress}
      style={({ pressed }) => [styles.save, (pressed || busy) && styles.actionPressed]}
    >
      <Icon color={COLORS.navy} size={20} />
      <View style={styles.saveText}>
        <Text style={styles.saveLabel}>{label}</Text>
        <Text style={styles.saveHint}>{hint}</Text>
      </View>
      <View style={[styles.saveAction, active && styles.saveActionActive]}>
        <Text style={styles.saveActionLabel}>{action}</Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.paper },
  content: { paddingBottom: SPACING.xxl },
  overscroll: {
    position: 'absolute',
    top: -1000,
    left: 0,
    right: 0,
    height: 1000,
    backgroundColor: COLORS.navy,
  },
  plate: {
    marginHorizontal: SPACING.xl - 4,
    marginTop: SPACING.xl - 4,
    aspectRatio: 16 / 9,
    borderRadius: 18,
    overflow: 'hidden',
    backgroundColor: COLORS.paper2,
  },
  photo: { ...StyleSheet.absoluteFill },
  body: { paddingHorizontal: SPACING.xl - 4, paddingTop: SPACING.lg, gap: SPACING.md },

  facts: { borderTopWidth: 1, borderTopColor: COLORS.line2 },
  fact: {
    flexDirection: 'row',
    gap: SPACING.md,
    paddingVertical: 11,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.line2,
  },
  factLabel: {
    width: 92,
    paddingTop: 3,
    fontFamily: FONTS.semibold,
    fontSize: 11.5,
    letterSpacing: 0.7,
    textTransform: 'uppercase',
    color: COLORS.muted,
  },
  factValue: { flex: 1 },
  factText: { ...TYPE.body, color: COLORS.ink },

  moments: { gap: SPACING.sm },
  momentRow: { flexDirection: 'row', gap: SPACING.md, alignItems: 'flex-start' },
  momentDay: { ...TYPE.body, color: COLORS.body, width: 86 },
  // De eerstvolgende keer in het vet, zoals het gele vakje in de strip op de site.
  momentNext: { fontFamily: FONTS.semibold, color: COLORS.ink },
  momentText: { flex: 1 },
  momentTime: { ...TYPE.body, color: COLORS.ink },
  momentPlace: { ...TYPE.small, color: COLORS.muted },
  momentsToggle: { ...TYPE.small, color: COLORS.navy, textDecorationLine: 'underline' },

  actions: { flexDirection: 'row', gap: SPACING.sm },
  action: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.sm,
    minHeight: 46,
    paddingHorizontal: SPACING.md,
    borderRadius: RADIUS.pill,
    borderWidth: 1,
    borderColor: COLORS.line2,
  },
  actionPrimary: { backgroundColor: COLORS.ink, borderColor: COLORS.ink },
  actionActive: { backgroundColor: COLORS.yellow, borderColor: COLORS.yellow },
  actionPressed: { opacity: 0.8 },
  actionLabel: { fontFamily: FONTS.semibold, fontSize: 14, color: COLORS.ink },
  actionLabelPrimary: { color: COLORS.paper },
  note: { ...TYPE.small, color: COLORS.muted },

  saves: { borderTopWidth: 1, borderTopColor: COLORS.line2 },
  save: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
    paddingVertical: SPACING.md,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.line,
  },
  saveText: { flex: 1, gap: 2 },
  saveLabel: { fontFamily: FONTS.semibold, fontSize: 15, lineHeight: 20, color: COLORS.ink },
  saveHint: { ...TYPE.small, color: COLORS.muted },
  saveAction: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: RADIUS.pill,
    borderWidth: 1,
    borderColor: COLORS.line2,
    backgroundColor: COLORS.surface,
  },
  saveActionActive: { backgroundColor: COLORS.yellow, borderColor: COLORS.yellow },
  saveActionLabel: { fontFamily: FONTS.semibold, fontSize: 13, color: COLORS.ink },

  about: { gap: SPACING.md, marginTop: SPACING.md },
  attendees: { marginTop: SPACING.xs, borderTopWidth: 1, borderTopColor: COLORS.line },
  attendee: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: SPACING.md,
    paddingVertical: SPACING.sm,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.line,
  },
  attendeeName: { ...TYPE.body, color: COLORS.ink, flex: 1 },
  attendeeAnon: { color: COLORS.muted, fontStyle: 'italic' },
  attendeeMeta: { ...TYPE.small, color: COLORS.muted },
});
