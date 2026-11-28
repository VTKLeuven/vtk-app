import * as WebBrowser from 'expo-web-browser';
import { useFocusEffect, useScrollToTop } from 'expo-router';
import { ChevronRight, Star } from 'lucide-react-native';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View, type ScrollViewInstance } from 'react-native';

import type { AppBurgieclanCourse } from '../../api/contract';
import {
  fetchBurgieclanCourses,
  searchBurgieclanCourses,
  setBurgieclanFavorite,
} from '../../api/endpoints';
import { messageFor, useResource } from '../../api/useResource';
import { useTabRouter } from '../../navigation';
import { useApp } from '../../state/app';
import { COLORS, FONTS, SPACING, TYPE } from '../../theme/tokens';
import { YellowHead } from '../YellowHead';
import { SearchField } from '../SearchField';
import { Button, Card, CardList, Empty, ErrorState, Loading, MarginRegister, StaleNotice } from '../ui';
import type { StudiesTabs } from './tabs';
import { HeadScroll } from '../HeadScroll';
import { t } from '../../i18n';

/**
 * Burgieclan, het derde tabblad van Studies: de documenten van je vakken.
 *
 * In de vorm van de app en niet van Burgieclan: je vakken als register met
 * haarlijnen, een zoekveld bovenaan, en een vak als eigen scherm met zijn
 * documenten per soort. Het zijn dezelfde gegevens als op burgieclan.vtk.be:
 * "Jouw vakken" is daar "Mijn vakken", en een ster hier is er een daar.
 *
 * Wat hier niet kan, is opladen, stemmen en reageren. Dat zijn formulieren met
 * hun eigen moderatie, en die blijven op Burgieclan; elk vak heeft een link
 * ernaartoe.
 */
