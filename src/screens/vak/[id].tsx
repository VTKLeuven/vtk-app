import * as WebBrowser from 'expo-web-browser';
import { useLocalSearchParams } from 'expo-router';
import { ChevronDown, ChevronRight, FileText, Star } from 'lucide-react-native';
import { useState } from 'react';
import { ActivityIndicator, Alert, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';

import type { AppBurgieclanCourse, AppBurgieclanDocument } from '../../api/contract';
import { fetchBurgieclanCourse, fetchBurgieclanFile, setBurgieclanFavorite } from '../../api/endpoints';
import { messageFor, useResource } from '../../api/useResource';
import { YellowHead, YellowHeadButton } from '../../components/YellowHead';
import { EvaluationsView } from '../../components/studies/BurgieclanEvaluations';
import { HeadScroll } from '../../components/HeadScroll';
import { Empty, ErrorState, Loading, MarginRegister, StaleNotice } from '../../components/ui';
import { formatShortDate } from '../../format';
import { useApp } from '../../state/app';
import { useTabRouter } from '../../navigation';
import { COLORS, FONTS, RADIUS, SPACING, TYPE } from '../../theme/tokens';
import { CARD_SHADOW } from '../../components/HomeSection';
import { t } from '../../i18n';

type View_ = 'documenten' | 'evaluaties';

/**
 * Eén vak van Burgieclan, zoals de vakpagina daar: de documenten per soort, en
 * de vakevaluatie (sterren per rubriek en de opmerkingen van studenten). Die
 * twee staan als pillen in de kop. Binnen een soort staat het nieuwste
 * academiejaar bovenaan; dat is wat je meestal zoekt.
 *
 * Een document openen haalt een link op die tien minuten geldig is en toont de pdf
 * in de app zelf (`pdf.tsx`), met een knop om hem te delen of te bewaren.
 */
export default function VakScreen() {
  const { id, naam } = useLocalSearchParams<{ id: string; naam?: string }>();
  const { locale } = useApp();
  const router = useTabRouter();
  const resource = useResource(`burgieclan-vak-${id}`, () => fetchBurgieclanCourse(locale, id), `${locale}:${id}`);
  const [view, setView] = useState<View_>('documenten');
  const [favorite, setFavorite] = useState<boolean | null>(null);
  const [starBusy, setStarBusy] = useState(false);
  const [opening, setOpening] = useState<number | null>(null);
  const [openGroups, setOpenGroups] = useState<Set<string>>(() => new Set());

  const detail = resource.data;

  // De naam komt mee van de lijst, zodat de kop niet van "Vak" naar de echte naam springt.
  if (resource.loading && !detail) {
    return (
      <>
        <YellowHead title={naam ?? t('Vak', 'Course')} back />
        <Loading />
      </>
    );
  }
  if (!detail) {
    return (
      <>
        <YellowHead title={naam ?? t('Vak', 'Course')} back />
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
        next ? t('Niet bij je vakken gezet', 'Not added to your courses') : t('Niet uit je vakken gehaald', 'Not removed from your courses'),
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
      // In de app zelf (`pdf.tsx`), niet meer in het browservenster van het systeem.
      router.push({ pathname: '/pdf', params: { url: file.url, title: document.name } });
    } catch (error) {
      Alert.alert(t('Document niet geopend', 'Document not opened'), messageFor(error instanceof Error ? error : null));
    } finally {
      setOpening(null);
    }
  };

  // De kop staat in de scroll en schuift mee weg, bij de documenten en bij de evaluaties.
  const head = (
        <YellowHead
          back
          title={course.name}
          subtitle={[course.code, subtitleFor(course)].filter(Boolean).join(' · ')}
          right={
            <YellowHeadButton
              label={starred ? t('Uit je vakken halen', 'Remove from your courses') : t('Bij je vakken zetten', 'Add to your courses')}
              onPress={() => {
                if (!starBusy) void toggleStar();
              }}
            >
              <Star size={20} color={COLORS.yellow} fill={starred ? COLORS.yellow : 'transparent'} />
            </YellowHeadButton>
          }
          tabs={
            evaluations
              ? {
                  value: view,
                  onChange: setView,
                  options: [
                    { value: 'documenten', label: `Documenten ${documents.length}` },
                    { value: 'evaluaties', label: `Evaluaties ${commentCount}` },
                  ],
                }
              : undefined
          }
        />
  );

  return (
    <>
      {view === 'evaluaties' && evaluations ? (
        <EvaluationsView evaluations={evaluations} url={course.url} locale={locale} head={head} />
      ) : null}
      {view === 'documenten' ? (
      <HeadScroll
        head={head}
        style={styles.root}
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl refreshing={resource.refreshing} onRefresh={() => void resource.refresh()} />
        }
      >
        {resource.stale ? <StaleNotice onRetry={() => void resource.refresh()} /> : null}
        {documents.length === 0 ? (
          <Empty
            flush
            title={t('Nog geen documenten', 'No documents yet')}
            hint={t('Niemand deelde voor dit vak al iets. Heb jij een samenvatting of een oud examen?', 'Nobody has shared anything for this course yet. Do you have a summary or an old exam?')}
            action={{ label: t('Opladen op Burgieclan', 'Upload on Burgieclan'), onPress: () => void WebBrowser.openBrowserAsync(course.url) }}
          />
        ) : null}

        {/* Per soort (examens, oefenzittingen, samenvattingen) een kaart die je
            openklapt, standaard dicht zoals de rubrieken van de evaluaties. Met
            maar één soort staat die meteen open. */}
        {grouped.map(({ name, items }) => {
          const expanded = grouped.length === 1 || openGroups.has(name);
          return (
            <View key={name} style={styles.groupCard}>
              {grouped.length > 1 ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityState={{ expanded }}
                  accessibilityLabel={`${name}, ${items.length} ${items.length === 1 ? 'document' : 'documenten'}`}
                  onPress={() =>
                    setOpenGroups((current) => {
                      const next = new Set(current);
                      if (next.has(name)) next.delete(name);
                      else next.add(name);
                      return next;
                    })
                  }
                  style={({ pressed }) => [styles.groupHead, pressed && styles.pressed]}
                >
                  <View style={styles.flex}>
                    <Text style={styles.groupName}>{name}</Text>
                    <Text style={styles.meta}>
                      {items.length} {items.length === 1 ? 'document' : 'documenten'}
                    </Text>
                  </View>
                  <View style={[styles.chevron, expanded && styles.chevronOpen]}>
                    <ChevronDown size={17} color={expanded ? COLORS.yellow : COLORS.ink} />
                  </View>
                </Pressable>
              ) : null}
              {expanded
                ? items.map((document, index) => (
                    <Pressable
                      key={document.id}
                      accessibilityRole="button"
                      accessibilityLabel={document.hasFile ? t(`${document.name} openen`, `Open ${document.name}`) : t(`${document.name}, geen bestand`, `${document.name}, no file`)}
                      disabled={!document.hasFile || opening !== null}
                      onPress={() => void open(document)}
                      style={({ pressed }) => [
                        styles.row,
                        (index > 0 || grouped.length > 1) && styles.rowDivider,
                        pressed && styles.pressed,
                        !document.hasFile && styles.dim,
                      ]}
                    >
                      <View style={styles.icon}>
                        <FileText size={18} color={COLORS.strong} />
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
                            {document.underReview ? <Text style={styles.flag}>{t('Wacht op goedkeuring', 'Awaiting approval')}</Text> : null}
                            {!document.hasFile ? <Text style={styles.flag}>{t('Geen bestand', 'No file')}</Text> : null}
                          </View>
                        ) : null}
                      </View>
                      {opening === document.id ? (
                        <ActivityIndicator color={COLORS.strong} />
                      ) : (
                        <ChevronRight color={COLORS.muted} size={18} />
                      )}
                    </Pressable>
                  ))
                : null}
            </View>
          );
        })}

        {documents.length > 0 ? (
          <MarginRegister
            title={t('Op Burgieclan', 'On Burgieclan')}
            links={[
              {
                label: t('Iets opladen of bespreken', 'Upload or discuss something'),
                hint: 'burgieclan.vtk.be',
                external: true,
                onPress: () => void WebBrowser.openBrowserAsync(course.url),
              },
            ]}
          />
        ) : null}
      </HeadScroll>
      ) : null}
    </>
  );
}

