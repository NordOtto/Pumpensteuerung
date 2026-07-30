import { redirect } from "next/navigation";

// Der Assistent ist keine eigene Seite mehr, sondern der schwebende Knopf
// (components/assistant-fab.tsx) auf jeder Seite. Alte Lesezeichen und der
// App-Startbildschirm sollen trotzdem nicht ins Leere laufen.
export default function AssistantPage() {
  redirect("/dashboard");
}
