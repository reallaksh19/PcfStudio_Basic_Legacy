import * as XLSX from 'xlsx';
import { gate } from "./gate-logger.js";

/**
 * Robust Excel Parser for Linelist, Weights, and LineDump.
 * Enhanced with smart header detection (Weighted Scoring + Longest Match).
 */
export class ExcelParser {

  /**
   * Reads an Excel file and returns JSON data with smart header detection.
   * @param {File} file - The uploaded file.
   * @param {Array} expectedKeywords - Keywords to score rows for header detection (e.g. ['Line', 'Service']).
   * @returns {Promise<{headers: string[], data: any[], detectedRow: number}>}
   */
  static async parse(file, expectedKeywords = []) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const data = new Uint8Array(e.target.result);
          const workbook = XLSX.read(data, { type: 'array' });
          const sheetNames = workbook.SheetNames;

          // Try each sheet until one yields data rows
          let bestResult = null;
          for (const sheetName of sheetNames) {
            const worksheet = workbook.Sheets[sheetName];
            // Strip completely-empty rows so detectHeaderRow always sees real content at index 0
            const rawData = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: null })
              .filter(row => Array.isArray(row) && row.some(cell => cell != null));

            if (rawData.length === 0) continue; // skip empty sheets

            // Smart Header Detection
            let headerRowIndex = this.detectHeaderRow(rawData, expectedKeywords);

            // Safety: if detected row is empty scan for first row with cells
            if (!rawData[headerRowIndex] || rawData[headerRowIndex].length === 0) {
              for (let i = 0; i < rawData.length; i++) {
                if (rawData[i] && rawData[i].length > 0) { headerRowIndex = i; break; }
              }
            }
            if (!rawData[headerRowIndex] || rawData[headerRowIndex].length === 0) continue;

            // Ensure headers array length matches the maximum row length
            let maxLen = rawData[headerRowIndex].length;
            for (let i = headerRowIndex + 1; i < Math.min(rawData.length, headerRowIndex + 100); i++) {
              if (rawData[i] && rawData[i].length > maxLen) maxLen = rawData[i].length;
            }
            maxLen = Math.min(maxLen, 200);

            const rawHeaders = rawData[headerRowIndex];
            const headers = [];
            for (let i = 0; i < maxLen; i++) {
              const h = rawHeaders[i];
              headers.push(h ? h.toString().trim() : `ColumnX${i + 1}`);
            }

            // Slice data rows
            const dataRows = rawData.slice(headerRowIndex + 1);
            const jsonData = dataRows.map(row => {
              const obj = {};
              headers.forEach((h, i) => { obj[h] = row[i] ?? null; });
              return obj;
            });

            // Raw sample for diagnostic logging (first 3 rows before header)
            const rawSample = rawData.slice(0, Math.min(headerRowIndex + 1, 5))
              .map(r => r.filter(c => c != null).slice(0, 8));

            const result = {
              headers,
              data: jsonData,
              detectedRow: headerRowIndex,
              sheetName,
              sheetNames,
              rawSample,
              rawRows: rawData
            };

            gate('ExcelParser', 'parse', 'Header Row Detected', {
              filename: file.name,
              sheet: sheetName,
              detectedRow: headerRowIndex,
              headerCount: headers.length,
              keywords: expectedKeywords.slice(0, 5),
              sampleHeaders: headers.slice(0, 5)
            });

            // Score sheet name — prefer sheets whose name contains "Line" or "List"
            const snLower = sheetName.toLowerCase();
            let sheetScore = 0;
            if (snLower.includes('line')) sheetScore++;
            if (snLower.includes('list')) sheetScore++;

            if (jsonData.length > 0) {
              if (!bestResult || sheetScore > (bestResult._sheetScore || 0)) {
                bestResult = { ...result, _sheetScore: sheetScore };
              }
              if (sheetScore >= 2) break; // Both "line" and "list" — perfect match, stop searching
            }
            if (!bestResult) bestResult = { ...result, _sheetScore: 0 }; // store fallback even if 0 rows
          }

          if (!bestResult) {
            return resolve({ headers: [], data: [], detectedRow: 0, sheetNames, rawSample: [], rawRows: [] });
          }
          resolve(bestResult);
        } catch (err) {
          reject(err);
        }
      };
      reader.onerror = () => reject(new Error("Failed to read file"));
      reader.readAsArrayBuffer(file);
    });
  }

  /**
   * Scans first 20 rows to find the most likely header row.
   * Uses weighted scoring: Exact Match (+10) > Partial Match (+1).
   * Prioritizes longest keyword matches to avoid false positives (e.g. "Pressure" in "Design Pressure").
   */
  static detectHeaderRow(rows, keywords) {
    // Find first non-empty row as the default fallback (never return an empty row)
    let firstNonEmpty = 0;
    for (let i = 0; i < rows.length; i++) {
      if (rows[i] && Array.isArray(rows[i]) && rows[i].length > 0) { firstNonEmpty = i; break; }
    }

    if (!keywords || keywords.length === 0) return firstNonEmpty;

    let bestScore = -1;
    let bestRow = firstNonEmpty; // seed with first non-empty row, not always 0

    // Sort keywords by length descending to prioritize specific matches
    // e.g. "Design Pressure" before "Pressure"
    const sortedKeywords = [...keywords].sort((a, b) => b.length - a.length);

    // Scan first 20 rows
    const limit = Math.min(rows.length, 20);

    for (let i = 0; i < limit; i++) {
      const row = rows[i];
      if (!row || !Array.isArray(row) || row.length === 0) continue;

      let score = 0;

      // Track unique matches to avoid over-scoring data rows with repeated values (e.g. "Gas", "Gas")
      const matchedKeywords = new Set();

      // Check each cell in the row
      // Strict Match First Logic: If an exact match for a highly specific keyword like "Piping Class" exists,
      // we heavily weight it and avoid fuzzy matching it later.
      const hasExactPipingClass = row.some(cell => String(cell).trim().toLowerCase() === "piping class");
      
      row.forEach(cell => {
        if (!cell) return;
        const cellStr = String(cell).trim();
        const cellLower = cellStr.toLowerCase();

        // Check against keywords
        for (const kw of sortedKeywords) {
            const kwLower = kw.toLowerCase();

            if (cellLower === kwLower) {
                // Exact match: +10 if unique, +2 if duplicate
                if (!matchedKeywords.has(kwLower)) {
                    score += 10;
                    matchedKeywords.add(kwLower);
                } else {
                    score += 2;
                }
                break;
            } else if (!hasExactPipingClass && cellLower.includes(kwLower)) {
                // Partial match: +1 (Only if we aren't enforcing strict match for a known key like Piping Class)
                // We avoid partial match if exact Piping Class is in the row, to avoid mapping 'construction class' to 'Piping Class'
                score += 1;
                break;
            } else if (hasExactPipingClass && cellLower.includes(kwLower) && kwLower !== "piping class") {
                // If it's another keyword, partial match is fine
                score += 1;
                break;
            }
        }
      });

      // Density check: Ratio of non-empty cells
      const nonEmptyCount = row.filter(c => c !== null && c !== undefined && c !== '').length;
      const density = nonEmptyCount / row.length;
      const finalScore = score + (density * 0.5); // Density is tie-breaker

      if (finalScore > bestScore) {
        bestScore = finalScore;
        bestRow = i;
      }
    }
    return bestRow;
  }

  /**
   * Select the best sheet from a workbook for Linelist import (Phase 1A).
   * Scores sheet names: contains both 'line' AND 'list' = 2, either one = 1, no match = 0.
   * Returns null sheet when no keyword match — caller handles user prompt.
   * @param {string[]} sheetNames
   * @returns {{ sheet: string|null, prompted: boolean, promptMessage: string }}
   */
  static _selectSheet(sheetNames) {
    if (!sheetNames || sheetNames.length === 0) return { sheet: null, prompted: false, promptMessage: '' };
    if (sheetNames.length === 1)               return { sheet: sheetNames[0], prompted: false, promptMessage: '' };

    let bestSheet = null;
    let bestScore = 0;

    for (const name of sheetNames) {
      const n = name.toLowerCase();
      let score = 0;
      if (n.includes('line') && n.includes('list')) score = 2;
      else if (n.includes('line') || n.includes('list')) score = 1;
      if (score > bestScore) { bestScore = score; bestSheet = name; }
    }

    if (bestSheet) return { sheet: bestSheet, prompted: false, promptMessage: '' };

    // No keyword match — build a numbered list for the user prompt
    const listStr = sheetNames.map((s, i) => `${i + 1}: ${s}`).join('\n');
    return {
      sheet: null,
      prompted: true,
      promptMessage: `No sheet matching "Line" or "List" was found.\n\nAvailable tabs:\n${listStr}\n\nEnter tab number or exact tab name:`,
    };
  }
}

