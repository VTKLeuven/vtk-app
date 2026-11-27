# Expo HAS CHANGED

Read the exact versioned docs at https://docs.expo.dev/versions/v58.0.0/ before writing any code.

(Dit blok wordt door `expo start` herschreven en kan dan naar een andere versie
wijzen dan waar deze app op staat. Wij zitten op SDK 58; zie onderaan waarom.)

# VTK (Expo)

De app van VTK Leuven, voor iOS en Android. **Hetzelfde ontwerp als
vtk-website-new, maar niet dezelfde vorm.** De site is er om te lezen wat VTK
doet; de app is er voor de vijf dingen die je met een telefoon in je hand doet:
zien wat er open is, plannen wat je gaat doen, een ticket kopen en tonen, een
broodje bestellen en afhalen, en aan een balie een code laten scannen. De hele
inhoud van de site zit er nog steeds in, maar onder Meer en niet vooraan.

**De admin zit erin, maar als dashboard en niet nagebouwd.** Sinds november 2026
ziet wie rechten heeft onder Meer › Beheer zijn tegels, de deurknop, wat zijn
post nog naar het BO moet brengen en de onderdelen van zijn zijbalk; een
onderdeel zelf opent als de pagina van de site, zonder haar kop. Zie regel 3.

**Je studies staan in één tab**: samen blokken, de cursusdienst (cudi.vtk.be) en
Burgieclan, als native schermen. vtk.be spreekt namens jou met cudi en
Burgieclan; de app logt daar niet apart in. Zie "Studies" onder Structuur.

**De ticketscanner voor aan de deur zit hier ook in**, met zijn offline-werking,
zijn wachtrij en zijn feedback over het hele beeld. Tot november 2026 was dat een aparte app,
vtk-scanner-app; die staat nu enkel nog als archief. Enkel wie iets te scannen
heeft, ziet hem. Alles daarover staat in `docs/scanner.md`.

**Lees `docs/` voor je plant of schrijft.** `docs/plan.md` is het plan én het
logboek (welke fase waar staat), `docs/architecture.md` legt uit hoe de app met
de site praat.

## Een eigen repo

Tot november 2026 stond de app in `mobile/` in de repo van vtk-website-new; nu
heeft ze deze eigen repo, met de volledige historiek van die map. De site en de
app delen geen code meer, enkel een contract dat hier een kopie is (zie
"Gekopieerd uit vtk-website-new"). Clone vtk-website-new naast deze repo (of zet
`VTK_WEBSITE_DIR`), anders kan `npm run contract:check` niets vergelijken.
Handleiding: `docs/ontwikkelen.md`.

## Draaien

```
npm start          # expo start (dev build, niet Expo Go: react-native-webview)
npm run check      # alles hieronder samen; draai dit voor je pusht
npm run type-check # tsc --noEmit, moet 0 fouten geven
npm run lint
npm run routes     # schrijft app/(tabs)/** en app/(oud)/** uit src/navigation.ts
npm run routes:check # loopt dat gelijk, en bestaat elk adres waar de app naartoe duwt
npm run contract:sync  # haalt src/api/contract.ts uit vtk-website-new
npm run contract:check # faalt wanneer de twee verschillen
```

Lokaal testen vraagt HTTPS, want de weblogin doet KU Leuven-SSO. Draai
vtk-website-new achter een cloudflared-tunnel en vul die URL in bij
**Meer -> je naam -> Server**. Zie `docs/architecture.md`.

**De camera, de agenda, de fotobibliotheek, locatie en de scanner gaan niet mee met `eas update`.**
`expo-camera`, `expo-calendar`, `expo-media-library`, `expo-location` (gebruikt
door `lokalen.tsx`) en de modules van de scanner (`expo-crypto`, `expo-haptics`,
`expo-network`) zijn native. In Expo Go zitten ze al ingebouwd, dus daar kan je
de scanner, "In agenda", de wandelroute naar een lokaal en het bewaren van een
foto wel gewoon testen. Op een APK moet de module in de build zelf zitten; wie
een oudere APK heeft, krijgt daar een rood scherm. Laad zo'n module nooit vanuit
iets dat bij de start geladen wordt, anders valt niet één scherm maar de hele
app om; zie `docs/scanner.md`.

