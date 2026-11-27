import { useLocalSearchParams } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useWindowDimensions, StyleSheet, Text, View } from 'react-native';
import { WebView } from 'react-native-webview';

import { HeadScroll } from '../../components/HeadScroll';
import { PageHead } from '../../components/PageHead';
import { Empty, MarginRegister } from '../../components/ui';
import { songById, type SongBlock, type SongLine } from '../../liederboek';
import { COLORS, FONTS, RADIUS, SPACING, TYPE } from '../../theme/tokens';

/**
 * Eén lied uit het liederboek: de paginanummers, wie het schreef, de tekst per
 * strofe en, als rondgezang.be er een heeft, de video onderaan.
 *
 * De tekst volgt de opmaak van codex.rondgezang.be: een refrein staat
 * ingesprongen achter de gele lijn, een herhaling in het geel gemarkeerd met
 * het aantal keer erachter ("(bis)", "(ter)"), een vervangregel of tussenzin
 * schuin.
 */
export default function LiedScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const song = songById(Number(id));

  if (!song) {
    return (
      <View style={styles.root}>
        <PageHead title="Liederboek" />
        <Empty title="Lied niet gevonden" hint="Dit lied staat niet (meer) in het liederboek." />
      </View>
    );
  }

  const pages = [
    song.lp ? { book: 'Leuvens Liedboek', page: song.lp } : null,
    song.kp ? { book: 'KVHV-codex 2020', page: song.kp } : null,
  ].filter(Boolean) as { book: string; page: string }[];
  const credits = Object.entries(song.cr ?? {});

  return (
    <HeadScroll head={<PageHead title={song.t} />} style={styles.root} contentContainerStyle={styles.content}>
      {pages.length > 0 || credits.length > 0 ? (
        <View style={styles.meta}>
          {pages.length > 0 ? (
            <View style={styles.pages}>
              {pages.map((p) => (
                <View key={p.book} style={styles.page}>
                  <Text style={styles.pageNumber}>{p.page}</Text>
                  <Text style={styles.pageBook}>{p.book}</Text>
                </View>
              ))}
            </View>
          ) : null}
          {credits.map(([label, value]) => (
            <Text key={label} style={styles.credit}>
              <Text style={styles.creditLabel}>{label} </Text>
              {value}
            </Text>
          ))}
        </View>
      ) : null}

      {song.s.length === 0 ? (
        <Text style={styles.hint}>Voor dit lied staat er geen tekst op rondgezang.be.</Text>
      ) : (
        <View style={styles.text}>
          {song.s.map((stanza, index) => (
            <View key={index} style={styles.stanza}>
              {song.s.length > 1 ? <Text style={styles.number}>{index + 1}.</Text> : <View style={styles.numberEmpty} />}
              <View style={styles.flex}>
                {stanza.map((block, at) => (
                  <Block key={at} block={block} />
                ))}
              </View>
            </View>
          ))}
        </View>
      )}

      {song.src ? <Text style={styles.source}>{song.src}</Text> : null}

      {song.yt ? <Video id={song.yt} title={song.t} /> : null}

      <MarginRegister
        title="Meer"
        links={[
          {
            label: 'Op codex.rondgezang.be',
            hint: 'De bron van dit lied',
            external: true,
            onPress: () => void WebBrowser.openBrowserAsync(`https://codex.rondgezang.be/${song.id}`),
          },
        ]}
      />
    </HeadScroll>
  );
}

function Block({ block }: { block: SongBlock }) {
  const chorus = block.k === 'c';
  return (
    <View style={[styles.block, chorus && styles.chorus]}>
      {block.l.map((line, index) => (
        <Line key={index} line={line} chorus={chorus} />
      ))}
    </View>
  );
}

function Line({ line, chorus }: { line: SongLine; chorus: boolean }) {
  if (line.length === 0) return <Text style={styles.line}> </Text>;
  return (
    <Text style={[styles.line, chorus && styles.lineChorus]}>
      {line.map(([kind, text], index) => (
        <Text
          key={index}
          style={
            kind === 'r'
              ? styles.repeat
              : kind === 'n'
                ? styles.repeatNumber
                : kind === 's'
                  ? styles.substitute
                  : kind === 'c'
                    ? styles.inline
                    : undefined
          }
        >
          {kind === 'n' ? ` ${text}` : text}
        </Text>
      ))}
    </Text>
  );
}

