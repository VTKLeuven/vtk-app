import { useEffect, useRef } from 'react';

/**
 * Een segment dat ook van buitenaf gezet kan worden (`/tickets?tab=mijne`).
 *
 * Het bestaat om één geval: je staat al op de Tickets-tab en tikt elders "Mijn
 * tickets" aan. De `useState`-initialisatie van dat scherm draait dan niet
 * opnieuw, want het scherm is al gemonteerd, en het segment blijft staan waar het
 * stond. Wie dat niet doorheeft, denkt dat de knop stuk is.
 *
 * Wat het **niet** doet is het segment bij elke render terugzetten. De parameter
 * blijft in het adres staan nadat hij toegepast is; zou dit erop blijven kijken,
 * dan kon je daarna zelf niet meer wisselen. Vandaar de referentie: enkel een
 * waarde die verschilt van de vorige telt als een nieuwe opdracht.
 */
export function useTabParam<T extends string>(
  value: string | undefined,
  allowed: readonly T[],
  onChange: (next: T) => void,
  /**
   * Een volgnummer uit het adres (`?tab=agenda&n=...`), voor een knop die
   * hetzelfde tabblad opnieuw moet kunnen openen nadat je zelf wisselde.
   */
  nonce?: string,
): void {
  const applied = useRef(`${value}|${nonce ?? ''}`);
  const latest = useRef({ allowed, onChange });
  latest.current = { allowed, onChange };

  useEffect(() => {
    const key = `${value}|${nonce ?? ''}`;
    if (key === applied.current) return;
    applied.current = key;

    const { allowed: options, onChange: apply } = latest.current;
    if (value && (options as readonly string[]).includes(value)) apply(value as T);
  }, [value, nonce]);
}
