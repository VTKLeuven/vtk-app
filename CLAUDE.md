@AGENTS.md

# Schrijfconventies

- **Gebruik geen em-dashes (—)** in code, comments, UI-copy, commits of andere
  output. Gebruik in plaats daarvan een puntkomma, dubbele punt, komma, of een
  losse zin.
- Vertaal technische termen niet krampachtig naar het Nederlands.
- **EAS Update na elke app-wijziging.** Push je naar `main`, publiceer dan ook
  altijd direct een EAS Update zodat toestellen en Expo Go de wijzigingen
  ontvangen:
  `npx eas update --branch preview --environment preview --message "<korte beschrijving>"`.
- **Het contract komt uit vtk-website-new.** Pas `src/api/contract.ts` nooit
  hier aan: wijzig `apps/web/lib/app-api/contract.ts` in vtk-website-new en draai
  `npm run contract:sync`. Draai `npm run check` voor je pusht.
