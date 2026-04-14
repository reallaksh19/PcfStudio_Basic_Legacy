import React from "react";
export function Separator({ className = "", orientation = "horizontal", ...p }) {
  return <div className={`shrink-0 bg-slate-200 ${orientation === "vertical" ? "h-full w-[1px]" : "h-[1px] w-full"} ${className}`} {...p} />;
}
