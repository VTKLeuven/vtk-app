/**
 * De kleuren en maten van de site, als waarden.
 *
 * Letterlijke port van `:root` in `apps/web/app/design/vtk-base.css` in
 * vtk-website-new. **Wijzigt daar een kleur, dan wijzigt ze hier mee**; dit
 * bestand staat daarom in de "Gekopieerd uit"-tabel in AGENTS.md.
 *
 * De site is bewust light mode ("cool paper"), en deze app volgt de site. Eén
 * scherm is de uitzondering: de scanner aan de deur (`SCANNER` onderaan), die in
 * het donker op armlengte gebruikt wordt.
 */

export const COLORS = {
  /** Tekst en donkere vlakken. */
  ink: '#0A0F1F',
  /** De donkere banden, de header en de voettekst. */
  navy: '#0E1A36',
  /** De grond van elke pagina. */
  paper: '#EFF2F8',
  /** Een tint dieper, voor banden en insets. */
  paper2: '#E6ECF5',
  /** Kaarten en panelen. */
  surface: '#FFFFFF',
  line: 'rgba(14, 26, 54, 0.10)',
  line2: 'rgba(14, 26, 54, 0.18)',
  /** Rand rond invoervelden en knoppen met voldoende contrast (WCAG 2.2 AA). */
  controlBorder: 'rgba(14, 26, 54, 0.5)',
  /** Rand rond bedieningselementen op een donkere band. */
  onDarkControlBorder: 'rgba(239, 242, 248, 0.48)',
  /** Het enige accent. Spaarzaam gebruiken. */
  yellow: '#FFD23F',
  yellowDeep: '#EDBD22',
  /** Rand van een drankbon-muntje, donker genoeg om op het gele vlak leesbaar te blijven. */
  coinRim: '#805B00',
  muted: '#5C667F',
  body: '#34405E',
  /** Gedempte tekst op een donkere band. */
  onDarkMuted: '#B7C0DC',
  /** Wit op een donkere band; `paper` en niet puur wit, zoals op de site. */
  onDark: '#EFF2F8',
  /** Fout- en waarschuwingsvlakken, zoals uitschrijven of een ongeldig veld. */
  dangerBg: '#FDECEA',
  dangerInk: '#B42318',
  dangerLine: '#D92D20',
  /**
   * Beschikbaarheid, zoals bij de shiften op de site (`--ok-*`, `--low-*`,
   * `--full-*`): ruim of in orde, bijna op of wachten, en vol. Vol is bewust
   * grijs en niet rood: het is geen fout maar een keuze die wegvalt.
   */
  okBg: '#E2F1E8',
  okInk: '#16663F',
  lowBg: '#FFF2C7',
  lowInk: '#7A4E05',
} as const;

/**
 * De transportplanning (Meer › Transport), zoals logistiek.vtk.be ze tekent
 * (`apps/logistiek/app/design/theme.css`, lichte modus). De vulkleur van een rit
 * is de chauffeur en komt van de server (`AppTransportTrip.fill`); hier staat de
 * rest: de arcering per voertuig, de rand zonder chauffeur, de streep van een
 * aanvraag en de nu-lijn.
 */
export const TRANSPORT = {
  pattern: 'rgba(14, 26, 54, 0.13)',
  patternStrong: 'rgba(14, 26, 54, 0.2)',
  patternFaint: 'rgba(14, 26, 54, 0.11)',
  /** De streepjesrand van een rit zonder chauffeur. */
  edge: 'rgba(14, 26, 54, 0.45)',
  /** Een gewone rand rond een blok (`border-vtk-navy/15`). */
  border: 'rgba(14, 26, 54, 0.15)',
  /** De streep bovenaan een rit die nog beslist moet worden, en de rail van je eigen post. */
  emphasis: '#0E1A36',
  /** De kolom van vandaag. */
  today: '#FFFBF0',
  /** De lijn van nu, `--now-line`. */
  now: '#D64545',
} as const;

/**
 * Op een donkere band zijn panelen "dark glass": een lichte vulling met een
 * lichte rand, geen tweede blok navy. Zie de Styling Guidelines in CLAUDE.md.
 */
export const DARK_GLASS = {
  background: 'rgba(255, 255, 255, 0.06)',
  border: 'rgba(255, 255, 255, 0.14)',
} as const;

/**
 * De planning (Kalender, tabblad Planning): de lessen uit het KU Leuven-rooster
 * per soort, zoals de planner van Burgieclan ze kleurt (`--color-plan-*` in
 * `frontend/src/app/globals.css` van burgieclan, lichte modus). Het is dezelfde
 * planning op twee plaatsen, dus een les heeft op beide dezelfde kleur.
 *
 * Een VTK-evenement krijgt geen eigen tint maar de gele rail, zoals een
 * uitgelichte kaart op de site; een verplichte les de rode rail van Burgieclan.
 *
 * De vulkleuren staan een tikje donkerder dan bij Burgieclan: in de app ligt het
 * raster op een witte kaart, en daar vielen de lichtste tinten bijna weg. De
 * randen en de tekst zijn die van Burgieclan.
 */
