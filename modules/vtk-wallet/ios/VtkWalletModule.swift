import ExpoModulesCore
import PassKit

/// Een ticket aan Apple Wallet toevoegen zonder browser ertussen.
///
/// Tot hiertoe opende de app de `.pkpass` van vtk.be in de browser in de app.
/// Die toonde het venster van Wallet, maar bleef daarna als witte pagina staan
/// tot je ze zelf sloot. Hier halen we de pas zelf op en tonen we het venster van
/// Wallet (`PKAddPassesViewController`) rechtstreeks: na "Voeg toe" of
/// "Annuleer" sta je terug in de app.
///
/// In Expo Go en in een build zonder deze module bestaat ze niet; de JS-kant
/// (`src/wallet.ts`) valt dan terug op de browser.
public class VtkWalletModule: Module {
  /// Het venster kent zijn delegate enkel zwak; zonder deze verwijzing is de
  /// delegate weg voor de gebruiker iets kiest, en hoort de belofte nooit iets.
  private var pending: PassDelegate?

  public func definition() -> ModuleDefinition {
    Name("VtkWallet")

    Function("canAddPasses") { () -> Bool in
      PKAddPassesViewController.canAddPasses()
    }

    /// Haalt de pas op `url` en toont het venster. Lost op met "added" (de pas
    /// staat nu in Wallet), "exists" (ze stond er al) of "cancelled".
    AsyncFunction("addPassFromUrl") { (url: URL, promise: Promise) in
      URLSession.shared.dataTask(with: url) { data, response, error in
        if let error = error {
          promise.reject("E_DOWNLOAD", error.localizedDescription)
          return
        }
        let status = (response as? HTTPURLResponse)?.statusCode ?? 0
        guard let data = data, (200..<300).contains(status) else {
          promise.reject("E_DOWNLOAD", "De pas kon niet opgehaald worden (\(status)).")
          return
        }
        DispatchQueue.main.async {
          self.present(data: data, promise: promise)
        }
      }.resume()
    }
  }

  private func present(data: Data, promise: Promise) {
    let pass: PKPass
    do {
      pass = try PKPass(data: data)
    } catch {
      promise.reject("E_PASS", "Dit is geen geldige pas: \(error.localizedDescription)")
      return
    }

    let library = PKPassLibrary()
    if library.containsPass(pass) {
      promise.resolve("exists")
      return
    }

    guard let controller = PKAddPassesViewController(pass: pass) else {
      promise.reject("E_PASS", "Wallet kan deze pas niet tonen.")
      return
    }
    guard let presenter = appContext?.utilities?.currentViewController() else {
      promise.reject("E_PRESENT", "Er is geen scherm om het venster op te tonen.")
      return
    }

    let delegate = PassDelegate { [weak self] in
      promise.resolve(library.containsPass(pass) ? "added" : "cancelled")
      self?.pending = nil
    }
    pending = delegate
    controller.delegate = delegate
    presenter.present(controller, animated: true)
  }
}

private final class PassDelegate: NSObject, PKAddPassesViewControllerDelegate {
  private let onFinish: () -> Void

  init(onFinish: @escaping () -> Void) {
    self.onFinish = onFinish
  }

  func addPassesViewControllerDidFinish(_ controller: PKAddPassesViewController) {
    controller.dismiss(animated: true) { [onFinish] in onFinish() }
  }
}
