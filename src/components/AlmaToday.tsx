import { Image } from 'expo-image';
import { ChevronRight, Soup } from 'lucide-react-native';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { AppAlmaRestaurant } from '../api/contract';
import { fetchAlma } from '../api/endpoints';
import { useResource } from '../api/useResource';
import { almaHighlights, almaStatusLine } from '../alma';
import { useTabRouter } from '../navigation';
import { useApp } from '../state/app';
import { COLORS, FONTS, SPACING, TYPE } from '../theme/tokens';
import { CARD_SHADOW, HomeSection } from './HomeSection';
import { PhotoViewer, type ViewerPhoto } from './PhotoViewer';

/**
 * De Alma's op Home, onder je lessen: per restaurant of het open is en wat er
 * vandaag warm op het menu staat (of welke soep, waar geen warme maaltijden zijn).
 * Een tik opent het volledige menu van dat restaurant; een tik op de foto toont
 * die meteen in het groot, zoals op het Alma-scherm.
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
  const [viewing, setViewing] = useState<ViewerPhoto | null>(null);
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
            onPhoto={setViewing}
          />
        ))}
      </View>
      <PhotoViewer
        photos={viewing ? [viewing] : []}
        index={viewing ? 0 : null}
        onIndexChange={() => undefined}
        onClose={() => setViewing(null)}
      />
    </HomeSection>
  );
}

function Row({
  restaurant,
  last,
  onPress,
  onPhoto,
}: {
  restaurant: AppAlmaRestaurant;
  last: boolean;
  onPress: () => void;
  onPhoto: (photo: ViewerPhoto) => void;
}) {
  const status = almaStatusLine(restaurant);
  const highlights = almaHighlights(restaurant);
  const dishes = highlights?.dishes.map((dish) => dish.name).join(' · ') ?? null;
  const line = highlights?.kind === 'soep' ? `Soep: ${dishes}` : dishes;
  // De foto van het gerecht van de dag; anders die van het eerste gerecht met een foto.
  const photoDish =
    highlights?.dishes.find((dish) => dish.imageUrl) ??
    restaurant.menu.flatMap((section) => section.groups.flatMap((group) => group.dishes)).find((dish) => dish.imageUrl) ??
    null;
  const photo = photoDish?.imageUrl ?? null;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={[restaurant.name, status, line].filter(Boolean).join(', ')}
      onPress={onPress}
      style={({ pressed }) => [styles.row, !last && styles.divider, pressed && styles.pressed]}
    >
      {photo && photoDish ? (
        <Pressable
          accessibilityRole="imagebutton"
          accessibilityLabel={`Foto van ${photoDish.name} in het groot`}
          onPress={() => onPhoto({ id: photoDish.id, url: photo, filename: photoDish.name })}
          hitSlop={4}
          style={({ pressed }) => [styles.photo, pressed && styles.photoPressed]}
        >
          <Image cachePolicy="memory-disk" source={{ uri: photo }} style={StyleSheet.absoluteFill} contentFit="cover" transition={120} />
        </Pressable>
      ) : (
        <View style={styles.photo}>
          <Soup color={COLORS.muted} size={22} />
        </View>
      )}
      <View style={styles.text}>
        <View style={styles.head}>
          <Text style={styles.name} numberOfLines={1}>
            {restaurant.name}
          </Text>
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
  head: { flexDirection: 'row', alignItems: 'baseline', gap: SPACING.sm },
  name: { ...TYPE.cardTitle, fontSize: 15, lineHeight: 20, color: COLORS.ink, flexShrink: 0 },
  status: { flexShrink: 1, fontFamily: FONTS.medium, fontSize: 12.5, color: COLORS.muted },
  statusOpen: { fontFamily: FONTS.semibold, color: COLORS.okInk },
  // Het gerecht van de dag, links: zonder foto zag een rij er levenloos uit.
  photo: {
    width: 60,
    height: 60,
    borderRadius: 14,
    overflow: 'hidden',
    backgroundColor: COLORS.paper2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  photoPressed: { opacity: 0.75 },
  dishes: { ...TYPE.small, color: COLORS.body },
});
