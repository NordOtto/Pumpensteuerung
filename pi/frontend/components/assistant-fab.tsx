"use client";

import { useEffect, useRef, useState } from "react";
import { Sparkles, Send, X, Mic } from "lucide-react";
import { api } from "@/lib/api";
import { listenOnce, speechDiagnose } from "@/lib/speech";
import { cn } from "@/lib/utils";
import type { AssistantIntent } from "@/lib/types";

type Msg = { role: "user" | "bot"; text: string; intent?: AssistantIntent };

/** Beim Deploy hochzählen — macht am Gerät sichtbar, welcher Stand geladen ist. */
const BUILD_TAG = "v3";

const BEISPIELE = [
  "Garten 20 Minuten bewässern",
  "Beregnungsstart vom Garten auf 6:30",
  "Wann wird das nächste Mal bewässert?",
  "Warum wird gerade nicht bewässert?",
];

/** Schwebender Assistent-Knopf: tippen oder diktieren, was passieren soll. */
export function AssistantFab() {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [listening, setListening] = useState(false);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [msgs, open]);

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 80);
  }, [open]);

  const push = (m: Msg) => setMsgs((c) => [...c, m]);

  const ask = async (text: string) => {
    const q = text.trim();
    if (!q || busy) return;
    setInput("");
    push({ role: "user", text: q });
    setBusy(true);
    try {
      // Lokaler Servicebefehl — die App hat keine Adresszeile für eine Debug-Seite.
      if (/^\s*(diagnose|mikro(fon)?|sprache)\s*$/i.test(q)) {
        push({ role: "bot", text: await speechDiagnose() });
        return;
      }
      const intent = await api.assistantAsk(q);
      if (intent.confirm && intent.preview) {
        push({ role: "bot", text: intent.preview, intent });
      } else {
        push({ role: "bot", text: intent.reply ?? "Alles klar." });
      }
    } catch (e) {
      push({ role: "bot", text: `Fehler: ${e instanceof Error ? e.message : "unbekannt"}` });
    } finally {
      setBusy(false);
    }
  };

  const confirm = async (intent: AssistantIntent, idx: number) => {
    setBusy(true);
    try {
      const res = await api.assistantApply(intent);
      // Bestätigte Nachricht verliert ihre Knöpfe, damit nichts doppelt läuft.
      setMsgs((c) => c.map((m, i) => (i === idx ? { ...m, intent: undefined } : m)));
      push({ role: "bot", text: res.reply });
    } catch (e) {
      push({ role: "bot", text: `Fehler: ${e instanceof Error ? e.message : "unbekannt"}` });
    } finally {
      setBusy(false);
    }
  };

  const cancel = (idx: number) => {
    setMsgs((c) => c.map((m, i) => (i === idx ? { ...m, intent: undefined } : m)));
    push({ role: "bot", text: "Abgebrochen." });
  };

  // Mikrofon immer anzeigen. Früher wurde es bei fehlender Erkennung versteckt —
  // dann ist aber nicht unterscheidbar, ob die Funktion fehlt oder die App
  // schlicht alten Code geladen hat. Ein Knopf, der seinen Grund nennt, ist
  // ehrlicher als gar kein Knopf.
  const listen = async () => {
    if (listening || busy) return;
    setListening(true);
    try {
      const said = await listenOnce();
      if (said) {
        await ask(said);
      } else {
        push({ role: "bot", text: `Nichts verstanden.\n\n${await speechDiagnose()}` });
      }
    } catch (e) {
      push({
        role: "bot",
        text: `Spracheingabe fehlgeschlagen: ${e instanceof Error ? e.message : String(e)}\n\n${await speechDiagnose()}`,
      });
    } finally {
      setListening(false);
    }
  };

  return (
    <>
      {/* Knopf unten rechts, über der Navigationsleiste */}
      {!open && (
        <button
          onClick={() => setOpen(true)}
          aria-label="Assistent öffnen"
          className={cn(
            "fixed bottom-[68px] right-4 z-[60] flex h-14 w-14 items-center justify-center",
            "rounded-full border border-[var(--color-purple)]/30 bg-purple text-white",
            "shadow-lg shadow-black/25 transition active:scale-95 hover:brightness-110",
            "lg:bottom-6 lg:right-6",
          )}
        >
          <Sparkles className="h-6 w-6" />
        </button>
      )}

      {open && (
        <div className="fixed inset-0 z-[70] flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4">
          <div
            className={cn(
              "flex w-full max-w-lg flex-col overflow-hidden border border-border bg-bg1",
              "h-[85dvh] rounded-t-card sm:h-[600px] sm:rounded-card",
            )}
          >
            {/* Kopf */}
            <div className="flex shrink-0 items-center gap-3 border-b border-border px-4 py-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[var(--color-purple-dim)] text-purple">
                <Sparkles className="h-4 w-4" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-[13px] font-bold text-tx">Assistent</div>
                {/* Bau-Kennung: zeigt sofort, ob die App wirklich neuen Code geladen hat */}
                <div className="text-[10px] text-tx3">Sag oder schreib, was passieren soll · {BUILD_TAG}</div>
              </div>
              <button
                onClick={() => setOpen(false)}
                aria-label="Schließen"
                className="flex h-8 w-8 items-center justify-center rounded-tile text-tx3 hover:bg-bg2 hover:text-tx"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Verlauf */}
            <div ref={scrollRef} className="flex flex-1 flex-col gap-3 overflow-y-auto p-4">
              {msgs.length === 0 && (
                <div className="flex flex-col gap-2">
                  <div className="text-[11px] text-tx3">Zum Beispiel:</div>
                  {BEISPIELE.map((b) => (
                    <button
                      key={b}
                      onClick={() => void ask(b)}
                      className="rounded-tile border border-border bg-bg2 px-3 py-2.5 text-left text-[13px] text-tx2 transition hover:border-purple/30 hover:text-tx active:scale-[0.99]"
                    >
                      {b}
                    </button>
                  ))}
                </div>
              )}

              {msgs.map((m, i) => (
                <div key={i} className={cn("flex", m.role === "user" ? "justify-end" : "justify-start")}>
                  <div
                    className={cn(
                      "max-w-[85%] whitespace-pre-wrap rounded-card border px-3.5 py-2.5 text-[13px] leading-relaxed",
                      m.role === "user"
                        ? "rounded-br-sm border-[var(--color-purple)]/25 bg-[var(--color-purple-dim)] text-tx"
                        : "rounded-bl-sm border-border bg-bg2 text-tx",
                    )}
                  >
                    {m.text}
                    {m.intent && (
                      <div className="mt-3 flex gap-2">
                        <button
                          onClick={() => void confirm(m.intent!, i)}
                          disabled={busy}
                          className="rounded-tile bg-ok px-3 py-1.5 text-[12px] font-bold text-white disabled:opacity-50"
                        >
                          Ausführen
                        </button>
                        <button
                          onClick={() => cancel(i)}
                          disabled={busy}
                          className="rounded-tile border border-border bg-bg1 px-3 py-1.5 text-[12px] font-semibold text-tx2 disabled:opacity-50"
                        >
                          Abbrechen
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              ))}

              {listening && (
                <div className="flex justify-end">
                  <div className="flex items-center gap-2 rounded-card rounded-br-sm border border-[var(--color-purple)]/25 bg-[var(--color-purple-dim)] px-3.5 py-2.5">
                    <Mic className="h-3.5 w-3.5 shrink-0 animate-pulse text-purple" />
                    <span className="text-[13px] text-tx2">Ich höre zu…</span>
                  </div>
                </div>
              )}
            </div>

            {/* Eingabe */}
            <div className="flex shrink-0 gap-2 border-t border-border p-3">
              <input
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && void ask(input)}
                placeholder="Was soll ich tun?"
                className="h-11 flex-1 rounded-tile border border-border bg-bg2 px-3 text-[14px] text-tx outline-none ring-purple/20 placeholder:text-tx3 focus:ring-2"
              />
              <button
                onClick={() => void listen()}
                disabled={busy}
                aria-label={listening ? "Höre zu…" : "Diktieren"}
                className={cn(
                  "flex h-11 w-11 shrink-0 items-center justify-center rounded-tile border transition",
                  listening
                    ? "animate-pulse border-[var(--color-purple)]/40 bg-[var(--color-purple-dim)] text-purple"
                    : "border-border bg-bg2 text-tx3",
                  "disabled:opacity-40",
                )}
              >
                <Mic className="h-4 w-4" />
              </button>
              <button
                onClick={() => void ask(input)}
                disabled={!input.trim() || busy}
                aria-label="Senden"
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-tile bg-purple text-white disabled:opacity-40"
              >
                <Send className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
