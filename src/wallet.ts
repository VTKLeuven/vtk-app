import { requireOptionalNativeModule } from 'expo';
import * as WebBrowser from 'expo-web-browser';
import { Linking, Platform } from 'react-native';

/**
 * Een ticket aan de wallet van dit toestel toevoegen, zonder dat er een witte
 * browserpagina achterblijft.
 *
 * - **iOS**: de eigen module `VtkWallet` (`modules/vtk-wallet`) toont het venster
 *   van Apple Wallet in de app. Die zit enkel in een build van na november 2026;
 *   in Expo Go en in een oudere build bestaat ze niet, en dan opent de pas zoals
 *   voordien in de browser in de app. `requireOptionalNativeModule` gooit dan
 *   niet, dus een EAS Update naar een oudere build valt niet om.
 * - **Android**: het adres op vtk.be stuurt door naar `pay.google.com`. We
 *   volgen die doorverwijzing zelf en geven het eindadres aan het systeem: dat
 *   opent Google Wallet, en terug brengt je meteen in de app.
 */

type VtkWalletModule = {
  canAddPasses(): boolean;
  addPassFromUrl(url: string): Promise<'added' | 'exists' | 'cancelled'>;
};

const nativeWallet = Platform.OS === 'ios' ? requireOptionalNativeModule<VtkWalletModule>('VtkWallet') : null;

export async function addToAppleWallet(url: string): Promise<void> {
  if (nativeWallet?.canAddPasses()) {
    try {
      await nativeWallet.addPassFromUrl(url);
      return;
    } catch {
      // Ophalen of tonen mislukte; de browser kan het dan nog altijd.
    }
  }
  await WebBrowser.openBrowserAsync(url);
}

export async function addToGoogleWallet(url: string): Promise<void> {
  try {
    const response = await fetch(url);
    const target = response.url;
    if (response.ok && target.startsWith('https://pay.google.com/')) {
      await Linking.openURL(target);
      return;
    }
  } catch {
    // Valt terug op de browser hieronder.
  }
  await WebBrowser.openBrowserAsync(url);
}
