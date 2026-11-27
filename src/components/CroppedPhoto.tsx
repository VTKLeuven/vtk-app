import { Image, type ImageSource } from 'expo-image';
import { useState } from 'react';
import { StyleSheet, View, type LayoutChangeEvent } from 'react-native';

import type { AppImageCrop } from '../api/contract';

/**
 * Een eventfoto die het kader vult, bijgesneden zoals de redactie het in het
 * beheer koos (`imageCrop` uit het contract).
 *
 * `kind="hero"` is voor de grote foto bovenaan (Home, de eventpagina): de eigen
 * uitsnede van de app, met zoom. `kind="focus"` is voor een breed kader (een
 * kaart in 16/9, een duimnagel) en volgt het punt van de site.
 *
 * Zonder zoom doet `contentPosition` het werk, het `object-position` van de
 * site. Met zoom kan dat niet: cover snijdt altijd evenveel af, en schalen
 * verkleint enkel wat er al overbleef. Dan rekenen we de afmetingen van de foto
 * zelf uit, net als `cropBox` in `lib/imageFocus.ts` op de site, en vult een
 * vervaagde kopie wat de foto bij uitzoomen leeg laat.
 */
export function CroppedPhoto({
  source,
  crop,
  kind,
  transition = 150,
}: {
  source: ImageSource | number;
  crop?: AppImageCrop | null;
  kind: 'hero' | 'focus';
  transition?: number;
}) {
  const [frame, setFrame] = useState<{ width: number; height: number } | null>(null);
  const hero = kind === 'hero' ? crop?.hero : null;
  const point = (kind === 'hero' ? crop?.hero : crop?.focus) ?? { x: 0.5, y: 0.5 };
  const ratio = hero?.ratio ?? null;
  const zoom = hero && ratio ? hero.zoom : 1;
  const transitionMs = typeof source === 'number' ? 0 : transition;

  if (zoom === 1 || !ratio) {
    return (
      <Image
        source={source}
        style={StyleSheet.absoluteFill}
        contentFit="cover"
        contentPosition={{ left: percent(point.x), top: percent(point.y) }}
        transition={transitionMs}
        cachePolicy="memory-disk"
      />
    );
  }

  const onLayout = (event: LayoutChangeEvent) => {
    const { width, height } = event.nativeEvent.layout;
    if (width > 0 && height > 0) setFrame({ width, height });
  };
  const box = frame ? cropBox(ratio, frame.width / frame.height, point, zoom) : null;

  return (
    <View style={styles.frame} onLayout={onLayout}>
      {box ? (
        <>
          {zoom < 1 ? (
            <Image
              source={source}
              style={[StyleSheet.absoluteFill, styles.fill]}
              contentFit="cover"
              blurRadius={24}
              transition={transitionMs}
              cachePolicy="memory-disk"
            />
          ) : null}
          <Image
            source={source}
            style={{
              position: 'absolute',
              left: `${box.left}%`,
              top: `${box.top}%`,
              width: `${box.width}%`,
              height: `${box.height}%`,
            }}
            contentFit="fill"
            transition={transitionMs}
            cachePolicy="memory-disk"
          />
        </>
      ) : null}
    </View>
  );
}

function percent(value: number): `${number}%` {
  return `${Math.min(1, Math.max(0, value)) * 100}%`;
}

/**
 * Waar de foto in het kader staat, in procenten van dat kader: de cover-uitsnede
 * rond `focus`, maal `zoom` rond hetzelfde punt. Gelijk aan `cropBox` in
 * `lib/imageFocus.ts` op de site; houd ze gelijk.
 */
export function cropBox(
  imageRatio: number,
  frameRatio: number,
  focus: { x: number; y: number },
  zoom: number,
): { left: number; top: number; width: number; height: number } {
  const width = zoom * Math.max(1, imageRatio / frameRatio) * 100;
  const height = zoom * Math.max(1, frameRatio / imageRatio) * 100;
  return { left: focus.x * (100 - width), top: focus.y * (100 - height), width, height };
}

const styles = StyleSheet.create({
  frame: { ...StyleSheet.absoluteFill, overflow: 'hidden' },
  // Een vervaagde rand is lichter dan het midden; iets groter verbergt dat.
  fill: { transform: [{ scale: 1.15 }] },
});