export function BurgieclanView({ tabs, linked }: { tabs: StudiesTabs; linked: boolean }) {
  // Een tik op de tab waar je al staat, scrolt naar boven.
  const topRef = useRef<ScrollViewInstance>(null);
  useScrollToTop(topRef);
  const router = useTabRouter();
  const { locale, viewer } = useApp();
  const head = (
    <YellowHead title="Studies" tabs={tabs}>
      <Text style={styles.headLine}>{t('Samenvattingen, examens en notities per vak', 'Summaries, exams and notes per course')}</Text>
    </YellowHead>
  );

  const resource = useResource(
    'burgieclan-vakken',
    () => fetchBurgieclanCourses(locale),
    `${locale}:${viewer?.id ?? 'anon'}`,
    Boolean(viewer) && linked,
  );

  const [query, setQuery] = useState('');
  const search = useCourseSearch(query);
  const [pending, setPending] = useState<number | null>(null);
  // Een ster die net gezet werd, staat meteen goed; de lijst haalt daarna stil op.
  const [overrides, setOverrides] = useState<Record<number, boolean>>({});

  useFocusEffect(
    useCallback(() => {
      if (viewer && linked) void resource.reload();
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [viewer?.id, linked]),
  );

  if (!viewer) {
    return (
      <>
        <HeadScroll head={head} style={styles.root} contentContainerStyle={styles.content}>
          <Card>
            <Text style={styles.title}>{t('Log eerst in', 'Log in first')}</Text>
            <Text style={styles.body}>
              {t('Burgieclan gebruikt hetzelfde VTK-account. Eens ingelogd zie je hier je vakken en hun documenten, zonder tweede aanmelding.', 'Burgieclan uses the same VTK account. Once logged in you see your courses and their documents here, without a second login.')}
            </Text>
            <Button label={t('Inloggen', 'Log in')} onPress={() => router.push('/inloggen')} />
          </Card>
        </HeadScroll>
      </>
    );
  }

  if (!linked || resource.data?.available === false) {
    return (
      <>
        {head}
        <Empty
          title={t('Burgieclan staat hier nog niet', 'Burgieclan is not available here yet')}
          hint={t('Op burgieclan.vtk.be wel, met hetzelfde VTK-account.', 'It is on burgieclan.vtk.be, with the same VTK account.')}
          action={{ label: t('Naar burgieclan.vtk.be', 'To burgieclan.vtk.be'), onPress: () => void WebBrowser.openBrowserAsync('https://burgieclan.vtk.be') }}
        />
      </>
    );
  }

  const toggle = async (course: AppBurgieclanCourse) => {
    const next = !(overrides[course.id] ?? course.favorite);
    setPending(course.id);
    setOverrides((current) => ({ ...current, [course.id]: next }));
    try {
      await setBurgieclanFavorite(locale, course.id, next);
      void resource.reload();
    } catch (error) {
      setOverrides((current) => ({ ...current, [course.id]: !next }));
      Alert.alert(
        next ? t('Niet bij je vakken gezet', 'Not added to your courses') : t('Niet uit je vakken gehaald', 'Not removed from your courses'),
        messageFor(error instanceof Error ? error : null),
      );
    } finally {
      setPending(null);
    }
  };

  const searching = query.trim().length >= 2;
  const favourites = (resource.data?.courses ?? []).filter((course) => overrides[course.id] ?? true);

  return (
    <ScrollView ref={topRef}
      style={styles.root}
      contentContainerStyle={styles.scroll}
      keyboardShouldPersistTaps="handled"
      refreshControl={
        <RefreshControl refreshing={resource.refreshing} tintColor={COLORS.strong} onRefresh={() => void resource.refresh()} />
      }
    >
      <View style={styles.overscroll} />
      {/* Het zoekveld staat in het geel, zoals op het voorstel van november 2026. */}
      <YellowHead title="Studies" tabs={tabs}>
        <SearchField
          value={query}
          onChange={setQuery}
          placeholder={t('Zoek een vak op naam of code', 'Search a course by name or code')}
          label={t('Vakken zoeken', 'Search courses')}
          // In de gele kop: zonder eigen marge, de kop zet de ruimte al.
          style={styles.headSearch}
        />
      </YellowHead>
      <View style={styles.content}>
        {resource.stale ? <StaleNotice onRetry={() => void resource.refresh()} /> : null}

        {searching ? (
          <View style={styles.block}>
            <Text accessibilityRole="header" style={styles.heading}>{t('Gevonden', 'Found')}</Text>
            {search.loading && search.courses.length === 0 ? (
              <ActivityIndicator color={COLORS.strong} style={styles.spinner} />
            ) : search.error ? (
              <Text style={styles.hint}>{search.error}</Text>
            ) : search.courses.length === 0 ? (
              <Text style={styles.hint}>{t(`Geen vak gevonden voor “${query.trim()}”.`, `No course found for “${query.trim()}”.`)}</Text>
            ) : (
              <CourseList
                courses={search.courses}
                favorite={(course) => overrides[course.id] ?? course.favorite}
                pending={pending}
                onOpen={(course) => router.push({ pathname: `/vak/${course.id}`, params: { naam: course.name } })}
                onToggle={(course) => void toggle(course)}
              />
            )}
          </View>
        ) : resource.loading && !resource.data ? (
          <Loading label={t('Je vakken ophalen', 'Loading your courses')} />
        ) : !resource.data ? (
          <ErrorState message={messageFor(resource.error)} onRetry={() => void resource.refresh()} />
        ) : (
          <View style={styles.block}>
            <Text accessibilityRole="header" style={styles.heading}>{t('Jouw vakken', 'Your courses')}</Text>
            {favourites.length === 0 ? (
              <Text style={styles.hint}>
                {t('Zoek je vakken hierboven en tik op de ster. Ze staan dan hier, en op Burgieclan bij Mijn vakken.', 'Search your courses above and tap the star. They then show up here, and on Burgieclan under My courses.')}
              </Text>
            ) : (
              <CourseList
                courses={favourites}
                favorite={(course) => overrides[course.id] ?? course.favorite}
                pending={pending}
                onOpen={(course) => router.push({ pathname: `/vak/${course.id}`, params: { naam: course.name } })}
                onToggle={(course) => void toggle(course)}
              />
            )}
          </View>
        )}

        <MarginRegister
          title={t('Op Burgieclan', 'On Burgieclan')}
          links={[
            {
              label: t('Een document opladen', 'Upload a document'),
              hint: 'burgieclan.vtk.be',
              external: true,
              onPress: () => void WebBrowser.openBrowserAsync(resource.data?.burgieclanUrl ?? 'https://burgieclan.vtk.be'),
            },
          ]}
        />
      </View>
    </ScrollView>
  );
}

/**
 * Zoeken terwijl je tikt, met een kleine pauze en zonder dat een traag antwoord
 * een sneller overschrijft.
 */
function useCourseSearch(query: string) {
  const { locale } = useApp();
  const [state, setState] = useState<{ courses: AppBurgieclanCourse[]; loading: boolean; error: string | null }>({
    courses: [],
    loading: false,
    error: null,
  });
  const latest = useRef(0);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) return;
    const id = ++latest.current;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      setState((current) => ({ ...current, loading: true, error: null }));
      searchBurgieclanCourses(locale, q, controller.signal)
        .then((result) => {
          if (latest.current === id) setState({ courses: result.courses, loading: false, error: null });
        })
        .catch((error: Error) => {
          if (latest.current === id && error.name !== 'AbortError') {
            setState({ courses: [], loading: false, error: messageFor(error) });
          }
        });
    }, 250);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query, locale]);

  // Onder twee tekens wordt er niet gezocht; wat er van een vorige zoekopdracht bleef, telt niet.
  return query.trim().length < 2 ? NO_RESULTS : state;
}

