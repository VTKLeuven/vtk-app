import { apiFetch, appApi } from './client';
import type {
  AppAdminDashboard,
  AppAlma,
  AppAlbumDetail,
  AppBurgieclanCourse,
  AppBurgieclanCourseDetail,
  AppBurgieclanCourses,
  AppBurgieclanFile,
  AppCalendar,
  AppCalendarEventDetail,
  AppCategory,
  AppCudiCancelResult,
  AppCudiCatalog,
  AppCudiOrderInput,
  AppCudiOrderResult,
  AppCudiOverview,
  AppCudiTimeslotResult,
  AppCudiTimeslots,
  AppFakCheckin,
  AppPaymentMethod,
  AppGroups,
  AppLocale,
  AppMedia,
  AppMyOrder,
  AppNotificationSettings,
  AppNotificationTopic,
  AppPage,
  AppPassHolder,
  AppPiano,
  AppPlanning,
  AppPlanningOperation,
  AppPoc,
  AppPollAnswerInput,
  AppPolls,
  AppPraesidium,
  AppProfile,
  AppRooms,
  AppScanEvent,
  AppScannerInviteResult,
  AppSearch,
  AppShifts,
  AppStudyAction,
  AppStudyOverview,
  AppStudyStopResult,
  AppTheokot,
  AppTheokotOrderInput,
  AppTheokotReleaseInput,
  AppTheokotUpdateInput,
  AppTicketEvent,
  AppTicketEventDetail,
  AppToday,
  AppTransportWeek,
  AppVoucherRedeemInput,
  AppVoucherRedeemResult,
  AppVouchers,
} from './contract';

/**
 * De endpoints van de app-API. Eén regel per aanroep, zodat de schermen niets van
 * paden hoeven te weten en de versie op één plek staat (`appApi`).
 */

/**
 * De kalender. Zonder `van` vertrekt de lijst vanaf nu; de maandweergave geeft
 * het zichtbare rooster mee, want die toont ook het verleden.
 */
export function fetchCalendar(
  locale: AppLocale,
  options: {
    categorie?: string;
    audience?: 'all';
    van?: string;
    tot?: string;
    /** Enkel wat je zelf met een ster aanduidde. */
    interesse?: boolean;
  } = {},
): Promise<AppCalendar> {
  return apiFetch<AppCalendar>(
    appApi('/kalender', {
      locale,
      categorie: options.categorie,
      audience: options.audience,
      van: options.van,
      tot: options.tot,
      interesse: options.interesse ? '1' : undefined,
    }),
  );
}

export function fetchCalendarEvent(locale: AppLocale, id: string): Promise<AppCalendarEventDetail> {
  return apiFetch<AppCalendarEventDetail>(appApi(`/kalender/${encodeURIComponent(id)}`, { locale }));
}

export function fetchTheokot(locale: AppLocale): Promise<AppTheokot> {
  return apiFetch<AppTheokot>(appApi('/theokot', { locale }));
}

export function placeTheokotOrder(
  input: AppTheokotOrderInput,
): Promise<{ orderId: string; totalCents: number }> {
  return apiFetch(appApi('/theokot/order'), { method: 'POST', body: input });
}

export function cancelTheokotOrder(orderId: string): Promise<{ ok: true }> {
  return apiFetch(appApi('/theokot/order'), { method: 'DELETE', body: { orderId } });
}

/** Een reservatie aanpassen zolang het bestelvenster open is. */
export function updateTheokotOrder(
  input: AppTheokotUpdateInput,
): Promise<{ orderId: string; totalCents: number }> {
  return apiFetch(appApi('/theokot/order'), { method: 'PATCH', body: input });
}

/** Na de deadline: broodjes vrijgeven voor overname. Zonder `lines` alles. */
export function releaseTheokotOrder(input: AppTheokotReleaseInput): Promise<{ ok: true }> {
  return apiFetch(appApi('/theokot/vrijgeven'), { method: 'POST', body: input });
}

/** Eén vrijgegeven broodje overnemen. */
export function takeOverTheokotSandwich(
  sessionItemId: string,
): Promise<{ orderId: string; totalCents: number }> {
  return apiFetch(appApi('/theokot/overnemen'), { method: 'POST', body: { sessionItemId } });
}

// ── Tickets ─────────────────────────────────────────────────────────────────

