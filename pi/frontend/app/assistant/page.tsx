"use client";

import { useState, useRef, useEffect } from "react";
import { Bot, Send, RotateCcw } from "lucide-react";
import { Card } from "@/components/ui/card";
import { useStatus } from "@/lib/ws";
import { cn } from "@/lib/utils";
import type { AppStatus } from "@/lib/types";

const FLOW: Array<{
  id: string;
  q?: string;
  type?: "choice";
  options?: string[];
}> = [
  { id: "welcome" },
  { id: "what",     q: "Was soll bewässert werden?",                 type: "choice", options: ["Garten (Rasen + Beete)", "Hecken und Sträucher", "Gemüsegarten", "Topfpflanzen / Terrasse", "Eigene Eingabe…"] },
  { id: "mode",     q: "Wie soll die Bewässerung gesteuert werden?",  type: "choice", options: ["Smart ET — automatisch nach Verdunstung & Wetter", "Feste Zeiten & Wochentage", "Beides kombinieren", "Ich bin nicht sicher"] },
  { id: "zones",    q: "Wie viele Bewässerungszonen gibt es?",         type: "choice", options: ["1 Zone", "2–3 Zonen", "4–6 Zonen", "Mehr als 6"] },
  { id: "preset",   q: "Welches Druckprofil soll genutzt werden?",     type: "choice", options: ["Normal (3 bar)", "Beregnung (3.5 bar)", "Tropfschlauch (1.5 bar)", "Benutzerdefiniert"] },
  { id: "schedule", q: "Zu welcher Tageszeit soll bewässert werden?",   type: "choice", options: ["Frühmorgens (5–8 Uhr)", "Morgens (7–10 Uhr)", "Abends (18–21 Uhr)", "Steuerung entscheidet"] },
  { id: "result" },
];

type ChatMsg = { role: "user" | "assistant" | "thinking"; text?: string };

