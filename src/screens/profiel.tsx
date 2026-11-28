import { Image } from 'expo-image';

import * as WebBrowser from 'expo-web-browser';
import { Bell, ChevronRight, Coins, Sandwich, TicketCheck, Wrench } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';

import { baseUrl } from '../api/client';
import { fetchProfile } from '../api/endpoints';
import { useResource } from '../api/useResource';
import { signOut } from '../auth/session';
import { PageHead } from '../components/PageHead';
import { Button, Card, SectionTitle } from '../components/ui';
import { formatDay, formatTimeRange } from '../format';
import { refreshPushRegistration } from '../push';
import { useApp } from '../state/app';
import { useTabRouter } from '../navigation';
import { COLORS, RADIUS, SPACING, TYPE } from '../theme/tokens';
import { CARD_SHADOW } from '../components/HomeSection';
import { HeadScroll } from '../components/HeadScroll';
import { t } from '../i18n';

/**
 * Profiel: wie je bent, en je shiften.
 *
 * Het staat onder Meer en niet meer als eigen tab. Je opent je profiel een paar
 * keer per jaar en niet een paar keer per dag; die plaats in de onderbalk is
 * beter besteed aan iets wat je wél dagelijks doet.
 *
 * Wat hier níét in staat is even bewust als wat er wel in staat. Je gegevens
 * wijzigen, je privacygegevens opvragen en je verbonden apps beheren blijven op
 * de site. Dat zijn formulieren met eigen validatie en juridische gevolgen, en
 * die twee keer bouwen is twee keer kunnen mislopen; het is een beslissing en
 * geen achterstand.
 */
