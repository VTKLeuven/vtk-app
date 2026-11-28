import { useRouter } from 'expo-router';
import { X } from 'lucide-react-native';
import { useState } from 'react';
import { ActivityIndicator, Linking, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { WebView, type WebViewNavigation } from 'react-native-webview';

import { COLORS, FONTS, SPACING } from '../theme/tokens';
import { HeadButton, useStatusBar } from './PageHead';
import { t } from '../i18n';

const IN_WEBVIEW_SCHEMES = new Set(['http:', 'https:', 'about:', 'data:', 'blob:']);

/**
 * HTTPS-links die als Android App Link / iOS Universal Link een externe app
 * moeten openen in plaats van in deze WebView te laden.
 *
 * KU Leuven Authenticator (`be.kuleuven.icts.authenticator`) gebruikt een
 * `https://`-App Link op `icts.kuleuven.be/apps/authenticator/...`. Laadt die
 * URL in de WebView zelf, dan toont KU Leuven de terugvalpagina "KU Leuven
 * Authenticator cannot be opened". Door ze aan `Linking.openURL` te geven,
 * opent het OS de app en blijft de loginpagina op `idp.kuleuven.be` (inclusief
 * haar WebSocket) gewoon openstaan.
 */
const EXTERNAL_APP_LINKS: readonly RegExp[] = [
  /^https:\/\/icts\.kuleuven\.be\/apps\/authenticator\//i,
];

function getUrlScheme(url: string): string | null {
  const match = /^([a-z][a-z0-9+.-]*:)/i.exec(url);
  return match ? match[1].toLowerCase() : null;
}

/**
 * Opent een Android `intent://`-URL via het besturingssysteem.
 *
 * Sommige Android-toestellen weigeren de ruwe `intent://`-URI rechtstreeks via
 * `Linking.openURL`. In dat geval valt deze helper terug op het uitpakken van
 * `scheme=...` en desnoods `S.browser_fallback_url=...` uit het
 * `#Intent;...;end`-blok.
 */
async function openIntentUrl(url: string): Promise<void> {
  try {
    await Linking.openURL(url);
    return;
  } catch {
    // Val terug op het parsen van `#Intent;...;end`.
  }

  const hashIndex = url.indexOf('#Intent;');
  if (hashIndex === -1) return;

  const beforeIntent = url.slice(0, hashIndex);
  const pathWithoutIntentPrefix = beforeIntent.replace(/^intent:\/\//i, '');
  const paramsPart = url.slice(hashIndex + '#Intent;'.length);

  let scheme: string | null = null;
  let fallbackUrl: string | null = null;

  for (const part of paramsPart.split(';')) {
    if (part === 'end') break;
    if (part.startsWith('scheme=')) {
      scheme = part.slice('scheme='.length);
    } else if (part.startsWith('S.browser_fallback_url=')) {
      const raw = part.slice('S.browser_fallback_url='.length);
      try {
        fallbackUrl = decodeURIComponent(raw);
      } catch {
        fallbackUrl = raw;
      }
    }
  }

  if (scheme) {
    try {
      await Linking.openURL(`${scheme}://${pathWithoutIntentPrefix}`);
      return;
    } catch {
      // Val door naar de eventuele browser-fallback.
    }
  }

  if (fallbackUrl) {
    try {
      await Linking.openURL(fallbackUrl);
    } catch {
      // Geen app of browser kon de fallback openen.
    }
  }
}

/**
 * Laat gewone webpagina's in de WebView laden en geeft eigen app-schema's
 * (zoals KU Leuven Authenticator of `intent://` op Android) door aan het OS,
 * zodat ze niet stuklopen op `ERR_UNKNOWN_URL_SCHEME`.
 */
export function handleShouldStartLoad(requestUrl: string): boolean {
  if (EXTERNAL_APP_LINKS.some((pattern) => pattern.test(requestUrl))) {
    void Linking.openURL(requestUrl).catch(() => {});
    return false;
  }

  const scheme = getUrlScheme(requestUrl);
  if (!scheme || IN_WEBVIEW_SCHEMES.has(scheme)) return true;

  if (scheme === 'intent:') {
    void openIntentUrl(requestUrl);
    return false;
  }

  void Linking.openURL(requestUrl).catch(() => {});
  return false;
}

/**
 * Een stuk website in de app.
 *
 * Bewust beperkt tot drie soorten schermen, en die drie hebben allemaal dezelfde
 * reden: ze horen bij de identiteit of bij het geld, en die willen we níét
 * nabouwen.
 *
 * - **inloggen**, want daar hangt KU Leuven-SSO aan. Een eigen loginformulier
 *   zou dat moeten nadoen, en dan bouw je een tweede plek waar wachtwoorden
 *   langskomen.
 * - **onboarding en studiebevestiging**, de twee poorten uit `proxy.ts`.
 * - **betalen** (sinds november 2026): de bestelpagina van vtk.be en Mollie. In
 *   de systeembrowser ging dat mis, want die heeft het toegangscookie van de
 *   bestelling en je login niet; deze WebView deelt ze met `fetch`. Een bankapp
 *   (Bancontact, Payconiq) opent via `handleShouldStartLoad` buiten de app.
 *
 * Alles wat gewone inhoud is, wordt native. Een WebView is hier geen manier om
 * werk uit te stellen; staat er iets in dat er niet in hoort, dan is dat een bug.
 */
export function WebFlow({
  url,
  title,
  /** Klaar zodra de WebView hier langskomt. Krijgt de nieuwe URL. */
  isDone,
  onDone,
  onClose,
  markAsApp = false,
}: {
  url: string;
  title: string;
  isDone: (url: string) => boolean;
  onDone: () => void;
  /** Wat het kruisje doet; standaard terug in de stack. */
  onClose?: () => void;
  /** Zet `data-vtk-app`, zodat een pagina van vtk.be haar kop en voet weglaat. */
  markAsApp?: boolean;
}) {
  const router = useRouter();
  useStatusBar('dark');
  const insets = useSafeAreaInsets();
  const [loading, setLoading] = useState(true);

  const handleNavigation = (event: WebViewNavigation) => {
    if (event.loading) return;
    if (isDone(event.url)) onDone();
  };

  return (
    <View style={styles.root}>
      <View style={[styles.bar, { paddingTop: insets.top + SPACING.sm }]}>
        <Text style={styles.title}>{title}</Text>
        <HeadButton accessibilityLabel={t('Sluiten', 'Close')} onPress={onClose ?? (() => router.back())}>
          <X color={COLORS.ink} size={21} />
        </HeadButton>
      </View>

      <WebView
        // Zonder dit krijgt de WebView op iOS een vertraging van 0 mee en stopt
        // scrollen meteen, alsof het vastklikt.
        decelerationRate="normal"
        source={{ uri: url }}
        originWhitelist={['*']}
        // Houdt `target="_blank"` en `window.open()` in deze WebView zodat
        // externe SSO- en authenticatorlinks langs `onShouldStartLoadWithRequest`
        // passeren in plaats van stil te verdwijnen.
        setSupportMultipleWindows={false}
        injectedJavaScriptBeforeContentLoaded={markAsApp ? MARK_AS_APP : undefined}
        onShouldStartLoadWithRequest={(request) => handleShouldStartLoad(request.url)}
        onNavigationStateChange={handleNavigation}
        onLoadEnd={() => setLoading(false)}
        onLoadStart={() => setLoading(true)}
        // Zonder dit deelt de WebView op iOS zijn cookies niet met `fetch`, en
        // dan is de app na het inloggen nog steeds uitgelogd.
        sharedCookiesEnabled
        thirdPartyCookiesEnabled
        style={styles.web}
      />

      {loading ? (
        <View style={styles.loading} pointerEvents="none">
          <ActivityIndicator color={COLORS.strong} />
        </View>
      ) : null}
    </View>
  );
}

/** Zelfde vlag als in `web.tsx`; `true;` is wat iOS verwacht. */
const MARK_AS_APP = `document.documentElement.setAttribute('data-vtk-app', '');true;`;

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.paper },
  bar: {
    backgroundColor: COLORS.paper,
    paddingHorizontal: SPACING.lg,
    paddingBottom: SPACING.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: SPACING.md,
  },
  title: { fontFamily: FONTS.bold, fontSize: 20, letterSpacing: -0.5, color: COLORS.ink, flexShrink: 1 },
  web: { flex: 1, backgroundColor: COLORS.paper },
  loading: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
