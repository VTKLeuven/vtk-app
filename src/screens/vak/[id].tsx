import * as WebBrowser from 'expo-web-browser';
import { useLocalSearchParams } from 'expo-router';
import { ChevronRight, FileText, Star } from 'lucide-react-native';
import { useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';

import type { AppBurgieclanCourse, AppBurgieclanDocument } from '../../api/contract';
import { fetchBurgieclanCourse, fetchBurgieclanFile, setBurgieclanFavorite } from '../../api/endpoints';
import { messageFor, useResource } from '../../api/useResource';
import { PageHead } from '../../components/PageHead';
import { EvaluationsView } from '../../components/studies/BurgieclanEvaluations';
import { Empty, ErrorState, Loading, MarginRegister, StaleNotice } from '../../components/ui';
import { formatShortDate } from '../../format';
import { useApp } from '../../state/app';
import { COLORS, FONTS, RADIUS, SPACING, TYPE } from '../../theme/tokens';

type View_ = 'documenten' | 'evaluaties';

/**
 * Eén vak van Burgieclan, zoals de vakpagina daar: de documenten per soort, en
 * de vakevaluatie (sterren per rubriek en de opmerkingen van studenten). Die
 * twee staan als pillen in de kop. Binnen een soort staat het nieuwste
 * academiejaar bovenaan; dat is wat je meestal zoekt.
 *
 * Een document openen haalt een link op die tien minuten geldig is en opent die
 * in het venster van het systeem: dat toont een pdf beter dan wij het zouden
 * nabouwen, en je kan er van daaruit mee delen of bewaren.
 */
export default function VakScreen() {
  const { id, naam } = useLocalSearchParams<{ id: string; naam?: string }>();
  const { locale } = useApp();
  const resource = useResource(`burgieclan-vak-${id}`, () => fetchBurgieclanCourse(locale, id), `${locale}:${id}`);
  const [view, setView] = useState<View_>('documenten');
  const [favorite, setFavorite] = useState<boolean | null>(null);
  const [starBusy, setStarBusy] = useState(false);
  const [opening, setOpening] = useState<number | null>(null);

  const detail = resource.data;
  const categories = useMemo(() => {
    const counts = new Map<string, number>();
    for (const document of detail?.documents ?? []) {
      counts.set(document.category, (counts.get(document.category) ?? 0) + 1);
    }
    return [...counts.entries()].map(([name, count]) => ({ name, count }));
  }, [detail]);

  // De naam komt mee van de lijst, zodat de kop niet van "Vak" naar de echte naam springt.
  if (resource.loading && !detail) {
    return (
      <>
        <PageHead title={naam ?? 'Vak'} />
        <Loading />
      </>
    );
  }
  if (!detail) {
    return (
      <>
        <PageHead title={naam ?? 'Vak'} />
        <ErrorState message={messageFor(resource.error)} onRetry={() => void resource.refresh()} />
      </>
    );
  }

  const { course, documents } = detail;
  const starred = favorite ?? course.favorite;
  const grouped = groupByCategory(documents);
  const evaluations = detail.evaluations ?? null;
  const commentCount = evaluations?.sections.reduce((sum, section) => sum + section.comments.length, 0) ?? 0;

  const toggleStar = async () => {
    setStarBusy(true);
    const next = !starred;
    setFavorite(next);
    try {
      await setBurgieclanFavorite(locale, course.id, next);
    } catch (error) {
      setFavorite(!next);
      Alert.alert(
        next ? 'Niet bij je vakken gezet' : 'Niet uit je vakken gehaald',
        messageFor(error instanceof Error ? error : null),
      );
    } finally {
      setStarBusy(false);
    }
  };

  const open = async (document: AppBurgieclanDocument) => {
    setOpening(document.id);
    try {
      const file = await fetchBurgieclanFile(document.id);
      await WebBrowser.openBrowserAsync(file.url, {
        presentationStyle: WebBrowser.WebBrowserPresentationStyle.PAGE_SHEET,
        controlsColor: COLORS.navy,
      });
    } catch (error) {
      Alert.alert('Document niet geopend', messageFor(error instanceof Error ? error : null));
    } finally {
      setOpening(null);
    }
  };

  return (
    <>
      <PageHead
        kicker={course.code}
        title={course.name}
        subtitle={subtitleFor(course)}
        right={
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={starred ? 'Uit je vakken halen' : 'Bij je vakken zetten'}
            accessibilityState={{ selected: starred, busy: starBusy }}
            disabled={starBusy}
            onPress={() => void toggleStar()}
            hitSlop={10}
          >
            <Star size={22} color={COLORS.yellow} fill={starred ? COLORS.yellow : 'transparent'} />
          </Pressable>
        }
        tabs={
          evaluations
            ? {
                value: view,
                onChange: setView,
                options: [
                  { value: 'documenten', label: 'Documenten', count: documents.length },
                  { value: 'evaluaties', label: 'Evaluaties', count: commentCount },
                ],
              }
            : undefined
        }
      />

      {view === 'evaluaties' && evaluations ? (
        <EvaluationsView evaluations={evaluations} url={course.url} locale={locale} />
      ) : null}
      {view === 'documenten' && documents.length === 0 ? (
        <Empty
          title="Nog geen documenten"
          hint="Niemand deelde voor dit vak al iets. Heb jij een samenvatting of een oud examen?"
          action={{ label: 'Opladen op Burgieclan', onPress: () => void WebBrowser.openBrowserAsync(course.url) }}
        />
      ) : null}
      {view === 'documenten' ? (
      <ScrollView
        style={styles.root}
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl refreshing={resource.refreshing} onRefresh={() => void resource.refresh()} />
        }
      >
        {resource.stale ? <StaleNotice onRetry={() => void resource.refresh()} /> : null}

        {grouped.map(({ name, items }) => (
            <View key={name} style={styles.group}>
              {categories.length > 1 ? <Text style={styles.kicker}>{name}</Text> : null}
              <View style={styles.register}>
                {items.map((document) => (
                  <Pressable
                    key={document.id}
                    accessibilityRole="button"
                    accessibilityLabel={document.hasFile ? `${document.name} openen` : `${document.name}, geen bestand`}
                    disabled={!document.hasFile || opening !== null}
                    onPress={() => void open(document)}
                    style={({ pressed }) => [styles.row, pressed && styles.pressed, !document.hasFile && styles.dim]}
                  >
                    <View style={styles.icon}>
                      <FileText size={18} color={COLORS.navy} />
                    </View>
                    <View style={styles.flex}>
                      <Text style={styles.name} numberOfLines={2}>
                        {document.name}
                      </Text>
                      <Text style={styles.meta} numberOfLines={1}>
                        {documentMeta(document, locale)}
                      </Text>
                      {document.underReview || !document.hasFile ? (
                        <View style={styles.flags}>
                          {document.underReview ? <Text style={styles.flag}>Wacht op goedkeuring</Text> : null}
                          {!document.hasFile ? <Text style={styles.flag}>Geen bestand</Text> : null}
                        </View>
                      ) : null}
                    </View>
                    {opening === document.id ? (
                      <ActivityIndicator color={COLORS.navy} />
                    ) : (
                      <ChevronRight color={COLORS.muted} size={18} />
                    )}
                  </Pressable>
                ))}
              </View>
            </View>
          ))}

        {documents.length > 0 ? (
          <MarginRegister
            title="Op Burgieclan"
            links={[
              {
                label: 'Iets opladen of bespreken',
                hint: 'burgieclan.vtk.be',
                external: true,
                onPress: () => void WebBrowser.openBrowserAsync(course.url),
              },
            ]}
          />
        ) : null}
      </ScrollView>
      ) : null}
    </>
  );
}

