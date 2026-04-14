/**
 * excel-parser.js
 * Convert .xlsx/.xls to CSV text using SheetJS, then hand off to csv-parser.
 * Input: File object  Output: string (CSV text)
 */

import * as XLSX from "xlsx";

const LOG_PREFIX = "[ExcelParser]";

/**
 * readExcelAsCSV — reads .xlsx or .xls File, returns CSV text string.
 * @param {File} file
 * @param {number} sheetIndex  0-based sheet index (default 0)
 * @returns {Promise<string>}
 */
export async function readExcelAsCSV(file, sheetIndex = 0) {
  if (!(file instanceof File)) {
    throw new Error(`${LOG_PREFIX} readExcelAsCSV: expected File, got ${typeof file}`);
  }

  console.info(`${LOG_PREFIX} Reading Excel file: "${file.name}" (${(file.size / 1024).toFixed(1)} KB)`);

  const buffer  = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: "array", cellDates: false });

  const sheetNames = workbook.SheetNames;
  if (!sheetNames.length) {
    throw new Error(`${LOG_PREFIX} Excel file "${file.name}" has no sheets.`);
  }

  if (sheetIndex >= sheetNames.length) {
    console.warn(`${LOG_PREFIX} sheetIndex ${sheetIndex} out of range. Using sheet 0 ("${sheetNames[0]}").`);
    sheetIndex = 0;
  }

  const sheetName = sheetNames[sheetIndex];
  const sheet     = workbook.Sheets[sheetName];

  // sheet_to_csv: output canonical CSV so Stage-1 parser reads it like normal CSV uploads
  const csv = XLSX.utils.sheet_to_csv(sheet, { FS: ",", RS: "\n", blankrows: false });

  console.info(`${LOG_PREFIX} Converted sheet "${sheetName}" to CSV.`, {
    sheets:    sheetNames,
    activeSheet: sheetName,
    csvLength: csv.length,
  });

  return { csv, sheetName };
}

/** Detect if file is Excel by extension. */
export function isExcelFile(file) {
  const ext = (file?.name || "").split(".").pop().toLowerCase();
  return ["xlsx", "xls", "xlsm"].includes(ext);
}
