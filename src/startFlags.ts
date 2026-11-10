// Petits drapeaux locaux de la liste « Pour démarrer » (stockage indisponible : ils valent « non »). Effacés à la
// déconnexion comme le reste de mjars:* (voir sessionCleanup.ts).
const VOICE_KEY = "mjars:voiceUsed";
const INSTALL_KEY = "mjars:installDone";
const HIDDEN_KEY = "mjars:startHidden";

function read(key: string): boolean {
  try { return localStorage.getItem(key) === "1"; } catch { return false; }
}
function write(key: string, on: boolean): void {
  try { if (on) localStorage.setItem(key, "1"); else localStorage.removeItem(key); } catch { /* sans importance */ }
}

export const voiceUsed = () => read(VOICE_KEY);
export const markVoiceUsed = () => write(VOICE_KEY, true);

export const installMarked = () => read(INSTALL_KEY);
export const setInstallMarked = (on: boolean) => write(INSTALL_KEY, on);

export const startHidden = () => read(HIDDEN_KEY);
export const setStartHidden = (on: boolean) => write(HIDDEN_KEY, on);

/** L'app tourne déjà comme une application installée (écran d'accueil du téléphone, fenêtre autonome). */
export function isInstalledApp(): boolean {
  try {
    return window.matchMedia("(display-mode: standalone)").matches || (navigator as unknown as { standalone?: boolean }).standalone === true;
  } catch {
    return false;
  }
}
