import { Image } from 'expo-image';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { fetchWerkgroepen } from '../api/endpoints';
import { messageFor, useResource } from '../api/useResource';
import { PageHead } from '../components/PageHead';
import { Prose } from '../components/Prose';
import { Card, Empty, ErrorState, Loading } from '../components/ui';
import { useApp } from '../state/app';
import { COLORS, RADIUS, SPACING, TYPE } from '../theme/tokens';
import { CARD_SHADOW } from '../components/HomeSection';
import { HeadScroll } from '../components/HeadScroll';
import { t } from '../i18n';

/**
 * De werkgroepen, per werkingsjaar.
 *
 * De beschrijving is Markdown uit het CMS, net als op de site, en gaat dus door
 * `Prose` en niet als platte tekst op het scherm.
 *
 * Een werkgroep zonder leden dit jaar blijft in de lijst staan met een lege
 * ploeg; hij bestaat wel degelijk, en hem verzwijgen laat lijken alsof hij
 * opgeheven is.
 */
export default function WerkgroepenScreen() {
  const { locale } = useApp();
  const [year, setYear] = useState<number | null>(null);
  const resource = useResource(
    'werkgroepen',
    () => fetchWerkgroepen(locale, year ?? undefined),
    `${locale}:${year ?? ''}`,
  );

  if (resource.loading) return <Loading label={t('Werkgroepen ophalen', 'Loading working groups')} />;
  if (!resource.data) {
    return (
      <ErrorState message={messageFor(resource.error)} onRetry={() => void resource.refresh()} />
    );
  }

  const data = resource.data;

  return (
    <>
      <HeadScroll head={<PageHead
        title={t('Werkgroepen', 'Working groups')}
        subtitle={data.year ? t(`Werkingsjaar ${data.year}-${data.year + 1}`, `Academic year ${data.year}-${data.year + 1}`) : undefined}
      />} style={styles.root} contentContainerStyle={styles.content}>
        {data.years.length > 1 ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.years}>
            {data.years.map((option) => (
              <Pressable
                key={option}
                accessibilityRole="button"
                accessibilityState={{ selected: option === data.year }}
                accessibilityLabel={t(`Werkingsjaar ${option}-${option + 1}`, `Academic year ${option}-${option + 1}`)}
                onPress={() => setYear(option)}
                style={[styles.year, option === data.year && styles.yearActive]}
              >
                <Text style={[styles.yearLabel, option === data.year && styles.yearLabelActive]}>
                  {option}-{String(option + 1).slice(2)}
                </Text>
              </Pressable>
            ))}
          </ScrollView>
        ) : null}

        {data.groups.length === 0 ? (
          <Empty title={t('Geen werkgroepen', 'No working groups')} hint={t('Er staat voor dit jaar niets ingevuld.', 'Nothing has been filled in for this year.')} />
        ) : null}

        {data.groups.map((group) => (
          <Card key={group.slug}>
            {group.imageUrl ? (
              <Image cachePolicy="memory-disk" source={{ uri: group.imageUrl }} style={styles.photo} contentFit="cover" />
            ) : null}
            <Text style={styles.groupName}>{group.name}</Text>
            {group.description ? <Prose>{group.description}</Prose> : null}
            {group.people.length === 0 ? (
              <Text style={styles.hint}>{t('Dit jaar nog niemand ingevuld.', 'Nobody filled in yet this year.')}</Text>
            ) : (
              <View style={styles.people}>
                {group.people.map((person, index) => (
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
            )}
          </Card>
        ))}
      </HeadScroll>
    </>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.paper },
  content: { padding: SPACING.lg, gap: SPACING.md, paddingBottom: SPACING.xxl },
  years: { gap: SPACING.sm, paddingBottom: SPACING.sm },
  year: {
    borderRadius: RADIUS.pill,
    backgroundColor: COLORS.surface,
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.sm,
    ...CARD_SHADOW,
  },
  yearActive: { backgroundColor: COLORS.yellow, borderColor: COLORS.yellow },
  yearLabel: { ...TYPE.small, color: COLORS.body },
  yearLabelActive: { color: COLORS.onYellow, fontFamily: TYPE.cardTitle.fontFamily },
  photo: { width: '100%', height: 140, borderRadius: RADIUS.sm, backgroundColor: COLORS.paper2 },
  groupName: { ...TYPE.sectionTitle, color: COLORS.ink },
  hint: { ...TYPE.small, color: COLORS.muted },
  people: { gap: SPACING.md, marginTop: SPACING.sm },
  person: { flexDirection: 'row', alignItems: 'center', gap: SPACING.md },
  personText: { flex: 1 },
  personName: { ...TYPE.body, color: COLORS.ink },
  avatar: { width: 44, height: 44, borderRadius: RADIUS.pill, backgroundColor: COLORS.paper2 },
  avatarEmpty: { borderWidth: 1, borderColor: COLORS.line },
});