**Voeg je een native dependency toe, bouw dan voor je publiceert.**
`runtimeVersion` staat op `"exposdk:58.0.0"`, dezelfde waarde voor élke SDK
58-build, dus een update wordt ook aangeboden aan een oudere APK die de module
niet heeft; `requireNativeModule` gooit dan op het scherm waar die import hangt.
Bouw eerst, verspreid de APK, en vraag om de vorige te vervangen.

**De stores.** Sinds november 2026 is er een Apple Developer-account en gaat de
app naar de App Store en de Play Store. `app.config.ts` geeft een
productiebuild (`APP_VARIANT=production`) de `fingerprint`-policy; de preview
houdt `exposdk:58.0.0`. Een update naar de stores gaat apart en bewust:
`npx eas-cli@latest update --branch production --environment production`. Alles
daarover staat in `docs/release.md`.

**De policy van de preview staat er om Expo Go.** Voor wie de preview op een
iPhone test, is Expo Go dat een gepubliceerde update opent de weg, en Expo Go
laadt enkel een `exposdk`-runtime. Zet de preview niet op
`{ "policy": "fingerprint" }` zonder eerst `docs/architecture.md` te lezen: dat is
één keer gebeurd en legde de hele iOS-kant stil.

**Voeg geen module toe die niet in Expo Go zit.** Alles wat we vandaag gebruiken
zit erin (camera, agenda, fotobibliotheek, locatie, sqlite, bestanden, delen,
webview, svg, crypto, haptics, netwerk, keep-awake). Iets anders erbij betekent
dat niemand de app nog op een iPhone kan bekijken. Push is de bestaande
uitzondering: die werkt in Expo Go niet.

**De enige eigen native module is `modules/vtk-wallet`** (november 2026): het
venster van Apple Wallet in de app, zodat er na "Voeg toe" geen witte
browserpagina achterblijft. Ze is optioneel geladen (`requireOptionalNativeModule`
in `src/wallet.ts`): in Expo Go en in een oudere build bestaat ze niet, en dan
opent de pas zoals voordien in de browser. Zo blijft de app in Expo Go werken en
valt een EAS Update naar een oudere build niet om. Een nieuwe native module hoort
diezelfde vorm te hebben, met een terugval die werkt zonder.

## Regels

1. **De server is de waarheid.** Elke regel die iets beslist (mag ik bestellen,
   is de deadline voorbij, hoeveel zijn er nog) staat in vtk-website-new en wordt
   hier niet nagebouwd. De app mag nooit soepeler zijn dan de site.
2. **Alles native, behalve identiteit en geld.** Een WebView is toegelaten voor
   inloggen, de onboarding-poorten en betalen (Mollie). Al de rest wordt een echt
   scherm. Een browser openen voor eigen inhoud is een bug, geen keuze; enkel
   adressen op een andere site (Career, logistiek.vtk.be om een rit aan te
   vragen, uploaden op Burgieclan, tweedehands en printen op cudi) horen
   daar. Sinds november 2026 is er één uitzondering bij, `src/screens/web.tsx`:
   een onderdeel van de admin (zie 3), en de twee eenmalige stappen op cudi die
   bij je account horen (voorwaarden aanvaarden, je vakken aanduiden), en het
   feedbackformulier van de app op dopl.vtk.be (Meer › Feedback App). Enkel
   `*.vtk.be` opent daar.
3. **De admin niet nabouwen.** Tot november 2026 stond hier "geen admin". Nu
   heeft wie in het beheer mag (dezelfde regel als de link op de site: een recht
   of superadmin, `abilities.admin`) onder Meer › Beheer een native dashboard:
   de tegels, de deur, de BO-resultaten, en de zijbalk van /admin als lijst
   (`/api/app/v1/beheer`, gefilterd door `visibleAdminNav` op de site). **Een
   onderdeel zelf is de pagina van de site** in `web.tsx`, met `data-vtk-app` op
   `<html>` zodat de site haar kop en zijbalk weglaat. Bouw geen adminscherm na:
   tientallen tabellen en formulieren op twee plaatsen is ze twee keer kunnen
   breken. De scanner aan de deur is geen admin: het scannerspaneel kan enkel de
   rol `SCANNER` geven, aan de deur, aan wie komt bijspringen.
