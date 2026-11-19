# VTK

De VTK-site als app, voor iOS en Android. Kalender (met de planning van
Burgieclan), broodjes bestellen, tickets, de scanner aan de deur, en alles wat er
op vtk.be staat, in de vorm van een app.

Gebouwd met Expo (SDK 58) en expo-router. De inhoud komt van
[vtk-website-new](https://github.com/VTKLeuven/vtk-website-new) via
`/api/app/v1`. Tot november 2026 stond deze app in `mobile/` in die repo.

```
npm install
npm start
npm run check     # types, lint, routes en het contract met de site
```

Inloggen vraagt HTTPS, dus lokaal testen gaat tegen een cloudflared-tunnel naar
je eigen `npm run dev` van de website; vul die URL in bij **Meer -> je naam ->
Server**.

- `AGENTS.md` - de afspraken in deze repo
- `docs/ontwikkelen.md` - opzetten, draaien op je telefoon, uitrollen met EAS
- `docs/plan.md` - het plan en hoever het staat
- `docs/architecture.md` - hoe de app met de site praat
- `docs/scanner.md` - de ticketscanner voor aan de deur, enkel voor wie iets te
  scannen heeft. De vroegere aparte app, `vtk-scanner-app`, staat enkel nog als
  archief.
