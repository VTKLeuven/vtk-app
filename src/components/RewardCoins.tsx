import { Image } from 'expo-image';
import { StyleSheet, Text, View } from 'react-native';

import { COLORS, FONTS } from '../theme/tokens';

/**
 * Een aantal bonnetjes: het cijfer met twee muntjes ernaast, zoals `RewardCoins`
 * op de site (`components/shift/RewardCoins.tsx`). Twee muntjes zeggen
 * "bonnetjes" zonder dat er iets te tellen valt; hoeveel, zegt het cijfer.
 *
 * Op elke munt staat het VTK-logo als stempel in de kleur van de rand, zoals op
 * de site (`.vtk-reward-coin::after`): net dat maakt van een gele cirkel een munt.
 * `onDark` zet het cijfer in papier, voor op een navy knop.
 *
 * `withheld` tekent ze grijs: de shift is ze waard, maar jij krijgt ze niet
 * (praesidiumjaar). Weglaten zou zeggen dat de shift niemand iets oplevert.
 */
export function RewardCoins({
  display,
  label,
  size = 'md',
  withheld = false,
  onDark = false,
}: {
  /** Het getal zoals het er moet staan, bv. "2,5". */
  display: string;
  /** Wat VoiceOver en TalkBack voorlezen, bv. "2 bonnetjes". */
  label: string;
  size?: 'sm' | 'md' | 'lg';
  withheld?: boolean;
  onDark?: boolean;
}) {
  const look = SIZES[size];
  const coin = {
    width: look.coin,
    height: look.coin,
    borderRadius: look.coin / 2,
  };
  return (
    <View style={[styles.row, { gap: look.gap }]} accessible accessibilityRole="text" accessibilityLabel={label}>
      <Text
        style={[
          styles.number,
          { fontSize: look.font, lineHeight: look.font * 1.1, letterSpacing: size === 'lg' ? -1.2 : 0 },
          onDark && styles.onDarkText,
          withheld && styles.withheldText,
        ]}
      >
        {display}
      </Text>
      <View style={styles.coins}>
        <View style={[styles.coin, styles.back, coin, withheld && styles.withheldCoin]}>
          <Stamp size={look.coin} withheld={withheld} />
        </View>
        <View
          style={[
            styles.coin,
            styles.face,
            coin,
            { marginLeft: -look.coin * 0.55 },
            withheld && styles.withheldCoin,
          ]}
        >
          <Stamp size={look.coin} withheld={withheld} />
        </View>
      </View>
    </View>
  );
}

/** Het VTK-logo op 74 % van de munt, in de kleur van de rand. */
function Stamp({ size, withheld }: { size: number; withheld: boolean }) {
  const width = size * 0.74;
  return (
    <Image
      source={require('../../assets/vtk-logo.png')}
      style={{ width, height: width * (650 / 1152) }}
      contentFit="contain"
      tintColor={withheld ? COLORS.line2 : COLORS.coinRim}
      accessible={false}
    />
  );
}

const SIZES = {
  sm: { coin: 14, gap: 5, font: 13 },
  md: { coin: 18, gap: 6, font: 15 },
  lg: { coin: 32, gap: 12, font: 42 },
} as const;

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center' },
  number: { fontFamily: FONTS.semibold, color: COLORS.ink, fontVariant: ['tabular-nums'] },
  coins: { flexDirection: 'row', alignItems: 'center' },
  coin: {
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    backgroundColor: COLORS.yellow,
    borderWidth: 1.5,
    borderColor: COLORS.coinRim,
  },
  face: {
    shadowColor: COLORS.navy,
    shadowOpacity: 0.18,
    shadowRadius: 2,
    shadowOffset: { width: 0, height: 1 },
  },
  onDarkText: { color: COLORS.onDark },
  back: { backgroundColor: COLORS.yellowDeep },
  withheldText: { color: COLORS.muted },
  withheldCoin: { backgroundColor: COLORS.paper2, borderColor: COLORS.line2 },
});