export const PLANNING = {
  // Hoorcolleges hemelsblauw, practica en oefenzittingen teal, de rest lavendel.
  lectureBg: '#dbeafb',
  lectureBorder: '#a9cdf3',
  lectureText: '#0b4f8c',
  practiceBg: '#d3efe5',
  practiceBorder: '#94d6c2',
  practiceText: '#0b5c4c',
  otherBg: '#e6e3fa',
  otherBorder: '#c9c4f3',
  otherText: '#463c9f',
  /** De rail van een verplichte les en de nu-lijn, `--color-danger` bij Burgieclan. */
  danger: '#dc2626',
  dangerText: '#b91c1c',
} as const;

export const SPACING = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
} as const;

/** Kaarten en panelen zijn zacht afgerond, 16 tot 22; kleine knoppen pill. */
export const RADIUS = {
  sm: 10,
  md: 16,
  lg: 22,
  pill: 999,
} as const;

/**
 * De lettertypes zoals ze bij `useFonts` geladen worden. Inter draagt alles;
 * Instrument Serif bestaat enkel als cursief accent in de kop van het
 * beginscherm. Gebruik het niet voor gewone interfacetekst.
 */
export const FONTS = {
  regular: 'Inter_400Regular',
  medium: 'Inter_500Medium',
  semibold: 'Inter_600SemiBold',
  bold: 'Inter_700Bold',
  serifItalic: 'InstrumentSerif_400Regular_Italic',
} as const;

export const TYPE = {
  /** De titel in een donkere paginakop. */
  pageTitle: { fontFamily: FONTS.semibold, fontSize: 32, lineHeight: 34, letterSpacing: -0.9 },
  /** Een kop met de gele lijn eronder (`SectionHeading`), zoals een h2 op de site. */
  heading: { fontFamily: FONTS.semibold, fontSize: 20, lineHeight: 24, letterSpacing: -0.4 },
  sectionTitle: { fontFamily: FONTS.semibold, fontSize: 20, lineHeight: 26 },
  cardTitle: { fontFamily: FONTS.semibold, fontSize: 16, lineHeight: 22 },
  body: { fontFamily: FONTS.regular, fontSize: 15, lineHeight: 22 },
  small: { fontFamily: FONTS.regular, fontSize: 13, lineHeight: 18 },
  /** Bovenschriftje in kapitalen, zoals `.vtk-page-kicker`. */
  kicker: { fontFamily: FONTS.semibold, fontSize: 11, letterSpacing: 1.2 },
} as const;

/**
 * De scanner aan de deur. Tot november 2026 had die een eigen donker palet (dat
 * van de webscanner); nu spreekt hij de taal van de rest van de app: de navy kop
 * met het patroon, papier eronder, witte panelen met haarlijnen, en navy voor wat
 * je aantikt. Enkel twee dingen zijn bewust anders: het camerabeeld (`videoWell`)
 * is donker, en de volle feedback na een scan (`accepted`, ...) blijft een vlak
 * in de kleur van het oordeel met witte tekst (`onStatus`), want dat moet je van
 * drie meter zien.
 */
export const SCANNER = {
  shell: COLORS.paper,
  header: COLORS.surface,
  field: COLORS.paper2,
  videoWell: '#090a0d',
  line: COLORS.line2,
  scrim: 'rgba(10, 15, 31, 0.45)',

  text: COLORS.ink,
  textMuted: COLORS.muted,
  /** Wat je aantikt: navy, met papier erop, zoals een primaire knop in de app. */
  accent: COLORS.navy,
  accentInk: COLORS.paper,
  /** Het geel van het richtkader in het camerabeeld. */
  reticle: COLORS.yellow,
  /** Tekst en iconen op het camerabeeld en op een feedbackvlak. */
  onStatus: '#FFFFFF',
  onStatusMuted: 'rgba(255, 255, 255, 0.8)',

  accepted: '#0d784c',
  duplicate: '#a66800',
  reversed: '#304c8c',
  rejected: '#ab1f39',

  onlineBg: COLORS.okBg,
  onlineInk: COLORS.okInk,
  offlineBg: COLORS.dangerBg,
  offlineInk: COLORS.dangerInk,
  // Bewust niet alarmrood: offline scannen is een werkende toestand, geen fout.
  offlineBanner: COLORS.lowBg,
  offlineBannerInk: COLORS.lowInk,
  conflictBanner: COLORS.dangerBg,
  conflictBannerInk: COLORS.dangerInk,

  countAccepted: COLORS.okInk,
  countDuplicate: COLORS.lowInk,
  countRejected: COLORS.dangerInk,
  countReversed: '#304c8c',
} as const;

/**
 * Het palet van `TicketType.color`, uit `apps/web/app/design/vtk-ticket-colors.css`
 * met de keys uit `apps/web/lib/ticketing/ticketColors.ts`. Bij een aanvaard ticket vult deze
 * kleur het hele camerabeeld, zodat een tapper van drie meter ziet welk ticket
 * het is.
 */
export const TICKET_COLORS = {
  navy: '#0e1a36',
  blue: '#17558f',
  amber: '#96590a',
  violet: '#5b3699',
  green: '#16663f',
  rose: '#a32259',
  slate: '#4a5468',
} as const;

/** Minimale aanraakoppervlakte aan de deur; dit wordt met handschoenen aan bediend. */
export const HIT_TARGET = 48;
