import * as WebBrowser from 'expo-web-browser';
import { useFocusEffect } from 'expo-router';
import { ChevronRight, Star } from 'lucide-react-native';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

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
import { PageHead } from '../PageHead';
import { SearchField } from '../SearchField';
import { Button, Card, CardList, Empty, ErrorState, Loading, MarginRegister, SectionHeading, StaleNotice } from '../ui';
import type { StudiesTabs } from './tabs';

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
  const router = useTabRouter();
  const { locale, viewer } = useApp();
  const head = (
    <PageHead
      title="Studies"
      subtitle="Samenvattingen, examens en notities per vak"
      back={false}
      tabs={tabs}
    />
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
        {head}
        <ScrollView style={styles.root} contentContainerStyle={styles.content}>
          <Card>
            <Text style={styles.title}>Log eerst in</Text>
            <Text style={styles.body}>
              Burgieclan gebruikt hetzelfde VTK-account. Eens ingelogd zie je hier je vakken en
              hun documenten, zonder tweede aanmelding.
            </Text>
            <Button label="Inloggen" onPress={() => router.push('/inloggen')} />
          </Card>
        </ScrollView>
      </>
    );
  }

  if (!linked || resource.data?.available === false) {
    return (
      <>
        {head}
        <Empty
          title="Burgieclan staat hier nog niet"
          hint="Op burgieclan.vtk.be wel, met hetzelfde VTK-account."
          action={{ label: 'Naar burgieclan.vtk.be', onPress: () => void WebBrowser.openBrowserAsync('https://burgieclan.vtk.be') }}
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
        next ? 'Niet bij je vakken gezet' : 'Niet uit je vakken gehaald',
        messageFor(error instanceof Error ? error : null),
      );
    } finally {
      setPending(null);
    }
  };

  const searching = query.trim().length >= 2;
  const favourites = (resource.data?.courses ?? []).filter((course) => overrides[course.id] ?? true);

  return (
    <>
      {head}
      <SearchField
        value={query}
        onChange={setQuery}
        placeholder="Zoek een vak op naam of code"
        label="Vakken zoeken"
        style={styles.search}
      />
      <ScrollView
        style={styles.root}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        refreshControl={
          <RefreshControl refreshing={resource.refreshing} onRefresh={() => void resource.refresh()} />
        }
      >
        {resource.stale ? <StaleNotice onRetry={() => void resource.refresh()} /> : null}

        {searching ? (
          <View style={styles.block}>
            <SectionHeading>Gevonden</SectionHeading>
            {search.loading && search.courses.length === 0 ? (
              <ActivityIndicator color={COLORS.navy} style={styles.spinner} />
            ) : search.error ? (
              <Text style={styles.hint}>{search.error}</Text>
            ) : search.courses.length === 0 ? (
              <Text style={styles.hint}>Geen vak gevonden voor {`“${query.trim()}”`}.</Text>
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
          <Loading label="Je vakken ophalen" />
        ) : !resource.data ? (
          <ErrorState message={messageFor(resource.error)} onRetry={() => void resource.refresh()} />
        ) : (
          <View style={styles.block}>
            <SectionHeading>Jouw vakken</SectionHeading>
            {favourites.length === 0 ? (
              <Text style={styles.hint}>
                Zoek je vakken hierboven en tik op de ster. Ze staan dan hier, en op Burgieclan bij
                Mijn vakken.
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
          title="Op Burgieclan"
          links={[
            {
              label: 'Een document opladen',
              hint: 'burgieclan.vtk.be',
              external: true,
              onPress: () => void WebBrowser.openBrowserAsync(resource.data?.burgieclanUrl ?? 'https://burgieclan.vtk.be'),
            },
          ]}
        />
      </ScrollView>
    </>
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
              accessibilityLabel={`${course.name}, ${course.documentCount} documenten`}
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
              accessibilityLabel={starred ? `${course.name} uit je vakken halen` : `${course.name} bij je vakken zetten`}
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
    course.documentCount === 1 ? '1 document' : `${course.documentCount} documenten`,
    course.credits ? `${course.credits} sp` : null,
    course.semesters.length > 0 ? course.semesters.join(', ') : null,
  ];
  return parts.filter(Boolean).join(' · ');
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.paper },
  content: { padding: SPACING.xl - 4, gap: SPACING.xl, paddingBottom: SPACING.xxl },
  flex: { flex: 1 },
  block: { gap: SPACING.md },
  search: { marginHorizontal: SPACING.xl - 4 },
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
