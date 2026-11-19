import type { ConfigContext, ExpoConfig } from 'expo/config';

/**
 * Bovenop `app.json`: enkel de `runtimeVersion` hangt af van waarvoor er gebouwd
 * wordt. Al de rest staat in `app.json`.
 *
 * - **Preview en Expo Go** houden `exposdk:58.0.0`. Expo Go laadt enkel een update
 *   met een `exposdk`-runtime, en zonder die waarde kan niemand de preview nog op
 *   een iPhone openen. Zie `docs/architecture.md`.
 * - **De stores** (`APP_VARIANT=production`) krijgen de `fingerprint`-policy: een
 *   hash over de native kant. Een geïnstalleerde app uit de App Store of Play
 *   Store kunnen we niet vragen om te herinstalleren, dus mag een update daar
 *   enkel aankomen bij een build die ze aankan. Met `exposdk` zou elke update
 *   naar elke SDK 58-build gaan, ook een die de nodige native module niet heeft.
 *
 * `APP_VARIANT` staat in het profiel `production` van `eas.json` (voor `eas
 * build`) en als EAS-omgevingsvariabele in de omgeving `production` (voor `eas
 * update --environment production`). Beide moeten kloppen, anders krijgt een
 * update een andere runtime dan de build en komt ze nergens aan.
 */
export default ({ config }: ConfigContext): ExpoConfig => ({
  ...(config as ExpoConfig),
  runtimeVersion: process.env.APP_VARIANT === 'production' ? { policy: 'fingerprint' } : 'exposdk:58.0.0',
});
