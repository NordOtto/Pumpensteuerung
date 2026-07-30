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

interface CapacitorGlobal {
  isNativePlatform?: () => boolean;
  isPluginAvailable?: (name: string) => boolean;
}

function capacitor(): CapacitorGlobal | undefined {
  if (typeof window === "undefined") return undefined;
  return (window as unknown as { Capacitor?: CapacitorGlobal }).Capacitor;
}

/**
 * Ist das native Plugin wirklich da? isPluginAvailable() fragt die Bridge und
 * ist die verlaessliche Pruefung — faellt der Plugin-Proxy auf seine
 * Web-Implementierung zurueck, wirft available() naemlich nur "unimplemented".
 */
function hasNativePlugin(): boolean {
  const cap = capacitor();
  if (!cap?.isNativePlatform?.()) return false;
  return cap.isPluginAvailable?.("SpeechRecognition") ?? true;
}

let nativeCache: NativePlugin | null | undefined;

async function loadNative(): Promise<NativePlugin | null> {
  if (nativeCache !== undefined) return nativeCache;
  if (!hasNativePlugin()) {
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
 * Klartext-Bericht, warum Diktieren geht oder nicht — im Assistenten ueber
 * "diagnose" abrufbar. Die App hat keine Adresszeile, ueber die man eine
 * Debug-Seite aufrufen koennte.
 */
export async function speechDiagnose(): Promise<string> {
  const cap = capacitor();
  const out: string[] = [];
  out.push(`App-Modus: ${cap?.isNativePlatform?.() ? "Android-App" : "Browser"}`);
  out.push(`Capacitor-Bridge: ${cap ? "vorhanden" : "fehlt"}`);
  if (cap) {
    const known = cap.isPluginAvailable?.("SpeechRecognition");
    out.push(`Plugin registriert: ${known === undefined ? "unbekannt" : known ? "ja" : "nein"}`);
  }
  out.push(`Browser-Spracherkennung: ${webCtor() ? "vorhanden" : "fehlt"}`);

  if (cap?.isNativePlatform?.()) {
    try {
      const mod = await import("@capacitor-community/speech-recognition");
      const res = await mod.SpeechRecognition.available();
      out.push(`Geräte-Spracherkennung: ${res.available ? "verfügbar" : "nicht verfügbar"}`);
      try {
        const p = await mod.SpeechRecognition.checkPermissions();
        out.push(`Mikrofon-Freigabe: ${p.speechRecognition}`);
      } catch {
        out.push("Mikrofon-Freigabe: nicht abfragbar");
      }
    } catch (e) {
      out.push(`Plugin-Fehler: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  const ok = await speechAvailable();
  out.push("");
  out.push(ok ? "→ Diktieren sollte funktionieren." : "→ Diktieren ist hier nicht möglich.");
  return out.join("\n");
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