export function fetchTicketEvents(locale: AppLocale): Promise<AppTicketEvent[]> {
  return apiFetch<AppTicketEvent[]>(appApi('/tickets', { locale }));
}

export function fetchTicketEvent(locale: AppLocale, slug: string): Promise<AppTicketEventDetail> {
  return apiFetch<AppTicketEventDetail>(
    appApi(`/tickets/${encodeURIComponent(slug)}`, { locale }),
  );
}

export function fetchMyTickets(locale: AppLocale): Promise<AppMyOrder[]> {
  return apiFetch<AppMyOrder[]>(appApi('/mijn/tickets', { locale }));
}

export function fetchProfile(locale: AppLocale): Promise<AppProfile> {
  return apiFetch<AppProfile>(appApi('/mijn/profiel', { locale }));
}

/**
 * Afrekenen gaat naar de bestaande route van de webshop en niet naar `/app/v1`.
 *
 * Twee redenen. Een wrapper zou hier niets doen dan doorgeven; en die route zet
 * het order-toegangscookie dat daarna nodig is om de status van de bestelling te
 * mogen lezen. `fetch` in React Native deelt die cookie-opslag met de browser die
 * de betaling opent, dus dat werkt vanzelf mee.
 */
export function startTicketCheckout(input: {
  eventId: string;
  buyerName: string;
  buyerEmail: string;
  locale: AppLocale;
  termsAccepted: true;
  /** Voor de ticketstatistieken; de site zet het ook zelf voor elke aanvraag uit de app. */
  source?: 'app';
  items: {
    ticketTypeId: string;
    attendeeName: string;
    attendeeEmail?: string;
    answers: Record<string, string | boolean | string[]>;
  }[];
}): Promise<{ orderId: string; orderNumber: string; checkoutUrl: string }> {
  return apiFetch('/api/tickets/checkout', { method: 'POST', body: { source: 'app', ...input } });
}

/**
 * De betaling van een bestelling starten met de gekozen betaalwijze; dezelfde
 * route als de knoppen op de bestelpagina van de site. Het toegangscookie dat de
 * checkout zette, reist mee in de cookie-opslag (zie `client.ts`). Het antwoord
 * is de pagina van Mollie of de Bancontact-pagina op vtk.be.
 */
export function startOrderPayment(
  orderId: string,
  provider: AppPaymentMethod,
  locale: AppLocale,
): Promise<{ provider: AppPaymentMethod; checkoutUrl: string }> {
  return apiFetch(`/api/tickets/orders/${encodeURIComponent(orderId)}/pay`, {
    method: 'POST',
    body: { provider, locale },
  });
}

/** De stand van een bestelling, om na het betalen te weten of ze doorging. */
export function fetchOrderStatus(orderId: string): Promise<{ id: string; status: string }> {
  return apiFetch(`/api/tickets/orders/${encodeURIComponent(orderId)}/status`);
}

// ── Inhoud, zoeken, media en mensen ─────────────────────────────────────────

export function fetchCategory(locale: AppLocale, slug: string): Promise<AppCategory> {
  return apiFetch<AppCategory>(appApi(`/categorie/${encodeURIComponent(slug)}`, { locale }));
}

export function fetchPage(locale: AppLocale, slug: string): Promise<AppPage> {
  return apiFetch<AppPage>(appApi(`/paginas/${encodeURIComponent(slug)}`, { locale }));
}

export function search(locale: AppLocale, query: string): Promise<AppSearch> {
  return apiFetch<AppSearch>(appApi('/zoeken', { locale, q: query }));
}

export function fetchMedia(locale: AppLocale): Promise<AppMedia> {
  return apiFetch<AppMedia>(appApi('/media', { locale }));
}

export function fetchAlbum(locale: AppLocale, slug: string): Promise<AppAlbumDetail> {
  return apiFetch<AppAlbumDetail>(appApi(`/media/${encodeURIComponent(slug)}`, { locale }));
}

export function fetchPraesidium(locale: AppLocale, year?: number): Promise<AppPraesidium> {
  return apiFetch<AppPraesidium>(
    appApi('/praesidium', { locale, jaar: year === undefined ? undefined : String(year) }),
  );
}

// ── Shiften ─────────────────────────────────────────────────────────────────