4. **iOS en Android doen hetzelfde.** Geen platformspecifieke schermen.
5. **Geen dependency die de Expo SDK al dekt.**
6. **Geen emoji in de UI**; iconen komen uit `lucide-react-native`.
7. **Nederlands in de interface**, Engelse vakterminologie waar dat natuurlijker
   is. **Geen em-dashes**, ook niet in code, comments of commits.
8. **Het ontwerp is dat van de nieuwe Home (voorstel F1, november 2026).** De
   tokens in `src/theme/tokens.ts` blijven de enige plek met kleuren (navy, geel,
   papier van de site); verzin er geen. Geel enkel als accent, geen gradienten en
   geen kaart in een kaart. Tot november 2026 opende elk scherm met de navy kop
   van de site (patroon, gele lijn van 5 px); dat is voorbij. Nu:
   - **`PageHead` is licht**: de titel op papier, een ronde witte terugknop, een
     actie rechts als `HeadButton` (wit, rond, icoon in inkt), en tabbladen als
     pillen, zwart voor wat open staat en wit voor de rest. Geen `onDark`-kleuren
     in `right` of `children`.
   - **Witte kaarten met een zachte schaduw** (`CARD_SHADOW` uit
     `src/components/HomeSection.tsx`, radius 20) in plaats van kaarten met een
     haarlijnrand. Een lijst is één kaart met haarlijnen tussen de rijen
     (`CardList` in `ui.tsx`), geen register met haarlijnen op papier.
   - **Koppen van een deel** (`SectionHeading`) zijn een klein woord in
     kapitalen, gedempt, zonder gele lijn. Op Home is `HomeSection` een korte
     titel in navy ("Voor jou", "Ook binnenkort").
   - De statusbalk staat donker, ook op Home.
   **Home is de uitzondering op "geel enkel als accent"** (voorstel G.1, november
   2026): het opent met een geel vlak (`WeekHero`) met het logo en je naam, je
   bonnetjes als muntjes, "Deze week bij VTK", een strook met de komende zeven
   dagen (vierkante dagjes) en de evenementen van de gekozen dag als kaarten die
   je opzij veegt. De volgorde daaronder ligt vast: openingsuren (drie witte
   tegels met het logo van de plek, `ServiceList`; de naam staat er enkel in het
   Engels onder, want een international weet niet dat cudi de course shop is),
   je lessen, "Voor jou", Alma, "Ook binnenkort" (de evenementen vanaf morgen als
   schuiflijst) en "Snel naar". **Broodjes en shiften staan nooit tussen je
   lessen.** **Kalender volgt Home** (november 2026): een geel vlak
   (`YellowHead`) met de titel, de bel en de tabbladen als pillen, en daarin
   wat bij het tabblad hoort (de dagen die je ziet in de week, de voortgang per
   vak als één balk, Lijst of Agenda). Een VTK-evenement in de planning is
   lichtgeel met een gele rand en het logo, een eigen item papier met een
   stippelrand; geen gekleurde rail aan één kant. Een scherm met een eigen beeld (een evenement, een ticket,
   de broodjes) opent met `PhotoHead`: de foto over de volle breedte en de titel
   op papier eronder. **De transportplanning (`vervoer.tsx`) volgt de app, maar
   haar agenda is exact die van logistiek.vtk.be** (drie dagen naast elkaar, de
   hele dag in beeld, dezelfde kleuren, arceringen en randen); verander daar
   niets aan zonder de site. Praesidium hield zijn eigen vorm. De scanner aan de deur
   volgt het lichte ontwerp; enkel het camerabeeld en de feedback na een scan zijn
   een gekleurd vlak.
9. **Home is vandaag, Meer is waar alles staat.** Home beantwoordt twee vragen:
   wat is er open, en wat wacht er op mij. De CMS-boom, de mensen, de piano en je
   profiel staan onder Meer. Zet een snelkoppeling niet op allebei; anders komt de
   helft twee keer voor, één keer als tegel en één keer als menu-item uit het CMS.
10. **Wat je aan een balie toont, is twee tikken ver.** Je ticket en je
   bonnetjes staan achter een segment in hun eigen tab en niet achter een menu.
   Aan een deur of een toog staat er een rij achter je. Een ticket vergroot je
   met één tik tot over het hele scherm. Broodjes hebben geen code: aan het
   Theokot scant men je studentenkaart.
