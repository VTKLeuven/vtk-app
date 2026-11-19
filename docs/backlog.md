# Backlog: resterende verschillen met `vtk-website-new`

Dit document verzamelt de openstaande functies en ontwerpaanpassingen die wel op
`vtk-website-new` bestaan, maar nog niet (volledig) in `vtk-app` zitten. Zo
blijft het overzicht bewaard zonder dat losse items verloren gaan.

Voor de algemene architectuur en afspraken rond de app-API, zie
`docs/architecture.md` en `AGENTS.md`.

## 1. Nieuws

- **Site:** `/nieuws` en `/nieuws/[id]`, inclusief *Woord van de praeses* en
  *Bakske*.
- **Nog te doen:**
  - App-API uitbreiden in `vtk-website-new` met `/api/app/v1/nieuws` (overzicht
    en detail) en het contract synchroniseren via `npm run contract:sync`.
  - Native schermen bouwen in `src/screens/` en registreren in
    `src/navigation.ts` (`npm run routes`).
  - `/nieuws` en `/nieuws/[id]` toevoegen aan `src/nativeRoute.ts` zodat links
    uit het CMS en pushberichten in de app openen in plaats van in de browser.

## 2. WCAG 2.2 AA contrasttokens toepassen in de UI

- **Status:** De nieuwe contrasttokens uit `:root` van `vtk-base.css` staan al
  in `src/theme/tokens.ts` (`controlBorder`, `onDarkControlBorder`, `dangerBg`,
  `dangerInk`, `dangerLine`, `coinRim`), maar worden nog niet gebruikt in de
  componenten en schermen.
- **Nog te doen:**
  - Randen van invoervelden, chips en knoppen op lichte en donkere oppervlakken
    overschakelen naar `controlBorder` en `onDarkControlBorder`.
  - Foutmeldingen, waarschuwingen en destructieve acties consequent afstemmen op
    `dangerBg`, `dangerInk` en `dangerLine`.
  - Munt- en accentranden waar nodig bijwerken met `coinRim`.

## 3. Shiftgeschiedenis

- **Site:** `/shift/history`.
- **Nog te doen:**
  - Inzicht geven in voorbije shiften (gewerkte shiften, status en eventuele
    beloningen) naast de bestaande openstaande shiften in `src/screens/shiften.tsx`.
  - Onderzoeken of dit als extra segment in `shiften.tsx` of als apart
    doorklikscherm het best past, en bijhorende route toevoegen aan
    `src/nativeRoute.ts`.

## 4. PAL+

- **Site:** `/pal-plus`.
- **Nog te doen:**
  - De PAL+-pagina en bijhorende interactie (informatie, inschrijving of
    koppeling) beschikbaar maken als native scherm wanneer er een app-API-route
    voor bestaat, en opnemen in `src/nativeRoute.ts`.

## 5. Theokot verhuur en Fakbar huren

- **Site:** `/theokot/verhuur` en `/fakbar-huren`.
- **Nog te doen:**
  - Nagaan welk deel informatief of beschikbaarheidsoverzicht is (geschikt voor
    een native scherm met eventueel een app-API-endpoint) en welk deel een
    uitgebreid aanvraagformulier is dat beter op het web blijft.
  - Indien native gebouwd: routes toevoegen aan `src/navigation.ts` en
    `src/nativeRoute.ts`.

## 6. 24urenloop accountstatistieken en Lidmaatschap

- **Site:** `/account/24urenloop` en `/lidmaatschap`.
- **Nog te doen:**
  - **24urenloop (`/account/24urenloop`):** persoonlijke loopstatistieken en
    gelinkte rondes tonen vanuit het profiel of de 24urenloop-sectie.
  - **Lidmaatschap (`/lidmaatschap`):** lidmaatschapsstatus en relevante
    informatie native tonen; betalingen of complexe formulieren lopen volgens
    Regel 2 in `AGENTS.md` via de bestaande web- en betaalflow.

## 7. Onvermelde en gedeelde fotoalbums

- **Site:** `/media/gedeeld/[token]`.
- **Nog te doen:**
  - Ondersteuning toevoegen om een gedeeld of unlisted fotoalbum via tokenlink
    rechtstreeks in de app te openen (deep link + `src/nativeRoute.ts`), met
    behoud van dezelfde toegangscontrole aan de serverkant.

## Wat bewust op het web blijft

Niet elke pagina op `vtk-website-new` hoort in de app thuis. Zoals vastgelegd in
`AGENTS.md` (onder *Regels* en *Wat bewust op de site blijft*) blijven deze
onderdelen bewust web-only:

- **Admin:** volledige beheeromgeving blijft op het web (enkel de ticketscanner
  aan de deur zit in de app).
- **Complexe en juridisch gevoelige formulieren:** onder meer je gegevens
  wijzigen, verbonden apps, privacygegevens, losse formulieren, lesbezoeken en
  het contactformulier. Die formulieren hebben eigen validatie of juridische
  gevolgen en worden niet op twee plaatsen onderhouden.
- **Identiteit en geld:** inloggen, onboardingpoorten en afrekenen (Mollie)
  blijven via WebView of de bestaande webroutes lopen.
