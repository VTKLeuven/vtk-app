import { Image } from 'expo-image';
import * as Linking from 'expo-linking';
import { Mail } from 'lucide-react-native';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { fetchPocs } from '../api/endpoints';
import { messageFor, useResource } from '../api/useResource';
import { PageHead } from '../components/PageHead';
import { Card, Empty, ErrorState, Loading } from '../components/ui';
import { useApp } from '../state/app';
import { COLORS, RADIUS, SPACING, TYPE } from '../theme/tokens';
import { HeadScroll } from '../components/HeadScroll';
import { t } from '../i18n';

/**
 * Alle POC's.
 *
 * Het mailadres is dat van de POC als geheel en niet van één vertegenwoordiger;
 * zo staat het op de site, en dat is met reden: een student mailt de commissie,
 * niet de persoon die toevallig bovenaan staat.
 */
export default function PocsScreen() {
  const { locale } = useApp();
  const resource = useResource('pocs', () => fetchPocs(locale), locale);

  if (resource.loading) return <Loading label={t("POC's ophalen", 'Loading POCs')} />;
  if (!resource.data) {
    return (
      <ErrorState message={messageFor(resource.error)} onRetry={() => void resource.refresh()} />
    );
  }

  return (
    <>
      <HeadScroll head={<PageHead
        title="POC's"
        subtitle={t('De permanente onderwijscommissies en wie er voor jou in zit', 'The permanent education committees and who represents you in them')}
      />} style={styles.root} contentContainerStyle={styles.content}>
        {resource.data.length === 0 ? (
          <Empty title={t("Geen POC's", 'No POCs')} hint={t('Er staat nog niets ingevuld.', 'Nothing has been filled in yet.')} />
        ) : null}

        {resource.data.map((poc) => (
          <Card key={poc.id}>
            <Text style={styles.name}>{poc.name}</Text>
            {poc.email ? (
              <Pressable
                accessibilityRole="link"
                accessibilityLabel={`Mail ${poc.name}`}
                onPress={() => void Linking.openURL(`mailto:${poc.email}`)}
                style={styles.mail}
              >
                <Mail color={COLORS.strong} size={15} />
                <Text style={styles.mailText}>{poc.email}</Text>
              </Pressable>
            ) : null}
            <View style={styles.people}>
              {poc.people.map((person, index) => (
                <View key={`${person.name}-${index}`} style={styles.person}>
                  {person.avatarUrl ? (
                    <Image cachePolicy="memory-disk" source={{ uri: person.avatarUrl }} style={styles.avatar} contentFit="cover" />
                  ) : (
                    <View style={[styles.avatar, styles.avatarEmpty]} />
                  )}
                  <View style={styles.personText}>
                    <Text style={styles.personName}>{person.name}</Text>
                    {person.role ? <Text style={styles.hint}>{person.role}</Text> : null}
                  </View>
                </View>
              ))}
            </View>
          </Card>
        ))}
      </HeadScroll>
    </>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.paper },
  content: { padding: SPACING.lg, gap: SPACING.md, paddingBottom: SPACING.xxl },
  name: { ...TYPE.sectionTitle, color: COLORS.ink },
  mail: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm },
  mailText: { ...TYPE.small, color: COLORS.strong, textDecorationLine: 'underline' },
  people: { gap: SPACING.md, marginTop: SPACING.sm },
  person: { flexDirection: 'row', alignItems: 'center', gap: SPACING.md },
  personText: { flex: 1 },
  personName: { ...TYPE.body, color: COLORS.ink },
  hint: { ...TYPE.small, color: COLORS.muted },
  avatar: { width: 44, height: 44, borderRadius: RADIUS.pill, backgroundColor: COLORS.paper2 },
  avatarEmpty: { borderWidth: 1, borderColor: COLORS.line },
});