function subtitleFor(course: AppBurgieclanCourse): string | null {
  const parts = [
    course.credits ? `${course.credits} studiepunten` : null,
    course.semesters.length > 0 ? course.semesters.join(', ') : null,
    course.professors.length > 0 ? course.professors.slice(0, 2).join(', ') : null,
  ].filter(Boolean);
  return parts.length > 0 ? parts.join(' · ') : null;
}

function groupByCategory(documents: AppBurgieclanDocument[]) {
  const groups = new Map<string, AppBurgieclanDocument[]>();
  for (const document of documents) {
    const list = groups.get(document.category) ?? [];
    list.push(document);
    groups.set(document.category, list);
  }
  return [...groups.entries()].map(([name, items]) => ({ name, items }));
}

function documentMeta(document: AppBurgieclanDocument, locale: 'nl' | 'en'): string {
  return [
    document.year ?? formatShortDate(document.createdAt, locale, true),
    document.fileSize ? formatSize(document.fileSize) : null,
    document.author,
  ]
    .filter(Boolean)
    .join(' · ');
}

function formatSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} kB`;
  return `${(bytes / (1024 * 1024)).toFixed(1).replace('.', ',')} MB`;
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.paper },
  content: { padding: SPACING.xl - 4, gap: SPACING.xl, paddingBottom: SPACING.xxl },
  flex: { flex: 1 },
  pressed: { opacity: 0.6 },
  dim: { opacity: 0.5 },
  title: { ...TYPE.cardTitle, color: COLORS.ink },
  body: { ...TYPE.body, color: COLORS.body },
  group: { gap: SPACING.sm },
  kicker: {
    fontFamily: FONTS.bold,
    fontSize: 11.5,
    letterSpacing: 1.1,
    textTransform: 'uppercase',
    color: COLORS.ink,
  },
  register: { borderTopWidth: 1, borderTopColor: COLORS.line2 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.line2,
  },
  icon: {
    width: 36,
    height: 36,
    borderRadius: RADIUS.sm,
    backgroundColor: COLORS.paper2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  name: { fontFamily: FONTS.semibold, fontSize: 15, lineHeight: 20, color: COLORS.ink },
  meta: { ...TYPE.small, color: COLORS.body },
  flags: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.xs, marginTop: 4 },
  flag: {
    ...TYPE.small,
    fontSize: 12,
    fontFamily: FONTS.medium,
    color: COLORS.muted,
    borderWidth: 1,
    borderColor: COLORS.line2,
    borderRadius: RADIUS.pill,
    paddingHorizontal: 8,
    overflow: 'hidden',
  },
});
