import { forwardRef } from 'react';
import { ScrollView, StyleSheet, View, type ScrollViewInstance, type ScrollViewProps } from 'react-native';

import { COLORS } from '../theme/tokens';

/**
 * Een scherm dat scrolt, met de kop erin: de kop schuift mee weg naar boven in
 * plaats van te blijven staan. **Dat is de regel voor elk scherm** (eind november
 * 2026); een vaste kop is een uitzondering die uitdrukkelijk gevraagd moet zijn.
 *
 * `head` is de kop (`PageHead`, `YellowHead`, `PhotoHead`), `contentContainerStyle`
 * geldt voor de inhoud eronder en niet voor de kop, zodat de marges van een scherm
 * de kop niet insnoeren. Boven de kop staat geel voor wanneer je op iOS omlaag
 * trekt.
 */
export const HeadScroll = forwardRef<ScrollViewInstance, ScrollViewProps & { head: React.ReactNode }>(function HeadScroll(
  { head, contentContainerStyle, children, ...rest },
  ref,
) {
  return (
    <ScrollView ref={ref} {...rest} contentContainerStyle={styles.container}>
      <View style={styles.overscroll} />
      {head}
      <View style={contentContainerStyle}>{children}</View>
    </ScrollView>
  );
});

const styles = StyleSheet.create({
  container: { flexGrow: 1 },
  overscroll: {
    position: 'absolute',
    top: -1000,
    left: 0,
    right: 0,
    height: 1000,
    backgroundColor: COLORS.head,
  },
});
