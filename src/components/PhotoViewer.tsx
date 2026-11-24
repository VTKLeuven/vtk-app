import { Image } from 'expo-image';
import { X } from 'lucide-react-native';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
  View,
  useWindowDimensions,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withDecay,
  withSpring,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { AppPhoto } from '../api/contract';
import { COLORS, SPACING, TYPE } from '../theme/tokens';

/** Hoe ver je mag inzoomen. Meer dan dit toont enkel nog de korrel. */
const MAX_SCALE = 4;

/** Waarheen een dubbeltik zoomt. */
const TAP_SCALE = 2.5;

/**
 * De schermvullende fotoviewer: vegen tussen de foto's, knijpen om in te zoomen,
 * en omhoog of omlaag vegen of naast de foto tikken om terug naar het album te
 * gaan, zoals in Foto's op iOS.
 *
 * **Waarom dit een eigen component is.** Het zat in `album/[slug].tsx` als één
 * `<Image>` in een `Modal`, zonder enige manier om naar de volgende foto te gaan
 * behalve sluiten en opnieuw tikken. Met albums van zeventienhonderd foto's is
 * dat geen viewer maar een doodlopende weg.
 *
 * Bladeren gebeurt met een gewone horizontale `FlatList` op `pagingEnabled`, niet
 * met een pager-bibliotheek: de app staat vast in portret, dus de paginabreedte
 * is de schermbreedte en `getItemLayout` klopt altijd.
 *
 * De knoppen bovenaan komen van de beller mee. De viewer weet niet wat "bewaren"
 * betekent; hij weet enkel welke foto in beeld staat.
 */
export function PhotoViewer({
  photos,
  index,
  onIndexChange,
  onClose,
  actions,
}: {
  photos: AppPhoto[];
  /** De foto die openstaat, of `null` wanneer de viewer dicht is. */
  index: number | null;
  onIndexChange: (index: number) => void;
  onClose: () => void;
  /** De knoppen rechtsboven, bv. delen en bewaren. */
  actions?: React.ReactNode;
}) {
  return (
    <Modal
      visible={index !== null}
      transparent
      animationType="fade"
      onRequestClose={onClose}
      // Zonder dit staat de statusbalk op Android over de foto.
      statusBarTranslucent
    >
      {/* Een tweede `GestureHandlerRootView`, binnen de modal. Een modal is een
          eigen native venster, dus gebaren erin bereiken de root buiten de modal
          niet: zonder deze wrapper doet knijpen gewoon niets, zonder foutmelding
          en zonder dat er iets in de logs verschijnt. */}
      <GestureHandlerRootView style={styles.root}>
        {index !== null ? (
          <Pager
            photos={photos}
            initialIndex={index}
            index={index}
            onIndexChange={onIndexChange}
            onClose={onClose}
            actions={actions}
          />
        ) : null}
      </GestureHandlerRootView>
    </Modal>
  );
}