export function fetchShifts(locale: AppLocale): Promise<AppShifts> {
  return apiFetch<AppShifts>(appApi('/shiften', { locale }));
}

/**
 * In- en uitschrijven gaan naar de bestaande route van de site.
 *
 * Die doet meer dan een rij wegschrijven: ze bewaakt overlappende shiften en de
 * 24-uursgrens, en ze duwt een cursusdienst-shift door naar cudi. Dat hier
 * overdoen zou betekenen dat een uitschrijving in de app op cudi kan blijven
 * staan.
 */
/**
 * `replaceable`: enkel voor een praesidiumlid (`AppShift.replaceableOption`).
 * Een student mag dan deze plaats innemen wanneer de shift vol staat.
 */
export function registerForShift(
  shiftId: string,
  options: { replaceable?: boolean } = {},
): Promise<unknown> {
  const extra = options.replaceable ? '&replaceable=1' : '';
  return apiFetch(`/api/shift/register?id=${encodeURIComponent(shiftId)}${extra}`, {
    method: 'POST',
  });
}

/** Achteraf aanzetten of uitzetten of een student je plaats mag innemen. */
export function setShiftReplaceable(shiftId: string, replaceable: boolean): Promise<unknown> {
  return apiFetch(`/api/shift/register?id=${encodeURIComponent(shiftId)}`, {
    method: 'PATCH',
    body: { replaceable },
  });
}

export function unregisterFromShift(shiftId: string): Promise<unknown> {
  return apiFetch(`/api/shift/register?id=${encodeURIComponent(shiftId)}`, { method: 'DELETE' });
}

// ── Peilingen ───────────────────────────────────────────────────────────────

export function fetchPolls(locale: AppLocale): Promise<AppPolls> {
  return apiFetch<AppPolls>(appApi('/peilingen', { locale }));
}

export function answerPoll(input: AppPollAnswerInput): Promise<{ ok: true }> {
  return apiFetch(appApi('/peilingen'), { method: 'POST', body: input });
}

// ── Groepen ─────────────────────────────────────────────────────────────────

export function fetchWerkgroepen(locale: AppLocale, year?: number): Promise<AppGroups> {
  return apiFetch<AppGroups>(
    appApi('/werkgroepen', { locale, jaar: year === undefined ? undefined : String(year) }),
  );
}

export function fetchPocs(locale: AppLocale): Promise<AppPoc[]> {
  return apiFetch<AppPoc[]>(appApi('/pocs', { locale }));
}

// ── Piano ───────────────────────────────────────────────────────────────────

export function fetchPiano(locale: AppLocale): Promise<AppPiano> {
  return apiFetch<AppPiano>(appApi('/piano', { locale }));
}

export function reservePianoSlot(startsAt: string): Promise<{ startsAt: string; endsAt: string }> {
  return apiFetch(appApi('/piano/reservatie'), { method: 'POST', body: { startsAt } });
}

export function cancelPianoSlot(id: string): Promise<{ ok: true }> {
  return apiFetch(appApi('/piano/reservatie'), { method: 'DELETE', body: { id } });
}

// ── Vandaag ─────────────────────────────────────────────────────────────────

/**
 * Het beginscherm. Bewust een eigen endpoint en niet `/home`: die laatste is de
 * voorpagina van de site in gegevensvorm en blijft bestaan voor toestellen die
 * nog op de vorige versie van de app zitten.
 */
export function fetchToday(locale: AppLocale): Promise<AppToday> {
  return apiFetch<AppToday>(appApi('/vandaag', { locale, peilingen: '1' }));
}

// ── Interesse en gevolgde categorieën ───────────────────────────────────────

export function setEventInterest(id: string, interested: boolean): Promise<{ interested: boolean }> {
  return apiFetch(appApi(`/kalender/${encodeURIComponent(id)}/interesse`), {
    method: interested ? 'POST' : 'DELETE',
  });
}

export function fetchNotificationSettings(locale: AppLocale): Promise<AppNotificationSettings> {
  return apiFetch<AppNotificationSettings>(appApi('/mijn/meldingen', { locale }));
}

type NotificationPatch = { topics: AppNotificationSettings['topics']; followedCategories: string[] };

