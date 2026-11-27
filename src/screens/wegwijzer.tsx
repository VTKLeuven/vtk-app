import { Image } from 'expo-image';
import * as WebBrowser from 'expo-web-browser';
import { useEffect, useMemo, useState } from 'react';
import { Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { PageHead } from '../components/PageHead';
import { Sheet } from '../components/planning/PlanningSheets';
import { SearchField } from '../components/SearchField';
import { Empty, Loading } from '../components/ui';
import { InteractiveFloorplan } from '../floorplan/InteractiveFloorplan';
import { getCategoryColor } from '../floorplan/theme';
import type { ExportedBooth, ExportedFloorplanData } from '../floorplan/types';
import { getPref, setPref } from '../storage';
import { COLORS, FONTS, RADIUS, SPACING, TYPE } from '../theme/tokens';

/** De jobfair op de site van Career; het grondplan komt van daar. */
const CAREER = 'https://www.career.vtk.be';
const EVENT = 'vtk-jobfair';
const CACHE_KEY = `wegwijzer:${EVENT}`;

type State =
  | { kind: 'loading' }
  | { kind: 'ready'; data: ExportedFloorplanData; offline: boolean }
  | { kind: 'missing' };

/**
 * Wegwijzer: het grondplan van de VTK Jobfair, met elk bedrijf op zijn stand.
 * Overgenomen uit vtk-floorplan-app (november 2026) en in het ontwerp van de app
 * gezet: knijpen en slepen op het plan, zoeken op een bedrijf, filteren op je
 * masterrichting, en per bedrijf wie er staat, wat ze zoeken en hun site.
 *
 * **Werkt ook zonder netwerk**: in een volle beurshal valt het netwerk weg, dus
 * het laatst opgehaalde plan blijft op het toestel. De gegevens komen van
 * `/api/events/<event>/floorplan` op career.vtk.be; zolang Career het grondplan
 * niet publiek zet, zegt dit scherm dat het er nog niet is.
 *
 * De kop blijft hier staan: het plan zelf is een vlak om in te zoomen en te
 * slepen, geen pagina die scrolt.
 */
export default function WegwijzerScreen() {
  const [state, setState] = useState<State>({ kind: 'loading' });
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<number | null>(null);
  const [selected, setSelected] = useState<ExportedBooth | null>(null);
  const [searched, setSearched] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    const cached = readCache();
    fetch(`${CAREER}/api/events/${EVENT}/floorplan`, { headers: { Accept: 'application/json' } })
      .then(async (response) => {
        if (!response.ok) throw new Error(String(response.status));
        const data = (await response.json()) as ExportedFloorplanData;
        if (!data?.svg || !Array.isArray(data.booths)) throw new Error('leeg');
        setPref(CACHE_KEY, JSON.stringify(data));
        if (!cancelled) setState({ kind: 'ready', data, offline: false });
      })
      .catch(() => {
        if (cancelled) return;
        setState(cached ? { kind: 'ready', data: cached, offline: true } : { kind: 'missing' });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const data = state.kind === 'ready' ? state.data : null;

  const categories = useMemo(() => {
    const map = new Map<number, string>();
    for (const booth of data?.booths ?? []) {
      for (const master of booth.company?.category ?? []) map.set(master.id, master.short_name || master.name);
    }
    return [...map.entries()].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name));
  }, [data]);

  const results = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle || !data) return [];
    return data.booths
      .filter((booth) => booth.company && booth.company.name.toLowerCase().includes(needle))
      .sort((a, b) => (a.company!.name < b.company!.name ? -1 : 1))
      .slice(0, 8);
  }, [query, data]);

  const pick = (booth: ExportedBooth) => {
    setQuery('');
    setSearched(booth.id);
    setSelected(booth);
  };

  return (
    <View style={styles.root}>
      <PageHead title="Wegwijzer" subtitle="Het grondplan van de VTK Jobfair">
        {data ? (
          <SearchField value={query} onChange={setQuery} placeholder="Zoek een bedrijf" label="Zoek een bedrijf op de jobfair" />
        ) : null}
      </PageHead>

      {state.kind === 'loading' ? <Loading label="Grondplan ophalen" /> : null}
      {state.kind === 'missing' ? (
        <Empty
          title="Het grondplan staat nog niet online"
          hint="Zodra Career het grondplan van de jobfair publiceert, zie je hier elk bedrijf op zijn stand. Eens opgehaald, werkt het ook zonder netwerk."
          action={{ label: 'Naar career.vtk.be', onPress: () => void WebBrowser.openBrowserAsync(`${CAREER}/event/${EVENT}`) }}
        />
      ) : null}

      {data ? (
        <>
          {categories.length > 0 ? (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={styles.filters}
              contentContainerStyle={styles.filterRow}
            >
              {[{ id: null as number | null, name: 'Alle richtingen' }, ...categories].map((item) => {
                const active = item.id === category;
                return (
                  <Pressable
                    key={item.id ?? 'alle'}
                    accessibilityRole="button"
                    accessibilityState={{ selected: active }}
                    onPress={() => setCategory(item.id)}
                    style={[styles.filter, active && styles.filterActive]}
                  >
                    {item.id !== null ? <View style={[styles.dot, { backgroundColor: getCategoryColor(item.id) }]} /> : null}
                    <Text style={[styles.filterLabel, active && styles.filterLabelActive]}>{item.name}</Text>
                  </Pressable>
                );
              })}
            </ScrollView>
          ) : null}

          {state.kind === 'ready' && state.offline ? (
            <Text style={styles.offline}>Geen netwerk: je ziet het laatst opgehaalde plan.</Text>
          ) : null}

          <View style={styles.map}>
            <InteractiveFloorplan
              data={data}
              selectedBoothId={selected?.id ?? null}
              selectedCategoryId={category}
              searchedBoothId={searched}
              onSelectBooth={(booth) => setSelected(booth)}
            />
            {results.length > 0 ? (
              <View style={styles.results}>
                {results.map((booth, index) => (
                  <Pressable
                    key={booth.id}
                    accessibilityRole="button"
                    onPress={() => pick(booth)}
                    style={({ pressed }) => [styles.result, index > 0 && styles.divider, pressed && styles.pressed]}
                  >
                    <Text style={styles.resultName} numberOfLines={1}>
                      {booth.company!.name}
                    </Text>
                    <Text style={styles.stand}>Stand {booth.booth_number}</Text>
                  </Pressable>
                ))}
              </View>
            ) : null}
          </View>
        </>
      ) : null}

      <CompanySheet booth={selected} onClose={() => setSelected(null)} />
    </View>
  );
}