function Pager({
  photos,
  initialIndex,
  index,
  onIndexChange,
  onClose,
  actions,
}: {
  photos: AppPhoto[];
  initialIndex: number;
  index: number;
  onIndexChange: (index: number) => void;
  onClose: () => void;
  actions?: React.ReactNode;
}) {
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  // Bladeren gaat uit zodra er ingezoomd is; anders vecht het slepen binnen de
  // foto met het omslaan naar de volgende.
  const [zoomed, setZoomed] = useState(false);
  const list = useRef<FlatList<AppPhoto>>(null);
  const positioned = useRef(false);
  // Hoe ver de foto omhoog of omlaag weggeveegd is; de achtergrond vaagt mee weg.
  const dismiss = useSharedValue(0);
  const backdrop = useAnimatedStyle(() => ({ opacity: 1 - Math.min(Math.abs(dismiss.value) / 320, 0.9) }));
  const chrome = useAnimatedStyle(() => ({ opacity: 1 - Math.min(Math.abs(dismiss.value) / 120, 1) }));

  /**
   * Na de eerste layout nog eens zelf naar de aangetikte foto springen.
   *
   * `initialScrollIndex` alleen was niet genoeg: in de modal bleef de lijst op
   * de eerste foto staan, terwijl ze enkel de aangetikte foto tekende
   * (`initialNumToRender={1}`). Wie een andere foto dan de eerste aantikte,
   * keek naar een plek waar niets stond: een zwart scherm.
   */
  const onLayout = useCallback(() => {
    if (positioned.current) return;
    positioned.current = true;
    list.current?.scrollToOffset({ offset: initialIndex * width, animated: false });
  }, [initialIndex, width]);

  const onMomentumEnd = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      const next = Math.round(event.nativeEvent.contentOffset.x / width);
      if (next !== index && next >= 0 && next < photos.length) onIndexChange(next);
    },
    [width, index, photos.length, onIndexChange],
  );

  return (
    <View style={styles.viewer}>
      <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.backdrop, backdrop]} />
      <FlatList
        ref={list}
        data={photos}
        keyExtractor={(photo) => photo.id}
        horizontal
        pagingEnabled
        scrollEnabled={!zoomed}
        showsHorizontalScrollIndicator={false}
        initialScrollIndex={initialIndex}
        getItemLayout={(_, i) => ({ length: width, offset: width * i, index: i })}
        onMomentumScrollEnd={onMomentumEnd}
        onLayout={onLayout}
        // Zonder dit tekent de lijst haar items niet opnieuw wanneer de actieve
        // foto verandert, en blijft een weggebladerde foto ingezoomd.
        extraData={index}
        // Enkel de buren inladen. Een album van zeventienhonderd foto's mag niet
        // zeventienhonderd keer `expo-image` monteren om er één te tonen.
        // Bewust geen `removeClippedSubviews`: in een modal liet dat een pagina
        // leeg, en met een venster van drie foto's valt er niets te winnen.
        initialNumToRender={1}
        maxToRenderPerBatch={2}
        windowSize={3}
        renderItem={({ item, index: position }) => (
          <ZoomablePhoto
            photo={item}
            width={width}
            height={height}
            active={position === index}
            onZoomChange={setZoomed}
            dismiss={dismiss}
            onClose={onClose}
          />
        )}
      />

      <Animated.View style={[styles.bar, { top: insets.top + SPACING.md }, chrome]}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Sluiten"
          onPress={onClose}
          hitSlop={14}
          style={styles.button}
        >
          <X color={COLORS.onDark} size={24} />
        </Pressable>
        {actions}
      </Animated.View>

      <Animated.Text style={[styles.counter, { bottom: insets.bottom + SPACING.xl }, chrome]}>
        {index + 1} van {photos.length}
      </Animated.Text>
    </View>
  );
}

/**
 * Eén foto, met knijpen, slepen en dubbeltikken.
 *
 * **Hoe het zoomen werkt (sinds november 2026).** Daarvoor kon je in de praktijk
 * maar één stand kiezen en ingezoomd niet schuiven: het knijpen wachtte tot de
 * dubbeltik mislukte, en of slepen mocht, hing aan een prop die de `FlatList`
 * nooit opnieuw doorgaf (een item tekent pas opnieuw bij `extraData`). Nu:
 *
 * - **Knijpen is traploos** en zoomt rond het punt tussen je vingers; met twee
 *   vingers schuif je tegelijk. Voorbij de grenzen geeft het wat mee en veert het
 *   daarna terug.
 * - **Slepen beslist zelf** of het meedoet (`manualActivation`): ingezoomd neemt
 *   het de veeg, op ware grootte laat het hem aan de lijst om te bladeren. Geen
 *   React-state ertussen, dus geen render die te laat komt.
 * - **Loslaten bolt uit** (`withDecay`) en stopt aan de rand van de foto zelf, niet
 *   aan de zwarte balken eromheen. De maten van de foto komen uit `onLoad`.
 * - **Dubbeltikken** zoomt in op de plek waar je tikt, en nog eens tikken zoomt uit.
 *
 * Zodra de foto ingezoomd is, meldt ze dat naar boven zodat de pager stopt met
 * bladeren. Bij het wegbladeren springt ze terug.
 */