export default function ProfielScreen() {
  const router = useTabRouter();
  const { viewer, gate, refresh, locale, setLocale } = useApp();
  const [signingOut, setSigningOut] = useState(false);

  const profile = useResource('profiel', () => fetchProfile(locale), locale);

  // Het besturingssysteem kan een pushtoken vervangen zonder dat de app het
  // merkt, dus melden we een bestaand token bij elke start opnieuw aan. Dit
  // vraagt nooit om toestemming; dat gebeurt enkel via de knop hieronder.
  useEffect(() => {
    void refreshPushRegistration();
  }, []);

  if (!viewer) {
    return (
      <>
        <HeadScroll head={<PageHead title={t('Profiel', 'Profile')} subtitle={t('Log in met je VTK-account', 'Log in with your VTK account')} />} contentContainerStyle={styles.content} style={styles.root}>
          <Card>
            <Text style={styles.title}>{t('Nog niet ingelogd', 'Not logged in yet')}</Text>
            <Text style={styles.body}>
              {t('Je kan de app zonder account gebruiken om alles te lezen. Bestellen, tickets en je gegevens vragen wel een login. Dat gaat met hetzelfde account als op vtk.be, KU Leuven-login inbegrepen.', 'You can use the app without an account to read everything. Ordering, tickets and your details do need a login. That uses the same account as on vtk.be, KU Leuven login included.')}
            </Text>
            <Button label={t('Inloggen', 'Log in')} onPress={() => router.push('/inloggen')} />
          </Card>
          <Settings
            locale={locale}
            setLocale={setLocale}
            onOpenServer={() => router.push('/instellingen')}
          />
        </HeadScroll>
      </>
    );
  }

  const data = profile.data;

  return (
    <>
      <HeadScroll head={<PageHead title={t('Profiel', 'Profile')} subtitle={viewer.email} />}
        contentContainerStyle={styles.content}
        style={styles.root}
        refreshControl={
          <RefreshControl refreshing={profile.refreshing} onRefresh={() => void profile.refresh()} />
        }
      >
        <Card>
          <View style={styles.person}>
            {viewer.avatarUrl ? (
              <Image cachePolicy="memory-disk" source={{ uri: viewer.avatarUrl }} style={styles.avatar} contentFit="cover" />
            ) : (
              <View style={[styles.avatar, styles.avatarEmpty]}>
                <Text style={styles.initials}>{initialsOf(viewer.name)}</Text>
              </View>
            )}
            <View style={styles.personText}>
              <Text style={styles.title}>{viewer.name}</Text>
              <Text style={styles.hint}>{data?.rNumber ?? viewer.email}</Text>
            </View>
          </View>
          {data && data.studyProgrammes.length > 0 ? (
            <Text style={styles.hint}>{data.studyProgrammes.join(', ')}</Text>
          ) : null}
        </Card>

        {gate ? (
          <Card featured>
            <Text style={styles.title}>
              {gate === 'onboarding'
                ? t('Je profiel is nog niet af', 'Your profile is not complete yet')
                : t('Je studie is nog niet bevestigd', 'Your studies are not confirmed yet')}
            </Text>
            <Text style={styles.body}>
              {t('Zolang dit openstaat, blijven bestellen en tickets gesloten.', 'As long as this is open, ordering and tickets stay closed.')}
            </Text>
            <Button
              label={t('Nu afwerken', 'Complete now')}
              onPress={() => router.push({ pathname: '/poort', params: { gate } })}
            />
          </Card>
        ) : null}

        <Row
          icon={<TicketCheck color={COLORS.strong} size={20} />}
          label={t('Mijn tickets', 'My tickets')}
          onPress={() => router.push('/tickets?tab=mijne')}
        />
        <Row
          icon={<Sandwich color={COLORS.strong} size={20} />}
          label={t('Mijn broodjes', 'My sandwiches')}
          onPress={() => router.push('/broodjes')}
        />
        <Row
          icon={<Coins color={COLORS.strong} size={20} />}
          label={t('Mijn bonnetjes', 'My vouchers')}
          onPress={() => router.push('/bonnetjes')}
        />
        <Row
          icon={<Wrench color={COLORS.strong} size={20} />}
          label={t('Shiften', 'Shifts')}
          onPress={() => router.push('/shiften')}
        />
        <Row
          icon={<Bell color={COLORS.strong} size={20} />}
          label={t('Meldingen', 'Notifications')}
          onPress={() => router.push('/meldingen')}
        />

        {data && data.upcomingShifts.length > 0 ? (
          <>
            <SectionTitle>{t('Jouw shiften', 'Your shifts')}</SectionTitle>
            <Card>
              {data.upcomingShifts.map((shift) => (
                <View key={shift.id} style={styles.shift}>
                  <Text style={styles.shiftName}>{shift.name}</Text>
                  <Text style={styles.hint}>
                    {formatDay(shift.start, locale)}, {formatTimeRange(shift.start, shift.end, locale)}
                  </Text>
                  <Text style={styles.hint}>{shift.location}</Text>
                </View>
              ))}
            </Card>
          </>
        ) : null}

        {data && data.totalShifts > 0 ? (
          <Card>
            <View style={styles.statRow}>
              <Text style={styles.body}>{t('Shiften gedaan', 'Shifts done')}</Text>
              <Text style={styles.title}>{data.totalShifts}</Text>
            </View>
            {data.unpaidShiftsThisYear > 0 ? (
              <View style={styles.statRow}>
                <Text style={styles.body}>{t('Nog uit te betalen dit jaar', 'Still to be paid out this year')}</Text>
                <Text style={styles.title}>{data.unpaidShiftsThisYear}</Text>
              </View>
            ) : null}
          </Card>
        ) : null}

        {viewer.groups.length > 0 ? (
          <>
            <SectionTitle>{t('Jouw posten en werkgroepen', 'Your positions and working groups')}</SectionTitle>
            <Card>
              {viewer.groups.map((group) => (
                <View key={group.id} style={styles.groupRow}>
                  <Text style={styles.groupName}>{group.name}</Text>
                  <Text style={styles.hint}>
                    {group.type === 'PRAESIDIUM'
                      ? t('Post', 'Board position')
                      : group.type === 'JAARWERKING'
                        ? t('Jaarwerking', 'Year team')
                        : t('Werkgroep', 'Working group')}
                  </Text>
                </View>
              ))}
            </Card>
          </>
        ) : null}

        <SectionTitle>{t('Op de site', 'On the website')}</SectionTitle>
        <Card>
          <Text style={styles.body}>
            {t('Je gegevens wijzigen, je verbonden apps en je privacygegevens staan op de site. Die formulieren hebben hun eigen regels, en die willen we niet op twee plaatsen hebben.', 'Changing your details, your connected apps and your privacy data are on the website. Those forms have their own rules, and we do not want them in two places.')}
          </Text>
          <Button
            label={t('Mijn account op vtk.be', 'My account on vtk.be')}
            variant="ghost"
            onPress={() => void WebBrowser.openBrowserAsync(`${baseUrl()}/account`)}
          />
          {/* Apple eist dat je je account vanuit de app kan verwijderen (richtlijn
              5.1.1(v)). Dat formulier staat op de site, met zijn eigen bevestiging;
              een rechtstreekse link ernaartoe is wat Apple toelaat. */}
          <Button
            label={t('Account verwijderen', 'Delete account')}
            variant="ghost"
            onPress={() => void WebBrowser.openBrowserAsync(`${baseUrl()}/account#privacy`)}
          />
        </Card>

        <Settings
          locale={locale}
          setLocale={setLocale}
          onOpenServer={() => router.push('/instellingen')}
        />

        <Button
          label={t('Uitloggen', 'Log out')}
          variant="ghost"
          busy={signingOut}
          onPress={() => {
            setSigningOut(true);
            void signOut()
              .then(() => refresh())
              .finally(() => setSigningOut(false));
          }}
        />
      </HeadScroll>
    </>
  );
}

