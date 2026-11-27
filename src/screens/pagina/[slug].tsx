import { Image } from 'expo-image';
import { useLocalSearchParams } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { Download } from 'lucide-react-native';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { fetchPage } from '../../api/endpoints';
import { messageFor, useResource } from '../../api/useResource';
import { PageHead } from '../../components/PageHead';
import { Prose } from '../../components/Prose';
import { Button, Card, ErrorState, Loading } from '../../components/ui';
import { useApp } from '../../state/app';
import { COLORS, SPACING, TYPE } from '../../theme/tokens';
import { CARD_SHADOW } from '../../components/HomeSection';

/**
 * Een contentpagina uit het CMS.
 *
 * De kop-index die op de site naast de tekst staat, staat hier niet. Die rail is
 * een register in de marge, en op een telefoon is er geen marge; de index zou een
 * tweede lijst boven de tekst worden waar je doorheen moet scrollen om bij de
 * tekst te komen. De downloads staan wel onderaan, want die zoekt iemand gericht.
 */
export default function PaginaScreen() {
  const { locale } = useApp();
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const resource = useResource(`pagina:${slug}`, () => fetchPage(locale, slug), `${locale}:${slug}`);

  if (resource.loading) return <Loading />;
  if (!resource.data) {
    return (
      <ErrorState message={messageFor(resource.error)} onRetry={() => void resource.refresh()} />
    );
  }

  const page = resource.data;

  return (
    <>
      {/* De kop schuift mee weg (eind november 2026): op een lange pagina hoeft
          de titel niet in beeld te blijven. De foto staat los van het geel, als
          kaart met afgeronde hoeken, en niet meer er recht tegenaan. */}
      <ScrollView contentContainerStyle={styles.content} style={styles.root}>
        <View style={styles.overscroll} />
        <PageHead title={page.title} subtitle={page.excerpt} kicker={page.category?.label} />
        {page.imageUrl ? (
          <Image cachePolicy="memory-disk" source={{ uri: page.imageUrl }} style={styles.photo} contentFit="cover" />
        ) : null}

        <View style={styles.prose}>
          <Prose>{page.content}</Prose>
        </View>

        {page.ctaUrl && page.ctaLabel ? (
          <View style={styles.block}>
            <Button
              label={page.ctaLabel}
              onPress={() => void WebBrowser.openBrowserAsync(page.ctaUrl as string)}
            />
          </View>
        ) : null}

        {page.downloads.length > 0 ? (
          <View style={styles.block}>
            <Text style={styles.section}>Downloads</Text>
            {page.downloads.map((download) => (
              <Pressable
                key={download.id}
                accessibilityRole="button"
                accessibilityLabel={`Download ${download.label}`}
                onPress={() => void WebBrowser.openBrowserAsync(download.url)}
                style={({ pressed }) => [styles.download, pressed && styles.downloadPressed]}
              >
                <Download color={COLORS.navy} size={18} />
                <View style={styles.downloadText}>
                  <Text style={styles.downloadLabel}>{download.label}</Text>
                  {download.sizeBytes ? (
                    <Text style={styles.hint}>{formatBytes(download.sizeBytes)}</Text>
                  ) : null}
                </View>
              </Pressable>
            ))}
          </View>
        ) : null}

        {page.content.trim() === '' && page.downloads.length === 0 ? (
          <View style={styles.block}>
            <Card>
              <Text style={styles.hint}>Deze pagina heeft nog geen inhoud.</Text>
            </Card>
          </View>
        ) : null}
      </ScrollView>
    </>
  );
}

/** "1,4 MB". Genoeg om te weten of je dit op mobiele data wil openen. */
function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} kB`;
  return `${(bytes / (1024 * 1024)).toFixed(1).replace('.', ',')} MB`;
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.paper },
  content: { paddingBottom: SPACING.xxl },
  // Wat boven de kop verschijnt als je op iOS omlaag trekt: geel, zoals de kop.
  overscroll: { position: 'absolute', top: -1000, left: 0, right: 0, height: 1000, backgroundColor: COLORS.yellow },
  photo: {
    height: 190,
    marginHorizontal: SPACING.lg,
    marginTop: SPACING.lg,
    borderRadius: 20,
    backgroundColor: COLORS.paper2,
  },
  prose: { padding: SPACING.lg },
  block: { paddingHorizontal: SPACING.lg, paddingBottom: SPACING.lg, gap: SPACING.sm },
  section: { ...TYPE.sectionTitle, color: COLORS.ink, marginBottom: SPACING.xs },
  download: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
    backgroundColor: COLORS.surface,
    borderRadius: 20,
    padding: SPACING.lg,
    ...CARD_SHADOW,
  },
  downloadPressed: { backgroundColor: COLORS.paper2 },
  downloadText: { flex: 1 },
  downloadLabel: { ...TYPE.body, color: COLORS.ink },
  hint: { ...TYPE.small, color: COLORS.muted },
});