/**
 * Legacy-compatible wrapper — keeps the same API for any code
 * that still uses `excelParser.parseExcelFile(file)`.
 */
export class ExcelParserService {
  async parseExcelFile(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const data = new Uint8Array(e.target.result);
          const workbook = XLSX.read(data, { type: 'array' });
          if (workbook.SheetNames.length === 0) {
            reject(new Error('Excel file contains no sheets.'));
            return;
          }

          // ── Tab keyword matching (Phase 1A) ─────────────────────────────
          const { sheet, prompted, promptMessage } = ExcelParser._selectSheet(workbook.SheetNames);
          let selectedSheet = sheet;

          if (!selectedSheet) {
            // Prompt user for tab selection
            const answer = window.prompt(promptMessage);
            if (answer === null) { reject(new Error('Tab selection cancelled by user.')); return; }
            const trimmed = answer.trim();
            const byIndex = parseInt(trimmed, 10);
            if (!isNaN(byIndex) && byIndex >= 1 && byIndex <= workbook.SheetNames.length) {
              selectedSheet = workbook.SheetNames[byIndex - 1];
            } else if (workbook.SheetNames.includes(trimmed)) {
              selectedSheet = trimmed;
            } else {
              reject(new Error(`Tab "${trimmed}" not found. Please reload and try again.`)); return;
            }
          }

          // ── Parse selected sheet ─────────────────────────────────────────
          const sheetObj = workbook.Sheets[selectedSheet];
          const jsonData = XLSX.utils.sheet_to_json(sheetObj, { header: 1, defval: '' });
          resolve(jsonData);
        } catch (err) {
          reject(new Error('Failed to parse Excel file: ' + err.message));
        }
      };
      reader.onerror = () => reject(new Error('Failed to read file.'));
      reader.readAsArrayBuffer(file);
    });
  }

}

export const excelParser = new ExcelParserService();
