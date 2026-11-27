import Constants from 'expo-constants';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import { registerPushToken, unregisterPushToken } from './api/bootstrap';
import { getPref, setPref, clearPref } from './storage';

/**
 * Pushberichten aan- en afzetten.
 *
 * **Toestemming wordt één keer vanzelf gevraagd, zodra je ingelogd bent**
 * (`askPushOnce`, vanuit Home; sinds november 2026). Tot dan enkel via de knop
 * onder Meer › Meldingen, en daar vond bijna niemand ze. Niet bij de allereerste
 * start: wie nog niet ingelogd is, krijgt geen berichten die over hem gaan, en
 * op iOS krijg je maar één kans; wie één keer weigert, moet daarna naar de
 * systeeminstellingen. De knop onder Meldingen blijft voor wie later wil.
 *
 * Het token wordt bij elke start opnieuw aangemeld, want het besturingssysteem
 * kan het vervangen zonder dat de app dat merkt.
 */

const ASKED_KEY = 'push-asked';
const TOKEN_KEY = 'push-token';

/** Hoe een binnengekomen bericht zich gedraagt terwijl de app openstaat. */
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
  }),
});

/** Heeft de gebruiker hier al ooit iets over beslist? */
export function hasBeenAsked(): boolean {
  return getPref(ASKED_KEY) === 'yes';
}

export function pushIsOn(): boolean {
  return Boolean(getPref(TOKEN_KEY));
}

/**
 * Vraagt toestemming en meldt het token aan.
 *
 * Geeft `false` terug wanneer de gebruiker weigert of wanneer het toestel geen
 * pushberichten kan krijgen (een simulator, bijvoorbeeld). De beller hoort dat
 * rustig te melden en niet opnieuw te vragen; `hasBeenAsked()` onthoudt dat we
 * het gevraagd hebben.
 */
export async function enablePush(): Promise<boolean> {
  setPref(ASKED_KEY, 'yes');

  const existing = await Notifications.getPermissionsAsync();
  const granted =
    existing.granted || (await Notifications.requestPermissionsAsync()).granted;
  if (!granted) return false;

  // Op Android moet er een kanaal bestaan, anders komt een bericht wel binnen
  // maar zonder geluid of belang.
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'VTK',
      // De enum bestaat (`NotificationChannelManager.types`), maar sinds SDK 58
      // herkent `import/namespace` het patroon waarmee ze gebouwd wordt niet meer.
      // eslint-disable-next-line import/namespace
      importance: Notifications.AndroidImportance.DEFAULT,
      lightColor: '#FFD23F',
    });
  }

  const projectId = Constants.expoConfig?.extra?.eas?.projectId as string | undefined;
  if (!projectId) {
    console.warn('Geen EAS-projectId; een pushtoken vragen heeft dan geen zin.');
    return false;
  }

  try {
    const token = (await Notifications.getExpoPushTokenAsync({ projectId })).data;
    await registerPushToken({
      token,
      platform: Platform.OS === 'ios' ? 'ios' : 'android',
      appVersion: Constants.expoConfig?.version,
    });
    setPref(TOKEN_KEY, token);
    return true;
  } catch (error) {
    // Geen netwerk of geen pushdienst: dan staat het gewoon niet aan, en dat
    // hoeft de gebruiker niet als een fout te zien.
    console.warn('Pushtoken registreren mislukte', error);
    return false;
  }
}

/** Zet pushberichten uit op de server; het toestel houdt zijn toestemming. */
export async function disablePush(): Promise<void> {
  const token = getPref(TOKEN_KEY);
  if (!token) return;
  try {
    await unregisterPushToken(token);
  } catch {
    // Al weg of geen netwerk; het token verdwijnt hier hoe dan ook, en de server
    // ruimt het op zodra Expo het afkeurt.
  }
  clearPref(TOKEN_KEY);
}

/**
 * Vraagt één keer vanzelf om pushberichten, voor wie ingelogd is en er nog nooit
 * over besliste. Wie het al weigerde (hier of in de systeeminstellingen), krijgt
 * de vraag niet opnieuw; wie al toestemming gaf, wordt stil aangemeld.
 */
export async function askPushOnce(): Promise<void> {
  if (hasBeenAsked()) return;
  try {
    const { status } = await Notifications.getPermissionsAsync();
    if (status === 'denied') {
      setPref(ASKED_KEY, 'yes');
      return;
    }
    await enablePush();
  } catch {
    // Expo Go of een toestel zonder pushdienst: dan staat het niet aan, en de
    // knop onder Meldingen kan het later nog.
    setPref(ASKED_KEY, 'yes');
  }
}

/**
 * Meldt een bestaand token opnieuw aan bij de start.
 *
 * Doet niets wanneer push nooit aangezet is; dit is uitdrukkelijk geen sluipweg
 * om het alsnog te vragen.
 */
export async function refreshPushRegistration(): Promise<void> {
  if (!pushIsOn()) return;
  await enablePush();
}
