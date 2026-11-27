import { IS_DARK } from './mode';

/**
 * De kleuren en maten van de site, als waarden.
 *
 * `LIGHT` is een letterlijke port van `:root` in `apps/web/app/design/vtk-base.css`
 * in vtk-website-new. **Wijzigt daar een kleur, dan wijzigt ze hier mee**; dit
 * bestand staat daarom in de "Gekopieerd uit"-tabel in AGENTS.md.
 *
 * De site is bewust light mode ("cool paper"), en de app volgt de site. Sinds eind
 * november 2026 is er ook een donker thema (richting D, "OLED zwart"), dat je
 * kiest onder Meer. Dat bestaat enkel in de app: `DARK` heeft dezelfde sleutels,
 * met echt zwart als grond. Welke van de twee geldt, ligt vast bij de start
 * (`IS_DARK` in `./mode`); wisselen herstart de app, omdat elke stijl met
 * `StyleSheet.create` bij het laden zijn kleuren al gekozen heeft.
 *
 * De sleutels onder "Rollen" bestaan enkel in de app. In het licht zijn ze een
 * kleur van de site (zodat er daar niets verandert), in het donker iets anders:
 * - `strong`: navy als tekst, rand of indicator op papier; in het donker bijna-wit.
 * - `onYellow`: tekst en iconen op een geel vlak; altijd navy, want geel blijft geel.
 * - `selected`, `onSelected`, `onSelectedAccent`: wat gekozen of primair is. In
 *   het licht navy met papier of geel erop, in het donker geel met zwart erop.
 * - `band`: een donker vlak dat donker blijft (een navy band, een ronde navy knop
 *   met een geel icoon); in het donker een tint boven zwart.
 * - `wash`: het navy waas achter een pil of een leeg vakje.
 * - `head`, `headTitle`: het gele vlak bovenaan elk scherm en de titel erop. In
 *   het donker valt het vlak weg en draagt de gele titel de kop.
 * - `raised`: wat boven een kaart of een waas uitsteekt (een witte ronde knop in
 *   de kop, het gekozen segment); in het licht wit, in het donker een tint lichter.
 * - `plate`: wit dat wit blijft, achter een QR-code en de logo's van de diensten.
 */
const LIGHT = {
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

  // Rollen (enkel in de app; zie hierboven).
  strong: '#0E1A36',
  onYellow: '#0E1A36',
  selected: '#0E1A36',
  onSelected: '#EFF2F8',
  onSelectedAccent: '#FFD23F',
  band: '#0E1A36',
  wash: 'rgba(14, 26, 54, 0.08)',
  head: '#FFD23F',
  headTitle: '#0E1A36',
  raised: '#FFFFFF',
  plate: '#FFFFFF',
};

/** Het donkere thema: richting D ("OLED zwart") uit de ontwerpronde van november 2026. */
const DARK: typeof LIGHT = {
  ink: '#F5F5F7',
  // Wat nog navy heet, is een vlak; tekst in navy heet `strong`.
  navy: '#1C1C1F',
  paper: '#000000',
  paper2: '#1C1C1F',
  surface: '#121214',
  line: 'rgba(255, 255, 255, 0.10)',
  line2: 'rgba(255, 255, 255, 0.16)',
  controlBorder: 'rgba(255, 255, 255, 0.45)',
  onDarkControlBorder: 'rgba(239, 242, 248, 0.48)',
  yellow: '#FFD23F',
  yellowDeep: '#EDBD22',
  coinRim: '#805B00',
  muted: '#9A9AA2',
  body: '#D1D1D6',
  onDarkMuted: '#B7C0DC',
  onDark: '#EFF2F8',
  dangerBg: '#3A1411',
  dangerInk: '#FF9B8F',
  dangerLine: '#F04438',
  okBg: '#0E2A1B',
  okInk: '#6FD39A',
  lowBg: '#33280A',
  lowInk: '#FFD36B',

  strong: '#F5F5F7',
  onYellow: '#0E1A36',
  selected: '#FFD23F',
  onSelected: '#000000',
  onSelectedAccent: '#000000',
  band: '#1C1C1F',
  wash: 'rgba(255, 255, 255, 0.10)',
  head: '#000000',
  headTitle: '#FFD23F',
  raised: '#2C2C31',
  plate: '#FFFFFF',
};

export const COLORS = IS_DARK ? DARK : LIGHT;

/**
 * Een QR-code is in elk thema donker op wit: een scanner aan een deur leest een
 * omgekeerde code niet altijd.
 */
export const QR = { background: '#FFFFFF', modules: '#0A0F1F' } as const;

/**
 * De transportplanning (Meer › Transport), zoals logistiek.vtk.be ze tekent
 * (`apps/logistiek/app/design/theme.css`, lichte modus). De vulkleur van een rit
 * is de chauffeur en komt van de server (`AppTransportTrip.fill`); hier staat de
 * rest: de arcering per voertuig, de rand zonder chauffeur, de streep van een
 * aanvraag en de nu-lijn.
 */
