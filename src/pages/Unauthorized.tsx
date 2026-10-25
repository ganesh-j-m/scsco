import { Link } from "react-router-dom";
import { ShieldOff } from "lucide-react";

export default function Unauthorized() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-3 p-4 text-center">
      <ShieldOff className="h-10 w-10 text-red-500" aria-hidden />
      <h1 className="text-xl font-semibold">Access denied</h1>
      <p className="text-sm text-slate-500">You do not have permission to view this page.</p>
      <Link to="/" className="btn-primary">Go to homepage</Link>
    </div>
  );
}