11. **Toon geen knop die "geen toegang" antwoordt.** `bootstrap.abilities` zegt
   wat deze gebruiker mag; verberg de rest. Dat is netheid en geen beveiliging,
   want elke route controleert het daarna nog eens zelf.
12. **Publiceer altijd een EAS Update na het pushen naar main.** Niets in deze
   repo deployt vanzelf: GitHub Actions draait enkel de checks. Wijzigingen aan de
   app moeten dus altijd via `npx eas-cli@latest update --branch preview --environment preview --message "..."` naar het
   preview-kanaal gepubliceerd worden zodat ze direct op toestellen en in Expo Go
   verschijnen.

## Structuur

- `app/` - enkel expo-router routes, en die worden **gemaakt, niet getikt**:
  `npm run routes` schrijft ze uit `TAB_ROUTES` in `src/navigation.ts`. De
  schermen zelf staan in `src/screens/`.
- **Elke tab is een eigen stack**, met het tabscherm onderaan:
  `app/(tabs)/(home)/`, `kalender/`, `studies/`, `tickets/`, `meer/`. Dat is de
  hele reden dat teruggaan werkt zoals het hoort, en het is één keer fout gegaan
  in drie pogingen, dus: **terugvegen popt een stack, en poppen kan enkel als er
  een scherm onder ligt.** Was er één gedeelde stack voor alle doorklikschermen,
  dan lag daar het tabscherm van de tab waar je het láátst geweest was, en kwam je
  vanuit Home op Meer uit. Was er geen stack, dan was er niets om te poppen en
  deed de veeg niets. Een scherm dat vanuit twee tabs bereikbaar is, staat dus in
  twee stacks maar bestaat één keer.
  - Home is een routegroep (`(home)`), de rest niet. Zo blijft `/evenement/12`
    letterlijk `/evenement/12` en breekt geen enkel bestaand adres, terwijl
    dezelfde pagina onder Meer `/meer/evenement/12` wordt.
  - **Gebruik `useTabRouter` uit `src/navigation.ts`, nooit `useRouter`** (behalve
    voor `back()`). De adressen in een scherm blijven gewoon `/piano`; welke tab
    ervoor komt, hoort een knop niet te weten.
  - Een nieuw scherm: bestand in `src/screens/`, regel bij in `TAB_ROUTES`,
    `npm run routes`. **In élke tab van waaruit je het kan openen**, niet enkel in
    de meest voor de hand liggende: een snelkoppeling op Home naar een scherm dat
    enkel Meer draagt, opent op Meer en zet je daar af bij het teruggaan. Dat is
    precies wat er één keer misging.
  - `npm run routes:check` bewaakt drie dingen: dat de bestanden gelijklopen met
    de kaart, dat elk adres waar de app naartoe duwt ook bestaat, en dat elke tab
    in zichzelf blijft. Wat het niet ziet, is een adres dat als data binnenkomt;
    de paden bij de taken op Home staan in
    `apps/web/app/api/app/v1/vandaag/route.ts` en horen in dezelfde lijst.
  - **Elk doorklikscherm krijgt een terugknop, en die zit in `PageHead`.** De
    stacks draaien met `headerShown: false`, dus er is geen systeemkop die er een
    tekent. Zonder die knop geraakte je op iOS nergens meer weg zodra je één keer
    doorklikte (op Android redde de hardwareknop dat). `PageHead` toont hem enkel
    wanneer er iets is om naar terug te keren, dus een tabscherm zet
    `back={false}`.
- `app/(oud)/` - de adressen van vóór die opsplitsing (`/piano`, `/shiften`,
  `/media`, ...), die enkel doorverwijzen. Een geïnstalleerde app kan maanden
  achterlopen en een pushbericht van vorige week draagt nog het oude pad; dat mag
  niet op een leeg scherm eindigen. Ook deze worden gemaakt.