const TRANSPORT_LIGHT = {
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

/** In het donker: dezelfde lagen, als wit waas op een donkere kaart. */
const TRANSPORT_DARK: { [K in keyof typeof TRANSPORT_LIGHT]: string } = {
  pattern: 'rgba(255, 255, 255, 0.12)',
  patternStrong: 'rgba(255, 255, 255, 0.2)',
  patternFaint: 'rgba(255, 255, 255, 0.08)',
  edge: 'rgba(255, 255, 255, 0.45)',
  border: 'rgba(255, 255, 255, 0.15)',
  emphasis: '#F5F5F7',
  today: '#17140A',
  now: '#F26B6B',
};

export const TRANSPORT = IS_DARK ? TRANSPORT_DARK : TRANSPORT_LIGHT;

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
const PLANNING_LIGHT = {
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
  // Afgevinkt: de volle kleur van de soort (`--color-plan-*-fill`), in het
  // semesteroverzicht en de voortgangsbalk per vak.
  lectureFill: '#2477c9',
  practiceFill: '#129278',
  otherFill: '#6b5fd6',
  // "In te halen": voorbij en niet afgevinkt (`--color-plan-catchup-*`).
  catchupBg: '#fdf0f6',
  catchupBorder: '#f5bdd5',
  catchupText: '#a3245a',
  catchupFill: '#d6407a',
} as const;

/**
 * In het donker: dezelfde drie soorten, als donkere tint met een lichte tekst in
 * dezelfde kleur. Afgevinkt blijft de volle kleur, die leest op zwart even goed.
 */
const PLANNING_DARK: { [K in keyof typeof PLANNING_LIGHT]: string } = {
  lectureBg: '#0F2740',
  lectureBorder: '#1F4D7A',
  lectureText: '#9CCBF7',
  practiceBg: '#0C2A24',
  practiceBorder: '#1C5C4E',
  practiceText: '#8EDCC6',
  otherBg: '#1E1B3A',
  otherBorder: '#3D3778',
  otherText: '#C3BDF6',
  danger: '#F05252',
  dangerText: '#FF9B8F',
  lectureFill: '#2F86DB',
  practiceFill: '#17A589',
  otherFill: '#7C70E6',
  catchupBg: '#33121F',
  catchupBorder: '#7A2A4B',
  catchupText: '#F7A6C7',
  catchupFill: '#E0538A',
};

export const PLANNING = IS_DARK ? PLANNING_DARK : PLANNING_LIGHT;

/**
 * De kleur van een vak in de blokkalender, in de volgorde waarin de vakken er
 * staan (`--color-course-1` tot `8` bij Burgieclan). Een vak heeft daar en hier
 * dezelfde kleur.
 */
export const COURSE_COLORS = ['#2477c9', '#129278', '#6b5fd6', '#b98900', '#0e8fb3', '#3e9a45', '#33478f', '#9b4fb0'] as const;

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
  accent: COLORS.selected,
  accentInk: COLORS.onSelected,
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

/**
 * De kleuren van de statuspil van een bestelling op cudi.vtk.be (*Mijn
 * bestellingen*, `ORDER_STATUS_PILLS` in `app/[association]/(main)/account/orders/page.tsx`
 * van de cursusdienst): de Tailwind-tinten `*-100` als vlak en `*-800` als tekst.
 * Zo heeft elke stand bij een bestelling in de app dezelfde kleur als op cudi.
 */
const CUDI_STATUS_LIGHT = {
  /** Afgehaald, of ligt klaar: green-100 / green-800. */
  green: { bg: '#DCFCE7', ink: '#166534' },
  /** Online betaald: blue-100 / blue-800. */
  blue: { bg: '#DBEAFE', ink: '#1E40AF' },
  /** Wacht op levering, op de wachtlijst: yellow-100 / yellow-800. */
  yellow: { bg: '#FEF9C3', ink: '#854D0E' },
  /** Niet op tijd afgehaald: amber-100 / amber-900. */
  amber: { bg: '#FEF3C7', ink: '#78350F' },
  /** Geannuleerd: red-100 / red-800. */
  red: { bg: '#FEE2E2', ink: '#991B1B' },
} as const;

/** In het donker: dezelfde vijf kleuren, als donkere tint met lichte tekst. */
const CUDI_STATUS_DARK: { [K in keyof typeof CUDI_STATUS_LIGHT]: { bg: string; ink: string } } = {
  green: { bg: '#0E2A1B', ink: '#86EFAC' },
  blue: { bg: '#10203F', ink: '#93C5FD' },
  yellow: { bg: '#2E2A0A', ink: '#FDE68A' },
  amber: { bg: '#33220A', ink: '#FCD34D' },
  red: { bg: '#3A1411', ink: '#FCA5A5' },
};

export const CUDI_STATUS = IS_DARK ? CUDI_STATUS_DARK : CUDI_STATUS_LIGHT;

/**
 * Het grondplan van de jobfair (Meer › Wegwijzer), overgenomen uit
 * vtk-floorplan-app maar in de kleuren van de app: navy standen, geel wat je
 * koos, grijs wat vrij is. `categories` kleurt de standen per masterrichting
 * wanneer je erop filtert, zoals de floorplan-app dat deed.
 */
export const FLOORPLAN = {
  canvas: IS_DARK ? '#121214' : '#E6ECF5',
  boothFill: IS_DARK ? '#2A3556' : '#0E1A36',
  boothStroke: IS_DARK ? '#45507A' : '#0A0F1F',
  boothEmptyFill: IS_DARK ? '#26262A' : '#CBD3E1',
  boothEmptyStroke: IS_DARK ? '#3A3A40' : '#AEB8CA',
  categories: {
    1: '#2563EB',
    2: '#0EA5E9',
    3: '#4F46E5',
    4: '#DC2626',
    5: '#EA580C',
    6: '#D97706',
    7: '#7C3AED',
    8: '#DB2777',
    9: '#E11D48',
    10: '#10B981',
    11: '#0D9488',
    12: '#475569',
    13: '#65A30D',
    14: '#92400E',
  } as Record<number, string>,
} as const;
