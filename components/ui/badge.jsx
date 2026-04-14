import React from "react";
const variants = {
  default: "bg-slate-900 text-white",
  secondary: "bg-slate-100 text-slate-900",
  destructive: "bg-red-500 text-white",
  outline: "border border-slate-200 text-slate-900",
};
export function Badge({ className = "", variant = "default", children, ...p }) {
  return <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${variants[variant] || variants.default} ${className}`} {...p}>{children}</span>;
}
