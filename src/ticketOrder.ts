import { ApiError } from './api/client';

/**
 * Wat de ticketpagina doorgeeft aan het scherm waar je bestelt: per tickettype
 * het aantal, als `type:aantal,type:aantal` in de adresbalk. Zo overleeft de
 * keuze ook een herstart van de stack, en het bestelscherm haalt het event zelf
 * opnieuw op (uit de cache), dus enkel de aantallen moeten mee.
 */
export function encodeQuantities(quantities: Record<string, number>): string {
  return Object.entries(quantities)
    .filter(([, quantity]) => quantity > 0)
    .map(([id, quantity]) => `${id}:${quantity}`)
    .join(',');
}

export function decodeQuantities(value: string | undefined): Record<string, number> {
  const out: Record<string, number> = {};
  for (const part of (value ?? '').split(',')) {
    const [id, raw] = part.split(':');
    const quantity = Number(raw);
    if (id && Number.isInteger(quantity) && quantity > 0) out[id] = quantity;
  }
  return out;
}

/** De melding bij een geweigerde bestelling; de codes komen van `TicketCheckoutError`. */
export function checkoutErrorText(error: unknown): string {
  if (!(error instanceof ApiError)) {
    return 'Geen verbinding met vtk.be. Probeer het straks opnieuw.';
  }
  switch (error.code) {
    case 'EVENT_NOT_ON_SALE':
      return 'De verkoop voor dit event is intussen gesloten.';
    case 'SOLD_OUT':
      return 'Er zijn niet genoeg tickets meer beschikbaar.';
    case 'LOGIN_REQUIRED':
      return 'Voor dit ticket moet je ingelogd zijn.';
    case 'TOO_MANY_RESERVATIONS':
      return 'Je hebt al een bestelling lopen. Rond die eerst af of wacht tot ze vervalt.';
    case 'FREE_TICKET_LIMIT':
      return 'Je hebt het maximum aan gratis tickets bereikt.';
    case 'HONORARY_PRICE_USED':
      return 'Je erelidticket voor dit event heb je al. Kies de gewone prijs.';
    case 'HONORARY_TICKET_LIMIT':
      return 'Als erelid koop je voor dit event één ticket, en dat heb je al.';
    case 'MEMBERSHIP_REQUIRED':
      return 'Dit ticket is enkel voor leden van VTK.';
    case 'INVALID_TICKET_TYPE':
      return 'Een gekozen tickettype is niet meer beschikbaar.';
    case 'INVALID_QUANTITY':
      return 'Dat aantal kan niet voor dit tickettype.';
    case 'INVALID_ANSWER':
      return 'Een van de antwoorden is niet geldig. Kijk de vragen nog eens na.';
    case 'PAYMENT_UNAVAILABLE':
      return 'De betaaldienst is even niet bereikbaar. Probeer het straks opnieuw.';
    case 'BUSY':
      // Een 503 van de checkout bij een rush: er is niets besteld en meteen
      // opnieuw proberen kan lukken, dus niet "straks".
      return 'Het is heel druk. Je bestelling is niet doorgegaan; probeer meteen opnieuw.';
    default:
      return error.message;
  }
}

/**
 * De melding wanneer een betaling niet start (`POST /api/tickets/orders/<id>/pay`).
 * `ALREADY_PAID` en `METHOD_UNAVAILABLE` vangt het bestelscherm zelf op.
 */
export function paymentErrorText(error: unknown): string {
  if (!(error instanceof ApiError)) {
    return 'Geen verbinding met vtk.be. Probeer het straks opnieuw.';
  }
  switch (error.code) {
    case 'RESERVATION_EXPIRED':
      return 'Je tickets waren te lang gereserveerd en zijn weer vrijgegeven. Bestel opnieuw.';
    case 'PAYMENT_IN_PROGRESS':
    case 'PAYMENT_PENDING_ELSEWHERE':
      return 'Er loopt al een betaling voor deze bestelling. Wacht even en kijk dan bij Mijn tickets.';
    case 'ORDER_NOT_PAYABLE':
      return 'Deze bestelling kan niet meer betaald worden. Bestel opnieuw.';
    case 'BUSY':
      return 'Het is heel druk. Probeer meteen opnieuw.';
    default:
      return 'De betaaldienst is even niet bereikbaar. Probeer het straks opnieuw.';
  }
}
