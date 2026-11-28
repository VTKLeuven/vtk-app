import type { AppAlmaDish, AppAlmaRestaurant } from './api/contract';
import { formatEuro } from './format';
import { IS_EN, t } from './i18n';

/**
 * Wat Home en het Alma-scherm samen over een Alma zeggen: de statusregel en de
 * gerechten die het vermelden waard zijn. De beslissing (open of niet, welk
 * menu) komt van de server; hier staat enkel hoe dat in een zin komt.
 */

/** "Open tot 14:00", "Opent 17:30", "Opent morgen 10:00", in dezelfde woorden als `ServiceList`. */
export function almaStatusLine(restaurant: AppAlmaRestaurant): string {
  const detail = restaurant.detail.trim();
  if (restaurant.unavailable) return detail;
  // Met `?locale=en` schrijft de server de toestand in het Engels, zoals bij `ServiceList`.
  if (IS_EN) {
    if (restaurant.openNow) return detail.startsWith('until') ? `Open ${detail}` : 'Open now';
    if (detail === 'closed') return 'Closed';
    if (detail.startsWith('opens')) return `O${detail.slice(1)}`;
    return `Opens ${detail}`;
  }
  if (restaurant.openNow) return detail.startsWith('tot') ? `Open ${detail}` : 'Nu open';
  if (detail === 'gesloten') return 'Gesloten';
  if (detail.startsWith('opent')) return `O${detail.slice(1)}`;
  return `Opent ${detail}`;
}

/** Iets dat gratis bij een gerecht hoort (geraspte kaas), is geen gerecht. */
function isExtra(dish: AppAlmaDish): boolean {
  return dish.prices.kuleuven === 0;
}

/**
 * De gerechten om op één regel te zetten: de warme maaltijden, en wie die niet
 * heeft (Quadrivium, De Moete) de soep. `kind` zegt welke van de twee het werd.
 * Twee gerechten met dezelfde naam (Alma zet de vegan versie er soms met een punt
 * achter) tellen één keer.
 */
export function almaHighlights(restaurant: AppAlmaRestaurant): { kind: 'warm' | 'soep'; dishes: AppAlmaDish[] } | null {
  const pick = (pattern: RegExp) =>
    restaurant.menu
      .filter((section) => pattern.test(section.title))
      .flatMap((section) => section.groups.flatMap((group) => group.dishes))
      .filter((dish) => !isExtra(dish));

  const unique = (dishes: AppAlmaDish[]) => {
    const seen = new Set<string>();
    return dishes.filter((dish) => {
      const key = dish.name.replace(/[.\s]+$/, '').toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  };

  const warm = unique(pick(/warm/i));
  if (warm.length > 0) return { kind: 'warm', dishes: warm };
  const soup = unique(pick(/^so(e|u)p/i));
  if (soup.length > 0) return { kind: 'soep', dishes: soup };
  return null;
}

/** Eurocent naar "€6,15". */
export function almaPrice(cents: number | null): string | null {
  if (cents === null) return null;
  if (cents === 0) return t('Gratis', 'Free');
  return formatEuro(cents);
}

/** Minuten sinds middernacht naar "11:30". */
export function almaClock(minutes: number): string {
  const hour = Math.floor(minutes / 60) % 24;
  return `${String(hour).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
}