function subtitleFor(course: AppBurgieclanCourse): string | null {
  const parts = [
    course.credits ? `${course.credits} studiepunten` : null,
    course.semesters.length > 0 ? course.semesters.join(', ') : null,
    // Geen docenten meer (eind november 2026): Burgieclan geeft er hun u-nummer
    // van, en "u0012345" zegt niemand iets. Een echte naam mag blijven.
    ...course.professors.filter((professor) => !/^[ur]\d{5,}$/i.test(professor.trim())).slice(0, 2),
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
  content: { padding: SPACING.xl - 4, gap: SPACING.md, paddingBottom: SPACING.xxl },
  flex: { flex: 1 },
  pressed: { opacity: 0.6 },
  dim: { opacity: 0.5 },
  title: { ...TYPE.cardTitle, color: COLORS.ink },
  body: { ...TYPE.body, color: COLORS.body },
  groupCard: { backgroundColor: COLORS.surface, borderRadius: 20, overflow: 'hidden', ...CARD_SHADOW },
  groupHead: { flexDirection: 'row', alignItems: 'center', gap: SPACING.md, minHeight: 64, paddingHorizontal: SPACING.lg, paddingVertical: SPACING.md },
  groupName: { fontFamily: FONTS.bold, fontSize: 16, lineHeight: 21, color: COLORS.ink },
  chevron: {
    width: 32,
    height: 32,
    borderRadius: RADIUS.pill,
    backgroundColor: COLORS.paper2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chevronOpen: { backgroundColor: COLORS.band, transform: [{ rotate: '180deg' }] },
  rowDivider: { borderTopWidth: 1, borderTopColor: COLORS.line },
  kicker: {
    fontFamily: FONTS.bold,
    fontSize: 11.5,
    letterSpacing: 1.1,
    textTransform: 'uppercase',
    color: COLORS.ink,
  },

  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
    paddingVertical: 12,
    paddingHorizontal: SPACING.lg,
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