export function setNotificationTopic(
  topic: AppNotificationTopic,
  enabled: boolean,
): Promise<NotificationPatch> {
  return apiFetch(appApi('/mijn/meldingen'), { method: 'PATCH', body: { topic, enabled } });
}

export function setCategoryFollow(category: string, follow: boolean): Promise<NotificationPatch> {
  return apiFetch(appApi('/mijn/meldingen'), { method: 'PATCH', body: { category, follow } });
}

// ── Bonnetjes ───────────────────────────────────────────────────────────────

/** `locale` geeft de titels van de shiftladder (`shiftYear`) in die taal. */
export function fetchVouchers(locale?: AppLocale): Promise<AppVouchers> {
  return apiFetch<AppVouchers>(appApi('/mijn/bonnetjes', { locale }));
}

/** Wie hoort bij deze pas, en hoeveel staat er open. Nog niets afgeboekt. */
export function lookupPass(pass: string): Promise<AppPassHolder> {
  return apiFetch<AppPassHolder>(appApi('/bonnetjes/pas'), { method: 'POST', body: { pass } });
}

export function redeemVouchers(input: AppVoucherRedeemInput): Promise<AppVoucherRedeemResult> {
  return apiFetch(appApi('/bonnetjes/inwisselen'), { method: 'POST', body: input });
}

// ── Scannen ─────────────────────────────────────────────────────────────────

export function fetchScanEvents(locale: AppLocale): Promise<AppScanEvent[]> {
  return apiFetch<AppScanEvent[]>(appApi('/scan/events', { locale }));
}

export function redeemScannerInvite(code: string): Promise<AppScannerInviteResult> {
  return apiFetch(appApi('/scan/uitnodiging'), { method: 'POST', body: { code } });
}

// ── Fakbar ──────────────────────────────────────────────────────────────────

export function fakCheckin(code: string): Promise<AppFakCheckin> {
  return apiFetch<AppFakCheckin>(appApi('/fakbar/checkin'), { method: 'POST', body: { code } });
}

// ── Samen blokken ───────────────────────────────────────────────────────────

export function fetchStudyOverview(): Promise<AppStudyOverview> {
  return apiFetch<AppStudyOverview>(appApi('/studeren'));
}

export function startStudySession(input: {
  subject?: string;
  subjectHidden?: boolean;
}): Promise<AppStudyOverview> {
  return apiFetch(appApi('/studeren/sessie'), { method: 'POST', body: input });
}

/**
 * Pauzeren, hervatten of enkel laten weten dat het scherm nog openstaat.
 *
 * De app stuurt dit ook wanneer er niets veranderde. Dat levensteken is niet
 * beleefdheid maar meting: blijft het weg, dan telt de server de sessie tot het
 * laatste moment waarop hij wist dat ze liep.
 */
export function updateStudySession(input: {
  action: AppStudyAction;
  subject?: string;
  subjectHidden?: boolean;
}): Promise<AppStudyOverview> {
  return apiFetch(appApi('/studeren/sessie'), { method: 'PATCH', body: input });
}

export function stopStudySession(): Promise<AppStudyStopResult> {
  return apiFetch(appApi('/studeren/sessie'), { method: 'DELETE' });
}

export function setStudyGoal(dailyGoalMinutes: number): Promise<AppStudyOverview> {
  return apiFetch(appApi('/studeren/doel'), { method: 'PATCH', body: { dailyGoalMinutes } });
}

/** De vakken onder "Waaraan werk je?", de hele lijst in één keer. */
export function setStudySubjects(subjects: string[]): Promise<AppStudyOverview> {
  return apiFetch(appApi('/studeren/vakken'), { method: 'PUT', body: { subjects } });
}

export function createStudyGroup(
  name: string,
): Promise<{ groupId: string; overview: AppStudyOverview }> {
  return apiFetch(appApi('/studeren/groepen'), { method: 'POST', body: { name } });
}

export function joinStudyGroup(
  code: string,
): Promise<{ groupId: string; overview: AppStudyOverview }> {
  return apiFetch(appApi('/studeren/groepen/deelnemen'), { method: 'POST', body: { code } });
}

export function updateStudyGroup(
  groupId: string,
  changes: { name?: string; weeklyGoalMinutes?: number | null },
): Promise<AppStudyOverview> {
  return apiFetch(appApi(`/studeren/groepen/${encodeURIComponent(groupId)}`), {
    method: 'PATCH',
    body: changes,
  });
}

