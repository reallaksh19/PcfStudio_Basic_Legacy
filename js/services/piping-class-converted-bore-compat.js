import { dataManager } from './data-manager.js';
import { CONVERTED_BORE_COL } from './bore-converter.js';

const ORIGINAL_SIZE_COL = '_Original Size';
let installed = false;

export function normalizePipingClassRowsForLegacyMatcher(rows = []) {
  const safeRows = Array.isArray(rows) ? rows : [];
  return safeRows.map((row) => {
    const converted = String(row?.[CONVERTED_BORE_COL] ?? row?.ConvertedBore ?? '').trim();
    if (!converted) return row;

    const out = { ...row };
    if (out[ORIGINAL_SIZE_COL] == null && out.Size != null && String(out.Size).trim() !== converted) {
      out[ORIGINAL_SIZE_COL] = out.Size;
    }

    // rc-master-loader.js still reads Size, DN, NPS in that order.
    // Shadow those getter-returned fields from Converted Bore so the old matcher receives canonical DN/NB mm.
    out.Size = converted;
    out.DN = converted;
    out.NB = converted;
    out.NPS = converted;
    out.ConvertedBore = converted;
    return out;
  });
}

export function installPipingClassConvertedBoreCompat() {
  if (installed || !dataManager) return;
  installed = true;

  const originalGetLive = dataManager.getPipingClassMaster?.bind(dataManager);
  const originalGetStorage = dataManager.getPipingClassMasterFromStorage?.bind(dataManager);

  if (originalGetLive) {
    dataManager.getPipingClassMaster = function getPipingClassMasterConvertedBoreCompat() {
      return normalizePipingClassRowsForLegacyMatcher(originalGetLive());
    };
  }

  if (originalGetStorage) {
    dataManager.getPipingClassMasterFromStorage = function getPipingClassMasterFromStorageConvertedBoreCompat() {
      return normalizePipingClassRowsForLegacyMatcher(originalGetStorage());
    };
  }

  try {
    window.__PCF_CONVERTED_BORE_COMPAT__ = {
      installed: true,
      mode: 'legacy-piping-class-getter-shadow',
      shadowFields: ['Size', 'DN', 'NB', 'NPS', 'ConvertedBore'],
      sourceField: CONVERTED_BORE_COL,
    };
  } catch (_) {}
}

try {
  if (typeof window !== 'undefined') {
    window.installPipingClassConvertedBoreCompat = installPipingClassConvertedBoreCompat;
    window.normalizePipingClassRowsForLegacyMatcher = normalizePipingClassRowsForLegacyMatcher;
  }
} catch (_) {}
