import { CARD_SHADOW } from '../components/HomeSection';
import { COLORS as APP, FLOORPLAN, FONTS as APP_FONTS, RADIUS as APP_RADIUS, SPACING as APP_SPACING } from '../theme/tokens';

/**
 * De namen die de onderdelen uit vtk-floorplan-app gebruiken, op de tokens van
 * de app gelegd. Zo konden `BoothNode`, `InteractiveFloorplan` en de gebaren
 * bijna ongewijzigd overkomen en volgen ze toch het ontwerp van de app. Geen
 * nieuwe kleuren hier: die staan in `src/theme/tokens.ts` (`FLOORPLAN`).
 */
export const COLORS = {
  primary: APP.navy,
  primaryDark: APP.ink,
  accent: APP.yellow,
  accentDark: APP.yellowDeep,
  accentSoft: APP.lowBg,
  primarySoft: APP.paper2,
  surface: APP.surface,
  border: APP.line,
  text: APP.ink,
  textMuted: APP.muted,
  textInverse: APP.surface,
  floorplan: {
    canvas: FLOORPLAN.canvas,
    boothDefaultFill: FLOORPLAN.boothFill,
    boothDefaultStroke: FLOORPLAN.boothStroke,
    boothEmptyFill: FLOORPLAN.boothEmptyFill,
    boothEmptyStroke: FLOORPLAN.boothEmptyStroke,
  },
} as const;

export const FONTS = APP_FONTS;
export const SPACING = { xs: 4, sm: 8, md: APP_SPACING.md, xl: APP_SPACING.xl } as const;
export const RADIUS = { xs: 6, sm: APP_RADIUS.sm, md: 14, xl: 28, full: APP_RADIUS.pill } as const;
export const SHADOWS = { xs: CARD_SHADOW, sm: CARD_SHADOW, md: CARD_SHADOW, lg: CARD_SHADOW } as const;
export const TEXT = {
  label: { fontFamily: APP_FONTS.medium, fontSize: 13, lineHeight: 18, color: APP.muted },
} as const;
export const HIT_TARGET = 44;
export const MOTION = {
  spring: { damping: 18, stiffness: 180, mass: 0.9 },
  springSnappy: { damping: 20, stiffness: 320, mass: 0.7 },
  timing: { duration: 200 },
  timingFast: { duration: 120 },
} as const;

export function getCategoryColor(categoryId: number | null | undefined): string {
  if (categoryId == null) return APP.yellow;
  return FLOORPLAN.categories[categoryId] ?? APP.yellow;
}
