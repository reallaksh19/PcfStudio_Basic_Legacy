export function buildLineGroups(tableData, headers) {
  const lineGroups = new Map();
  const lineIdx = headers.indexOf("Line No. (Derived)");
  const boreIdx = headers.indexOf("DN (Bore)");

  if (lineIdx === -1 || boreIdx === -1) {
    console.warn("[ca-matrix-popup] Cannot find Line No or DN columns.");
    return lineGroups;
  }

  tableData.forEach((row, rIdx) => {
    if (!row) return;
    const lineNo = (row[lineIdx] || 'UNKNOWN_LINE').toString().trim();
    if (!lineNo) return;
    const bore = (row[boreIdx] || 'Unknown').toString().trim();

    const groupKey = `${lineNo}::${bore}`;

    if (!lineGroups.has(groupKey)) {
      lineGroups.set(groupKey, { lineNo, bore, rows: [] });
    }
    lineGroups.get(groupKey).rows.push(rIdx);
  });

  return lineGroups;
}

import { linelistService } from "../services/linelist-service.js";

export function renderCAMatrix(lineGroups, caDefs) {
  const caList = ['CA1', 'CA2', 'CA3', 'CA4', 'CA5', 'CA6', 'CA7', 'CA8', 'CA9', 'CA10'];
  const labels = {
    'CA1': 'Pr. (KPA)',   'CA2': 'Temp (°C)',  'CA3': 'Mat.',
    'CA4': 'Wall (mm)',   'CA5': 'Insul (mm)', 'CA6': 'InsDen (kg/m³)',
    'CA7': 'Corr (mm)',   'CA8': 'Flange Wt (kg)', 'CA9': 'Den (kg/m³)',
    'CA10': 'HP (KPA)'
  };

  // Line No datalist data — unique values from the configured lineNo column (ColumnX1)
  const dataManager = window.dataManager;
  let linelistData = [];
  if (dataManager) linelistData = dataManager.getLinelist() || [];

  let lineNoKey = "Line Number";
  if (dataManager?.headerMap?.linelist?.lineNo) lineNoKey = dataManager.headerMap.linelist.lineNo;

  // Use only the dynamic ColumnX1 mapping (headerMap.linelist.lineNo) — not hardcoded fallbacks
  const linelistLineNos = Array.from(new Set(
    linelistData.map(r => r[lineNoKey]).filter(v => v !== undefined && v !== null && String(v).trim() !== '')
  )).sort();

  // Build datalist HTML (rendered once, shared by all rows)
  const datalistId = 'matrix-lineno-datalist';
  const datalistHtml = `<datalist id="${datalistId}">${linelistLineNos.map(ln => `<option value="${ln}">`).join('')}</datalist>`;

  // Helper to build a Fill Down button
  const fillBtn = (dataAttr, val) =>
    `<button class="ca-fill-down-btn" data-${dataAttr}="${val}" title="Fill Down"
      style="margin-top:2px;cursor:pointer;background:var(--amber);color:#000;border:none;border-radius:3px;padding:1px 4px;font-size:0.65rem;font-weight:700;line-height:1.4">&#9660; Fill</button>`;

  // Helper: editable cell (shared style)
  const cellStyle = 'width:100%;box-sizing:border-box;background:var(--bg-2);border:1px solid var(--border);color:var(--text-primary);padding:4px;';

  let rowsHtml = '';
  for (const [key, group] of lineGroups.entries()) {
    // CA inputs
    const caCells = caList.map(ca =>
      `<td style="padding:4px"><input type="text" data-group="${key}" data-ca="${ca}" value=""
        style="${cellStyle}min-width:60px;"></td>`
    ).join('');

    rowsHtml += `
      <tr data-group-row="${key}" data-original-line="${group.lineNo}">
        <td style="padding:2px;text-align:center;">
          <button class="btn-row-load-master" data-group="${key}" title="Load from master for this row"
            style="cursor:pointer;background:var(--amber);color:#000;border:none;border-radius:3px;
                   padding:1px 6px;font-size:0.9rem;line-height:1.6;">⟳</button>
        </td>
        <td style="padding:4px;white-space:nowrap;min-width:220px;">
          <input type="text" list="${datalistId}" data-group="${key}" class="matrix-line-no"
            value="${group.lineNo}" style="${cellStyle}width:100%;min-width:200px;">
        </td>
        <td style="padding:4px;white-space:nowrap">${group.bore}</td>
        <td style="padding:4px"><input type="text" data-group="${key}" data-pc="" value=""
          style="${cellStyle}min-width:80px;" placeholder="—"></td>
        <td style="padding:4px"><input type="text" data-group="${key}" data-rating="" value=""
          style="${cellStyle}min-width:50px;" placeholder="—"></td>
        ${caCells}
      </tr>
    `;
  }

  const caThHtml = caList.map(ca => `
    <th style="padding:4px;font-weight:normal;font-size:11px;white-space:nowrap;">
      ${labels[ca]}<br>${fillBtn('ca', ca)}
    </th>`).join('');

  return `
    ${datalistHtml}
    <div style="overflow-x:auto;">
      <table style="width:100%;border-collapse:collapse;text-align:left;">
        <thead>
          <tr style="border-bottom:1px solid var(--border);">
            <th style="padding:4px;width:32px;"></th>
            <th style="padding:4px;min-width:220px;">Line No.</th>
            <th style="padding:4px;">Bore</th>
            <th style="padding:4px;font-size:11px;white-space:nowrap;">
              Piping Class<br>${fillBtn('pc', 'pc')}
            </th>
            <th style="padding:4px;font-size:11px;white-space:nowrap;">
              Rating<br>${fillBtn('rating', 'rating')}
            </th>
            ${caThHtml}
          </tr>
        </thead>
        <tbody>${rowsHtml}</tbody>
      </table>
    </div>
  `;
}

