#!/usr/bin/env node
/**
 * Het contract met de site, gelijk houden met het origineel.
 *
 * `src/api/contract.ts` is een letterlijke kopie van
 * `apps/web/lib/app-api/contract.ts` in vtk-website-new. Sinds de app een eigen
 * repo heeft, kan geen van beide repo's dat bestand van de andere importeren, dus
 * blijft het een kopie, en is de enige verdediging tegen drift dat iemand het
 * vergelijkt. Dat doet dit script:
 *
 *   npm run contract:sync    kopieert het origineel hierheen
 *   npm run contract:check   faalt wanneer de twee verschillen
 *
 * Het zoekt de website naast deze repo (`../vtk-website-new`), of waar
 * `VTK_WEBSITE_DIR` naar wijst. Staat ze er niet, dan zegt `check` dat en slaagt
 * hij, tenzij met `--strict`: zonder de andere repo valt er niets te vergelijken,
 * en een check die dan faalt, leert iedereen hem uit te zetten. De test aan de
 * kant van de site (`apps/web/test/appApiContract.test.ts`) doet hetzelfde in
 * omgekeerde richting.
 */
import { copyFileSync, existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const website = resolve(process.env.VTK_WEBSITE_DIR ?? join(root, '..', 'vtk-website-new'));
const original = join(website, 'apps/web/lib/app-api/contract.ts');
const copy = join(root, 'src/api/contract.ts');
const mode = process.argv[2];
const strict = process.argv.includes('--strict');

if (!existsSync(original)) {
  const message = `Geen vtk-website-new gevonden op ${website}; zet VTK_WEBSITE_DIR of clone ze naast deze repo.`;
  if (mode === 'sync' || strict) {
    console.error(message);
    process.exit(1);
  }
  console.log(`contract:check overgeslagen. ${message}`);
  process.exit(0);
}

if (mode === 'sync') {
  copyFileSync(original, copy);
  console.log(`src/api/contract.ts bijgewerkt uit ${original}`);
} else if (mode === 'check') {
  if (readFileSync(original, 'utf8') !== readFileSync(copy, 'utf8')) {
    console.error(
      'src/api/contract.ts verschilt van apps/web/lib/app-api/contract.ts in vtk-website-new.\n' +
        'Draai `npm run contract:sync` (of pas eerst het origineel aan; dat is de bron).',
    );
    process.exit(1);
  }
  console.log('Contract gelijk aan vtk-website-new.');
} else {
  console.error('Gebruik: node scripts/contract.mjs sync|check [--strict]');
  process.exit(2);
}
