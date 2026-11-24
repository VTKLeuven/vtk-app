import * as WebBrowser from 'expo-web-browser';
import { Star } from 'lucide-react-native';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import type { AppBurgieclanEvaluations, AppBurgieclanEvaluationSection, AppLocale } from '../../api/contract';
import { formatShortDate } from '../../format';
import { COLORS, FONTS, SPACING, TYPE } from '../../theme/tokens';
import { Empty, MarginRegister, SectionHeading } from '../ui';

/** Zoveel opmerkingen per rubriek staan er meteen; de rest achter "Alle opmerkingen". */
const FIRST_COMMENTS = 3;

/**
 * De vakevaluatie van Burgieclan: per rubriek de sterren (de recente jaren en
 * alle jaren samen, zoals op de vakpagina daar) en de opmerkingen van studenten.
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

function Section({
  section,
  recentLabel,
  locale,
}: {
  section: AppBurgieclanEvaluationSection;
  recentLabel: string;
  locale: AppLocale;
}) {
  const [all, setAll] = useState(false);
  const comments = [...section.comments].sort((a, b) => b.score - a.score || b.createdAt.localeCompare(a.createdAt));
  const shown = all ? comments : comments.slice(0, FIRST_COMMENTS);

  return (
    <View style={styles.section}>
      <SectionHeading>{section.name}</SectionHeading>
      {section.description ? <Text style={styles.hint}>{section.description}</Text> : null}

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

      {comments.length > 0 ? (
        <View style={styles.register}>
          {shown.map((comment) => (
            <View key={comment.id} style={styles.comment}>
              <Text style={styles.commentText}>{comment.content}</Text>
              <Text style={styles.meta}>
                {[comment.year ?? formatShortDate(comment.createdAt, locale, true), comment.author ?? 'Anoniem']
                  .filter(Boolean)
                  .join(' · ')}
                {comment.score !== 0 ? ` · ${comment.score > 0 ? '+' : ''}${comment.score}` : ''}
              </Text>
            </View>
          ))}
        </View>
      ) : null}
      {comments.length > FIRST_COMMENTS ? (
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ expanded: all }}
          onPress={() => setAll((value) => !value)}
          hitSlop={12}
          style={({ pressed }) => pressed && styles.pressed}
        >
          <Text style={styles.more}>
            {all ? 'Minder tonen' : `Alle ${comments.length} opmerkingen`}
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
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
  content: { padding: SPACING.xl - 4, gap: SPACING.xl, paddingBottom: SPACING.xxl },
  section: { gap: SPACING.md },
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
  register: { borderTopWidth: 1, borderTopColor: COLORS.line2 },
  comment: { gap: 4, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: COLORS.line2 },
  commentText: { ...TYPE.body, color: COLORS.ink },
  more: { ...TYPE.small, fontFamily: FONTS.semibold, color: COLORS.navy },
});
