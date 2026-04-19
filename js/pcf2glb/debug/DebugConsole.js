import React, { useState, useEffect } from "react";
function DebugConsole({ logger }) {
  const [logs, setLogs] = useState(() => logger.getEntries());
  const [levelFilter, setLevelFilter] = useState("ALL");
  const [stageFilter, setStageFilter] = useState("");
  useEffect(() => {
    const unsubscribe = logger.subscribe((latest, all) => {
      setLogs(all);
    });
    return unsubscribe;
  }, [logger]);
  const handleCopy = () => {
    navigator.clipboard.writeText(JSON.stringify(logs, null, 2));
    alert("Logs copied to clipboard!");
  };
  const handleDownload = () => {
    const blob = new Blob([JSON.stringify(logs, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "pcf2glb_logs.json";
    a.click();
    URL.revokeObjectURL(url);
  };
  const handleClear = () => {
    logger.clear();
  };
  const filteredLogs = logs.filter((log) => {
    if (levelFilter !== "ALL" && log.level !== levelFilter) return false;
    if (stageFilter && !log.code.toLowerCase().includes(stageFilter.toLowerCase())) return false;
    return true;
  });
  return /* @__PURE__ */ React.createElement("div", { style: { display: "flex", flexDirection: "column", height: "100%", border: "1px solid #ccc", background: "#fafafa", borderRadius: "4px" } }, /* @__PURE__ */ React.createElement("div", { style: { padding: "8px", borderBottom: "1px solid #ccc", display: "flex", gap: "10px", alignItems: "center", background: "#eee", flexWrap: "wrap" } }, /* @__PURE__ */ React.createElement("strong", null, "Debug Console"), /* @__PURE__ */ React.createElement("select", { value: levelFilter, onChange: (e) => setLevelFilter(e.target.value) }, /* @__PURE__ */ React.createElement("option", { value: "ALL" }, "All Levels"), /* @__PURE__ */ React.createElement("option", { value: "INFO" }, "INFO"), /* @__PURE__ */ React.createElement("option", { value: "WARN" }, "WARN"), /* @__PURE__ */ React.createElement("option", { value: "ERROR" }, "ERROR")), /* @__PURE__ */ React.createElement(
    "input",
    {
      type: "text",
      placeholder: "Filter by code...",
      value: stageFilter,
      onChange: (e) => setStageFilter(e.target.value),
      style: { padding: "2px 4px" }
    }
  ), /* @__PURE__ */ React.createElement("button", { onClick: handleCopy }, "Copy"), /* @__PURE__ */ React.createElement("button", { onClick: handleDownload }, "Export JSON"), /* @__PURE__ */ React.createElement("button", { onClick: handleClear }, "Clear"), /* @__PURE__ */ React.createElement("span", { style: { fontSize: "12px", marginLeft: "auto" } }, filteredLogs.length, " entries")), /* @__PURE__ */ React.createElement("div", { style: { flex: 1, overflowY: "auto", padding: "8px", fontFamily: "monospace", fontSize: "12px", background: "#1e1e1e", color: "#d4d4d4" } }, filteredLogs.length === 0 ? /* @__PURE__ */ React.createElement("div", { style: { color: "#888" } }, "No logs...") : null, filteredLogs.map((log, i) => {
    let color = "#d4d4d4";
    if (log.level === "WARN") color = "#ce9178";
    if (log.level === "ERROR") color = "#f44747";
    return /* @__PURE__ */ React.createElement("div", { key: i, style: { marginBottom: "4px", borderBottom: "1px solid #333", paddingBottom: "4px" } }, /* @__PURE__ */ React.createElement("span", { style: { color: "#569cd6" } }, "[", log.ts.split("T")[1].replace("Z", ""), "]"), " ", /* @__PURE__ */ React.createElement("span", { style: { color, fontWeight: "bold" } }, "[", log.level, "]"), " ", /* @__PURE__ */ React.createElement("span", { style: { color: "#4ec9b0" } }, log.code), " ", Object.keys(log.data).length > 0 && /* @__PURE__ */ React.createElement("span", { style: { color: "#9cdcfe" } }, JSON.stringify(log.data)));
  })));
}
export {
  DebugConsole
};