/** Zelf vertrekken, of als eigenaar iemand anders eruit zetten. */
export function leaveStudyGroup(groupId: string, memberId?: string): Promise<AppStudyOverview> {
  const path = appApi(`/studeren/groepen/${encodeURIComponent(groupId)}`);
  return apiFetch(memberId ? `${path}?lid=${encodeURIComponent(memberId)}` : path, {
    method: 'DELETE',
  });
}

// ── Lokalen ─────────────────────────────────────────────────────────────────

/**
 * De lokalenzoeker.
 *
 * Zonder `query` komen alle gebouwen mee met hun contour; dat is wat de kaart
 * nodig heeft en het is klein genoeg om in één keer te cachen. Met `query` komen
 * de treffers erbij in `results`. Het zoeken zelf gebeurt op de server: die
 * beslist wat "200k0006" betekent, niet de app.
 */
export function fetchRooms(query?: string): Promise<AppRooms> {
  return apiFetch<AppRooms>(appApi('/lokalen', { q: query?.trim() || undefined }));
}

// ── Planning (Burgieclan) ───────────────────────────────────────────────────

/**
 * De planning van Burgieclan: lessenrooster, deadlines en de VTK-evenementen
 * erin. De site geeft alles door aan Burgieclan, dus dit zijn dezelfde gegevens
 * als op burgieclan.be. Een sync van het lessenrooster mag even duren, vandaar
 * de ruimere timeout.
 */
export function fetchPlanning(locale: AppLocale): Promise<AppPlanning> {
  return apiFetch<AppPlanning>(appApi('/planning', { locale }), { timeout: 35_000 });
}

export function planningOperation(locale: AppLocale, operation: AppPlanningOperation): Promise<AppPlanning> {
  return apiFetch<AppPlanning>(appApi('/planning/operations', { locale }), {
    method: 'POST',
    body: operation,
    timeout: 20_000,
  });
}

export function subscribePlanning(locale: AppLocale, icsUrl: string): Promise<AppPlanning> {
  return apiFetch<AppPlanning>(appApi('/planning/subscription', { locale }), {
    method: 'POST',
    body: { icsUrl },
    timeout: 35_000,
  });
}

export function unsubscribePlanning(locale: AppLocale): Promise<AppPlanning> {
  return apiFetch<AppPlanning>(appApi('/planning', { locale }), { method: 'DELETE', timeout: 20_000 });
}

export function syncPlanning(locale: AppLocale): Promise<AppPlanning> {
  return apiFetch<AppPlanning>(appApi('/planning/sync', { locale }), { method: 'POST', timeout: 35_000 });
}

export function rotatePlanningFeed(locale: AppLocale): Promise<AppPlanning> {
  return apiFetch<AppPlanning>(appApi('/planning/feed-token', { locale }), { method: 'POST' });
}

// ── Beheer (de admin, voor wie er toegang toe heeft) ────────────────────────

export function fetchAdminDashboard(locale: AppLocale): Promise<AppAdminDashboard> {
  return apiFetch<AppAdminDashboard>(appApi('/beheer', { locale }));
}

/** De voordeur op afstand openen; de Pi kan even nodig hebben. */
export function openDoor(): Promise<{ ok: true }> {
  return apiFetch(appApi('/beheer/deur'), { method: 'POST', body: {}, timeout: 20_000 });
}

// ── Transport (Logistiek) ───────────────────────────────────────────────────

/** De ritten van één week; `week` is een dag in die week (YYYY-MM-DD). */
export function fetchTransportWeek(locale: AppLocale, week?: string): Promise<AppTransportWeek> {
  return apiFetch<AppTransportWeek>(appApi('/vervoer', { locale, week }));
}

// ── Burgieclan: vakken en documenten ────────────────────────────────────────

export function fetchBurgieclanCourses(locale: AppLocale): Promise<AppBurgieclanCourses> {
  return apiFetch<AppBurgieclanCourses>(appApi('/burgieclan/vakken', { locale }), { timeout: 20_000 });
}

export function searchBurgieclanCourses(
  locale: AppLocale,
  q: string,
  signal?: AbortSignal,
): Promise<{ courses: AppBurgieclanCourse[] }> {
  return apiFetch(appApi('/burgieclan/vakken/zoeken', { locale, q }), { signal, timeout: 20_000 });
}

