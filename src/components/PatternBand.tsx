import { memo } from 'react';
import { StyleSheet, useWindowDimensions, View } from 'react-native';
import { parse, SvgAst, type JsxAST } from 'react-native-svg';

import { TECHNISCH_PATTERN } from '../theme/pattern';

/** Zo groot staat één tegel van het patroon; op de site is dat 880 px op een breed scherm. */
const TILE = 620;

/** Ruim genoeg voor elke band, zonder onzichtbare rijen eronder te tekenen. */
const BAND_MAX_HEIGHT = 540;

let cachedAst: JsxAST | null | undefined;

/** Parseert de patroon-SVG één keer voor de hele app in plaats van vier keer per band. */
function patternAst(): JsxAST | null {
  if (cachedAst === undefined) {
    cachedAst = parse(TECHNISCH_PATTERN);
  }
  return cachedAst;
}

type PatternBandProps = {
  /** Waar de tekening begint, in px; negatief schuift ze naar links of boven. */
  offset?: readonly [number, number];
  opacity?: number;
  /** Voor een volledig scherm; standaard dekt een band enkel de kop of strook. */
  fullHeight?: boolean;
};

/**
 * Het technische patroon over een navy band, zoals `.vtk-page-head::after` op de
 * site: witte lijnen op een derde sterkte. Elk scherm geeft een eigen `offset`
 * mee, zodat niet elke kop hetzelfde stuk van de tekening toont; op de site heeft
 * ook elke band zijn eigen uitsnede.
 *
 * Hoogstens twee op twee tegels, en enkel de tegels die binnen de band vallen. Het
 * patroon is naadloos, dus de naad tussen twee tegels valt niet op.
 */
export const PatternBand = memo(
  function PatternBand({ offset = [0, 0], opacity = 0.34, fullHeight = false }: PatternBandProps) {
    const { width, height } = useWindowDimensions();
    const ast = patternAst();
    if (!ast) return null;

    // Altijd binnen één tegel beginnen, zodat de tegels de hele band dekken.
    const left = -(((-offset[0] % TILE) + TILE) % TILE);
    const top = -(((-offset[1] % TILE) + TILE) % TILE);
    const maxHeight = fullHeight ? height : Math.min(height, BAND_MAX_HEIGHT);
    const cols = left + TILE < width ? [0, 1] : [0];
    const rows = top + TILE < maxHeight ? [0, 1] : [0];

    return (
      <View pointerEvents="none" style={[styles.layer, { opacity }]}>
        {rows.map((row) =>
          cols.map((col) => (
            <SvgAst
              key={`${row}-${col}`}
              ast={ast}
              override={{
                width: TILE,
                height: TILE,
                style: { position: 'absolute', left: left + col * TILE, top: top + row * TILE },
              }}
            />
          )),
        )}
      </View>
    );
  },
  (prev, next) =>
    prev.opacity === next.opacity &&
    prev.fullHeight === next.fullHeight &&
    (prev.offset?.[0] ?? 0) === (next.offset?.[0] ?? 0) &&
    (prev.offset?.[1] ?? 0) === (next.offset?.[1] ?? 0),
);

const styles = StyleSheet.create({
  layer: { ...StyleSheet.absoluteFill, overflow: 'hidden' },
});
