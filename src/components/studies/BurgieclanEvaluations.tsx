import * as WebBrowser from 'expo-web-browser';
import { ChevronDown, Star } from 'lucide-react-native';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import type { AppBurgieclanEvaluations, AppBurgieclanEvaluationSection, AppLocale } from '../../api/contract';
import { formatShortDate } from '../../format';
import { COLORS, FONTS, RADIUS, SPACING, TYPE } from '../../theme/tokens';
import { CARD_SHADOW } from '../HomeSection';
import { Empty, MarginRegister } from '../ui';

/** Zoveel opmerkingen per rubriek staan er meteen; de rest achter "Alle opmerkingen". */
const FIRST_COMMENTS = 3;

/**
 * De vakevaluatie van Burgieclan: per rubriek de sterren (de recente jaren en
 * alle jaren samen, zoals op de vakpagina daar) en de opmerkingen van studenten.
 * Elke rubriek is een kaart die je eerst openklikt, zoals op Burgieclan.
 *
 * Een gemiddelde verschijnt pas boven het minimum aantal scores; Burgieclan
 * beslist dat en stuurt anders `null`. Dan staat er hoeveel scores er al zijn,
 * en geen getal dat op twee stemmen rust.
 *
 * Zelf een evaluatie geven of stemmen op een opmerking gebeurt op Burgieclan.
 */
export function EvaluationsView({
  evaluations,
  url,
  locale,
}: {
  evaluations: AppBurgieclanEvaluations;
  url: string;
  locale: AppLocale;
}) {
  const sections = evaluations.sections.filter(
    (section) => section.comments.length > 0 || section.recent.count > 0 || section.allTime.count > 0,
  );
  const external = {
    label: 'Zelf een evaluatie geven',
    hint: 'burgieclan.vtk.be',
    external: true,
    onPress: () => void WebBrowser.openBrowserAsync(url),
  };

  if (sections.length === 0) {
    return (
      <Empty
        title="Nog geen evaluaties"
        hint="Niemand evalueerde dit vak al. Jij kan de eerste zijn, op Burgieclan."
        action={{ label: 'Evalueren op Burgieclan', onPress: external.onPress }}
      />
    );
  }

  const recentLabel =
    evaluations.recentYears.length > 0 ? evaluations.recentYears.join(', ') : 'De laatste jaren';

  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.content}>
      {sections.map((section) => (
        <Section key={section.id} section={section} recentLabel={recentLabel} locale={locale} />
      ))}
      <MarginRegister title="Op Burgieclan" links={[external]} />
    </ScrollView>
  );
}

/**
 * Eén rubriek als kaart die je openklikt, zoals op Burgieclan: dicht staan de naam,
 * de sterren van de recente jaren en hoeveel opmerkingen er zijn; open de uitleg,
 * de sterren van alle jaren en de opmerkingen.
 */
