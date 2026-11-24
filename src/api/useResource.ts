import { useCallback, useEffect, useRef, useState } from 'react';

import { NetworkError } from './client';
import { readCache, writeCache } from '../storage';

/**
 * Eén scherm dat gegevens ophaalt.
 *
 * Het patroon is overal hetzelfde: toon wat er in de cache staat, haal daarna op,
 * en zeg het wanneer die verversing niet lukte. Dat laatste is de reden dat dit
 * een eigen hook is en geen losse `useEffect` per scherm: **een scherm dat oude
 * inhoud toont zonder het te zeggen, is erger dan een leeg scherm**, want iemand
 * plant er zijn avond mee.
 *
 * Bewust geen react-query of swr. Wat hier gebeurt is vijftig regels, en een
 * cachebibliotheek erbij zou een dependency zijn die de SDK niet dekt (zie
 * AGENTS.md).
 */
export type Resource<T> = {
  data: T | null;
  /** Eerste ophaling, zonder iets in de cache. */
  loading: boolean;
  /** Ophalen terwijl er al iets op het scherm staat (pull-to-refresh). */
  refreshing: boolean;
  /** Wat je ziet komt uit de cache; de verversing is niet gelukt. */
  stale: boolean;
  error: Error | null;
  /** Omlaag getrokken: zet `refreshing` aan, zodat de spinner blijft staan. */
  refresh: () => Promise<void>;
  /**
   * Stil opnieuw ophalen: na een actie, of bij terugkomen naar het scherm. Raakt
   * `refreshing` niet. Een `RefreshControl` die aangaat zonder dat iemand trok,
   * schuift op iOS de inhoud een spinnerhoogte omlaag zonder spinner te tonen,
   * en die witte strook bleef staan tot je scrolde.
   */
  reload: () => Promise<void>;
};

type ResourceState<T> = {
  key: string;
  enabled: boolean;
  data: T | null;
  hasCache: boolean;
  loading: boolean;
  refreshing: boolean;
  stale: boolean;
  error: Error | null;
};

function initialState<T>(key: string, enabled: boolean): ResourceState<T> {
  if (!enabled) {
    return {
      key,
      enabled: false,
      data: null,
      hasCache: false,
      loading: false,
      refreshing: false,
      stale: false,
      error: null,
    };
  }
  const fromCache = readCache<T>(key);
  return {
    key,
    enabled: true,
    data: fromCache?.value ?? null,
    hasCache: Boolean(fromCache),
    loading: !fromCache,
    refreshing: false,
    stale: false,
    error: null,
  };
}

export function useResource<T>(
  cacheKey: string,
  fetcher: () => Promise<T>,
  /**
   * Verandert dit, dan is het een ander verzoek en begint het scherm opnieuw.
   * Hou het een string; een array of object verandert bij elke render.
   */
  deps: string = '',
  /**
   * `false`: niets ophalen en niets uit de cache lezen; `data` blijft `null`.
   * Voor een hook die onvoorwaardelijk moet draaien maar niet voor iedereen telt.
   */
  enabled: boolean = true,
): Resource<T> {
  const key = `${cacheKey}:${deps}`;
  const [state, setState] = useState<ResourceState<T>>(() => initialState<T>(key, enabled));

  let current = state;
  if (state.key !== key || state.enabled !== enabled) {
    current = initialState<T>(key, enabled);
    setState(current);
  }

  // De fetcher wordt bij elke render opnieuw aangemaakt door de beller; hem in
  // een ref houden voorkomt dat het effect daarop opnieuw draait.
  const fetcherRef = useRef(fetcher);
  useEffect(() => {
    fetcherRef.current = fetcher;
  });

  const seqRef = useRef(0);

  const load = useCallback(
    async (mode: 'initial' | 'refresh' | 'reload') => {
      if (!enabled) return;
      const requestSeq = ++seqRef.current;
      if (mode === 'refresh') {
        setState((prev) => (prev.key === key && prev.enabled ? { ...prev, refreshing: true } : prev));
      }
      try {
        const value = await fetcherRef.current();
        if (seqRef.current !== requestSeq) return;
        writeCache(key, value);
        setState((prev) =>
          prev.key === key && prev.enabled
            ? {
                ...prev,
                data: value,
                hasCache: true,
                loading: false,
                refreshing: false,
                stale: false,
                error: null,
              }
            : prev,
        );
      } catch (caught) {
        if (seqRef.current !== requestSeq) return;
        const failure = caught instanceof Error ? caught : new NetworkError(caught);
        setState((prev) =>
          prev.key === key && prev.enabled
            ? {
                ...prev,
                loading: false,
                refreshing: false,
                // Staat er iets uit de cache, dan blijft dat staan en zeggen we erbij dat
                // het oud is. Staat er niets, dan is dit gewoon een fout.
                stale: prev.hasCache,
                error: failure,
              }
            : prev,
        );
      }
    },
    [key, enabled],
  );

  useEffect(() => {
    if (!enabled) return;
    void load('initial');
    return () => {
      seqRef.current += 1;
    };
  }, [enabled, load]);

  // Stabiel, zodat een scherm `refresh` in de afhankelijkheden van een effect of
  // van `useFocusEffect` kan zetten zonder bij elke render opnieuw op te halen.
  const refresh = useCallback(() => load('refresh'), [load]);
  const reload = useCallback(() => load('reload'), [load]);

  return {
    data: current.data,
    loading: current.loading,
    refreshing: current.refreshing,
    stale: current.stale,
    error: current.error,
    refresh,
    reload,
  };
}

/** De zin die bij een mislukte ophaling hoort. Netwerk en server zijn niet hetzelfde. */
export function messageFor(error: Error | null): string {
  if (!error) return 'Er ging iets mis.';
  if (error instanceof NetworkError || error.name === 'NetworkError') {
    return 'Geen verbinding. Kijk je netwerk na en probeer opnieuw.';
  }
  return error.message;
}
