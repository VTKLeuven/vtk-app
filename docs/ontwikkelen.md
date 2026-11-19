# De VTK-app ontwikkelen

Dit is de handleiding: opzetten, draaien op je telefoon, en uitrollen. De
afspraken in de code staan in `AGENTS.md`; hoe de app met de site praat in
`docs/architecture.md`, en het contract aan de kant van de site in
`docs/app-api.md` van [vtk-website-new](https://github.com/VTKLeuven/vtk-website-new).

## Een eigen repo

Tot november 2026 stond de app in `mobile/` binnen de repo van de website, maar
buiten de npm-workspaces van die monorepo (anders werden de dependencies van
React Native samengevoegd met die van Next en loste de lockfile van de hele repo
opnieuw op). Ze had toen al haar eigen `node_modules` en lockfile; nu heeft ze ook
haar eigen repo, met de volledige historiek van `mobile/`.

Wat de twee nog delen, is het contract (`src/api/contract.ts`, zie onder). Clone
de website daarom naast deze repo:

```
~/code/vtk-website-new
~/code/vtk-app
```

Staat ze ergens anders, zet dan `VTK_WEBSITE_DIR`.

## Eén keer opzetten

```bash
npm install
```

## Draaien op je telefoon

Je hebt twee dingen tegelijk nodig: **de app** (de JavaScript, uit Metro) en **de
site** (de gegevens, uit vtk-website-new). Die twee staan los van elkaar.

### 1. De site

In vtk-website-new:

```bash
npm run dev              # apps/web op http://localhost:3000
```

Een telefoon kan niet aan `localhost`, en de weblogin heeft bovendien HTTPS nodig
(KU Leuven-SSO weigert anders). Zet er dus een tunnel voor:

```bash
cloudflared tunnel --url http://localhost:3000
```

Dat geeft een adres als `https://iets-willekeurigs.trycloudflare.com`. Onthoud
het; je vult het straks in de app in. Het adres verandert bij elke herstart.

### 2. De app

```bash
npm start
```

Metro start en toont een QR-code. Op hetzelfde wifi-netwerk volstaat dat; zit je
telefoon ergens anders, gebruik dan `npx expo start --tunnel`.

### 3. In Expo Go

Installeer **Expo Go** uit de App Store of Play Store en scan de QR-code. Voor
Android bestaat er ook een gebouwde APK (zie *Uitrollen*), maar voor iOS is Expo
Go voorlopig de enige weg: een build op een echte iPhone vraagt een Apple
Developer-account, en dat is er nog niet.

### 4. De server instellen

Open in de app **Meer → je naam → Server** en vul je cloudflared-adres in. Zonder dat
praat de app met `https://vtk.be`, en dan test je de productiegegevens in
plaats van je eigen werk.

Het wisselen gooit de leescache weg. Dat is met opzet: inhoud van de ene server
op de andere tonen levert schermen op die iets beweren dat er niet is.

## Wat er niet werkt in Expo Go

- **Pushberichten.** Sinds SDK 53 ondersteunt Expo Go geen remote push meer; de
  knop in Profiel zal falen. Alles daarbuiten werkt wel. Wil je push echt testen,
  dan heb je een development build nodig.
- **Een build op een iPhone**, om de reden hierboven.

## Nakijken voor je pusht

```bash
npm run check            # tsc, eslint, de routes en het contract
```

Dezelfde checks (behalve het contract) draaien in GitHub Actions
(`.github/workflows/checks.yml`).

**Het contract.** `src/api/contract.ts` is een letterlijke kopie van
`apps/web/lib/app-api/contract.ts` in vtk-website-new; het origineel is de bron.
Wijzig je het contract, doe het dan daar, en haal het hierheen met
`npm run contract:sync`. `npm run contract:check` faalt zodra de twee uit de pas
lopen, en aan de kant van de site doet `apps/web/test/appApiContract.test.ts`
hetzelfde wanneer deze repo ernaast staat. In CI staat de andere repo er niet,
en slaan beide de vergelijking over: dit is dus iets wat je lokaal doet, voor je
pusht.

## Uitrollen

De app draait op **EAS**, onder het account `vtk-it`, project `vtk-app`.

```bash
npx eas-cli@latest update --branch preview --environment preview --message "wat je veranderd hebt"
```

Dat is genoeg voor JavaScript en assets: die gaan over de lucht naar elk toestel
dat de app al heeft.

**Een nieuwe native dependency gaat er niet over.** Dan is er een nieuwe build
nodig:

```bash
npx eas-cli@latest build --profile preview --platform android
```

`runtimeVersion` staat op `"exposdk:58.0.0"`, en die waarde is dezelfde voor élke
SDK 58-build. Een update bereikt dus ook toestellen met een oudere APK, ook
wanneer de JavaScript erin een module importeert die daar niet in zit; dat geeft
een rood scherm op het moment dat zo'n scherm laadt. Bouw daarom eerst, verspreid
de APK, en zeg erbij dat wie een oudere versie heeft moet herinstalleren. Zie
`docs/architecture.md` voor waarom die policy hier toch de juiste is, en
wanneer ze op fingerprint moet.

De volgorde die klopt:

1. `npx eas-cli@latest build --profile preview --platform android`
2. de APK verspreiden (de link uit de build, of de QR), met de vraag om de vorige
   te vervangen
3. `npx eas-cli@latest update --branch preview --environment preview --message "..."` voor alles wat
   daarna nog aan de JavaScript verandert

Wijzigde er niets aan de native kant, dan volstaat stap 3 alleen.

**Na een SDK-sprong is stap 1 niet optioneel.** De app ging in september 2026 van
SDK 54 naar 57 en in november 2026 naar 58, en daarmee verschoof `runtimeVersion`
telkens mee. Elke APK van vóór die
sprong krijgt dus geen enkele update meer aangeboden, en dat is niet te zien: de
app blijft gewoon draaien op wat er al in zat. Iedereen met een oude APK moet
opnieuw installeren, anders zit het bestuur maandenlang naar een bevroren app te
kijken zonder het te weten.

Let op de bekende valstrik: een OTA-update wordt op de ene start **gedownload** en
op de volgende pas **toegepast**. De app moet dus twee keer dicht en open voor je
oordeelt over wat je ziet.

## Op een iPhone

Er is **geen Apple Developer-account**, dus EAS kan geen iOS-build maken en er is
er ook nooit een geweest. De weg naar een iPhone loopt daarom via **Expo Go**:

1. Expo Go installeren uit de App Store.
2. Inloggen met het `vtk-it`-account.
3. Het project `vtk-app` openen; Expo Go laadt de laatste update van het
   `preview`-kanaal.

Daarvoor is geen dev server nodig en er hoeft niets gebouwd te worden: een
`eas update` volstaat, want Expo Go draait op `exposdk:58.0.0`. Wat er niet werkt
is push, want Expo Go verstuurt sinds SDK 53 geen pushberichten meer; daarvoor
heb je een echte build nodig.

**Dit betekent ook dat Expo Go ons tempo bepaalt.** In de App Store staat maar
één Expo Go en die draait enkel de nieuwste SDK. Apple laat een oudere versie
niet installeren, en Expo's uitweg daarvoor (`eas go`, een eigen Expo Go op
TestFlight) vraagt net het Developer-account dat er niet is. Publiceert Expo een
nieuwe SDK, dan kan geen enkele iPhone-tester de app nog openen tot wij mee zijn.
Upgrade dan meteen, en in één beurt met vtk-floorplan-app (de scanner zit sinds
november 2026 in deze app):
`npx expo install expo@^<versie> --fix` per SDK, één versie tegelijk, en daarna
`npx expo-doctor@latest` en `npm run check`.

## De kanalen

`development`, `preview` en `production`, ingesteld in `eas.json`. Er wordt
vandaag enkel naar `preview` gepubliceerd; dat is het kanaal waar de APK van het
bestuur op zit.

## Waar wat staat

| Map | Wat |
|---|---|
| `app/` | De routes (expo-router), gemaakt uit `src/navigation.ts` met `npm run routes`. |
| `src/screens/` | De schermen zelf. |
| `src/api/` | De HTTP-laag en het contract met de site. |
| `src/components/` | Gedeelde UI. |
| `src/theme/tokens.ts` | De kleuren, overgenomen uit `apps/web/app/design/vtk-base.css` van de site. |
| `docs/plan.md` | Het plan en het logboek: welke fase waar staat. |
