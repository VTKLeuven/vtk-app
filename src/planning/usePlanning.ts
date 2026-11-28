import { useCallback, useState } from 'react';
import { Alert } from 'react-native';

import type { AppLocale, AppPlanning, AppPlanningOperation } from '../api/contract';
import {
  fetchPlanning,
  planningOperation,
  rotatePlanningFeed,
  subscribePlanning,
  syncPlanning,
  unsubscribePlanning,
} from '../api/endpoints';
import { messageFor, useResource, type Resource } from '../api/useResource';
import { writeCache } from '../storage';
import { t } from '../i18n';

/** De sleutel waaronder `useResource` de planning bewaart (`<cacheKey>:<deps>`). */
const cacheKeyFor = (locale: AppLocale) => `planning:${locale}`;

export type PlanningHandle = {
  resource: Resource<AppPlanning>;
  data: AppPlanning | null;
  busy: boolean;
  /** Eén wijziging; `true` wanneer Burgieclan ze bewaarde. */
  run: (operation: AppPlanningOperation) => Promise<boolean>;
  subscribe: (icsUrl: string) => Promise<boolean>;
  unsubscribe: () => Promise<boolean>;
  sync: () => Promise<boolean>;
  rotateFeed: () => Promise<boolean>;
};

/**
 * De planning van Burgieclan, gelezen en gewijzigd via de site.
 *
 * Elke wijziging antwoordt met de hele planning (zoals op Burgieclan zelf), dus
 * er volgt nooit een tweede aanvraag: het antwoord vervangt wat er staat en gaat
 * meteen in de cache, zodat het evenementscherm en de kalender hetzelfde zien.
 *
 * Afvinken zet het vinkje meteen en draait het terug wanneer het niet lukte. De
 * rest wacht op het antwoord: verbergen of een regel maken verandert wat er op
 * het scherm staat, en dat hoort te kloppen met wat Burgieclan bewaarde.
 */
export function usePlanning(locale: AppLocale): PlanningHandle {
  const resource = useResource('planning', () => fetchPlanning(locale), locale);
  // Het antwoord op een wijziging, samen met de ophaling waarop het volgde. Komt
  // er een verse ophaling (pull-to-refresh, terug naar het scherm), dan wint die.
  const [override, setOverrideState] = useState<{ base: AppPlanning | null; value: AppPlanning | null } | null>(null);
  const [busy, setBusy] = useState(false);

  const data = override && override.base === resource.data ? override.value : resource.data;
  const setOverride = useCallback(
    (value: AppPlanning | null) => setOverrideState({ base: resource.data, value }),
    [resource.data],
  );

  const apply = useCallback(
    async (call: () => Promise<AppPlanning>, optimistic?: AppPlanning): Promise<boolean> => {
      const before = data;
      if (optimistic) setOverride(optimistic);
      setBusy(true);
      try {
        const next = await call();
        setOverride(next);
        writeCache(cacheKeyFor(locale), next);
        return true;
      } catch (error) {
        if (optimistic) setOverride(before);
        Alert.alert(t('Dat lukte niet', 'That did not work'), messageFor(error instanceof Error ? error : null));
        return false;
      } finally {
        setBusy(false);
      }
    },
    [data, locale, setOverride],
  );

  const run = useCallback(
    (operation: AppPlanningOperation) => {
      let optimistic: AppPlanning | undefined;
      if (data && operation.op === 'done') {
        optimistic = {
          ...data,
          sessions: data.sessions.map((s) => (s.uid === operation.uid ? { ...s, done: operation.value } : s)),
        };
      } else if (data && operation.op === 'itemDone') {
        optimistic = {
          ...data,
          items: data.items.map((i) => (i.id === operation.id ? { ...i, done: operation.value } : i)),
        };
      } else if (data?.block && operation.op === 'taskDone') {
        optimistic = {
          ...data,
          block: {
            ...data.block,
            tasks: data.block.tasks.map((t) => (t.id === operation.id ? { ...t, done: operation.value } : t)),
          },
        };
      } else if (data?.personal && operation.op === 'updatePersonal') {
        const { item } = operation;
        const minutes = (time: string | null, fallback: number) => {
          if (!time) return fallback;
          const [h, m] = time.split(':').map(Number);
          return h * 60 + m;
        };
        optimistic = {
          ...data,
          personal: data.personal.map((p) =>
            p.id === operation.id
              ? {
                  ...p,
                  ...item,
                  startMin: item.allDay ? 0 : minutes(item.start, 0),
                  endMin: item.allDay ? 1440 : minutes(item.end, 60),
                }
              : p,
          ),
        };
      } else if (data?.personal && operation.op === 'deletePersonal') {
        optimistic = { ...data, personal: data.personal.filter((p) => p.id !== operation.id) };
      } else if (data?.block && operation.op === 'freeDay') {
        const { date, value } = operation;
        optimistic = {
          ...data,
          block: {
            ...data.block,
            freeDays: value ? [...new Set([...data.block.freeDays, date])] : data.block.freeDays.filter((d) => d !== date),
          },
        };
      }
      return apply(() => planningOperation(locale, operation), optimistic);
    },
    [apply, data, locale],
  );

  return {
    resource,
    data,
    busy,
    run,
    subscribe: useCallback((icsUrl: string) => apply(() => subscribePlanning(locale, icsUrl)), [apply, locale]),
    unsubscribe: useCallback(() => apply(() => unsubscribePlanning(locale)), [apply, locale]),
    sync: useCallback(() => apply(() => syncPlanning(locale)), [apply, locale]),
    rotateFeed: useCallback(() => apply(() => rotatePlanningFeed(locale)), [apply, locale]),
  };
}