const NO_RESULTS = { courses: [] as AppBurgieclanCourse[], loading: false, error: null };

export function CourseList({
  courses,
  favorite,
  pending,
  onOpen,
  onToggle,
}: {
  courses: AppBurgieclanCourse[];
  favorite: (course: AppBurgieclanCourse) => boolean;
  pending: number | null;
  onOpen: (course: AppBurgieclanCourse) => void;
  onToggle: (course: AppBurgieclanCourse) => void;
}) {
  return (
    <CardList>
      {courses.map((course) => {
        const starred = favorite(course);
        return (
          <View key={course.id} style={styles.row}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t(`${course.name}, ${course.documentCount} documenten`, `${course.name}, ${course.documentCount} documents`)}
              onPress={() => onOpen(course)}
              style={({ pressed }) => [styles.rowMain, pressed && styles.pressed]}
            >
              <View style={styles.flex}>
                <Text style={styles.code}>{course.code}</Text>
                <Text style={styles.name} numberOfLines={2}>
                  {course.name}
                </Text>
                <Text style={styles.meta}>{courseMeta(course)}</Text>
              </View>
              <ChevronRight color={COLORS.muted} size={18} />
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={starred ? t(`${course.name} uit je vakken halen`, `Remove ${course.name} from your courses`) : t(`${course.name} bij je vakken zetten`, `Add ${course.name} to your courses`)}
              accessibilityState={{ selected: starred, busy: pending === course.id }}
              disabled={pending === course.id}
              onPress={() => onToggle(course)}
              hitSlop={8}
              style={({ pressed }) => [styles.star, pressed && styles.pressed]}
            >
              <Star
                size={20}
                color={starred ? COLORS.yellowDeep : COLORS.muted}
                fill={starred ? COLORS.yellow : 'transparent'}
              />
            </Pressable>
          </View>
        );
      })}
    </CardList>
  );
}

export function courseMeta(course: AppBurgieclanCourse): string {
  const parts = [
    course.documentCount === 1 ? '1 document' : t(`${course.documentCount} documenten`, `${course.documentCount} documents`),
    course.credits ? t(`${course.credits} sp`, `${course.credits} ECTS`) : null,
    course.semesters.length > 0 ? course.semesters.join(', ') : null,
  ];
  return parts.filter(Boolean).join(' · ');
}

const styles = StyleSheet.create({
  headSearch: { margin: 0 },
  root: { flex: 1, backgroundColor: COLORS.paper },
  scroll: { paddingBottom: SPACING.xxl },
  content: { padding: SPACING.xl - 4, gap: SPACING.xl, paddingBottom: SPACING.xxl },
  // Trekt de gele kop door wanneer je op iOS omlaag trekt.
  overscroll: {
    position: 'absolute',
    top: -1000,
    left: 0,
    right: 0,
    height: 1000,
    backgroundColor: COLORS.head,
  },
  headLine: { fontFamily: FONTS.bold, fontSize: 17, color: COLORS.strong },
  heading: { fontFamily: FONTS.bold, fontSize: 22, letterSpacing: -0.5, color: COLORS.strong },
  flex: { flex: 1 },
  block: { gap: SPACING.md },
  pressed: { opacity: 0.6 },
  spinner: { alignSelf: 'flex-start', marginVertical: SPACING.md },
  title: { ...TYPE.cardTitle, color: COLORS.ink },
  body: { ...TYPE.body, color: COLORS.body },
  hint: { ...TYPE.small, color: COLORS.muted },


  row: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  rowMain: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: SPACING.md, paddingVertical: 12 },
  code: {
    fontFamily: FONTS.semibold,
    fontSize: 11.5,
    letterSpacing: 0.7,
    color: COLORS.muted,
    fontVariant: ['tabular-nums'],
  },
  name: { fontFamily: FONTS.semibold, fontSize: 15, lineHeight: 20, color: COLORS.ink, marginTop: 1 },
  meta: { ...TYPE.small, color: COLORS.body, marginTop: 2 },
  star: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', marginLeft: SPACING.xs },

});
