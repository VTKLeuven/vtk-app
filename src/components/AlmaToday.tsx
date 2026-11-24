import { ChevronRight } from 'lucide-react-native';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { AppAlmaRestaurant } from '../api/contract';
import { fetchAlma } from '../api/endpoints';
import { useResource } from '../api/useResource';
import { almaHighlights, almaStatusLine } from '../alma';
import { useTabRouter } from '../navigation';
import { useApp } from '../state/app';
import { COLORS, FONTS, RADIUS, SPACING, TYPE } from '../theme/tokens';
import { CARD_SHADOW, HomeSection } from './HomeSection';

/**
 * De Alma's op Home, onder je lessen: per restaurant of het open is en wat er
 * vandaag warm op het menu staat (of welke soep, waar geen warme maaltijden zijn).
 * Een tik opent het volledige menu van dat restaurant.
 *
 * Haalt zijn eigen gegevens, los van `/vandaag`: alma.be is een andere bron die
 * trager of plat kan zijn, en dan hoort Home niet mee te wachten. Lukt het niet
 * en ligt er niets in de cache, dan tekent dit blok niets; een foutmelding over
 * de Alma's bovenaan Home zou meer storen dan helpen.
 */
export function AlmaToday() {
  const { locale } = useApp();
  const router = useTabRouter();
  const resource = useResource('alma', () => fetchAlma(locale), locale);
  const restaurants = resource.data?.restaurants ?? [];
  if (restaurants.length === 0 || restaurants.every((restaurant) => restaurant.unavailable)) return null;

  const open = (slug?: string) =>
    router.push(slug ? { pathname: '/alma', params: { restaurant: slug } } : '/alma');

  return (
    <HomeSection
      title="Alma vandaag"
      link={{ label: 'Menu', accessibilityLabel: 'Naar de menu’s van de Alma’s', onPress: () => open() }}
    >
      <View style={styles.card}>
        {restaurants.map((restaurant, index) => (
          <Row
            key={restaurant.slug}
            restaurant={restaurant}
            last={index === restaurants.length - 1}
            onPress={() => open(restaurant.slug)}
          />
        ))}
      </View>
    </HomeSection>
  );
}

function Row({
  restaurant,
  last,
  onPress,
}: {
  restaurant: AppAlmaRestaurant;
  last: boolean;
  onPress: () => void;
}) {
  const status = almaStatusLine(restaurant);
  const highlights = almaHighlights(restaurant);
  const dishes = highlights?.dishes.map((dish) => dish.name).join(' · ') ?? null;
  const line = highlights?.kind === 'soep' ? `Soep: ${dishes}` : dishes;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={[restaurant.name, status, line].filter(Boolean).join(', ')}
      onPress={onPress}
      style={({ pressed }) => [styles.row, !last && styles.divider, pressed && styles.pressed]}
    >
      <View style={styles.text}>
        <View style={styles.head}>
          <Text style={styles.name} numberOfLines={1}>
            {restaurant.name}
          </Text>
          <View style={[styles.dot, restaurant.openNow ? styles.dotOpen : styles.dotClosed]} />
          <Text style={[styles.status, restaurant.openNow && styles.statusOpen]} numberOfLines={1}>
            {status}
          </Text>
        </View>
        {line ? (
          <Text style={styles.dishes} numberOfLines={2}>
            {line}
          </Text>
        ) : null}
      </View>
      <ChevronRight color={COLORS.muted} size={18} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: COLORS.surface, borderRadius: 20, ...CARD_SHADOW },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
    paddingVertical: 14,
    paddingHorizontal: SPACING.lg,
  },
  divider: { borderBottomWidth: 1, borderBottomColor: COLORS.line },
  pressed: { backgroundColor: COLORS.paper2 },
  text: { flex: 1, gap: 4 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  name: { ...TYPE.cardTitle, fontSize: 15, lineHeight: 20, color: COLORS.ink, flexShrink: 0, marginRight: 4 },
  dot: { width: 8, height: 8, borderRadius: RADIUS.pill },
  dotOpen: { backgroundColor: COLORS.yellowDeep, borderWidth: 1.5, borderColor: COLORS.coinRim },
  dotClosed: { borderWidth: 1.5, borderColor: COLORS.muted },
  status: { flexShrink: 1, fontFamily: FONTS.regular, fontSize: 13, color: COLORS.muted },
  statusOpen: { color: COLORS.body },
  dishes: { ...TYPE.small, color: COLORS.body },
});