/**
 * De video van rondgezang.be, ingebed. YouTube weigert een inbedding zonder
 * herkomst, dus de pagina krijgt vtk.be als basis; lukt het toch niet, dan opent
 * de link eronder YouTube zelf.
 */
function Video({ id, title }: { id: string; title: string }) {
  const { width } = useWindowDimensions();
  const height = Math.round(((width - SPACING.lg * 2) * 9) / 16);
  const page = `<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"><style>html,body{margin:0;background:#0E1A36;height:100%}iframe{border:0;width:100%;height:100%}</style></head><body><iframe src="https://www.youtube-nocookie.com/embed/${id}?playsinline=1&rel=0" title="${title.replace(/"/g, '&quot;')}" allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowfullscreen></iframe></body></html>`;
  return (
    <View style={styles.video}>
      <Text style={styles.videoTitle}>Video</Text>
      <View style={[styles.player, { height }]}>
        <WebView
          source={{ html: page, baseUrl: 'https://vtk.be' }}
          originWhitelist={['*']}
          allowsInlineMediaPlayback
          allowsFullscreenVideo
          mediaPlaybackRequiresUserAction
          scrollEnabled={false}
          decelerationRate="normal"
          style={styles.web}
        />
      </View>
      <Text
        style={styles.videoLink}
        accessibilityRole="link"
        onPress={() => void WebBrowser.openBrowserAsync(`https://www.youtube.com/watch?v=${id}`)}
      >
        Openen op YouTube
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.paper },
  content: { padding: SPACING.lg, paddingBottom: SPACING.xxl * 2, gap: SPACING.xl },
  flex: { flex: 1 },
  hint: { ...TYPE.body, color: COLORS.muted },

  meta: { gap: SPACING.sm },
  pages: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.sm, marginBottom: SPACING.xs },
  page: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: RADIUS.pill,
    backgroundColor: COLORS.surface,
  },
  pageNumber: { fontFamily: FONTS.bold, fontSize: 17, color: COLORS.navy, fontVariant: ['tabular-nums'] },
  pageBook: { ...TYPE.small, fontFamily: FONTS.semibold, color: COLORS.muted },
  credit: { ...TYPE.small, color: COLORS.body },
  creditLabel: { fontFamily: FONTS.semibold, color: COLORS.muted },

  text: { gap: SPACING.lg },
  stanza: { flexDirection: 'row', gap: SPACING.sm },
  number: { width: 24, fontFamily: FONTS.bold, fontSize: 15, lineHeight: 25, color: COLORS.muted, fontVariant: ['tabular-nums'] },
  numberEmpty: { width: 0 },
  block: { gap: 0 },
  // Het refrein: ingesprongen achter de gele lijn, zoals de gele lijnen elders in de app.
  chorus: { marginTop: SPACING.sm, paddingLeft: SPACING.md, borderLeftWidth: 3, borderLeftColor: COLORS.yellow },
  line: { fontFamily: FONTS.regular, fontSize: 17, lineHeight: 25, color: COLORS.ink },
  lineChorus: { fontFamily: FONTS.medium },
  repeat: { backgroundColor: COLORS.lowBg },
  repeatNumber: { fontFamily: FONTS.semibold, fontSize: 14, color: COLORS.muted },
  substitute: { fontStyle: 'italic', color: COLORS.body },
  inline: { fontStyle: 'italic', color: COLORS.muted },

  source: { ...TYPE.small, fontSize: 12, color: COLORS.muted },
  video: { gap: SPACING.sm },
  videoTitle: { fontFamily: FONTS.bold, fontSize: 20, letterSpacing: -0.4, color: COLORS.navy },
  player: { borderRadius: 16, overflow: 'hidden', backgroundColor: COLORS.navy },
  web: { flex: 1, backgroundColor: COLORS.navy },
  videoLink: { fontFamily: FONTS.semibold, fontSize: 14, color: COLORS.navy, textDecorationLine: 'underline' },
});
