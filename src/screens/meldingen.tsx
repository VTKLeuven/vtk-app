
import { Bell } from 'lucide-react-native';
import { useState } from 'react';
import { Alert, Pressable, StyleSheet, Switch, Text, View } from 'react-native';

import type { AppNotificationTopic } from '../api/contract';
import {
  fetchNotificationSettings,
  setCategoryFollow,
  setNotificationTopic,
} from '../api/endpoints';
import { messageFor, useResource } from '../api/useResource';
import { PageHead } from '../components/PageHead';
import { Button, Card, ErrorState, Loading } from '../components/ui';
import { disablePush, enablePush, hasBeenAsked, pushIsOn } from '../push';
import { useApp } from '../state/app';
import { useTabRouter } from '../navigation';
import { COLORS, RADIUS, SPACING, TYPE } from '../theme/tokens';
import { CARD_SHADOW } from '../components/HomeSection';
import { HeadScroll } from '../components/HeadScroll';
import { t } from '../i18n';

/**
 * Waarvoor je telefoon afgaat.
 *
 * Twee lagen, en het verschil is belangrijk genoeg om het uit te leggen op het
 * scherm zelf:
 *
 * 1. **De toestemming van je telefoon.** Staat die uit, dan komt er niets binnen,
 *    ongeacht wat er hieronder aangevinkt staat. Home vraagt ze één keer vanzelf
 *    zodra je ingelogd bent (`askPushOnce`); hier zet je ze later alsnog aan.
 * 2. **Welke van de berichten je wil.** Dat staat op de server, want de server
 *    beslist wat hij stuurt.
 *
 * De categorieën eronder zijn iets anders dan een schakelaar: dat is een
 * abonnement op nieuwe evenementen. Het is het enige bericht dat geen "je moet nu
 * iets doen" is, en het mag precies omdat je er zelf om vraagt, per categorie.
 */

/** De zinnen bij elk soort bericht. Ze staan hier omdat ze UI zijn, geen contract. */
const TOPICS: Record<AppNotificationTopic, { label: string; hint: string }> = {
  'theokot.open': {
    label: t('Broodjes gaan open', 'Sandwich orders open'),
    hint: t('Wanneer een nieuwe bestelronde opengaat. De deadline ligt uren voor het eten.', 'When a new ordering round opens. The deadline is hours before the meal.'),
  },
  'theokot.pickup': {
    label: t('Je broodje ligt klaar', 'Your sandwich is ready'),
    hint: t('Op het moment dat de afhaal begint.', 'When pickup starts.'),
  },
  'shift.reminder': {
    label: t('Je shift begint', 'Your shift starts'),
    hint: t('De dag ervoor en vlak voor de start. Komt ook per mail.', 'The day before and right before the start. Also sent by email.'),
  },
  'calendar.follow': {
    label: t('Nieuw in wat je volgt', 'New in what you follow'),
    hint: t('Wanneer er een evenement bijkomt in een categorie hieronder.', 'When an event is added to a category below.'),
  },
  'calendar.interest': {
    label: t('Herinnering aan wat je aanduidde', 'Reminder of what you marked'),
    hint: t('Een dag voor een evenement waar je een ster bij zette.', 'A day before an event you starred.'),
  },
  'study.groupStart': {
    label: t('De eerste van je blokgroep zit', 'The first of your study group starts'),
    hint: t('Eén bericht per groep per dag, wanneer de eerste begint. Niet bij elke volgende.', 'One message per group per day, when the first one starts. Not for every next one.'),
  },
};

