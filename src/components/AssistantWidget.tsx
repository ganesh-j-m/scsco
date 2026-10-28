import { useEffect, useRef, useState } from "react";
import { Bot, MessageCircle, Send, X } from "lucide-react";
import { useAuth } from "@/context/AuthContext";

type Msg = { role: "user" | "assistant"; text: string };

const PUBLIC_CHIPS = ["What courses are available?", "How do I take admission?", "BSc fees?", "प्रवेश प्रक्रिया काय आहे?", "Contact details"];
const STUDENT_CHIPS = ["My attendance", "My pending fees", "My timetable", "Admission documents?"];
const STAFF_CHIPS = ["My subjects", "My timetable", "Which departments are there?"];

/** Floating chat assistant. Works for visitors and for logged-in users (personal answers come from the server only). */
export function AssistantWidget() {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const end = useRef<HTMLDivElement>(null);

  // a different person logged in or out: start a clean chat
  useEffect(() => { setMsgs([]); }, [user?.loginId]);
  useEffect(() => { end.current?.scrollIntoView({ block: "end" }); }, [msgs, busy, open]);
  useEffect(() => {
    if (!open) return;
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [open]);

  const role = user?.role;
  const chips = !role ? PUBLIC_CHIPS : role === "STUDENT" || role === "PARENT" ? STUDENT_CHIPS : STAFF_CHIPS;

  async function send(raw: string) {
    const message = raw.trim().slice(0, 500);
    if (!message || busy) return;
    const history = msgs.slice(-6);
    setMsgs((m) => [...m, { role: "user", text: message }]);
    setText("");
    setBusy(true);
    let reply = "Sorry, I could not reach the server. Please try again.";
    try {
      const res = await fetch("/api/assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ message, history }),
      });
      const data = await res.json().catch(() => null);
      if (data && typeof data.reply === "string") reply = data.reply;
    } catch { /* keep the default message */ }
    setMsgs((m) => [...m, { role: "assistant", text: reply }]);
    setBusy(false);
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label={open ? "Close assistant" : "Open college assistant"}
        aria-expanded={open}
        className="fixed bottom-4 right-4 z-[60] flex h-14 w-14 items-center justify-center rounded-full bg-brand-600 text-white shadow-lg transition hover:bg-brand-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 focus-visible:ring-offset-2"
      >
        {open ? <X className="h-6 w-6" /> : <MessageCircle className="h-6 w-6" />}
      </button>

      {open && (
        <section
          role="dialog"
          aria-label="College assistant"
          className="fixed inset-x-3 bottom-20 z-[60] flex max-h-[75vh] flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl sm:inset-x-auto sm:right-4 sm:w-96"
        >
          <header className="flex items-center gap-2 bg-brand-600 px-4 py-3 text-white">
            <Bot className="h-5 w-5" aria-hidden />
            <div className="leading-tight">
              <p className="text-sm font-semibold">College Assistant</p>
              <p className="text-xs text-brand-100">{user ? `Logged in as ${user.name ?? user.loginId}` : "Ask about courses, admission, fees…"}</p>
            </div>
          </header>

          <div className="flex-1 space-y-3 overflow-y-auto px-3 py-3 text-sm" aria-live="polite">
            {msgs.length === 0 && (
              <div className="space-y-2">
                <p className="text-slate-600">Hi! 👋 Ask me anything about the college in English, मराठी or हिंदी.</p>
                <div className="flex flex-wrap gap-2">
                  {chips.map((c) => (
                    <button key={c} type="button" onClick={() => send(c)} className="rounded-full border border-brand-200 bg-brand-50 px-3 py-1 text-xs text-brand-700 hover:bg-brand-100">
                      {c}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {msgs.map((m, i) => (
              <div key={i} className={m.role === "user" ? "flex justify-end" : "flex justify-start"}>
                <p className={`max-w-[85%] whitespace-pre-wrap break-words rounded-2xl px-3 py-2 ${m.role === "user" ? "bg-brand-600 text-white" : "bg-slate-100 text-slate-800"}`}>{m.text}</p>
              </div>
            ))}
            {busy && <p className="text-xs text-slate-500">Typing…</p>}
            <div ref={end} />
          </div>

          <form
            className="border-t border-slate-200 p-2"
            onSubmit={(e) => { e.preventDefault(); void send(text); }}
          >
            <div className="flex items-center gap-2">
              <input
                value={text}
                onChange={(e) => setText(e.target.value)}
                maxLength={500}
                placeholder="Type your question…"
                aria-label="Your question"
                className="min-w-0 flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
              />
              <button type="submit" disabled={busy || !text.trim()} aria-label="Send" className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-600 text-white disabled:opacity-50">
                <Send className="h-4 w-4" />
              </button>
            </div>
            <p className="mt-1 px-1 text-[11px] text-slate-400">AI can make mistakes - confirm important details at the office (02475-252020). Do not type passwords or personal details.</p>
          </form>
        </section>
      )}
    </>
  );
}
