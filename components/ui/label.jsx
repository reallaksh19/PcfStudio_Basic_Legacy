import React from "react";
export function Label({ className = "", ...p }) {
  return <label className={`text-sm font-medium leading-none ${className}`} {...p} />;
}
