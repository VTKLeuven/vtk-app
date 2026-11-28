import { DevSettings } from 'react-native';

/**
 * Herlaadt de app. Voor wat bij de start vastligt en elk scherm raakt: het thema
 * (`src/theme/mode.ts`) en de taal (`src/i18n.ts`).
 */
export async function restartApp(): Promise<void> {
  try {
    // Laat geladen, en enkel hier: dit heeft niets te zoeken in de start van de app.
    const Updates = await import('expo-updates');
    await Updates.reloadAsync();
  } catch {
    // In een ontwikkelbuild herlaadt `expo-updates` niet; daar doet DevSettings het.
    DevSettings.reload();
  }
}
