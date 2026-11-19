const { getDefaultConfig } = require('expo/metro-config');

/**
 * Metro met de standaardinstelling van Expo.
 *
 * Tot november 2026 stond de app in `mobile/` binnen de monorepo van de website,
 * en blokkeerde dit bestand de `node_modules` van de verdieping erboven: anders
 * kon Metro bij een ontbrekend pakket doorschuiven naar de `react` van Next, met
 * twee kopieën van React als gevolg. Sinds de app een eigen repo heeft, is er
 * geen verdieping erboven meer om voor op te passen.
 */
module.exports = getDefaultConfig(__dirname);