- `app/(tabs)/_layout.tsx` is wél met de hand geschreven: **Home, Kalender,
  Studies, Tickets, Meer**, met hun iconen. **Studies** (tot november 2026
  Studeren; `/studeren` verwijst door, ook in een pushbericht) heeft drie
  tabbladen als pillen in de kop: Blokken (samen blokken), Cursusdienst en
  Burgieclan. Elk tabblad is een weergave in `src/components/studies/` die zijn
  eigen gele kop (`YellowHead`, zoals Kalender) tekent met dezelfde pillen; je
  studiegroep kies je boven de zaal en niet als pillen in de kop, en de knop
  naar de tijdsloten van cudi staat altijd in de kop; `routes:check` kijkt ook in die
  map. Cudi en Burgieclan zijn gewone schermen op gegevens die vtk.be ondertekend
  bij hen ophaalt (`lib/cudi/` en `lib/burgieclan/` op de site): reserveren en
  annuleren bij cudi gaat door dezelfde functie als de webshop daar, een document
  van Burgieclan opent als pdf in het systeemvenster. Tickets heeft twee tabbladen
  (Kopen/Mijne) als pillen in de kop (`tabs` op `PageHead`). Kalender heeft er
  drie (Planning, Evenementen, Mijn lijst) in een gele kop (`YellowHead`) en
  opent op **Planning**, ook wie niet ingelogd is (die krijgt
  daar de vraag om in te loggen en daarna zijn lessenrooster te importeren) en voor wie die
  heeft (de Burgieclan-koppeling via `src/components/planning/PlanningView.tsx`;
  zie `docs/burgieclan-planning.md` in `vtk-website-new`); de weergaven van de
  planning (Week, Per vak, Semester, Blok) staan als witte balk eronder
  (`ModeBar`). Lijst en Agenda (vier weken: één terug, twee verder;
  `AgendaGrid`) zijn weergaven onder Evenementen, geen tabbladen, en er is geen
  filter op categorie meer. In de lijst is elk evenement even groot (`EventRow`). Broodjes staat als snelkoppeling op
  Home en heeft enkel Bestellen.
- `app/_layout.tsx` draagt enkel nog de tabs plus drie modals (inloggen, de
  onboardingpoort, de serverinstelling) en de scanner aan de deur
  (`app/scan/[eventId].tsx`, als `fullScreenModal`). Die liggen bewust wél over de
  balk: een modal die de navigatie eronder laat staan, is geen modal, en aan een
  deur is een tabbalk een rij knoppen waar je per ongeluk op tikt.
- `src/api/` - de HTTP-laag en het contract met de site.
- `src/auth/` - wie er ingelogd is (er wordt geen token bewaard; zie
  `src/api/client.ts`) en de twee poorten uit `proxy.ts`.
- `src/state/` - `AppProvider`, de schil: viewer, tabs, aankondiging.
- `src/components/`, `src/theme/tokens.ts` - UI en tokens. `src/theme/tokens.ts`
  volgt `:root` in `vtk-base.css` op de site, inclusief de WCAG 2.2 AA
  contrasttokens (`controlBorder`, `onDarkControlBorder`, `dangerLine`,
  `coinRim`). `Prose` rendert alle Markdown (pagina's, aankondigingen,
  evenement- en ticketbeschrijvingen).
- `src/campus/` - geografie, positiebepaling (`expo-location`) en wandelroutes
  op campus Arenberg voor de lokalenzoeker (`src/screens/lokalen.tsx`).
- `src/alma.ts`, `src/screens/alma.tsx`, `src/components/AlmaToday.tsx` - de
  Alma's: open of niet, de uren van de week en het menu per dag. Home toont onder
  je lessen enkel de vier op campus Arenberg (Alma 3, Quadrivium, De Moete,
  ESAT2); het Alma-scherm vraagt er met `?alle=1` ook Alma 1, Alma 2 en
  Gasthuisberg bij, als extra pillen. Een tik op een gerecht toont de foto in het
  groot. Alma heeft geen API; vtk.be leest hun pagina's (`lib/alma/` op de
  site, een half uur in de cache) en geeft ze door via `/api/app/v1/alma`. Wijzigt
  alma.be zijn opmaak, dan valt het menu weg tot `lib/alma/parse.ts` mee is; de
  app praat nooit zelf met alma.be.
- `src/api/useResource.ts` - het patroon van elk scherm dat gegevens ophaalt:
  cache tonen, ophalen, en het zeggen wanneer die verversing niet lukte.
- `src/format.ts` - datums, uren en geld, altijd in `Europe/Brussels`.
- `src/monthGrid.ts` - datumsleutels voor de kalender en de agenda. **Geen kopie van
  `calendarGrid.ts` op de site**: die rekent met de lokale tijd van de machine,
  en op een telefoon is dat niet noodzakelijk Brussel. Hier draait alles op
  datumsleutels (`YYYY-MM-DD`) en op UTC-middag, zodat geen tijdzone en geen
  zomertijdsprong een dag kan verschuiven.