export default function MeldingenScreen() {
  const router = useTabRouter();
  const { locale, viewer } = useApp();
  const resource = useResource(
    'meldingen',
    () =>
      viewer ? fetchNotificationSettings(locale) : Promise.reject(new Error(t('Niet ingelogd', 'Not logged in'))),
    `${locale}:${viewer?.id ?? 'anon'}`,
  );

  const [topics, setTopics] = useState<Record<string, boolean>>({});
  const [follows, setFollows] = useState<string[] | null>(null);
  const [pushOn, setPushOn] = useState(pushIsOn);
  const [busy, setBusy] = useState(false);

  if (!viewer) {
    return (
      <>
        <HeadScroll head={<PageHead title={t('Meldingen', 'Notifications')} />} contentContainerStyle={styles.content} style={styles.root}>
          <Card>
            <Text style={styles.title}>{t('Log eerst in', 'Log in first')}</Text>
            <Text style={styles.body}>{t('Meldingen hangen aan je account en aan je toestel.', 'Notifications are linked to your account and your device.')}</Text>
            <Button label={t('Inloggen', 'Log in')} onPress={() => router.push('/inloggen')} />
          </Card>
        </HeadScroll>
      </>
    );
  }

  if (resource.loading) return <Loading label={t('Instellingen ophalen', 'Loading settings')} />;
  if (!resource.data) {
    return (
      <ErrorState message={messageFor(resource.error)} onRetry={() => void resource.refresh()} />
    );
  }

  const settings = resource.data;
  const followed = follows ?? settings.followedCategories;
  const enabledFor = (topic: AppNotificationTopic) =>
    topics[topic] ?? settings.topics.find((entry) => entry.topic === topic)?.enabled ?? true;

  /**
   * De schakelaar meteen omzetten en pas daarna wegschrijven. Wachten op het
   * rondje zou een schakelaar opleveren die een halve seconde terugspringt, en
   * dat leest als "het werkte niet".
   */
  const toggleTopic = (topic: AppNotificationTopic, next: boolean) => {
    setTopics((current) => ({ ...current, [topic]: next }));
    void setNotificationTopic(topic, next).catch(() => {
      setTopics((current) => ({ ...current, [topic]: !next }));
      Alert.alert(t('Niet opgeslagen', 'Not saved'), t('Die instelling kon niet bewaard worden. Probeer opnieuw.', 'That setting could not be saved. Try again.'));
    });
  };

  const toggleFollow = (slug: string, next: boolean) => {
    setFollows(next ? [...followed, slug] : followed.filter((item) => item !== slug));
    void setCategoryFollow(slug, next).catch(() => {
      setFollows(followed);
      Alert.alert(t('Niet opgeslagen', 'Not saved'), t('Die categorie kon niet bewaard worden. Probeer opnieuw.', 'That category could not be saved. Try again.'));
    });
  };

  const togglePush = async () => {
    setBusy(true);
    try {
      if (pushOn) {
        await disablePush();
        setPushOn(false);
        return;
      }
      const ok = await enablePush();
      setPushOn(ok);
      if (!ok) {
        Alert.alert(
          t('Pushberichten staan uit', 'Push notifications are off'),
          hasBeenAsked()
            ? t('Je toestel laat geen berichten toe voor deze app. Dat kan je aanzetten in de instellingen van je telefoon.', 'Your device does not allow notifications for this app. You can turn that on in your phone settings.')
            : t('Er kon geen toestemming opgehaald worden.', 'Permission could not be obtained.'),
        );
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <HeadScroll head={<PageHead title={t('Meldingen', 'Notifications')} subtitle={t('Waarvoor je telefoon afgaat', 'What your phone notifies you about')} />} contentContainerStyle={styles.content} style={styles.root}>
        <Card featured={!pushOn}>
          <View style={styles.headRow}>
            <Bell color={COLORS.strong} size={20} />
            <Text style={styles.title}>{t('Pushberichten', 'Push notifications')}</Text>
          </View>
          <Text style={styles.body}>
            {pushOn
              ? t('Dit toestel staat aangemeld. Hieronder kies je welke berichten je wil.', 'This device is registered. Choose below which notifications you want.')
              : t('Zonder dit komt er niets binnen, hoe je het hieronder ook instelt.', 'Without this nothing comes in, no matter how you set it up below.')}
          </Text>
          <Button
            label={pushOn ? t('Uitzetten op dit toestel', 'Turn off on this device') : t('Aanzetten', 'Turn on')}
            variant={pushOn ? 'ghost' : 'primary'}
            busy={busy}
            onPress={() => void togglePush()}
          />
        </Card>

        <Text style={styles.sectionTitle}>{t('Soorten bericht', 'Kinds of notification')}</Text>
        <View style={styles.list}>
          {settings.topics.map((entry) => {
            const copy = TOPICS[entry.topic];
            if (!copy) return null;
            return (
              <View key={entry.topic} style={styles.switchRow}>
                <View style={styles.switchText}>
                  <Text style={styles.rowLabel}>{copy.label}</Text>
                  <Text style={styles.hint}>{copy.hint}</Text>
                </View>
                <Switch
                  value={enabledFor(entry.topic)}
                  onValueChange={(next) => toggleTopic(entry.topic, next)}
                  trackColor={{ true: COLORS.yellow, false: COLORS.line2 }}
                  thumbColor={COLORS.plate}
                />
              </View>
            );
          })}
        </View>

        <Text style={styles.sectionTitle}>{t('Categorieën volgen', 'Follow categories')}</Text>
        <Text style={styles.hint}>
          {t('Krijg een bericht wanneer er een evenement bijkomt in een categorie die je volgt. Tik om aan of uit te zetten.', 'Get a notification when an event is added to a category you follow. Tap to turn it on or off.')}
        </Text>
        <View style={styles.chips}>
          {settings.categories.map((category) => {
            const active = followed.includes(category.slug);
            return (
              <Pressable
                key={category.slug}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
                accessibilityLabel={
                  active ? t(`${category.name} niet meer volgen`, `Stop following ${category.name}`) : t(`${category.name} volgen`, `Follow ${category.name}`)
                }
                onPress={() => toggleFollow(category.slug, !active)}
                style={[styles.chip, active && styles.chipActive]}
              >
                <Text style={[styles.chipLabel, active && styles.chipLabelActive]}>
                  {category.name}
                </Text>
              </Pressable>
            );
          })}
        </View>
        {settings.categories.length === 0 ? (
          <Text style={styles.hint}>{t('Er staan nog geen categorieën klaar.', 'There are no categories yet.')}</Text>
        ) : null}
      </HeadScroll>
    </>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.paper },
  content: { padding: SPACING.lg, gap: SPACING.md, paddingBottom: SPACING.xxl },
  headRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm },
  sectionTitle: { ...TYPE.sectionTitle, color: COLORS.ink, marginTop: SPACING.md },

  list: {
    backgroundColor: COLORS.surface,
    borderRadius: 20,
    overflow: 'hidden',
    ...CARD_SHADOW,
  },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: COLORS.line,
  },
  switchText: { flex: 1, gap: 2 },
  rowLabel: { ...TYPE.body, fontFamily: TYPE.cardTitle.fontFamily, color: COLORS.ink },

  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.sm },
  chip: {
    borderRadius: RADIUS.pill,
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.sm,
    backgroundColor: COLORS.surface,
    ...CARD_SHADOW,
  },
  chipActive: { backgroundColor: COLORS.yellow, borderColor: COLORS.yellow },
  chipLabel: { ...TYPE.small, color: COLORS.body },
  chipLabelActive: { color: COLORS.onYellow, fontFamily: TYPE.cardTitle.fontFamily },

  title: { ...TYPE.cardTitle, color: COLORS.ink },
  body: { ...TYPE.body, color: COLORS.body },
  hint: { ...TYPE.small, color: COLORS.muted },
});
