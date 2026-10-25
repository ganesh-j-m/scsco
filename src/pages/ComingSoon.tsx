import { Construction } from "lucide-react";

export default function ComingSoon({ title, phase }: { title: string; phase: string }) {
  return (
    <div className="card mx-auto mt-10 max-w-md p-8 text-center">
      <Construction className="mx-auto mb-3 h-8 w-8 text-slate-500" aria-hidden />
      <h1 className="text-lg font-semibold capitalize">{title}</h1>
      <p className="mt-1 text-sm text-slate-500">This module is scheduled for {phase}.</p>
    </div>
  );
}
