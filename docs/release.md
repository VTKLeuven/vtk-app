# Naar de App Store en de Play Store

Wat er nodig is om de app in beide stores te krijgen, en wat er daarna anders
is. De preview (APK's, Expo Go op iPhone) blijft werken zoals ervoor; de stores
komen er naast.

## Wat al geregeld is in de repo

- **`eas.json`**: het profiel `production` bouwt een `.aab` voor Android en een
  App Store-build voor iOS, op het kanaal `production`. `appVersionSource` staat
  op `remote`: EAS houdt het buildnummer (iOS) en de `versionCode` (Android) bij
  en verhoogt ze bij elke build (`autoIncrement`). Enkel `version` in `app.json`
  (de versie die gebruikers zien, nu `1.0.0`) zet je zelf.
- **`runtimeVersion`** hangt af van de variant (`app.config.ts`): de preview houdt
  `exposdk:58.0.0` voor Expo Go, de stores krijgen de `fingerprint`-policy. Zo
  komt een update in de stores enkel aan bij een build met dezelfde native kant.
  `APP_VARIANT=production` staat in het buildprofiel én als EAS-variabele in de
  omgeving `production`.
- **Toestemmingen** zijn uitgedund tot wat de app gebruikt. Android vraagt geen
  `READ_MEDIA_IMAGES`/`VIDEO`/`AUDIO` meer (een foto bewaren heeft vanaf Android
  13 geen leesrecht nodig), en dus ook geen verklaring onder het fotobeleid van
  Google. iOS heeft geen microfoon, herinneringen, "altijd"-locatie of beweging
  meer in zijn `Info.plist`; dat waren standaardteksten in het Engels voor iets
  dat de app nooit vraagt, en daar stelt App Review vragen over.
- **Enkel iPhone** (`supportsTablet: false`). Met iPad-ondersteuning eist Apple
  iPad-screenshots en test het de app op een iPad, en ze is voor een telefoon
  ontworpen. Eens een versie met iPad in de store staat, kan je die
  ondersteuning niet meer weghalen; omgekeerd kan het later wel.
- **Account verwijderen** staat onder Meer -> je naam, als link naar
  `vtk.be/account#privacy`. Apple eist dat (richtlijn 5.1.1(v)) voor elke app
  waarin je een account kan aanmaken, en de login linkt naar `/registreren`.
- `ITSAppUsesNonExemptEncryption: false` staat er al, dus geen exportvragen bij
  elke upload.
- **Het icoon op iOS is `assets/vtk.icon`** (`ios.icon` in `app.json`), een
  bundel van Icon Composer voor het Liquid Glass van iOS 26: het logo als één
  platte vectorlaag (`Assets/vtk.svg`) in navy op geel, met een donkere variant
  (geel op navy) en een getinte. Het glas, de schaduw en de rand tekent iOS zelf;
  zet die dus niet in de laag. Aanpassen doe je in Icon Composer, dat bij Xcode
  26 hoort. Oudere iOS-versies krijgen een plat icoon dat Xcode bij de build uit
  dezelfde bundel maakt. `assets/icon.png` blijft het icoon van Android en Expo
  Go: wijzig je het ene, wijzig dan het andere mee. Een ander icoon komt enkel
  met een nieuwe build, niet met `eas update`.

## Wat jij moet doen

Volg de volgorde; de eerste build van iOS vraagt een Apple-login met 2FA, en dat
kan enkel interactief.

### 1. Eenmalig: de accounts

**Apple** (developer.apple.com, App Store Connect)

- Kijk na of het account op naam van VTK staat (organisatie, met D-U-N-S) of op
  een persoon. In de App Store staat de naam van het account als verkoper; voor
  een persoonlijk account is dat jouw naam.
- Voor een gratis app is er geen overeenkomst voor betaalde apps nodig.

**Google** (play.google.com/console)

- Maak de app aan: **Create app**, naam "VTK Leuven", standaardtaal Nederlands,
  App, Gratis. Package name komt bij de eerste upload: `be.vtk.app`.
- **Persoonlijk account van na november 2023?** Dan eist Google een gesloten test
  met minstens 12 testers, 14 dagen aan één stuk, vóór je naar productie mag.
  Voor een organisatieaccount geldt dat niet. Begin daar dus vroeg mee.
- **Een serviceaccount voor `eas submit`**: in Google Cloud (hetzelfde project
  als de Play Console of een nieuw) een serviceaccount maken, er een JSON-sleutel
  van downloaden, en in de Play Console onder **Users and permissions** dat
  e-mailadres uitnodigen met rechten om releases te beheren. Laad de sleutel op
  bij EAS, dan kan iedereen van het team indienen zonder het bestand:
  `npx eas-cli@latest credentials --platform android` -> production -> Google
  Service Account. Lokaal staat `google-service-account.json` in `.gitignore`.

### 2. Bouwen

```
npx eas-cli@latest build --profile production --platform ios
npx eas-cli@latest build --profile production --platform android
```

- **iOS** vraagt je Apple ID en 2FA. Laat EAS alles maken: de bundle ID
  `be.vtk.app`, het distributiecertificaat, het provisioning profile, en zeg
  **ja** op de push-sleutel (APNs). Die zit nu al in de app; zonder sleutel geen
  pushberichten op iPhone.
- **Android** maakt een keystore aan die EAS bewaart. Raak hem niet kwijt: met
  Play App Signing is het de uploadsleutel, en die vervangen vraagt een aanvraag
  bij Google.

### 3. Indienen

**iOS**

```
npx eas-cli@latest submit --platform ios --latest
```

De app staat al in App Store Connect als "VTK Leuven" ("VTK" was bezet; onder
het icoon staat wel "VTK", dat komt uit `app.json`). Haar Apple ID staat als
`ascAppId` in `eas.json`, zodat `eas submit` ze niet zelf probeert aan te maken:
dat lukte niet, omdat Apple bij de eerste app van een team een bedrijfsnaam
vraagt die EAS niet meegeeft. Het commando zet de build in TestFlight. Test eerst via TestFlight op een echte
iPhone: dat is de eerste keer dat de app als eigen build op iOS draait, met push,
camera en agenda. Daarna in App Store Connect:

- **App Information**: categorie (Education of Lifestyle), privacybeleid
  `https://vtk.be/privacy`, leeftijdsclassificatie (vragenlijst; alcohol op
  evenementen telt als "infrequent/mild references").
- **App Privacy**: de gegevens die de app aan VTK doorgeeft. Naam, e-mailadres
  en een gebruikers-ID (je account), aankopen (tickets, broodjes), en een
  apparaat-ID voor push. Gekoppeld aan de gebruiker, niet voor tracking. Je
  locatie verlaat het toestel niet en telt dus niet als verzameld.
- **Versie 1.0**: screenshots voor de 6.9"-iPhone (1320 x 2868, minstens drie),
  beschrijving, trefwoorden, support-URL (`https://vtk.be/contact`).
- **App Review Information**: een **testaccount met wachtwoord** op vtk.be, geen
  KU Leuven-login (de reviewer heeft er geen). Werk de onboarding en de
  studiebevestiging voor dat account af, anders botst de reviewer op de poort.
  Zet in de notities wat het is: de app van de studentenvereniging van de
  ingenieurs aan de KU Leuven; tickets en broodjes worden betaald via Mollie in
  de browser omdat het fysieke evenementen en eten zijn (richtlijn 3.1.3(e));
  de ticketscanner verschijnt enkel voor wie scanrechten heeft.

**Android**

De **eerste** upload moet met de hand; Google laat een API pas toe nadat de app
één keer een build heeft. Download de `.aab` van de build op expo.dev en zet ze
in de Play Console onder **Testing -> Internal testing -> Create release**. Vanaf
dan:

```
npx eas-cli@latest submit --platform android --latest
```

Dat zet een build als concept op de interne testtrack (`eas.json`). Daarnaast
onder **Policy -> App content**:

- privacybeleid `https://vtk.be/privacy`;
- **App access**: hetzelfde testaccount met wachtwoord, met dezelfde uitleg;
- advertenties: nee; doelgroep: 18+ (studenten, geen kinderen);
- vragenlijst voor de inhoudsclassificatie;
- **Data safety**: dezelfde gegevens als bij Apple (naam, e-mail, gebruikers-ID,
  aankopen, apparaat-ID voor push), versleuteld onderweg, verwijderbaar via
  `vtk.be/account`.

En de **Store listing**: korte beschrijving (80 tekens), volledige beschrijving,
icoon 512 x 512, feature graphic 1024 x 500, minstens twee telefoonscreenshots.

### 4. Release

- Apple: in App Store Connect de build aan versie 1.0 koppelen en **Submit for
  Review**. Een eerste review duurt meestal één tot twee dagen.
- Google: van intern naar gesloten test (en de 14 dagen, zie hoger) en dan naar
  productie. De eerste review kan enkele dagen duren.

## Een nieuwe versie naar de stores

Zo ging 1.1.0 (november 2026, nieuw icoon): versie 1.0.0 was ingediend bij Apple
maar nog niet vrijgegeven, en een versie die Apple al goedkeurde kan je niet
opnieuw indienen. Dus:

1. `version` in `app.json` omhoog. Het buildnummer en de `versionCode` doet EAS.
2. `npx eas-cli@latest build --profile production --platform all`.
3. `npx eas-cli@latest submit --platform ios --latest` en, eens het
   serviceaccount er is, hetzelfde voor `android`.
4. In App Store Connect een nieuwe versie met hetzelfde nummer, de nieuwe build
   eraan koppelen, "What's New" uit `docs/store.md`, en **Submit for Review**.
   Stond de vorige versie nog in review of was ze nog niet vrijgegeven, trek ze
   dan eerst terug of hernoem ze naar het nieuwe nummer.

## Na de release

**JavaScript-wijzigingen** blijven over de lucht gaan, maar naar de stores pas
wanneer je dat zelf beslist. De preview krijgt zoals altijd elke push naar
`main`. Voor de stores:

```
npx eas-cli@latest update --branch production --environment production --message "..."
```

`--environment production` is niet optioneel: daar komt `APP_VARIANT` vandaan,
en zonder krijgt de update de runtime van Expo Go en bereikt ze geen enkele
store-build. Het kanaal `production` leest standaard van de branch met dezelfde
naam.

**Een native wijziging** (een module erbij, iets in `app.json` dat in de build
zit, een SDK-sprong) vraagt een nieuwe build, een hogere `version` in `app.json`
en een nieuwe review. Door de fingerprint komt een update die die nieuwe native
kant nodig heeft, niet bij een oudere store-build aan; ze wacht op de nieuwe.

**Push op Android** heeft nog Firebase nodig (FCM): een Firebase-project,
`google-services.json` in de app (`android.googleServicesFile`) en de
FCM V1-sleutel bij EAS. Er wordt vandaag nog niets verstuurd (zie
`docs/architecture.md`), dus dit hoeft niet voor de eerste release, maar het is
een native wijziging en dus een nieuwe build wanneer het er komt.