export default function AssistantPage() {
  const { status } = useStatus();
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [chat, setChat] = useState<ChatMsg[]>([
    { role: "assistant", text: "Hallo! Ich bin dein smarter Bewässerungsassistent.\n\nIch helfe dir dabei, ein optimales Bewässerungsprogramm zu konfigurieren. Ich stelle dir ein paar Fragen — lass uns beginnen!" },
  ]);
  const [input, setInput] = useState("");
  const chatRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (chatRef.current) chatRef.current.scrollTop = chatRef.current.scrollHeight;
  }, [chat]);

  const currentFlow = FLOW[step + 1];
  const isDone = step >= FLOW.length - 1;
  const showChoices = !isDone && currentFlow?.type === "choice";

  const handleChoice = (choice: string) => {
    const flowItem = FLOW[step + 1];
    if (!flowItem) return;
    const newAnswers = { ...answers, [flowItem.id]: choice };
    setAnswers(newAnswers);
    const nextStep = step + 1;
    const nextFlow = FLOW[nextStep + 1];

    if (nextStep >= FLOW.length - 2) {
      setChat(c => [...c, { role: "user", text: choice }, { role: "thinking" }]);
      setStep(FLOW.length - 1);
      setTimeout(() => {
        setChat(c => {
          const filtered = c.filter(m => m.role !== "thinking");
          return [...filtered, { role: "assistant", text: buildRecommendation(newAnswers, status) }];
        });
      }, 1600);
    } else {
      setChat(c => [...c, { role: "user", text: choice }, { role: "assistant", text: nextFlow?.q }]);
      setStep(nextStep);
    }
  };

  const sendFreeText = () => {
    if (!input.trim()) return;
    const text = input.trim();
    setInput("");
    setChat(c => [...c, { role: "user", text }, { role: "thinking" }]);
    setTimeout(() => {
      setChat(c => {
        const filtered = c.filter(m => m.role !== "thinking");
        return [...filtered, { role: "assistant", text: chatResponse(text, status) }];
      });
    }, 1000);
  };

  const restart = () => {
    setStep(0);
    setAnswers({});
    setChat([{ role: "assistant", text: "Neu gestartet! Ich helfe dir, ein optimales Bewässerungsprogramm zu konfigurieren. Lass uns beginnen!" }]);
  };

  const progress = Math.round((step / (FLOW.length - 1)) * 100);

  return (
    <div className="flex flex-col gap-0 h-[calc(100dvh-8rem)] animate-fade-up">
      <Card pad="none" className="flex flex-col overflow-hidden flex-1">

        {/* Header */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-border shrink-0">
          <div className="flex h-8 w-8 items-center justify-center rounded-tile bg-[var(--color-purple-dim)] text-purple shrink-0">
            <Bot className="h-4 w-4" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-[12px] font-bold text-tx">Bewässerungsassistent</div>
            <div className="text-[10px] text-tx3">KI-gestützte Programmkonfiguration</div>
          </div>
          <button onClick={restart} className="shrink-0 rounded-tile border border-border bg-bg2 px-2.5 py-1.5 text-[10px] font-semibold text-tx3 hover:text-tx transition">
            <RotateCcw className="h-3 w-3 inline mr-1" />
            Neu
          </button>
        </div>

        {/* Progress */}
        <div className="h-0.5 bg-bg3 shrink-0">
          <div className="h-full bg-purple transition-all duration-500" style={{ width: `${progress}%` }} />
        </div>

        {/* Chat */}
        <div ref={chatRef} className="flex-1 overflow-y-auto p-4 flex flex-col gap-3">
          {chat.map((msg, i) => (
            <div key={i} className={cn("flex", msg.role === "user" ? "justify-end" : "justify-start")}>
              {msg.role === "thinking" ? (
                <div className="rounded-card rounded-bl-sm border border-border bg-bg2 px-4 py-3">
                  <div className="flex gap-1.5 items-center">
                    {[0, 1, 2].map(j => (
                      <div key={j} className="h-1.5 w-1.5 rounded-full bg-purple animate-pulse-dot" style={{ animationDelay: `${j * 0.2}s` }} />
                    ))}
                  </div>
                </div>
              ) : (
                <div className={cn(
                  "max-w-[85%] rounded-card px-3.5 py-2.5 text-sm leading-relaxed whitespace-pre-wrap border",
                  msg.role === "user"
                    ? "rounded-br-sm bg-[var(--color-purple-dim)] border-[var(--color-purple)]/25 text-tx"
                    : "rounded-bl-sm bg-bg2 border-border text-tx"
                )}>
                  {msg.text}
                </div>
              )}
            </div>
          ))}

          {/* Choice buttons */}
          {showChoices && (
            <div className="flex flex-col gap-2 mt-1">
              {currentFlow.options?.map(opt => (
                <button key={opt} onClick={() => handleChoice(opt)} className={cn(
                  "flex items-center gap-3 rounded-tile border border-border bg-bg2 px-4 py-3",
                  "text-sm font-medium text-tx text-left transition",
                  "hover:border-purple/30 hover:bg-[var(--color-purple-dim)] active:scale-[0.98]"
                )}>
                  <span className="h-1.5 w-1.5 rounded-full bg-purple shrink-0" />
                  {opt}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Input */}
        <div className="flex gap-2 p-3 border-t border-border shrink-0">
          <input
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => e.key === "Enter" && sendFreeText()}
            placeholder="Frage stellen oder Freitext eingeben…"
            className="flex-1 h-10 rounded-tile border border-border bg-bg2 px-3 text-sm text-tx outline-none ring-purple/20 focus:ring-2 placeholder:text-tx3"
          />
          <button
            onClick={sendFreeText}
            disabled={!input.trim()}
            className="h-10 w-10 flex items-center justify-center rounded-tile bg-purple text-white disabled:opacity-40 shrink-0"
          >
            <Send className="h-4 w-4" />
          </button>
        </div>
      </Card>
    </div>
  );
}

function buildRecommendation(answers: Record<string, string>, status: AppStatus | null): string {
  const w = status?.irrigation.weather;
  const what = answers.what ?? "Garten";
  const mode = answers.mode ?? "Smart ET";
  const zones = answers.zones ?? "2–3 Zonen";
  const preset = answers.preset ?? "Normal (3 bar)";
  const schedule = answers.schedule ?? "Morgens (7–10 Uhr)";

  const numZones = zones.startsWith("1") ? 1 : zones.startsWith("2") ? 2 : zones.startsWith("4") ? 5 : 3;
  const isSmartET = mode.includes("Smart ET") || mode.includes("Beides");
  const startH = schedule.includes("5–8") ? 6 : schedule.includes("7–10") ? 7 : schedule.includes("18") ? 18 : 7;

  let rec = `✅ Konfigurationsempfehlung\n\n`;
  rec += `📋 Programm: "${what}"\n`;
  rec += `⚙️  Modus: ${isSmartET ? "Smart ET (ET₀-basiert)" : "Feste Zeiten"}\n`;
  rec += `🕐 Startzeit: ${String(startH).padStart(2, "0")}:00 Uhr\n`;
  rec += `💧 Preset: ${preset}\n\n`;
  rec += `📍 Zonen (${numZones}):\n`;
  for (let i = 1; i <= numZones; i++) {
    rec += `  Zone ${i}: 15–25 min, 10–12 mm\n`;
  }
  if (w) {
    rec += `\n🌤️ Heute: ET₀ ${w.et0_mm?.toFixed(1) ?? "—"} mm, Boden ${w.soil_moisture_pct ?? "—"}%\n`;
    rec += `  Skip bei Regen > 6 mm\n`;
  }
  rec += `\n💡 Mit Smart ET passt die Steuerung die Laufzeiten täglich automatisch an. Soll ich dieses Programm übernehmen?`;
  return rec;
}

function chatResponse(text: string, status: AppStatus | null): string {
  const l = text.toLowerCase();
  const w = status?.irrigation.weather;
  if (l.includes("et") || l.includes("verdunst"))   return `ET₀ (Evapotranspiration) misst den täglichen Wasserverlust durch Verdunstung. Heute: ${w?.et0_mm?.toFixed(1) ?? "—"} mm. Die Steuerung berechnet daraus den genauen Bedarf.`;
  if (l.includes("preset") || l.includes("druck"))  return "Presets steuern den Betriebsdruck. 'Normal' (3 bar) für Regner. 'Tropfschlauch' (1.5 bar) verhindert Überdruckschäden. Presets unter Einstellungen anpassen.";
  if (l.includes("zone"))                           return "Zonen sind Ventilgruppen die gemeinsam bewässert werden. Jede Zone hat eigene Laufzeiten und Schwellenwerte. Steuerung über MQTT-Topic.";
  if (l.includes("regen") || l.includes("wetter"))  return `Aktuell: ${w?.rain_24h_mm ?? 0} mm/24h, Vorhersage +${w?.forecast_rain_mm ?? 0} mm. Bei >6 mm überspringt die Steuerung automatisch.`;
  if (l.includes("smart") || l.includes("automatisch")) return "Smart ET berechnet täglich anhand von Wetterdaten wie viel Wasser jede Zone braucht. Trockene Tage → längere Laufzeiten. Nach Regen → verkürzen oder überspringen.";
  return "Ich helfe dir bei der Konfiguration von Bewässerungsprogrammen. Du kannst mir Fragen zu ET, Presets, Zonen oder Smart ET stellen. Oder nutze den geführten Assistenten oben.";
}
