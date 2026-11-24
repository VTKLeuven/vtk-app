import Constants, { ExecutionEnvironment } from 'expo-constants';
import * as Notifications from 'expo-notifications';
import { useFocusEffect, useSegments } from 'expo-router';
import { useCallback, useEffect, useRef } from 'react';
import { AppState, Platform } from 'react-native';

import { apiFetch, appApi } from './api/client';
import type { AppLocale, AppUsageReport } from './api/contract';
import { installId, randomId } from './installId';
import { useCurrentTab } from './navigation';

/**
 * Hoe de app gebruikt wordt, voor Admin › Website › App op de site.
 *
 * De app meldt welke installatie dit is, hoe lang ze op de voorgrond stond en
 * welke schermen er open gingen (`AppUsageReport`, zie docs/app-gebruik.md in
 * vtk-website-new). Bij de start, wanneer ze naar de achtergrond gaat, en om de
 * minuut zolang er iets te melden is.
 *
 * **Er gaat niets naar schijf.** Lukt een rapport niet, dan gaat wat erin zat met
 * het volgende mee; sluit de app eerst, dan is dat stukje weg. Voor statistiek is
 * dat goed genoeg, en zo blijft `storage.ts` zonder schrijfwachtrij.
 *
 * Een sessie is gebruik zonder pauze van een halfuur. Terug op de voorgrond na
 * minder dan een halfuur is dezelfde sessie; na langer een nieuwe.
 */

const SESSION_GAP_MS = 30 * 60 * 1000;
const FLUSH_INTERVAL_MS = 60 * 1000;
/** Zoveel seconden op de voorgrond zonder iets anders te melden, zijn een rapport waard. */
const MIN_SECONDS_TO_REPORT = 30;

type ScreenKey = string;

const state = {
  sessionId: randomId(),
  sessionStartedAt: new Date().toISOString(),
  /** Of de site deze sessie al kent; tot dan gaat er sowieso een rapport. */
  sessionReported: false,
  /** Sinds wanneer de app op de voorgrond staat en nog niet geteld is. */
  activeSince: AppState.currentState === 'active' ? Date.now() : (null as number | null),
  backgroundAt: null as number | null,
  seconds: 0,
  screens: new Map<ScreenKey, { screen: string; tab: string | null; views: number }>(),
  events: [] as { kind: string; at: string }[],
  locale: 'nl' as AppLocale,
  sending: false,
};

/** Een scherm of een tabblad binnen een scherm werd geopend. */
export function trackScreen(screen: string, tab: string | null): void {
  const key = `${tab ?? ''}|${screen}`;
  const entry = state.screens.get(key);
  if (entry) entry.views += 1;
  else state.screens.set(key, { screen, tab, views: 1 });
}

/** Iets in de app zelf, zoals een tik op een pushbericht. */
export function trackEvent(kind: string): void {
  state.events.push({ kind, at: new Date().toISOString() });
}

/**
 * Een tabblad binnen een scherm (Planning, Cursusdienst, Mijn tickets) telt als
 * een eigen scherm: telkens het scherm in beeld komt en telkens het tabblad
 * wisselt. `null` telt niets, voor zolang het tabblad nog niet vaststaat.
 */
export function useTrackView(name: string | null): void {
  const tab = useCurrentTab();
  useFocusEffect(
    useCallback(() => {
      if (name) trackScreen(name, tab);
    }, [name, tab]),
  );
}

function countActive(now: number): void {
  if (state.activeSince !== null) {
    state.seconds += Math.max(0, Math.round((now - state.activeSince) / 1000));
    state.activeSince = now;
  }
}

function updatesInfo(): { updateId: string | null; channel: string | null; runtimeVersion: string | null } {
  try {
    // Pas hier en niet bovenaan: lukt het laden van expo-updates ergens niet,
    // dan mist het rapport enkel de update en valt de app niet om.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const Updates = require('expo-updates') as typeof import('expo-updates');
    return {
      updateId: Updates.updateId ?? null,
      channel: Updates.channel ?? null,
      runtimeVersion: Updates.runtimeVersion ?? null,
    };
  } catch {
    const runtime = Constants.expoConfig?.runtimeVersion;
    return { updateId: null, channel: null, runtimeVersion: typeof runtime === 'string' ? runtime : null };
  }
}

async function pushEnabled(): Promise<boolean | null> {
  try {
    const { status } = await Notifications.getPermissionsAsync();
    return status === 'granted' ? true : status === 'denied' ? false : null;
  } catch {
    return null;
  }
}

function device() {
  const constants = Platform.constants as { Release?: string; Model?: string };
  return {
    platform: Platform.OS === 'ios' ? ('ios' as const) : ('android' as const),
    osVersion: Platform.OS === 'android' ? (constants.Release ?? String(Platform.Version)) : String(Platform.Version),
    deviceModel: Platform.OS === 'android' ? (constants.Model ?? null) : null,
    appVersion: Constants.expoConfig?.version ?? null,
    expoGo: Constants.executionEnvironment === ExecutionEnvironment.StoreClient,
  };
}

