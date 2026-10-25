import { useState } from "react";
import { Link, Navigate, useLocation, useNavigate } from "react-router-dom";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { GraduationCap } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { ApiError } from "@/lib/api";
import { Spinner } from "@/components/ui";
import { homeFor } from "@/routes/guards";

const schema = z.object({
  loginId: z.string().trim().min(1, "Enter your Login ID"),
  password: z.string().min(1, "Enter your password"),
});
type Values = z.infer<typeof schema>;

export default function Login() {
  const { user, login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [error, setError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<Values>({ resolver: zodResolver(schema) });

  if (user) return <Navigate to={homeFor(user.role)} replace />;

  const onSubmit = async (v: Values) => {
    setError(null);
    try {
      const home = await login(v.loginId, v.password);
      const from = (location.state as { from?: string } | null)?.from;
      navigate(from ?? home, { replace: true });
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Unable to log in. Please try again.");
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 p-4">
      <div className="card w-full max-w-sm p-6">
        <div className="mb-6 text-center">
          <span className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-brand-600 text-white"><GraduationCap /></span>
          <h1 className="text-lg font-semibold">Sharadabai Pawar College</h1>
          <p className="text-sm text-slate-500">Sign in to the campus portal</p>
        </div>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
          {error && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
          <div>
            <label htmlFor="loginId" className="label">Login ID</label>
            <input id="loginId" className="input uppercase" autoComplete="username" {...register("loginId")} />
            {errors.loginId && <p className="mt-1 text-xs text-red-600">{errors.loginId.message}</p>}
          </div>
          <div>
            <label htmlFor="password" className="label">Password</label>
            <input id="password" type="password" className="input" autoComplete="current-password" {...register("password")} />
            {errors.password && <p className="mt-1 text-xs text-red-600">{errors.password.message}</p>}
          </div>
          <button className="btn-primary w-full" disabled={isSubmitting}>
            {isSubmitting && <Spinner />} Login
          </button>
        </form>
        <p className="mt-4 text-center text-sm"><Link to="/" className="text-brand-600 hover:underline">Back to website</Link></p>
      </div>
    </div>
  );
}
