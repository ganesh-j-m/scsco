import { useEffect, useState } from "react";
import { UserMinus, UserPlus } from "lucide-react";
import { api } from "@/lib/api";
import { useApi } from "@/hooks/useApi";
import { useToast } from "@/context/ToastContext";
import { Badge, ConfirmDialog, EmptyState, ErrorState, LoadingState, Modal, PageHeader, Spinner } from "@/components/ui";
import { apiMessage } from "@/components/forms";
import type { FacultyRow, HodDepartment } from "@/types/admin";

export default function Hods() {
  const toast = useToast();
  const { data, loading, error, reload } = useApi<{ data: HodDepartment[] }>("/hods");
  const [assigning, setAssigning] = useState<HodDepartment | null>(null);
  const [removing, setRemoving] = useState<HodDepartment | null>(null);
  const [busy, setBusy] = useState(false);

  const remove = async () => {
    if (!removing) return;
    setBusy(true);
    try {
      await api(`/hods/${removing.id}`, { method: "DELETE" });
      toast.success("HOD removed successfully.");
      setRemoving(null);
      reload();
    } catch (e) { toast.error(apiMessage(e, "Unable to remove HOD")); }
    finally { setBusy(false); }
  };

  return (
    <>
      <PageHeader title="HODs" subtitle="Assign one head of department per department" />
      <div className="card">
        {loading && !data ? <LoadingState rows={3} /> : error ? <ErrorState message={error} onRetry={reload} /> : !data?.data.length ? (
          <EmptyState title="No departments yet" hint="Departments are created in the Departments module. Add one, then assign its HOD here." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-left text-slate-500"><tr><th className="px-4 py-3 font-medium">Department</th><th className="px-4 py-3 font-medium">Faculty</th><th className="px-4 py-3 font-medium">Head of department</th><th className="px-4 py-3 text-right font-medium">Actions</th></tr></thead>
              <tbody className="divide-y divide-slate-100">
                {data.data.map((d) => (
                  <tr key={d.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3"><p className="font-medium">{d.name}</p><p className="text-xs text-slate-500">{d.code}</p></td>
                    <td className="px-4 py-3">{d._count.faculty}</td>
                    <td className="px-4 py-3">{d.hod ? <><p className="font-medium">{d.hod.user.name}</p><p className="text-xs text-slate-500">{d.hod.user.loginId}</p></> : <Badge>Not assigned</Badge>}</td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-2">
                        <button className="btn-secondary px-3 py-1" onClick={() => setAssigning(d)}><UserPlus className="h-4 w-4" /> {d.hod ? "Change" : "Assign"}</button>
                        {d.hod && <button className="btn-secondary px-3 py-1 text-red-600" onClick={() => setRemoving(d)}><UserMinus className="h-4 w-4" /> Remove</button>}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      <AssignModal dept={assigning} onClose={() => setAssigning(null)} onSaved={() => { setAssigning(null); reload(); }} />
      <ConfirmDialog open={!!removing} title="Remove this HOD?" message={`${removing?.hod?.user.name} will no longer head ${removing?.name} and will become a regular faculty member.`} confirmLabel="Remove" busy={busy} onConfirm={remove} onCancel={() => setRemoving(null)} />
    </>
  );
}

function AssignModal({ dept, onClose, onSaved }: { dept: HodDepartment | null; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const faculty = useApi<{ data: FacultyRow[] }>(dept ? `/faculty?departmentId=${dept.id}&status=ACTIVE&pageSize=100&sortBy=name&sortDir=asc` : null);
  const [facultyId, setFacultyId] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => { setFacultyId(dept?.hod?.id ?? ""); setErr(null); }, [dept]);

  const save = async () => {
    if (!dept || !facultyId) return setErr("Select a faculty member");
    setBusy(true);
    setErr(null);
    try {
      await api(`/hods/${dept.id}`, { method: "PUT", body: { facultyId } });
      toast.success("HOD assigned successfully.");
      onSaved();
    } catch (e) { setErr(apiMessage(e, "Unable to assign HOD")); }
    finally { setBusy(false); }
  };

  return (
    <Modal open={!!dept} title={`HOD for ${dept?.name ?? ""}`} onClose={onClose}>
      {err && <p role="alert" className="mb-3 rounded-lg bg-red-50 p-3 text-sm text-red-700">{err}</p>}
      {faculty.loading ? <LoadingState rows={1} /> : !faculty.data?.data.length ? (
        <p className="text-sm text-slate-600">This department has no active faculty yet. Add faculty first.</p>
      ) : (
        <>
          <label htmlFor="hod-select" className="label">Faculty member</label>
          <select id="hod-select" className="input" value={facultyId} onChange={(e) => setFacultyId(e.target.value)}>
            <option value="">Select</option>
            {faculty.data.data.map((f) => <option key={f.id} value={f.id}>{f.user.name} ({f.employeeId})</option>)}
          </select>
          <p className="mt-2 text-xs text-slate-500">The selected person gets the HOD role and can manage only this department. A previous HOD returns to Faculty.</p>
        </>
      )}
      <div className="mt-5 flex justify-end gap-2">
        <button className="btn-secondary" onClick={onClose}>Cancel</button>
        <button className="btn-primary" onClick={save} disabled={busy || !facultyId}>{busy && <Spinner />} Save</button>
      </div>
    </Modal>
  );
}
