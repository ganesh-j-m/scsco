import { useState } from "react";
import { Send } from "lucide-react";
import { api } from "@/lib/api";
import { useLookup } from "@/hooks/useLookup";
import { useToast } from "@/context/ToastContext";
import { PageHeader, Spinner } from "@/components/ui";
import { apiMessage, FormField } from "@/components/forms";

export default function Announcements() {
  const toast = useToast();
  const courses = useLookup("courses");
  const [audience, setAudience] = useState("STUDENT");
  const [courseId, setCourseId] = useState("");
  const [type, setType] = useState("NOTICE");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const send = async () => {
    setBusy(true);
    setError(null);
    try {
      const r = await api<{ recipients: number }>("/notifications/broadcast", { body: { audience, courseId: audience === "STUDENT" ? courseId : "", type, title, body } });
      toast.success(`Notification sent to ${r.recipients} user${r.recipients === 1 ? "" : "s"}.`);
      setTitle(""); setBody("");
    } catch (e) { setError(apiMessage(e, "Unable to send the notification")); }
    finally { setBusy(false); }
  };

  return (
    <>
      <PageHeader title="Notifications" subtitle="Send an in-app announcement to a group of users" />
      <div className="card max-w-2xl space-y-3 p-4">
        {error && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
        <div className="grid gap-3 sm:grid-cols-3">
          <FormField label="Send to" id="n-aud"><select id="n-aud" className="input" value={audience} onChange={(e) => setAudience(e.target.value)}><option value="STUDENT">Students</option><option value="FACULTY">Faculty</option><option value="PARENT">Parents</option><option value="ALL">Everyone</option></select></FormField>
          <FormField label="Course (optional)" id="n-course"><select id="n-course" className="input" disabled={audience !== "STUDENT"} value={courseId} onChange={(e) => setCourseId(e.target.value)}><option value="">All courses</option>{courses.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></FormField>
          <FormField label="Type" id="n-type"><select id="n-type" className="input" value={type} onChange={(e) => setType(e.target.value)}><option value="NOTICE">Notice</option><option value="ACADEMIC">Academic</option><option value="ALERT">Alert</option></select></FormField>
        </div>
        <FormField label="Title" id="n-title"><input id="n-title" className="input" maxLength={120} value={title} onChange={(e) => setTitle(e.target.value)} /></FormField>
        <FormField label="Message (optional)" id="n-body"><textarea id="n-body" rows={4} className="input" maxLength={1000} value={body} onChange={(e) => setBody(e.target.value)} /></FormField>
        <div className="flex justify-end"><button className="btn-primary" disabled={busy || title.trim().length < 3} onClick={send}>{busy ? <Spinner /> : <Send className="h-4 w-4" />} Send notification</button></div>
      </div>
    </>
  );
}
