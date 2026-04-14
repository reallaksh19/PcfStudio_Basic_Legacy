import React from "react";
export function Textarea({ className = "", ...p }) {
  return <textarea className={`flex min-h-[80px] w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm placeholder:text-slate-400 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-slate-400 disabled:opacity-50 ${className}`} {...p} />;
}
