/** Spracheingabe mit drei Stufen, in dieser Reihenfolge:
 *
 *  1. Natives Capacitor-Plugin — in der Android-App. Nutzt Androids eigene
 *     Spracherkennung; im WebView ist die Web Speech API meist gar nicht da.
 *  2. Web Speech API — Safari/iOS und Desktop-Chrome.
 *  3. Nichts — dann bleibt das Mikrofon-Symbol ausgeblendet.
 *
 * Das Plugin wird dynamisch geladen, damit der Web-Build ohne native
 * Umgebung nicht daran scheitert.
 */

interface SpeechRec {
  lang: string;
  interimResults: boolean;
  onresult: (e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void;
  onend: () => void;
  onerror: () => void;
  start: () => void;
}

type NativePlugin = {
  available: () => Promise<{ available: boolean }>;
  requestPermissions: () => Promise<{ speechRecognition: string }>;
  checkPermissions: () => Promise<{ speechRecognition: string }>;
  start: (opts: { language: string; maxResults: number; partialResults: boolean; popup: boolean }) =>
    Promise<{ matches?: string[] }>;
  stop: () => Promise<void>;
};

function webCtor(): (new () => SpeechRec) | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as {
    SpeechRecognition?: new () => SpeechRec;
    webkitSpeechRecognition?: new () => SpeechRec;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

function isNativeApp(): boolean {
  if (typeof window === "undefined") return false;
  const cap = (window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor;
  return Boolean(cap?.isNativePlatform?.());
}

let nativeCache: NativePlugin | null | undefined;

async function loadNative(): Promise<NativePlugin | null> {
  if (nativeCache !== undefined) return nativeCache;
  if (!isNativeApp()) {
    nativeCache = null;
    return null;
  }
  try {
    const mod = await import("@capacitor-community/speech-recognition");
    const plugin = mod.SpeechRecognition as unknown as NativePlugin;
    const { available } = await plugin.available();
    nativeCache = available ? plugin : null;
  } catch {
    nativeCache = null;
  }
  return nativeCache;
}

/** Ist Diktieren hier ueberhaupt moeglich? Steuert die Sichtbarkeit des Mikrofons. */
export async function speechAvailable(): Promise<boolean> {
  if (await loadNative()) return true;
  return webCtor() !== null;
}

/**
 * Nimmt einen gesprochenen Satz auf und liefert ihn als Text.
 * Gibt null zurueck, wenn nichts erkannt wurde oder der Nutzer abbricht.
 */
export async function listenOnce(): Promise<string | null> {
  const native = await loadNative();

  if (native) {
    const perm = await native.checkPermissions().catch(() => ({ speechRecognition: "prompt" }));
    if (perm.speechRecognition !== "granted") {
      const asked = await native.requestPermissions().catch(() => ({ speechRecognition: "denied" }));
      if (asked.speechRecognition !== "granted") return null;
    }
    const res = await native.start({
      language: "de-DE",
      maxResults: 1,
      partialResults: false,
      popup: false,
    });
    return res.matches?.[0]?.trim() || null;
  }

  const Ctor = webCtor();
  if (!Ctor) return null;
  return new Promise<string | null>((resolve) => {
    const rec = new Ctor();
    let done = false;
    const finish = (v: string | null) => {
      if (!done) { done = true; resolve(v); }
    };
    rec.lang = "de-DE";
    rec.interimResults = false;
    rec.onresult = (e) => finish(e.results[0]?.[0]?.transcript?.trim() || null);
    rec.onend = () => finish(null);
    rec.onerror = () => finish(null);
    try {
      rec.start();
    } catch {
      finish(null);
    }
  });
}
