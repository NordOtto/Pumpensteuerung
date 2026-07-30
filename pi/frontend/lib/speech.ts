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

/**
 * Bricht ab, wenn ein Aufruf nicht antwortet. Geht ein Capacitor-Bridge-Aufruf
 * ins Leere, bleibt seine Promise fuer immer offen — der Aufrufer haengt dann
 * stumm fest ("Ich hoere zu…" ohne Ergebnis und ohne Fehler).
 */
function withTimeout<T>(p: Promise<T>, ms: number, was: string): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`${was}: keine Antwort nach ${ms / 1000}s`)), ms),
    ),
  ]);
}

let nativeCache: NativePlugin | null | undefined;

async function loadNative(): Promise<NativePlugin | null> {
  if (nativeCache !== undefined) return nativeCache;
  if (!hasNativePlugin()) {
    nativeCache = null;
    return null;
  }
  try {
    const mod = await withTimeout(
      import("@capacitor-community/speech-recognition"), 4000, "Plugin laden");
    const plugin = mod.SpeechRecognition as unknown as NativePlugin;
    const { available } = await withTimeout(plugin.available(), 4000, "available()");
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
    // Welche Plugins kennt die Bridge überhaupt? Verrät, ob die Registrierung
    // im Remote-URL-Modus ankommt.
    const plugins = (window as unknown as { Capacitor?: { Plugins?: Record<string, unknown> } })
      .Capacitor?.Plugins;
    out.push(`Bridge kennt: ${plugins ? Object.keys(plugins).join(", ") || "(keine)" : "—"}`);

    try {
      const mod = await withTimeout(
        import("@capacitor-community/speech-recognition"), 4000, "Plugin laden");
      const res = await withTimeout(mod.SpeechRecognition.available(), 4000, "available()");
      out.push(`Geräte-Spracherkennung: ${res.available ? "verfügbar" : "nicht verfügbar"}`);
      try {
        const p = await withTimeout(
          mod.SpeechRecognition.checkPermissions(), 4000, "checkPermissions()");
        out.push(`Mikrofon-Freigabe: ${p.speechRecognition}`);
      } catch (e) {
        out.push(`Freigabe nicht abfragbar: ${e instanceof Error ? e.message : String(e)}`);
      }
    } catch (e) {
      out.push(`Plugin-Fehler: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  const ok = await withTimeout(speechAvailable(), 5000, "Verfügbarkeit")
    .catch(() => false);
  out.push("");
  out.push(ok ? "→ Diktieren sollte funktionieren." : "→ Diktieren ist hier nicht möglich.");
  return out.join("\n");
}

/**
 * Nimmt einen gesprochenen Satz auf und liefert ihn als Text.
 * Gibt null zurueck, wenn nichts erkannt wurde oder der Nutzer abbricht.
 */
export async function listenOnce(): Promise<string | null> {
  const native = await withTimeout(loadNative(), 4000, "Plugin-Suche");

  if (native) {
    // Fehler hier NICHT schlucken — sonst sieht ein abgelehntes oder gar nicht
    // erschienenes Berechtigungsfenster wie "nichts verstanden" aus.
    const perm = await withTimeout(native.checkPermissions(), 5000, "Freigabe prüfen");
    if (perm.speechRecognition !== "granted") {
      const asked = await withTimeout(native.requestPermissions(), 60000, "Freigabe anfragen");
      if (asked.speechRecognition !== "granted") {
        throw new Error(`Mikrofon-Freigabe verweigert (${asked.speechRecognition})`);
      }
    }
    const res = await withTimeout(
      native.start({ language: "de-DE", maxResults: 1, partialResults: false, popup: false }),
      60000,
      "Aufnahme",
    );
    return res.matches?.[0]?.trim() || null;
  }

  // Kein natives Plugin: in der Android-App ist die Browser-Erkennung eine
  // Attrappe — start() wirft nicht, onend feuert sofort, und es erscheint nie
  // eine Berechtigungsabfrage. Lieber klar sagen, dass die Bruecke fehlt.
  if (capacitor()?.isNativePlatform?.()) {
    throw new Error(
      "Das native Sprach-Plugin antwortet nicht. Die App muss mit dem aktuellen APK neu installiert werden.",
    );
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