export function fetchBurgieclanCourse(locale: AppLocale, id: string): Promise<AppBurgieclanCourseDetail> {
  return apiFetch<AppBurgieclanCourseDetail>(appApi(`/burgieclan/vakken/${encodeURIComponent(id)}`, { locale }), {
    timeout: 20_000,
  });
}

export function setBurgieclanFavorite(
  locale: AppLocale,
  id: number,
  favorite: boolean,
): Promise<{ course: AppBurgieclanCourse }> {
  return apiFetch(appApi(`/burgieclan/vakken/${id}/favoriet`, { locale }), {
    method: favorite ? 'PUT' : 'DELETE',
    body: favorite ? {} : undefined,
  });
}

export function fetchBurgieclanFile(id: number): Promise<AppBurgieclanFile> {
  return apiFetch<AppBurgieclanFile>(appApi(`/burgieclan/documenten/${id}/bestand`));
}

// ── Cursusdienst (cudi.vtk.be) ──────────────────────────────────────────────

export function fetchCudiOverview(locale: AppLocale): Promise<AppCudiOverview> {
  return apiFetch<AppCudiOverview>(appApi('/cudi', { locale }), { timeout: 20_000 });
}

/** Met `q` (minstens twee tekens) zoeken op titel, auteur, vaknaam of vakcode. */
export function fetchCudiCatalog(locale: AppLocale, q?: string, signal?: AbortSignal): Promise<AppCudiCatalog> {
  return apiFetch<AppCudiCatalog>(appApi('/cudi/catalogus', { locale, q }), { timeout: 20_000, signal });
}

export function fetchCudiTimeslots(locale: AppLocale): Promise<AppCudiTimeslots> {
  return apiFetch<AppCudiTimeslots>(appApi('/cudi/tijdsloten', { locale }), { timeout: 20_000 });
}

export function reserveCudiTimeslot(locale: AppLocale, timeslotId: string): Promise<AppCudiTimeslotResult> {
  return apiFetch<AppCudiTimeslotResult>(appApi('/cudi/tijdsloten', { locale }), {
    method: 'POST',
    body: { timeslotId },
    timeout: 20_000,
  });
}

export function releaseCudiTimeslot(locale: AppLocale, registrationId: string): Promise<AppCudiTimeslotResult> {
  return apiFetch<AppCudiTimeslotResult>(appApi('/cudi/tijdsloten/vrijgeven', { locale }), {
    method: 'POST',
    body: { registrationId },
    timeout: 20_000,
  });
}

/** Bij drukte wacht cudi tot een halve minuut op een vrije plaats; vandaar de ruime timeout. */
export function placeCudiOrder(locale: AppLocale, input: AppCudiOrderInput): Promise<AppCudiOrderResult> {
  return apiFetch<AppCudiOrderResult>(appApi('/cudi/bestellen', { locale }), {
    method: 'POST',
    body: input,
    timeout: 45_000,
  });
}

export function cancelCudiLine(locale: AppLocale, orderItemId: string): Promise<AppCudiCancelResult> {
  return apiFetch<AppCudiCancelResult>(appApi('/cudi/annuleren', { locale }), {
    method: 'POST',
    body: { orderItemId },
  });
}

export function cudiCheckout(locale: AppLocale, orderId: string): Promise<{ checkoutUrl: string }> {
  return apiFetch(appApi('/cudi/betalen', { locale }), { method: 'POST', body: { orderId }, timeout: 20_000 });
}

// ── Alma ────────────────────────────────────────────────────────────────────

/**
 * De Alma's op campus Arenberg: open of niet, de uren van de week en het menu van
 * een dag (standaard vandaag). De site leest alma.be en houdt het een half uur
 * bij; de app praat enkel met vtk.be. Werkt zonder login.
 */
/**
 * Standaard de vier Alma's op Arenberg (Home); met `all` ook Alma 1, Alma 2 en
 * Gasthuisberg, voor het Alma-scherm.
 */
export function fetchAlma(locale: AppLocale, datum?: string, all = false): Promise<AppAlma> {
  return apiFetch<AppAlma>(appApi('/alma', { locale, datum, alle: all ? '1' : undefined }), { timeout: 15_000 });
}