/** Stuurt wat er te melden is. Mislukt het, dan gaat alles terug in de wachtrij in het geheugen. */
async function flush(force = false): Promise<void> {
  if (state.sending) return;
  countActive(Date.now());
  const nothing = state.screens.size === 0 && state.events.length === 0 && state.seconds < MIN_SECONDS_TO_REPORT;
  if (!force && state.sessionReported && nothing) return;

  const screens = [...state.screens.values()];
  const events = state.events;
  const seconds = state.seconds;
  state.screens = new Map();
  state.events = [];
  state.seconds = 0;
  state.sending = true;

  const report: AppUsageReport = {
    installId: installId(),
    ...device(),
    ...updatesInfo(),
    locale: state.locale,
    pushEnabled: await pushEnabled(),
    sessionId: state.sessionId,
    sessionStartedAt: state.sessionStartedAt,
    activeSeconds: Math.min(seconds, 86_400),
    screens: screens.slice(0, 200),
    events: events.slice(0, 200),
  };
  const sessionId = state.sessionId;

  try {
    await apiFetch(appApi('/gebruik'), { method: 'POST', body: report, timeout: 15_000 });
    if (state.sessionId === sessionId) state.sessionReported = true;
  } catch {
    // Terug in de wachtrij, bij de volgende keer erbij. Was er intussen een nieuwe
    // sessie, dan telt het voor die: liever dat dan het weggooien.
    for (const entry of screens) {
      const key = `${entry.tab ?? ''}|${entry.screen}`;
      const current = state.screens.get(key);
      if (current) current.views += entry.views;
      else state.screens.set(key, entry);
    }
    state.events = [...events, ...state.events];
    state.seconds += seconds;
  } finally {
    state.sending = false;
  }
}

function startSession(now: number): void {
  state.sessionId = randomId();
  state.sessionStartedAt = new Date(now).toISOString();
  state.sessionReported = false;
}

/** De schermnaam uit de segmenten van expo-router: het routepatroon, zonder groepen. */
export function screenOf(segments: string[]): { screen: string; tab: string | null } | null {
  if (segments.length === 0) return { screen: 'home', tab: '(home)' };
  // De oude adressen verwijzen enkel door; het scherm waar ze op uitkomen telt.
  if (segments[0] === '(oud)') return null;
  const plain = (list: string[]) => list.filter((s) => !(s.startsWith('(') && s.endsWith(')')) && s !== 'index');
  if (segments[0] === '(tabs)') {
    const tab = segments[1] ?? '(home)';
    const rest = plain(segments.slice(2));
    if (rest.length > 0) return { screen: rest.join('/'), tab };
    return { screen: tab === '(home)' ? 'home' : tab, tab };
  }
  const rest = plain(segments);
  return { screen: rest.length > 0 ? rest.join('/') : 'home', tab: null };
}

/**
 * Hangt in de wortel van de app: telt elk scherm dat in beeld komt, houdt de
 * sessie bij en stuurt de rapporten. Tekent niets.
 */
export function UsageTracker({ locale }: { locale: AppLocale }) {
  const segments = useSegments() as string[];
  const key = segments.join('/');
  const last = useRef<string | null>(null);
  // Het scherm dat nu open staat, voor een sessie die begint zonder dat er genavigeerd wordt.
  const segmentsRef = useRef<string[]>([]);

  useEffect(() => {
    state.locale = locale;
  }, [locale]);

  useEffect(() => {
    segmentsRef.current = segments;
    if (key === last.current) return;
    last.current = key;
    const found = screenOf(segments);
    if (found) trackScreen(found.screen, found.tab);
    // `segments` verandert samen met `key`; enkel op die laatste letten.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  useEffect(() => {
    // Het eerste rapport van deze start, een tel later zodat het eerste scherm erbij zit.
    const first = setTimeout(() => void flush(true), 3_000);
    const interval = setInterval(() => {
      if (AppState.currentState === 'active') void flush();
    }, FLUSH_INTERVAL_MS);

    const subscription = AppState.addEventListener('change', (next) => {
      const now = Date.now();
      if (next === 'active') {
        if (state.backgroundAt !== null && now - state.backgroundAt >= SESSION_GAP_MS) {
          startSession(now);
          // Een nieuwe sessie opent op het scherm dat open stond.
          const found = screenOf(segmentsRef.current);
          if (found) trackScreen(found.screen, found.tab);
          setTimeout(() => void flush(true), 1_000);
        }
        state.backgroundAt = null;
        if (state.activeSince === null) state.activeSince = now;
      } else if (state.activeSince !== null || state.backgroundAt === null) {
        countActive(now);
        state.activeSince = null;
        state.backgroundAt = now;
        void flush();
      }
    });

    return () => {
      clearTimeout(first);
      clearInterval(interval);
      subscription.remove();
    };
  }, []);

  return null;
}