export function applyMatrixToTable(matrixValues, tableData, headers, lineGroups) {
  const caMap = {
    'CA1':  headers.indexOf('P1 (ATTR1)'),
    'CA2':  headers.indexOf('T1 (ATTR2)'),
    'CA3':  headers.indexOf('Material (ATTR3)'),
    'CA4':  headers.indexOf('Wall Thk (ATTR4)'),
    'CA5':  headers.indexOf('Ins Thk (ATTR5)'),
    'CA6':  headers.indexOf('Ins Den (ATTR6)'),
    'CA7':  headers.indexOf('Corr (ATTR7)'),
    'CA8':  headers.indexOf('Weight (ATTR8)'),
    'CA9':  headers.indexOf('Density (ATTR9)'),
    'CA10': headers.indexOf('HP (ATTR10)'),
    'pc':     headers.indexOf('Piping Class'),
    'rating': headers.indexOf('Rating'),
  };

  const typeIdx = headers.indexOf('Component');

  for (const [key, caValues] of Object.entries(matrixValues)) {
    const group = lineGroups.get(key);
    if (!group) continue;

    group.rows.forEach(rIdx => {
      const row = tableData[rIdx];
      if (!row) return;
      const compType = typeIdx !== -1 ? String(row[typeIdx]).toUpperCase() : '';

      Object.entries(caValues).forEach(([ca, val]) => {
        const colIdx = caMap[ca];
        if (colIdx === undefined || colIdx === -1) return;

        // Weight (CA8): FLANGE → apply value; non-FLANGE → set 0 if cell is blank
        if (ca === 'CA8') {
          const cur = row[colIdx];
          const blank = cur === undefined || cur === null || cur === '' || cur === 0 || cur === '0' || cur === 'Undefined MM';
          if (!compType.includes('FLANGE')) {
            if (blank) row[colIdx] = '0';
            return;
          }
          // FLANGE: fall through to normal blank-fill below
        }

        const currentVal = row[colIdx];
        const isBlank = currentVal === undefined || currentVal === null ||
                        currentVal === '' || currentVal === 0 ||
                        currentVal === '0' || currentVal === 'Undefined MM';
        if (isBlank && val && val !== '') {
          row[colIdx] = val;
        }
      });
    });
  }

  return tableData;
}

/**
 * Overwrite variant — always writes, regardless of current cell value.
 * Used by "Load from Master (Overwrite)" button.
 */
export function overwriteMatrixToTable(matrixValues, tableData, headers, lineGroups) {
  const caMap = {
    'CA1':  headers.indexOf('P1 (ATTR1)'),
    'CA2':  headers.indexOf('T1 (ATTR2)'),
    'CA3':  headers.indexOf('Material (ATTR3)'),
    'CA4':  headers.indexOf('Wall Thk (ATTR4)'),
    'CA5':  headers.indexOf('Ins Thk (ATTR5)'),
    'CA6':  headers.indexOf('Ins Den (ATTR6)'),
    'CA7':  headers.indexOf('Corr (ATTR7)'),
    'CA8':  headers.indexOf('Weight (ATTR8)'),
    'CA9':  headers.indexOf('Density (ATTR9)'),
    'CA10': headers.indexOf('HP (ATTR10)'),
    'pc':     headers.indexOf('Piping Class'),
    'rating': headers.indexOf('Rating'),
  };

  const typeIdx = headers.indexOf('Component');

  for (const [key, caValues] of Object.entries(matrixValues)) {
    const group = lineGroups.get(key);
    if (!group) continue;

    group.rows.forEach(rIdx => {
      const row = tableData[rIdx];
      if (!row) return;
      const compType = typeIdx !== -1 ? String(row[typeIdx]).toUpperCase() : '';

      Object.entries(caValues).forEach(([ca, val]) => {
        const colIdx = caMap[ca];
        if (colIdx === undefined || colIdx === -1) return;
        // Weight (CA8): for FLANGE only — others get 0 explicitly
        if (ca === 'CA8') {
          if (compType.includes('FLANGE')) {
            // apply normally below
          } else {
            row[colIdx] = '0'; // non-flange components get 0
            return;
          }
        }
        if (val && val !== '') row[colIdx] = val;
      });
    });
  }

  return tableData;
}