function readCache(): ExportedFloorplanData | null {
  try {
    const raw = getPref(CACHE_KEY);
    return raw ? (JSON.parse(raw) as ExportedFloorplanData) : null;
  } catch {
    return null;
  }
}

/** HTML uit het CMS van Career naar platte tekst. */
function plain(html: string | null | undefined): string {
  return (html ?? '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function CompanySheet({ booth, onClose }: { booth: ExportedBooth | null; onClose: () => void }) {
  const company = booth?.company ?? null;
  const description = plain(company?.long_description || company?.short_description);
  return (
    <Sheet
      visible={booth !== null}
      title={company ? company.name : booth ? `Stand ${booth.booth_number}` : ''}
      onClose={onClose}
    >
      {booth && !company ? <Text style={styles.body}>Op deze stand staat (nog) geen bedrijf.</Text> : null}
      {company && booth ? (
        <View style={styles.sheet}>
          <View style={styles.sheetHead}>
            {company.logo_url ? (
              <Image source={{ uri: company.logo_url }} style={styles.logo} contentFit="contain" />
            ) : null}
            <View style={styles.flex}>
              <Text style={styles.stand}>Stand {booth.booth_number}</Text>
              {company.location ? <Text style={styles.hint}>{company.location}</Text> : null}
            </View>
          </View>

          {company.category?.length ? (
            <View style={styles.chips}>
              {company.category.map((master) => (
                <View key={master.id} style={styles.chip}>
                  <View style={[styles.dot, { backgroundColor: getCategoryColor(master.id) }]} />
                  <Text style={styles.chipLabel}>{master.short_name || master.name}</Text>
                </View>
              ))}
            </View>
          ) : null}

          {description ? <Text style={styles.body}>{description}</Text> : null}

          {company.vacancies?.length ? (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Vacatures</Text>
              {company.vacancies.map((vacancy) => (
                <Pressable
                  key={vacancy.id}
                  accessibilityRole={vacancy.url ? 'link' : undefined}
                  disabled={!vacancy.url}
                  onPress={() => vacancy.url && void WebBrowser.openBrowserAsync(vacancy.url)}
                  style={({ pressed }) => [styles.item, pressed && styles.pressed]}
                >
                  <Text style={styles.itemTitle}>{vacancy.title}</Text>
                  <Text style={styles.hint}>{[vacancy.type, vacancy.location].filter(Boolean).join(' · ')}</Text>
                </Pressable>
              ))}
            </View>
          ) : null}

          {company.representatives?.length ? (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Aanwezig</Text>
              {company.representatives.map((person) => (
                <View key={person.id} style={styles.item}>
                  <Text style={styles.itemTitle}>{[person.first_name, person.last_name].filter(Boolean).join(' ')}</Text>
                  {person.title ? <Text style={styles.hint}>{person.title}</Text> : null}
                  <View style={styles.contact}>
                    {person.email ? (
                      <Text style={styles.link} onPress={() => void Linking.openURL(`mailto:${person.email}`)}>
                        {person.email}
                      </Text>
                    ) : null}
                    {person.tel ? (
                      <Text style={styles.link} onPress={() => void Linking.openURL(`tel:${person.tel}`)}>
                        {person.tel}
                      </Text>
                    ) : null}
                  </View>
                </View>
              ))}
            </View>
          ) : null}

          {company.website ? (
            <Pressable
              accessibilityRole="link"
              onPress={() => void WebBrowser.openBrowserAsync(company.website!)}
              style={({ pressed }) => [styles.website, pressed && styles.pressed]}
            >
              <Text style={styles.websiteLabel}>Naar hun website</Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.paper },
  flex: { flex: 1 },
  pressed: { opacity: 0.6 },
  hint: { ...TYPE.small, color: COLORS.muted },
  body: { ...TYPE.body, color: COLORS.body },

  filters: { flexGrow: 0, marginTop: SPACING.md },
  filterRow: { gap: SPACING.sm, paddingHorizontal: SPACING.lg },
  filter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    height: 36,
    paddingHorizontal: 14,
    borderRadius: RADIUS.pill,
    backgroundColor: COLORS.surface,
  },
  filterActive: { backgroundColor: COLORS.navy },
  filterLabel: { fontFamily: FONTS.semibold, fontSize: 13, color: COLORS.navy },
  filterLabelActive: { color: COLORS.yellow },
  dot: { width: 8, height: 8, borderRadius: 4 },
  offline: { ...TYPE.small, color: COLORS.muted, paddingHorizontal: SPACING.lg, marginTop: SPACING.sm },

  map: { flex: 1, marginTop: SPACING.md, borderTopLeftRadius: 24, borderTopRightRadius: 24, overflow: 'hidden' },
  results: {
    position: 'absolute',
    top: SPACING.sm,
    left: SPACING.md,
    right: SPACING.md,
    borderRadius: 18,
    backgroundColor: COLORS.surface,
    overflow: 'hidden',
  },
  result: { flexDirection: 'row', alignItems: 'center', gap: SPACING.md, paddingVertical: 12, paddingHorizontal: SPACING.lg },
  divider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: COLORS.line2 },
  resultName: { flex: 1, fontFamily: FONTS.semibold, fontSize: 15, color: COLORS.ink },
  stand: { fontFamily: FONTS.bold, fontSize: 13, color: COLORS.navy },

  sheet: { gap: SPACING.lg },
  sheetHead: { flexDirection: 'row', alignItems: 'center', gap: SPACING.md },
  logo: { width: 56, height: 56, borderRadius: 12, backgroundColor: COLORS.surface },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: RADIUS.pill,
    backgroundColor: COLORS.paper2,
  },
  chipLabel: { fontFamily: FONTS.semibold, fontSize: 12, color: COLORS.navy },
  section: { gap: SPACING.sm },
  sectionTitle: { ...TYPE.kicker, color: COLORS.muted },
  item: { gap: 2, paddingVertical: 6 },
  itemTitle: { fontFamily: FONTS.semibold, fontSize: 15, color: COLORS.ink },
  contact: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.md, marginTop: 2 },
  link: { fontFamily: FONTS.medium, fontSize: 14, color: COLORS.navy, textDecorationLine: 'underline' },
  website: {
    height: 48,
    borderRadius: RADIUS.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.navy,
  },
  websiteLabel: { fontFamily: FONTS.bold, fontSize: 15, color: COLORS.yellow },
});
