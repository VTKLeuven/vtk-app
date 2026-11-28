import { useMemo, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';

import { PageHead } from '../components/PageHead';
import { SearchField } from '../components/SearchField';
import { Empty } from '../components/ui';
import { liederboek, normalize, pageNumber, type Song } from '../liederboek';
import { useTabRouter } from '../navigation';
import { COLORS, FONTS, RADIUS, SPACING, TYPE } from '../theme/tokens';
import { t } from '../i18n';

type Book = 'alle' | 'leuven' | 'kvhv';

/**
 * Het liederboek: alle liedjes van codex.rondgezang.be, ook zonder netwerk.
 *
 * Zoeken gaat op titel én op paginanummer: tik "133" en je krijgt het lied op
 * pagina 133 van het Leuvens Liedboek (LeLie) en dat op pagina 133 van de KVHV
 * Groene Codex. Met de pillen in de kop kies je een boek; dan staat de lijst in
 * de volgorde van dat boek en zie je enkel wat erin staat, zodat je kan volgen
 * met wie het boek in handen heeft.
 */
export default function LiederboekScreen() {
  const router = useTabRouter();
  const [query, setQuery] = useState('');
  const [book, setBook] = useState<Book>('alle');
  const songs = liederboek().songs;

  const shown = useMemo(() => {
    const needle = normalize(query.trim());
    const digits = /^\d+[a-z]?$/i.test(query.trim()) ? query.trim().toLowerCase().replace(/^0+/, '') : null;
    let list = songs.filter((song) => (book === 'leuven' ? song.lp : book === 'kvhv' ? song.kp : true));
    if (needle) {
      list = list.filter((song) => {
        if (digits) {
          if (book !== 'kvhv' && song.lp?.toLowerCase() === digits) return true;
          if (book !== 'leuven' && song.kp?.toLowerCase() === digits) return true;
        }
        return normalize(song.t).includes(needle);
      });
    }
    if (book === 'leuven') return [...list].sort((a, b) => pageNumber(a.lp) - pageNumber(b.lp));
    if (book === 'kvhv') return [...list].sort((a, b) => pageNumber(a.kp) - pageNumber(b.kp));
    return list;
  }, [songs, query, book]);

  return (
    <FlatList
      data={shown}
      keyExtractor={(song) => String(song.id)}
      style={styles.root}
      contentContainerStyle={styles.list}
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="on-drag"
      initialNumToRender={20}
      // De kop en het zoekveld staan in de lijst en schuiven mee weg.
      ListHeaderComponent={
        <View style={styles.headWrap}>
          <View style={styles.overscroll} />
          <PageHead
            title={t('Liederboek', 'Songbook')}
            subtitle={t(`${songs.length} liedjes van codex.rondgezang.be`, `${songs.length} songs from codex.rondgezang.be`)}
            tabs={{
              value: book,
              onChange: setBook,
              options: [
                { value: 'alle', label: t('Alle', 'All') },
                { value: 'leuven', label: 'Leuvens Liedboek' },
                { value: 'kvhv', label: 'KVHV-codex' },
              ],
            }}
          >
            <View style={styles.search}>
              <SearchField
                value={query}
                onChange={setQuery}
                placeholder={t('Titel of paginanummer', 'Title or page number')}
                label={t('Zoek een lied op titel of paginanummer', 'Search a song by title or page number')}
                style={styles.searchField}
              />
            </View>
          </PageHead>
        </View>
      }
      ListEmptyComponent={
        <Empty
          flush
          title={t('Niets gevonden', 'Nothing found')}
          hint={/^\d/.test(query.trim()) ? t(`Geen lied op pagina ${query.trim()}.`, `No song on page ${query.trim()}.`) : t('Probeer een ander woord uit de titel.', 'Try another word from the title.')}
        />
      }
      renderItem={({ item, index }) => (
        <SongRow
          song={item}
          first={index === 0}
          last={index === shown.length - 1}
          book={book}
          onPress={() => router.push(`/lied/${item.id}`)}
        />
      )}
    />
  );
}

function SongRow({
  song,
  first,
  last,
  book,
  onPress,
}: {
  song: Song;
  first: boolean;
  last: boolean;
  book: Book;
  onPress: () => void;
}) {
  const pages = [
    book !== 'kvhv' && song.lp ? { key: 'LeLie', page: song.lp } : null,
    book !== 'leuven' && song.kp ? { key: 'KVHV', page: song.kp } : null,
  ].filter(Boolean) as { key: string; page: string }[];
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={[song.t, ...pages.map((p) => `${p.key} pagina ${p.page}`)].join(', ')}
      onPress={onPress}
      style={({ pressed }) => [
        styles.row,
        first && styles.rowFirst,
        last && styles.rowLast,
        !first && styles.divider,
        pressed && styles.pressed,
      ]}
    >
      <Text style={styles.title} numberOfLines={2}>
        {song.t}
      </Text>
      <View style={styles.pages}>
        {pages.map((p) => (
          <View key={p.key} style={[styles.page, p.key === 'LeLie' && styles.pageLeuven]}>
            <Text style={styles.pageBook}>{p.key}</Text>
            <Text style={styles.pageNumber}>{p.page}</Text>
          </View>
        ))}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.paper },
  list: { paddingHorizontal: SPACING.lg, paddingBottom: SPACING.xxl * 2 },
  headWrap: { marginHorizontal: -SPACING.lg, marginBottom: SPACING.lg },
  overscroll: { position: 'absolute', top: -1000, left: 0, right: 0, height: 1000, backgroundColor: COLORS.head },
  search: {},
  searchField: { margin: 0 },

  // Eén witte kaart voor de hele lijst: de eerste en laatste rij ronden de hoeken af.
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
    minHeight: 54,
    paddingVertical: 10,
    paddingHorizontal: SPACING.lg,
    backgroundColor: COLORS.surface,
  },
  rowFirst: { borderTopLeftRadius: 20, borderTopRightRadius: 20 },
  rowLast: { borderBottomLeftRadius: 20, borderBottomRightRadius: 20 },
  divider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: COLORS.line2 },
  pressed: { backgroundColor: COLORS.paper2 },
  title: { flex: 1, fontFamily: FONTS.semibold, fontSize: 15.5, lineHeight: 21, color: COLORS.ink },
  pages: { flexDirection: 'row', gap: 6 },
  page: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: RADIUS.pill,
    backgroundColor: COLORS.paper2,
  },
  pageLeuven: { backgroundColor: COLORS.lowBg },
  pageBook: { ...TYPE.small, fontSize: 10, fontFamily: FONTS.bold, letterSpacing: 0.5, color: COLORS.muted },
  pageNumber: { fontFamily: FONTS.bold, fontSize: 13, color: COLORS.strong, fontVariant: ['tabular-nums'] },
});