function Section({
  section,
  recentLabel,
  locale,
}: {
  section: AppBurgieclanEvaluationSection;
  recentLabel: string;
  locale: AppLocale;
}) {
  const [open, setOpen] = useState(false);
  const [all, setAll] = useState(false);
  const comments = [...section.comments].sort((a, b) => b.score - a.score || b.createdAt.localeCompare(a.createdAt));
  const shown = all ? comments : comments.slice(0, FIRST_COMMENTS);
  const description = section.description ? plainText(section.description) : '';
  const summary = [
    section.rated && section.recent.average !== null
      ? `${section.recent.average.toFixed(1).replace('.', ',')} op 5`
      : null,
    comments.length > 0 ? `${comments.length} ${comments.length === 1 ? 'opmerking' : 'opmerkingen'}` : null,
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <View style={styles.card}>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        accessibilityLabel={[section.name, summary].filter(Boolean).join(', ')}
        onPress={() => setOpen((value) => !value)}
        style={({ pressed }) => [styles.head, pressed && styles.pressed]}
      >
        <View style={styles.headText}>
          <Text style={styles.name}>{section.name}</Text>
          {summary ? <Text style={styles.hint}>{summary}</Text> : null}
        </View>
        {section.rated && section.recent.average !== null ? <MiniStars average={section.recent.average} /> : null}
        <View style={[styles.chevron, open && styles.chevronOpen]}>
          <ChevronDown size={17} color={open ? COLORS.yellow : COLORS.ink} />
        </View>
      </Pressable>

      {open ? (
        <View style={styles.body}>
          {description ? <Text style={styles.description}>{description}</Text> : null}

          {section.rated ? (
            <View style={styles.scores}>
              <Score label={recentLabel} value={section.recent} />
              <Score label="Alle jaren" value={section.allTime} />
              {section.lowLabel || section.highLabel ? (
                <Text style={styles.scale}>
                  1 = {section.lowLabel ?? 'laag'}, 5 = {section.highLabel ?? 'hoog'}
                </Text>
              ) : null}
            </View>
          ) : null}

          {shown.map((comment) => (
            <View key={comment.id} style={styles.comment}>
              <Text style={styles.commentText}>{plainText(comment.content)}</Text>
              <Text style={styles.meta}>
                {[comment.year ?? formatShortDate(comment.createdAt, locale, true), comment.author ?? 'Anoniem']
                  .filter(Boolean)
                  .join(' · ')}
                {comment.score !== 0 ? ` · ${comment.score > 0 ? '+' : ''}${comment.score}` : ''}
              </Text>
            </View>
          ))}

          {comments.length > FIRST_COMMENTS ? (
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ expanded: all }}
              onPress={() => setAll((value) => !value)}
              hitSlop={12}
              style={({ pressed }) => [styles.moreRow, pressed && styles.pressed]}
            >
              <Text style={styles.more}>{all ? 'Minder tonen' : `Alle ${comments.length} opmerkingen`}</Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

/** Vijf kleine sterren in de kop van een dichte rubriek. */
function MiniStars({ average }: { average: number }) {
  return (
    <View style={styles.miniStars} importantForAccessibility="no-hide-descendants">
      {[1, 2, 3, 4, 5].map((n) => (
        <Star
          key={n}
          size={12}
          color={COLORS.yellowDeep}
          fill={average >= n - 0.25 ? COLORS.yellowDeep : 'transparent'}
        />
      ))}
    </View>
  );
}

/**
 * Burgieclan bewaart beschrijvingen en opmerkingen als HTML (`<div>`, `<br>`,
 * `&amp;`). Hier wordt dat gewone tekst: een blok of een regeleinde wordt een
 * nieuwe regel, de rest van de tags valt weg, en de gewone entiteiten worden weer
 * tekens.
 */
function plainText(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(div|p|li|h[1-6])>/gi, '\n')
    .replace(/<li[^>]*>/gi, '• ')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCharCode(Number(code)))
    .replace(/&amp;/gi, '&')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function Score({ label, value }: { label: string; value: { average: number | null; count: number } }) {
  const average = value.average;
  const spoken =
    average === null
      ? `${label}: nog te weinig scores`
      : `${label}: ${average.toFixed(1).replace('.', ',')} op 5, ${value.count} scores`;
  return (
    <View style={styles.score} accessible accessibilityLabel={spoken}>
      <Text style={styles.scoreLabel} numberOfLines={1}>
        {label}
      </Text>
      {average === null ? (
        <Text style={styles.hint}>
          {value.count === 0 ? 'Nog geen scores' : `Nog te weinig scores (${value.count})`}
        </Text>
      ) : (
        <View style={styles.stars}>
          {[1, 2, 3, 4, 5].map((n) => (
            <Star
              key={n}
              size={16}
              color={COLORS.yellowDeep}
              fill={average >= n - 0.25 ? COLORS.yellowDeep : 'transparent'}
            />
          ))}
          <Text style={styles.average}>{average.toFixed(1).replace('.', ',')}</Text>
          <Text style={styles.hint}>({value.count})</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.paper },
  content: { padding: SPACING.xl - 4, gap: SPACING.md, paddingBottom: SPACING.xxl },
  card: { backgroundColor: COLORS.surface, borderRadius: 20, ...CARD_SHADOW },
  head: { flexDirection: 'row', alignItems: 'center', gap: SPACING.md, minHeight: 64, paddingHorizontal: SPACING.lg, paddingVertical: SPACING.md },
  headText: { flex: 1, gap: 2 },
  name: { fontFamily: FONTS.bold, fontSize: 16, lineHeight: 21, color: COLORS.ink },
  miniStars: { flexDirection: 'row', gap: 1 },
  chevron: {
    width: 32,
    height: 32,
    borderRadius: RADIUS.pill,
    backgroundColor: COLORS.paper2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chevronOpen: { backgroundColor: COLORS.ink, transform: [{ rotate: '180deg' }] },
  body: {
    gap: SPACING.md,
    paddingHorizontal: SPACING.lg,
    paddingBottom: SPACING.lg,
    paddingTop: SPACING.sm,
    borderTopWidth: 1,
    borderTopColor: COLORS.line,
  },
  description: { ...TYPE.small, color: COLORS.body },
  moreRow: { alignSelf: 'flex-start' },
  pressed: { opacity: 0.6 },
  hint: { ...TYPE.small, color: COLORS.muted },
  meta: { ...TYPE.small, color: COLORS.muted },
  scores: { gap: SPACING.sm },
  score: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: SPACING.md },
  scoreLabel: { ...TYPE.body, color: COLORS.body, flexShrink: 1 },
  stars: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  average: {
    fontFamily: FONTS.semibold,
    fontSize: 15,
    color: COLORS.ink,
    marginLeft: SPACING.xs,
    fontVariant: ['tabular-nums'],
  },
  scale: { ...TYPE.small, fontSize: 12, color: COLORS.muted },

  comment: { gap: 4, paddingTop: SPACING.md, borderTopWidth: 1, borderTopColor: COLORS.line },
  commentText: { ...TYPE.body, color: COLORS.ink },
  more: { ...TYPE.small, fontFamily: FONTS.semibold, color: COLORS.navy },
});
