
import * as WebBrowser from 'expo-web-browser';
import { ExternalLink } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';

import { baseUrl } from '../api/client';
import { search } from '../api/endpoints';
import { nativeRouteFor } from '../nativeRoute';
import type { AppSearchResult } from '../api/contract';
import { PageHead } from '../components/PageHead';
import { SearchField } from '../components/SearchField';
import { Empty, Loading } from '../components/ui';
import { useApp } from '../state/app';
import { useTabRouter } from '../navigation';
import { COLORS, SPACING, TYPE } from '../theme/tokens';
import { CARD_SHADOW } from '../components/HomeSection';

/** Wachttijd voor een getikte letter een zoekopdracht wordt. */
const DEBOUNCE_MS = 350;

/**
 * Zoeken op de site.
 *
 * Bewust geen `useResource`: dit zoekt bij elke aanslag opnieuw en heeft dus
 * geen leescache nodig; wat er gisteren gevonden werd, wil niemand terugzien.
 * De vertraging van 350 ms bestaat om niet per letter een zoekopdracht te doen,
 * en de teller `sequence` zorgt dat een traag antwoord op "gala" nooit een
 * sneller antwoord op "galabal" overschrijft.
 */
export default function ZoekenScreen() {
  const router = useTabRouter();
  const { locale } = useApp();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<AppSearchResult[]>([]);
  const [searched, setSearched] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const term = query.trim();
    if (term.length < 2) {
      setResults([]);
      setSearched(false);
      return;
    }

    let current = true;
    setBusy(true);
    const timer = setTimeout(() => {
      search(locale, term)
        .then((outcome) => {
          if (!current) return;
          setResults(outcome.results);
          setSearched(outcome.searched);
        })
        .catch(() => {
          if (current) setResults([]);
        })
        .finally(() => {
          if (current) setBusy(false);
        });
    }, DEBOUNCE_MS);

    return () => {
      current = false;
      clearTimeout(timer);
    };
  }, [query, locale]);

  /**
   * Elk resultaat van vtk.be opent in de app: een evenement, een pagina uit het
   * CMS, een album en een menu-item met een eigen scherm (`nativeRouteFor`) op
   * hun scherm, en wat geen scherm heeft (een formulier, het contact) als pagina
   * van vtk.be in de app (`web.tsx`). Enkel een andere site (het
   * uitleenmateriaal op logistiek.vtk.be, een externe link) gaat naar de
   * browser. Tot november 2026 opende alles behalve een evenement in de browser.
   */
  const open = (result: AppSearchResult) => {
    if (result.kind === 'event') {
      router.push(`/evenement/${result.id}`);
      return;
    }
    const route = inAppRoute(result);
    if (route) {
      const [pathname, query] = route.split('?');
      router.push(query ? { pathname, params: Object.fromEntries(new URLSearchParams(query)) } : pathname);
      return;
    }
    const href = absolute(result.href);
    if (isSite(href)) {
      router.push({ pathname: '/web', params: { url: href, title: result.title } });
      return;
    }
    void WebBrowser.openBrowserAsync(href);
  };

  return (
    <>
      <PageHead title="Zoeken" subtitle="Pagina's, activiteiten en albums" />

      <SearchField
        value={query}
        onChange={setQuery}
        placeholder="Waar zoek je naar?"
        label="Zoekterm"
        autoFocus
      />

      {busy && results.length === 0 ? <Loading label="Zoeken" /> : null}

      <FlatList
        data={results}
        keyExtractor={(result) => `${result.kind}:${result.id}`}
        style={styles.root}
        contentContainerStyle={styles.list}
        keyboardDismissMode="on-drag"
        renderItem={({ item }) => (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={item.title}
            onPress={() => open(item)}
            style={({ pressed }) => [styles.row, pressed && styles.pressed]}
          >
            <View style={styles.text}>
              <Text style={styles.title}>{item.title}</Text>
              {item.meta ? <Text style={styles.meta}>{item.meta}</Text> : null}
              {item.snippet ? (
                <Text style={styles.snippet} numberOfLines={2}>
                  {item.snippet}
                </Text>
              ) : null}
            </View>
            {leavesApp(item) ? <ExternalLink color={COLORS.muted} size={16} /> : null}
          </Pressable>
        )}
        ListEmptyComponent={
          busy ? undefined : searched ? (
            <Empty title="Niets gevonden" hint={`Geen resultaten voor "${query.trim()}".`} />
          ) : (
            <Empty title="Typ om te zoeken" hint="Vanaf twee letters gaat de zoektocht van start." />
          )
        }
      />
    </>
  );
}

/** Hoort dit adres bij de site waar de app mee praat (of bij vtk.be)? */
function isSite(href: string): boolean {
  try {
    const host = new URL(href).host;
    return host === new URL(baseUrl()).host || host === 'vtk.be' || host === 'www.vtk.be';
  } catch {
    return false;
  }
}

/**
 * Het scherm in de app voor een zoekresultaat van vtk.be, of `null`.
 *
 * Een pagina staat op `/<tab>/<slug>` of `/p/<slug>`, een album op
 * `/media/<slug>`, beide eventueel met `/en` ervoor. Een menu-item (`link`) is
 * een vast adres zoals `/piano`; dat vertaalt `nativeRouteFor`, net als in Meer.
 */
function inAppRoute(result: AppSearchResult): string | null {
  const href = absolute(result.href);
  // Cudi en een andere site: `nativeRouteFor` kent de winkel van cudi, al de rest is extern.
  if (!isSite(href)) return nativeRouteFor(href);
  let path: string;
  try {
    path = new URL(href).pathname.replace(/^\/en(?=\/|$)/, '').replace(/\/+$/, '');
  } catch {
    return null;
  }
  const native = nativeRouteFor(path || '/');
  if (native) return native;
  const parts = path.split('/').filter(Boolean);
  if (result.kind === 'album' && parts[0] === 'media' && parts.length === 2) return `/album/${parts[1]}`;
  if ((result.kind === 'page' || result.kind === 'link') && parts.length === 2 && parts[0] !== 'media') {
    return `/pagina/${parts[1]}`;
  }
  return null;
}

/** Gaat dit resultaat naar een andere site? Enkel dan het pijltje naar buiten. */
function leavesApp(result: AppSearchResult): boolean {
  return result.kind !== 'event' && inAppRoute(result) === null && !isSite(absolute(result.href));
}

/** Een menu-item komt soms als pad binnen ("/piano"); dat hoort bij de site. */
function absolute(href: string): string {
  return href.startsWith('/') ? `${baseUrl()}${href}` : href;
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.paper },
  list: { padding: SPACING.lg, gap: SPACING.md, paddingBottom: SPACING.xxl },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
    backgroundColor: COLORS.surface,
    borderRadius: 20,
    padding: SPACING.lg,
    ...CARD_SHADOW,
  },
  pressed: { backgroundColor: COLORS.paper2 },
  text: { flex: 1, gap: 2 },
  title: { ...TYPE.cardTitle, color: COLORS.ink },
  meta: { ...TYPE.small, color: COLORS.muted },
  snippet: { ...TYPE.small, color: COLORS.body },
});
