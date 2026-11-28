import { ApiError } from './api/client';
import { t } from './i18n';

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
    return t('Geen verbinding met vtk.be. Probeer het straks opnieuw.', 'No connection to vtk.be. Try again later.');
  }
  switch (error.code) {
    case 'EVENT_NOT_ON_SALE':
      return t('De verkoop voor dit event is intussen gesloten.', 'Sales for this event have closed in the meantime.');
    case 'SOLD_OUT':
      return t('Er zijn niet genoeg tickets meer beschikbaar.', 'There are not enough tickets left.');
    case 'LOGIN_REQUIRED':
      return t('Voor dit ticket moet je ingelogd zijn.', 'You need to be logged in for this ticket.');
    case 'TOO_MANY_RESERVATIONS':
      return t('Je hebt al een bestelling lopen. Rond die eerst af of wacht tot ze vervalt.', 'You already have an order in progress. Finish it first or wait until it expires.');
    case 'FREE_TICKET_LIMIT':
      return t('Je hebt het maximum aan gratis tickets bereikt.', 'You have reached the maximum number of free tickets.');
    case 'HONORARY_PRICE_USED':
      return t('Je erelidticket voor dit event heb je al. Kies de gewone prijs.', 'You already have your honorary member ticket for this event. Choose the regular price.');
    case 'HONORARY_TICKET_LIMIT':
      return t('Als erelid koop je voor dit event één ticket, en dat heb je al.', 'As an honorary member you can buy one ticket for this event, and you already have it.');
    case 'MEMBERSHIP_REQUIRED':
      return t('Dit ticket is enkel voor leden van VTK.', 'This ticket is for VTK members only.');
    case 'INVALID_TICKET_TYPE':
      return t('Een gekozen tickettype is niet meer beschikbaar.', 'A chosen ticket type is no longer available.');
    case 'INVALID_QUANTITY':
      return t('Dat aantal kan niet voor dit tickettype.', 'That quantity is not possible for this ticket type.');
    case 'INVALID_ANSWER':
      return t('Een van de antwoorden is niet geldig. Kijk de vragen nog eens na.', 'One of the answers is not valid. Check the questions again.');
    case 'PAYMENT_UNAVAILABLE':
      return t('De betaaldienst is even niet bereikbaar. Probeer het straks opnieuw.', 'The payment service is unavailable right now. Try again later.');
    case 'BUSY':
      // Een 503 van de checkout bij een rush: er is niets besteld en meteen
      // opnieuw proberen kan lukken, dus niet "straks".
      return t('Het is heel druk. Je bestelling is niet doorgegaan; probeer meteen opnieuw.', 'It is very busy. Your order did not go through; try again right away.');
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
    return t('Geen verbinding met vtk.be. Probeer het straks opnieuw.', 'No connection to vtk.be. Try again later.');
  }
  switch (error.code) {
    case 'RESERVATION_EXPIRED':
      return t('Je tickets waren te lang gereserveerd en zijn weer vrijgegeven. Bestel opnieuw.', 'Your tickets were reserved for too long and have been released. Order again.');
    case 'PAYMENT_IN_PROGRESS':
    case 'PAYMENT_PENDING_ELSEWHERE':
      return t('Er loopt al een betaling voor deze bestelling. Wacht even en kijk dan bij Mijn tickets.', 'A payment for this order is already in progress. Wait a moment and then check My tickets.');
    case 'ORDER_NOT_PAYABLE':
      return t('Deze bestelling kan niet meer betaald worden. Bestel opnieuw.', 'This order can no longer be paid. Order again.');
    case 'BUSY':
      return t('Het is heel druk. Probeer meteen opnieuw.', 'It is very busy. Try again right away.');
    default:
      return t('De betaaldienst is even niet bereikbaar. Probeer het straks opnieuw.', 'The payment service is unavailable right now. Try again later.');
  }
}
