import React from "react";
export function Card({ className = "", children, ...p }) {
  return <div className={`rounded-xl border bg-white shadow-sm ${className}`} {...p}>{children}</div>;
}
export function CardHeader({ className = "", children, ...p }) {
  return <div className={`flex flex-col space-y-1.5 p-6 ${className}`} {...p}>{children}</div>;
}
export function CardTitle({ className = "", children, ...p }) {
  return <h3 className={`text-lg font-semibold leading-none tracking-tight ${className}`} {...p}>{children}</h3>;
}
export function CardDescription({ className = "", children, ...p }) {
  return <p className={`text-sm text-slate-500 ${className}`} {...p}>{children}</p>;
}
export function CardContent({ className = "", children, ...p }) {
  return <div className={`p-6 pt-0 ${className}`} {...p}>{children}</div>;
}
