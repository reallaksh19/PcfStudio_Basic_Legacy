/**
 * TableInteraction.js
 * Handles user interactions: Paste, Export, and Event Listeners.
 */

export class TableInteraction {
    constructor(controller) {
        this.controller = controller;
    }

    setupPasteHandler(table) {
        table.addEventListener("paste", (e) => {
            e.preventDefault();
            const clipboardData = e.clipboardData || window.clipboardData;
            const pastedText = clipboardData.getData("text");
            if (!pastedText) return;

            const rows = pastedText.split("\n").map((r) => r.split("\t"));
            const startCell = e.target.closest("td");
            if (!startCell) return;

            const startRow = parseInt(startCell.dataset.row);
            const startCol = parseInt(startCell.dataset.col);

            rows.forEach((rowValues, rOffset) => {
                const targetRow = startRow + rOffset;
                if (targetRow >= this.controller.tableData.length) return;

                rowValues.forEach((val, cOffset) => {
                    const targetCol = startCol + cOffset;
                    if (targetCol >= this.controller.headers.length) return;

                    const cleanVal = val.trim();
                    this.controller.tableData[targetRow][targetCol] = cleanVal;

                    // Update DOM
                    const td = table.querySelector(`td[data-row="${targetRow}"][data-col="${targetCol}"]`);
                    if (td) {
                        td.textContent = cleanVal;
                        td.classList.add("cell-edited");
                    }
                });
            });
            console.log(`[TableInteraction] Pasted ${rows.length} rows.`);
        });
    }

    exportCSV(headers, data) {
        if (!data || data.length === 0) return;
        let csv = [];
        csv.push(headers.map(h => `"${h}"`).join(","));
        data.forEach(row => {
            if (!row) return;
            csv.push(row.map(val => `"${String(val || "").replace(/"/g, '""')}"`).join(","));
        });

        const blob = new Blob([csv.join("\n")], { type: "text/csv" });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.setAttribute("hidden", "");
        a.setAttribute("href", url);
        a.setAttribute("download", "pcf_table_export.csv");
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);
    }
}
