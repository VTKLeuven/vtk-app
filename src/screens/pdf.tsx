import { Directory, File, Paths } from 'expo-file-system';
import { useLocalSearchParams } from 'expo-router';
import * as Sharing from 'expo-sharing';
import { Share } from 'lucide-react-native';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Platform, StyleSheet, View } from 'react-native';
import { WebView } from 'react-native-webview';

import { HeadButton, PageHead } from '../components/PageHead';
import { Empty } from '../components/ui';
import { COLORS } from '../theme/tokens';

/**
 * Een pdf in de app zelf, voor de documenten van Burgieclan (november 2026). Tot
 * dan opende een document in het browservenster van het systeem.
 *
 * Het bestand wordt eerst naar de cache van de app gehaald: de link van
 * Burgieclan is maar tien minuten geldig, en met het bestand lokaal kan je het
 * ook delen of bewaren (de knop rechtsboven).
 *
 * - **iOS** toont een pdf zelf in een WebView, met knijpen om te zoomen en tekst
 *   die je kan selecteren.
 * - **Android** kan dat niet: daar tekent pdf.js de pagina's in een WebView. Het
 *   script komt van jsDelivr; het bestand zelf gaat nergens heen, het wordt als
 *   base64 in de pagina gezet. Een eigen native pdf-module zou niet in Expo Go
 *   zitten (zie AGENTS.md), en dan kon niemand de app nog op een iPhone bekijken.
 *
 * De kop blijft hier staan: de WebView scrolt zelf, en een kop die meeschuift
 * kan daar niet in.
 */
export default function PdfScreen() {
  const { url, title } = useLocalSearchParams<{ url?: string; title?: string }>();
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState(false);
  const [rendered, setRendered] = useState(false);
  const web = useRef<React.ComponentRef<typeof WebView>>(null);

  const invalid = typeof url !== 'string' || !/^https:\/\//i.test(url);

  useEffect(() => {
    if (typeof url !== 'string' || !/^https:\/\//i.test(url)) return;
    let cancelled = false;
    const dir = new Directory(Paths.cache, 'pdf');
    if (!dir.exists) dir.create({ intermediates: true });
    const name = `${(title ?? 'document').replace(/[^\w.-]+/g, '_').slice(0, 80) || 'document'}.pdf`;
    const target = new File(dir, name);
    if (target.exists) target.delete();
    File.downloadFileAsync(url, target)
      .then(() => {
        if (!cancelled) setFile(target);
      })
      .catch(() => {
        if (!cancelled) setError(true);
      });
    return () => {
      cancelled = true;
    };
  }, [url, title]);

  /** Android: de pdf als base64 aan pdf.js geven zodra de pagina klaar is. */
  const sendToPdfJs = async () => {
    if (!file) return;
    try {
      const data = await file.base64();
      web.current?.injectJavaScript(`window.showPdf(${JSON.stringify(data)}); true;`);
    } catch {
      setError(true);
    }
  };

  const head = (
    <PageHead
      title={title ?? 'Document'}
      inline
      right={
        file ? (
          <HeadButton accessibilityLabel="Delen of bewaren" onPress={() => void Sharing.shareAsync(file.uri)}>
            <Share size={19} color={COLORS.ink} />
          </HeadButton>
        ) : undefined
      }
    />
  );

  if (error || invalid) {
    return (
      <View style={styles.root}>
        {head}
        <Empty
          title="Document niet geopend"
          hint="Het bestand kon niet opgehaald worden. Ga terug en probeer het opnieuw."
        />
      </View>
    );
  }

  return (
    <View style={styles.root}>
      {head}
      {file ? (
        Platform.OS === 'ios' ? (
          <WebView
            source={{ uri: file.uri }}
            originWhitelist={['file://*']}
            allowingReadAccessToURL={file.uri}
            allowFileAccess
            style={styles.web}
            onLoadEnd={() => setRendered(true)}
            onError={() => setError(true)}
          />
        ) : (
          <WebView
            ref={web}
            source={{ html: PDF_JS_PAGE, baseUrl: 'https://cdn.jsdelivr.net' }}
            originWhitelist={['*']}
            style={styles.web}
            onLoadEnd={() => void sendToPdfJs()}
            onMessage={(event) => {
              if (event.nativeEvent.data === 'ok') setRendered(true);
              else if (event.nativeEvent.data === 'error') setError(true);
            }}
            onError={() => setError(true)}
          />
        )
      ) : null}
      {!rendered ? (
        <View style={styles.loading} pointerEvents="none">
          <ActivityIndicator color={COLORS.navy} size="large" />
        </View>
      ) : null}
    </View>
  );
}

/**
 * pdf.js 3 (de laatste met een gewoon script en geen modules), elke pagina op de
 * breedte van het scherm, onder elkaar. Knijpen zoomt de hele pagina.
 */
const PDF_JS = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build';
const PDF_JS_PAGE = `<!doctype html>
<html>
<head>
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=5, user-scalable=yes">
<style>
  html, body { margin: 0; background: #E6ECF5; }
  #pages { display: flex; flex-direction: column; gap: 10px; padding: 10px 0 40px; align-items: center; }
  canvas { background: #fff; box-shadow: 0 2px 10px rgba(14,26,54,0.12); max-width: 100%; }
</style>
<script src="${PDF_JS}/pdf.min.js"></script>
</head>
<body>
<div id="pages"></div>
<script>
  pdfjsLib.GlobalWorkerOptions.workerSrc = '${PDF_JS}/pdf.worker.min.js';
  function bytes(base64) {
    var raw = atob(base64);
    var out = new Uint8Array(raw.length);
    for (var i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
    return out;
  }
  window.showPdf = async function (base64) {
    try {
      var pdf = await pdfjsLib.getDocument({ data: bytes(base64) }).promise;
      var holder = document.getElementById('pages');
      var width = window.innerWidth - 20;
      var ratio = window.devicePixelRatio || 1;
      for (var n = 1; n <= pdf.numPages; n++) {
        var page = await pdf.getPage(n);
        var base = page.getViewport({ scale: 1 });
        var viewport = page.getViewport({ scale: (width / base.width) * ratio });
        var canvas = document.createElement('canvas');
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        canvas.style.width = width + 'px';
        canvas.style.height = (viewport.height / ratio) + 'px';
        holder.appendChild(canvas);
        await page.render({ canvasContext: canvas.getContext('2d'), viewport: viewport }).promise;
        if (n === 1) window.ReactNativeWebView.postMessage('ok');
      }
    } catch (e) {
      window.ReactNativeWebView.postMessage('error');
    }
  };
</script>
</body>
</html>`;

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.paper },
  web: { flex: 1, backgroundColor: COLORS.paper2 },
  loading: {
    ...StyleSheet.absoluteFill,
    top: 120,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
