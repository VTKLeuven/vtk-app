import { memo, useCallback, useEffect, useRef } from 'react';
import {
  FlatList,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { COLORS, FONTS } from '../../theme/tokens';

/** De hoogte van één rij, en hoeveel rijen er zichtbaar zijn (oneven: de middelste is de keuze). */
export const ROW = 36;
const VISIBLE = 5;
const PAD = ((VISIBLE - 1) / 2) * ROW;

/**
 * Eén kolom van een draaiwiel, zoals de tijdkiezer op iOS: je scrolt, en de rij in
 * het midden is wat gekozen is. In JavaScript en niet de native kiezer van het
 * systeem: die is een module die niet in elke geïnstalleerde build zit, en een
 * update die ze nodig heeft, zou een oudere app doen omvallen.
 *
 * Wat hier gekozen wordt, meldt het wiel pas wanneer het stilstaat.
 */
export const Wheel = memo(function Wheel<T extends string | number>({
  values,
  value,
  label,
  onChange,
  width,
  render,
  accessibilityLabel,
}: {
  values: readonly T[];
  value: T;
  label?: (value: T) => string;
  onChange: (value: T) => void;
  width: number;
  render?: (value: T) => string;
  accessibilityLabel: string;
}) {
  const list = useRef<FlatList<T>>(null);
  const index = Math.max(0, values.indexOf(value));
  const settled = useRef(index);
  const text = render ?? label ?? ((v: T) => String(v));

  // Van buitenaf veranderd (het einde schuift mee met het begin): erheen draaien.
  useEffect(() => {
    if (index !== settled.current) {
      settled.current = index;
      list.current?.scrollToOffset({ offset: index * ROW, animated: true });
    }
  }, [index]);

  const settle = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      const next = Math.min(values.length - 1, Math.max(0, Math.round(event.nativeEvent.contentOffset.y / ROW)));
      if (next !== settled.current) {
        settled.current = next;
        onChange(values[next]);
      }
    },
    [values, onChange],
  );

  return (
    <View
      style={[styles.wheel, { width }]}
      accessible
      accessibilityRole="adjustable"
      accessibilityLabel={accessibilityLabel}
      accessibilityValue={{ text: text(value) }}
      accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
      onAccessibilityAction={(event) => {
        const next = index + (event.nativeEvent.actionName === 'increment' ? 1 : -1);
        if (next >= 0 && next < values.length) onChange(values[next]);
      }}
    >
      <View pointerEvents="none" style={styles.band} />
      <FlatList
        ref={list}
        data={values as T[]}
        keyExtractor={(item) => String(item)}
        renderItem={({ item }) => (
          <View style={styles.row}>
            <Text style={[styles.text, item === value && styles.textActive]} numberOfLines={1}>
              {text(item)}
            </Text>
          </View>
        )}
        getItemLayout={(_, i) => ({ length: ROW, offset: ROW * i, index: i })}
        initialScrollIndex={index}
        contentContainerStyle={{ paddingVertical: PAD }}
        snapToInterval={ROW}
        decelerationRate="fast"
        showsVerticalScrollIndicator={false}
        nestedScrollEnabled
        onMomentumScrollEnd={settle}
        onScrollEndDrag={(event) => {
          // Zonder vaart komt er geen momentum-einde: dan hier al kiezen.
          if (Math.abs(event.nativeEvent.velocity?.y ?? 0) < 0.05) settle(event);
        }}
        initialNumToRender={20}
        windowSize={7}
        extraData={value}
      />
    </View>
  );
}) as <T extends string | number>(props: {
  values: readonly T[];
  value: T;
  label?: (value: T) => string;
  onChange: (value: T) => void;
  width: number;
  render?: (value: T) => string;
  accessibilityLabel: string;
}) => React.ReactElement;

const styles = StyleSheet.create({
  wheel: { height: ROW * VISIBLE, overflow: 'hidden' },
  band: {
    position: 'absolute',
    left: 2,
    right: 2,
    top: PAD,
    height: ROW,
    borderRadius: 10,
    backgroundColor: COLORS.paper2,
  },
  row: { height: ROW, alignItems: 'center', justifyContent: 'center' },
  text: { fontFamily: FONTS.regular, fontSize: 18, color: COLORS.muted, fontVariant: ['tabular-nums'] },
  textActive: { fontFamily: FONTS.semibold, color: COLORS.ink },
});