- `src/navigation.ts` - de kaart van tabs en schermen, plus `useTabRouter`. De
  enige plek waar staat welk scherm in welke tab hoort.
- `src/screens/` - de schermen zelf (onder meer `lokalen.tsx` voor de
  lokalenzoeker en `peilingen.tsx` voor stemmen op actieve peilingen). Een
  bestand hier is een gewone component; het weet niet in welke tab het getekend
  wordt, en dat hoort ook niet.
- `src/nativeRoute.ts` - vertaalt een pad uit het CMS naar een scherm in de app.
  Het CMS kent de app niet en zet "Piano reserveren" als link naar `/piano`;
  zonder deze tabel zou dat in een browser openen terwijl er een scherm voor
  bestaat. **Komt er een native scherm bij, voeg hier dan een regel toe.**
- `src/push.ts` - pushberichten. Toestemming wordt **één keer vanzelf gevraagd
  zodra je ingelogd op Home staat** (`askPushOnce`, sinds november 2026), en
  niet vóór je ingelogd bent; op iOS krijg je maar één kans. Wie toen weigerde,
  zet ze later aan via Meer -> Meldingen.
- `src/scanKind.ts` - welk soort code er gescand is in **Code scannen**
  (`scannen.tsx`, voor iedereen): uitnodiging, pas of fakbar, en een ticket dat
  daar niet meetelt en naar Tickets scannen verwijst. De prefix zegt welke.
- `src/scanner/`, `src/components/scanner/`, `src/api/scanner.ts` - de scanner aan
  de deur (`deur.tsx` kiest het event, `scan/[eventId].tsx` scant). Zie
  `docs/scanner.md`.
- `src/deviceCalendar.ts` - een evenement in de agenda van de telefoon zetten.
  Er wordt **niets gelezen**; de module maakt één afspraak wanneer je erom
  vraagt. Dat is iets anders dan de ICS-feed op de site, die je op alles
  abonneert.
- `src/markdown.ts` - Markdown naar platte tekst, voor waar opmaak niet past (de
  notitie bij een agenda-afspraak).
- `src/savePhoto.ts` - een foto bewaren in de fotobibliotheek of delen via het
  systeemvenster. Haalt het origineel op en niet wat er op het scherm staat.
- `src/storage.ts` - voorkeuren en de leescache. **Geen schrijfwachtrij**:
  bestellen vraagt netwerk. De enige wachtrij is die van de scanner, in een eigen
  databank (`src/scanner/storage.ts`), zodat de leescache leegmaken nooit een scan
  meeneemt.

## Wat bewust op de site blijft

Geen achterstand maar een beslissing: je gegevens wijzigen, verbonden apps,
privacygegevens, formulieren, lesbezoeken en het contactformulier. Ook de
schermen van de admin zelf (zie regel 3), uploaden en stemmen op Burgieclan, en
tweedehands en printen op cudi (een tijdslot om af te halen kies je sinds
november 2026 wel in de app, `cudi-tijdsloten.tsx`). Dat zijn
formulieren met eigen validatie en soms juridische gevolgen, en die op twee
plaatsen hebben is twee keer kunnen mislopen.

Drie schrijfwegen lopen ook bewust langs de bestaande routes van de site in plaats
van langs `/api/app/v1`: **afrekenen** (`/api/tickets/checkout`, dat het
order-toegangscookie zet) en **in- en uitschrijven op een shift**
(`/api/shift/register`, dat overlap, de 24-uursgrens en de cudi-sync bewaakt). Een
wrapper zou daar niets doen dan doorgeven, of erger, de helft vergeten.

## Gekopieerd uit vtk-website-new

Deze bestanden zijn bewust een kopie en geen import; wijzigt het origineel, dan
wijzigt dit mee. De eerste rij wordt byte voor byte vergeleken wanneer beide
repo's naast elkaar staan: hier door `npm run contract:check`, op de site door
`apps/web/test/appApiContract.test.ts`. **Het origineel is de bron**: pas het
contract aan in vtk-website-new en haal het met `npm run contract:sync`.

