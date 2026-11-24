import * as WebBrowser from 'expo-web-browser';
import { useLocalSearchParams } from 'expo-router';
import { RotateCw } from 'lucide-react-native';
import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import { WebView, type WebViewNavigation } from 'react-native-webview';

import { baseUrl } from '../api/client';
import { PageHead } from '../components/PageHead';
import { handleShouldStartLoad } from '../components/WebFlow';
import { Empty } from '../components/ui';
import { COLORS } from '../theme/tokens';

/**
 * Een pagina van vtk.be of cudi in de app, onder een gewone kop met terugknop.
 *
 * **Waarvoor, en waarvoor niet.** Regel 2 zegt: alles native, behalve identiteit
 * en geld. Dit scherm is de uitzondering die daar sinds november 2026 bij kwam,
 * en ze is smal:
 *
 * - **De admin** (Meer › Beheer), voor wie er rechten heeft. Het dashboard en de
 *   lijst van onderdelen zijn native; een onderdeel zelf (tabellen, formulieren,
 *   bevestigingen, tientallen schermen met hun eigen regels) opent hier. Die
 *   nabouwen zou ze op twee plaatsen laten leven.
 * - **Twee stappen op cudi** die bij je account horen: de voorwaarden aanvaarden
 *   en je vakken aanduiden. Eén keer, en daarna doet de app de rest native.
 *
 * Een pagina van de site of van cudi krijgt `data-vtk-app` op `<html>` nog voor
 * ze laadt; de site laat dan haar kop, voet en adminzijbalk weg
 * (`html[data-vtk-app]` in vtk-site-chrome.css en vtk-admin.css), cudi zijn kop
 * en voet (`[data-vtk-chrome]` in zijn globals.css). De app tekent
 * die zelf, en twee koppen boven elkaar is precies de "website in een kader"
 * die we niet willen.
 *
 * Enkel vtk.be en zijn subdomeinen openen hier; een link naar elders (een
 * rekenblad in Drive) gaat naar de browser. Zo kan een adres in een pushbericht
 * of een link geen willekeurige site in de huisstijl van de app zetten, met je
 * sessiecookie erbij.
 */
export default function WebScreen() {
  const { url, title } = useLocalSearchParams<{ url?: string; title?: string }>();
  // Herladen monteert de WebView opnieuw en begint bij de pagina die je opende.
  const [nonce, setNonce] = useState(0);
  const [loading, setLoading] = useState(true);

  const target = typeof url === 'string' ? url : '';
  if (!isAllowed(target)) {
    return (
      <>
        <PageHead title={title ?? 'vtk.be'} />
        <Empty title="Deze pagina opent niet in de app" hint="Enkel pagina's van vtk.be openen hier." />
      </>
    );
  }

  const site = sameOrigin(target, baseUrl());
  // De site en cudi volgen allebei de vlag (cudi verbergt dan `[data-vtk-chrome]`).
  const flag = site || isAllowed(target);

  const shouldStart = (requestUrl: string): boolean => {
    if (!/^https?:/i.test(requestUrl)) return handleShouldStartLoad(requestUrl);
    // Op de site blijft alles van de site hier; een link naar buiten gaat naar de browser.
    // Op cudi moet de login langs vtk.be en KU Leuven kunnen lopen, dus daar niet.
    if (site && !sameOrigin(requestUrl, baseUrl())) {
      void WebBrowser.openBrowserAsync(requestUrl);
      return false;
    }
    return handleShouldStartLoad(requestUrl);
  };

  return (
    <View style={styles.root}>
      <PageHead
        compact
        title={title ?? 'vtk.be'}
        right={
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Herladen"
            onPress={() => setNonce((n) => n + 1)}
            hitSlop={10}
          >
            <RotateCw color={COLORS.yellow} size={19} />
          </Pressable>
        }
      />
      <WebView
        key={nonce}
        source={{ uri: target }}
        originWhitelist={['*']}
        setSupportMultipleWindows={false}
        injectedJavaScriptBeforeContentLoaded={flag ? MARK_AS_APP : undefined}
        onShouldStartLoadWithRequest={(request) => shouldStart(request.url)}
        onNavigationStateChange={(event: WebViewNavigation) => setLoading(event.loading)}
        onLoadEnd={() => setLoading(false)}
        sharedCookiesEnabled
        thirdPartyCookiesEnabled
        style={styles.web}
      />
      {loading ? (
        <View style={styles.loading} pointerEvents="none">
          <ActivityIndicator color={COLORS.navy} />
        </View>
      ) : null}
    </View>
  );
}

/** Zet de vlag waarop de site haar eigen kop en zijbalk weglaat. `true;` is wat iOS verwacht. */
const MARK_AS_APP = `document.documentElement.setAttribute('data-vtk-app', '');true;`;

function host(value: string): string | null {
  try {
    return new URL(value).host.toLowerCase();
  } catch {
    return null;
  }
}

function sameOrigin(a: string, b: string): boolean {
  try {
    return new URL(a).origin === new URL(b).origin;
  } catch {
    return false;
  }
}

/** vtk.be, zijn subdomeinen (cudi, logistiek) en de server waar de app mee praat. */
function isAllowed(value: string): boolean {
  if (!/^https?:\/\//i.test(value)) return false;
  const h = host(value);
  if (!h) return false;
  return h === 'vtk.be' || h.endsWith('.vtk.be') || h === host(baseUrl());
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.paper },
  web: { flex: 1, backgroundColor: COLORS.paper },
  loading: { position: 'absolute', top: 140, left: 0, right: 0, alignItems: 'center' },
});