function ZoomablePhoto({
  photo,
  width,
  height,
  active,
  onZoomChange,
  dismiss,
  onClose,
}: {
  photo: AppPhoto;
  width: number;
  height: number;
  active: boolean;
  onZoomChange: (zoomed: boolean) => void;
  /** Hoe ver de foto weggeveegd is, voor de achtergrond. */
  dismiss: SharedValue<number>;
  onClose: () => void;
}) {
  const scale = useSharedValue(1);
  const savedScale = useSharedValue(1);
  const x = useSharedValue(0);
  const y = useSharedValue(0);
  const savedX = useSharedValue(0);
  const savedY = useSharedValue(0);
  // Het punt onder de vingers bij het begin van het knijpen, t.o.v. het midden.
  const originX = useSharedValue(0);
  const originY = useSharedValue(0);
  // De verhouding van de foto (breedte / hoogte); tot ze geladen is die van het scherm.
  const aspect = useSharedValue(width / height);
  // Waar de vinger neerkwam, en wat de veeg doet: 0 nog niets, 1 rondkijken, 2 wegvegen.
  const touchX = useSharedValue(0);
  const touchY = useSharedValue(0);
  const mode = useSharedValue(0);

  const reset = useCallback(() => {
    scale.value = withTiming(1);
    savedScale.value = 1;
    x.value = withTiming(0);
    y.value = withTiming(0);
    savedX.value = 0;
    savedY.value = 0;
  }, [scale, savedScale, x, y, savedX, savedY]);

  // Blader je weg, dan gaat deze foto terug naar ware grootte.
  useEffect(() => {
    if (!active) reset();
  }, [active, reset]);

  /** Hoe ver de foto bij deze schaal mag schuiven voor er een rand in beeld komt. */
  const bounds = (s: number) => {
    'worklet';
    const shownWidth = Math.min(width, height * aspect.value);
    const shownHeight = Math.min(height, width / aspect.value);
    return {
      x: Math.max(0, (shownWidth * s - width) / 2),
      y: Math.max(0, (shownHeight * s - height) / 2),
    };
  };

  /** Voorbij de rand geeft het nog wat mee, maar steeds minder. */
  const rubber = (value: number, limit: number) => {
    'worklet';
    if (value > limit) return limit + (value - limit) / 3;
    if (value < -limit) return -limit + (value + limit) / 3;
    return value;
  };

  const clamp = (value: number, limit: number) => {
    'worklet';
    return Math.min(limit, Math.max(-limit, value));
  };

  /** Na het loslaten: schaal en positie terug binnen de grenzen, met een veer. */
  const settle = () => {
    'worklet';
    const target = Math.min(Math.max(scale.value, 1), MAX_SCALE);
    const limits = bounds(target);
    const nextX = target === 1 ? 0 : clamp(x.value, limits.x);
    const nextY = target === 1 ? 0 : clamp(y.value, limits.y);
    scale.value = withSpring(target, SPRING);
    x.value = withSpring(nextX, SPRING);
    y.value = withSpring(nextY, SPRING);
    savedScale.value = target;
    savedX.value = nextX;
    savedY.value = nextY;
    runOnJS(onZoomChange)(target > 1.01);
  };

  const pinch = Gesture.Pinch()
    .onStart((event) => {
      originX.value = event.focalX - width / 2;
      originY.value = event.focalY - height / 2;
      savedScale.value = scale.value;
      savedX.value = x.value;
      savedY.value = y.value;
      runOnJS(onZoomChange)(true);
    })
    .onUpdate((event) => {
      const raw = savedScale.value * event.scale;
      // Traploos, met wat meegeven onder 1 en boven het maximum.
      const next = raw < 1 ? 1 - (1 - raw) / 2 : raw > MAX_SCALE ? MAX_SCALE + (raw - MAX_SCALE) / 4 : raw;
      const ratio = next / savedScale.value;
      // Het punt onder de vingers blijft onder de vingers, en schuift mee met hun midden.
      const focusX = event.focalX - width / 2;
      const focusY = event.focalY - height / 2;
      scale.value = next;
      x.value = focusX - (originX.value - savedX.value) * ratio;
      y.value = focusY - (originY.value - savedY.value) * ratio;
    })
    .onEnd(() => {
      settle();
    });

  /**
   * Eén vinger. **Ingezoomd** is dat rondkijken. **Op ware grootte** beslist de
   * richting: omhoog of omlaag veegt de foto weg en sluit de viewer, zoals in
   * Foto's op iOS; opzij weigert het gebaar meteen, zodat de lijst eronder de
   * veeg krijgt en je naar de volgende foto bladert.
   */
  const pan = Gesture.Pan()
    .manualActivation(true)
    .maxPointers(1)
    .onTouchesDown((event) => {
      const touch = event.allTouches[0];
      if (touch) {
        touchX.value = touch.absoluteX;
        touchY.value = touch.absoluteY;
      }
      mode.value = 0;
    })
    .onTouchesMove((event, manager) => {
      if (savedScale.value > 1.01) {
        mode.value = 1;
        manager.activate();
        return;
      }
      const touch = event.allTouches[0];
      if (!touch) return;
      const dx = touch.absoluteX - touchX.value;
      const dy = touch.absoluteY - touchY.value;
      if (Math.abs(dy) > 12 && Math.abs(dy) > Math.abs(dx) * 1.2) {
        mode.value = 2;
        manager.activate();
      } else if (Math.abs(dx) > 12) {
        manager.fail();
      }
    })
    .onStart(() => {
      savedX.value = x.value;
      savedY.value = y.value;
    })
    .onUpdate((event) => {
      if (mode.value === 2) {
        x.value = event.translationX * 0.4;
        y.value = event.translationY;
        scale.value = 1 - Math.min(Math.abs(event.translationY) / 1600, 0.15);
        dismiss.value = event.translationY;
        return;
      }
      const limits = bounds(scale.value);
      x.value = rubber(savedX.value + event.translationX, limits.x);
      y.value = rubber(savedY.value + event.translationY, limits.y);
    })
    .onEnd((event) => {
      if (mode.value === 2) {
        if (Math.abs(event.translationY) > 110 || Math.abs(event.velocityY) > 900) {
          const away = (event.translationY < 0 ? -1 : 1) * height;
          dismiss.value = withTiming(away, { duration: 180 });
          y.value = withTiming(away, { duration: 180 }, (done) => {
            if (done) runOnJS(onClose)();
          });
        } else {
          x.value = withSpring(0, SPRING);
          y.value = withSpring(0, SPRING);
          scale.value = withSpring(1, SPRING);
          dismiss.value = withSpring(0, SPRING);
        }
        return;
      }
      const limits = bounds(scale.value);
      // Buiten de rand: terugveren. Erbinnen: uitbollen tot de rand.
      if (Math.abs(x.value) > limits.x) x.value = withSpring(clamp(x.value, limits.x), SPRING);
      else x.value = withDecay({ velocity: event.velocityX, clamp: [-limits.x, limits.x] });
      if (Math.abs(y.value) > limits.y) y.value = withSpring(clamp(y.value, limits.y), SPRING);
      else y.value = withDecay({ velocity: event.velocityY, clamp: [-limits.y, limits.y] });
    })
    .onFinalize(() => {
      if (mode.value !== 2) {
        savedX.value = x.value;
        savedY.value = y.value;
      }
      mode.value = 0;
    });

  const doubleTap = Gesture.Tap()
    .numberOfTaps(2)
    .maxDuration(250)
    .onEnd((event) => {
      if (savedScale.value > 1.01) {
        scale.value = withTiming(1);
        x.value = withTiming(0);
        y.value = withTiming(0);
        savedScale.value = 1;
        savedX.value = 0;
        savedY.value = 0;
        runOnJS(onZoomChange)(false);
        return;
      }
      // Inzoomen op de plek waar je tikte, binnen de randen van de foto.
      const limits = bounds(TAP_SCALE);
      const nextX = clamp(-(event.x - width / 2) * (TAP_SCALE - 1), limits.x);
      const nextY = clamp(-(event.y - height / 2) * (TAP_SCALE - 1), limits.y);
      scale.value = withTiming(TAP_SCALE);
      x.value = withTiming(nextX);
      y.value = withTiming(nextY);
      savedScale.value = TAP_SCALE;
      savedX.value = nextX;
      savedY.value = nextY;
      runOnJS(onZoomChange)(true);
    });

  /** Een tik naast de foto (in de zwarte rand erboven of eronder) sluit de viewer. */
  const singleTap = Gesture.Tap()
    .numberOfTaps(1)
    .maxDuration(250)
    .onEnd((event) => {
      if (savedScale.value > 1.01) return;
      const shownWidth = Math.min(width, height * aspect.value);
      const shownHeight = Math.min(height, width / aspect.value);
      const outside =
        Math.abs(event.x - width / 2) > shownWidth / 2 || Math.abs(event.y - height / 2) > shownHeight / 2;
      if (outside) runOnJS(onClose)();
    });

  // Knijpen en slepen tegelijk, zonder te wachten op een tik; één tik wacht wel
  // tot het geen dubbeltik is.
  const gesture = Gesture.Simultaneous(pinch, pan, Gesture.Exclusive(doubleTap, singleTap));

  const animated = useAnimatedStyle(() => ({
    transform: [{ translateX: x.value }, { translateY: y.value }, { scale: scale.value }],
  }));

  return (
    <GestureDetector gesture={gesture}>
      {/* Vaste maten en geen `flex: 1`: in een horizontale lijst is de
          hoofdas onbegrensd, en een flex-basis van 0 mag daar niet bepalen hoe
          breed een pagina is. */}
      <Animated.View style={[{ width, height }, styles.page]}>
        <Animated.View style={[{ width, height }, animated]}>
          <Image cachePolicy="memory-disk"
            source={{ uri: photo.url }}
            // De thumbnail staat al in de cache van het raster; die toont meteen,
            // tot de grote versie binnen is.
            placeholder={{ uri: photo.thumbUrl }}
            placeholderContentFit="contain"
            style={{ width, height }}
            contentFit="contain"
            transition={150}
            recyclingKey={photo.id}
            accessibilityLabel={photo.filename}
            onLoad={(event) => {
              const { width: w, height: h } = event.source;
              if (w > 0 && h > 0) aspect.value = w / h;
            }}
          />
        </Animated.View>
      </Animated.View>
    </GestureDetector>
  );
}

/** Een veer zonder doorschieten: de foto mag terugkomen, niet natrillen. */
const SPRING = { damping: 26, stiffness: 260, mass: 0.9 } as const;

const styles = StyleSheet.create({
  root: { flex: 1 },
  // Bewust bijna zwart en niet navy: een foto beoordeel je niet tegen een
  // gekleurde achtergrond.
  viewer: { flex: 1 },
  backdrop: { backgroundColor: 'rgba(0,0,0,0.94)' },
  page: { alignItems: 'center', justifyContent: 'center' },
  bar: {
    position: 'absolute',
    left: SPACING.lg,
    right: SPACING.lg,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  button: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    // Een lichte vulling, zodat de icoontjes ook op een lichte foto leesbaar zijn.
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  counter: { ...TYPE.small, color: COLORS.onDarkMuted, alignSelf: 'center', position: 'absolute' },
});