| Hier | Origineel |
|---|---|
| `src/api/contract.ts` | `apps/web/lib/app-api/contract.ts` |
| de prefixen in `src/scanKind.ts` | `apps/web/lib/ticketing/crypto.ts` + `apps/web/lib/app-api/tokens.ts` |
| `src/theme/tokens.ts` | `apps/web/app/design/vtk-base.css` (`:root`) |
| `TICKET_COLORS` en de oordeelkleuren in `SCANNER` (`src/theme/tokens.ts`) | `apps/web/app/design/vtk-ticket-colors.css` + `vtk-tickets.css` (`.scanner-*`) |
| `src/scanner/types.ts` | `apps/web/components/ticketing/scanner/types.ts` |
| `src/scanner/offline.ts` | `apps/web/components/ticketing/scanner/offline.ts` (de beslislogica) |
| `src/scanner/cardHash.ts` | `apps/web/lib/ticketing/cardHash.ts` (**letterlijk**; faalt stil) |

## Expo SDK 58

Tot september 2026 bewust gelijk aan **vtk-scanner-app** en **vtk-floorplan-app**:
één toolchain voor de drie VTK-apps, en die is al door de EAS-bouwproblemen heen
(de `react-dom`-pin, het wegvallen van `@react-native-cookies/cookies`,
`platforms: ["ios","android"]` voor `eas update`). In november 2026 ging deze app
naar SDK 58, omdat Expo Go in de stores enkel nog SDK 58 opent, en kwam de
scanner hierin. Enkel vtk-floorplan-app staat nog los; trek die mee wanneer daar
iets aan gebeurt. Upgraden blijft een eigen taak, niet en passant.

**Die keuze is niet vrijblijvend.** Expo Go in de App Store draait enkel de
nieuwste SDK, en zonder Apple Developer-account is Expo Go de enige weg naar een
iPhone; blijven we achter, dan kan niemand de app op iOS nog openen. Zie
`docs/architecture.md` onder `runtimeVersion`.

Wat er bij de sprong van 54 naar 57 uit de weg moest, voor de volgende keer:

- `privacy`, `splash` en `android.edgeToEdgeEnabled` bestaan niet meer in
  `app.json`. De splash is nu een `expo-splash-screen`-plugin, edge-to-edge is
  verplicht en dus geen instelling meer.
- `expo-status-bar` heeft geen `backgroundColor` meer, om diezelfde reden. Wie
  onder de statusbalk wil kleuren, doet dat zelf met de insets uit
  `react-native-safe-area-context`; `SafeAreaView` uit `react-native` is op
  Android geen echte safe area.
- `StyleSheet.absoluteFillObject` is weg, `StyleSheet.absoluteFill` is nu zelf een
  gewoon object en vervangt het één op één.
- `expo-calendar` heeft een herziene API; de oude functies werken nog (met een
  waarschuwing) maar het type `Calendar` wordt niet meer geëxporteerd.
- `eas update` eist sinds SDK 55 `--environment`.
- `eslint-config-expo` zet de React Compiler-regels aan. Zie `eslint.config.js`
  voor welke aan staan en waarom `immutability` uit moet zolang we Reanimated
  gebruiken.

En bij de sprong van 57 naar 58 (React Native 0.88, React 19.3):

- **`expo-calendar` en `expo-media-library` gooien een fout bij de oude
  functies** wanneer je ze uit het hoofdpakket haalt (`getCalendarsAsync`,
  `saveToLibraryAsync`, ...): die staan nu onder `expo-calendar/legacy` en
  `expo-media-library/legacy`. De typecheck ziet het niet, want de stubs hebben
  dezelfde types; `import/namespace` in eslint wel. Een import uit het hoofdpakket
  geeft dus pas op het toestel een fout, op de knop "In agenda" of "Bewaren".
- `ListEmptyComponent` van een `FlatList` aanvaardt geen `null` meer; geef
  `undefined`.
- `npx expo install --fix` liep vast op een peer-conflict rond het optionele
  `@expo/ui`. De verwachte versies met de hand in `package.json` zetten en de
  lockfile opnieuw oplossen (`rm -rf node_modules package-lock.json && npm install`)
  werkte wel.
- `react-native-gesture-handler` ging naar 3 en `react-native-webview` naar 14; de
  app gebruikt de eerste niet rechtstreeks en de tweede enkel in `WebFlow`.