function Row({
  icon,
  label,
  onPress,
}: {
  icon: React.ReactNode;
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
    >
      {icon}
      <Text style={styles.rowLabel}>{label}</Text>
      <ChevronRight color={COLORS.muted} size={18} />
    </Pressable>
  );
}

function Settings({
  locale,
  setLocale,
  onOpenServer,
}: {
  locale: 'nl' | 'en';
  setLocale: (locale: 'nl' | 'en') => void;
  onOpenServer: () => void;
}) {
  return (
    <>
      <SectionTitle>{t('Instellingen', 'Settings')}</SectionTitle>
      <Card>
        <Text style={styles.title}>{t('Taal', 'Language')}</Text>
        <Text style={styles.body}>
          {locale === 'nl' ? 'De app staat in het Nederlands.' : 'The app is set to English.'}
        </Text>
        <Button
          label={locale === 'nl' ? 'Switch to English' : 'Zet terug op Nederlands'}
          variant="ghost"
          onPress={() => setLocale(locale === 'nl' ? 'en' : 'nl')}
        />
      </Card>
      <Card>
        <Text style={styles.title}>Server</Text>
        <Text style={styles.body}>
          {t('Standaard praat de app met vtk.be. Wijzig dit enkel om te testen tegen een andere omgeving.', 'By default the app talks to vtk.be. Only change this to test against another environment.')}
        </Text>
        <Button label={t('Server instellen', 'Set server')} variant="ghost" onPress={onOpenServer} />
      </Card>
    </>
  );
}

function initialsOf(name: string): string {
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.paper },
  content: { padding: SPACING.lg, gap: SPACING.md, paddingBottom: SPACING.xxl },
  person: { flexDirection: 'row', alignItems: 'center', gap: SPACING.lg },
  personText: { flex: 1, gap: SPACING.xs },
  avatar: { width: 56, height: 56, borderRadius: RADIUS.pill, backgroundColor: COLORS.paper2 },
  avatarEmpty: { alignItems: 'center', justifyContent: 'center' },
  initials: { ...TYPE.cardTitle, color: COLORS.strong },
  title: { ...TYPE.cardTitle, color: COLORS.ink },
  body: { ...TYPE.body, color: COLORS.body },
  hint: { ...TYPE.small, color: COLORS.muted },

  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
    backgroundColor: COLORS.surface,
    borderRadius: 20,
    padding: SPACING.lg,
    ...CARD_SHADOW,
  },
  rowPressed: { backgroundColor: COLORS.paper2 },
  rowLabel: { ...TYPE.cardTitle, color: COLORS.ink, flex: 1 },

  shift: { paddingVertical: SPACING.sm, gap: 2 },
  shiftName: { ...TYPE.body, fontFamily: TYPE.cardTitle.fontFamily, color: COLORS.ink },
  statRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },

  groupRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: SPACING.md,
    paddingVertical: SPACING.xs,
  },
  groupName: { ...TYPE.body, color: COLORS.ink, flex: 1 },
});
