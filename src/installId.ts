import { getPref, setPref } from './storage';

const INSTALL_ID_KEY = 'install-id';

/**
 * Een willekeurige id per installatie, gemaakt bij de eerste start en daarna
 * bewaard. De site telt er installaties mee (Admin › Website › App) en herkent
 * er een bestelling uit de app aan (`X-VTK-Install`, zie `src/api/client.ts`).
 *
 * Bewust geen toestel-id van Apple of Google en geen `expo-crypto`: dit is geen
 * geheim, enkel een sleutel die buiten vtk.be niets zegt, en een native module
 * hoort niet in iets dat bij de start geladen wordt (zie AGENTS.md).
 */
let cached: string | null = null;

function uuid(): string {
  const hex = '0123456789abcdef';
  let out = '';
  for (let i = 0; i < 36; i++) {
    if (i === 8 || i === 13 || i === 18 || i === 23) out += '-';
    else if (i === 14) out += '4';
    else if (i === 19) out += hex[((Math.random() * 4) | 0) + 8];
    else out += hex[(Math.random() * 16) | 0];
  }
  return out;
}

export function installId(): string {
  if (cached) return cached;
  let id: string | null = null;
  try {
    id = getPref(INSTALL_ID_KEY);
  } catch {
    // Een kapotte voorkeurenopslag mag de app niet tegenhouden.
  }
  if (!id) {
    id = uuid();
    try {
      setPref(INSTALL_ID_KEY, id);
    } catch {
      // Dan telt deze start als een nieuwe installatie; liever dat dan geen app.
    }
  }
  cached = id;
  return id;
}

/** Een nieuwe willekeurige id, voor een sessie. */
export function randomId(): string {
  return uuid();
}
