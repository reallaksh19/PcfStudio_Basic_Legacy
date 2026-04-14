import { vec } from '/js/pcf-fixer-runtime/math/VectorMath.js';
import { runPTEEngine } from '/js/pcf-fixer-runtime/engine/pte-engine.js';
import { validatePcfData } from '/js/pcf-fixer-runtime/engine/SchemaValidator.js';
import { convertInchToMmIfEnabled, toStrictNumber } from '/js/pcf-fixer-runtime/../services/bore-utils.js';
import { getOletBrlen, getTeeBrlen, resolveWeightForCa8 } from '/js/pcf-fixer-runtime/../services/fallbackcontract.js';
import { detectRating } from '/js/pcf-fixer-runtime/../services/rating-detector.js';

export function runDataProcessor(dataTable, config, logger) {
  logger.push({ stage: "TRANSLATION", type: "Info", message: "═══ RUNNING PRE-VALIDATION DATA PROCESSING (STEPS 1-11) ═══" });

  // 1. Validation Barrier (Zod Archetypal Casting)
  const zodedTable = validatePcfData(dataTable, logger);

  // Run PTE Engine Pre-Flight
  const pteEnrichedTable = runPTEEngine(zodedTable, config, logger);
  const updatedTable = [...pteEnrichedTable];
  let seq = 1;
  let bendPtr = 0, rigidPtr = 0, intPtr = 0;
  const stdMm = new Set(config.standardMmBores || [15,20,25,32,40,50,65,80,90,100,125,150,200,250,300,350,400,450,500,600,750,900,1050,1200]);

  let prevEp2 = null;

  for (let i = 0; i < updatedTable.length; i++) {
    const row = { ...updatedTable[i] };
    const t = row.type || "";

    // Step 3: Fill Identifiers
    // Try to extract RefNo and SeqNo from text field if available
    let extractedRefNo = null;
    let extractedSeqNo = null;
    if (row.text && typeof row.text === 'string') {
         // Handle cases like RefNo:=67130482/1666_pipe
         // Or RefNo: 67130482/1666_pipe
         const refMatch = row.text.match(/(?:RefNo|REF\s*NO\.?)\s*[:=]+\s*([^\s,]+)/i);
         if (refMatch && refMatch[1]) extractedRefNo = refMatch[1].trim();

         // Handle SeqNo:27.1, SeqNo:=5, etc.
         const seqMatch = row.text.match(/(?:SeqNo|SEQ\s*NO\.?)\s*[:=]+\s*([0-9.]+)/i);
         if (seqMatch && seqMatch[1]) extractedSeqNo = parseFloat(seqMatch[1]);
    }

    if (extractedSeqNo && !row.csvSeqNo) {
         row.csvSeqNo = extractedSeqNo;
         markModified(row, "csvSeqNo", "Extracted from TEXT");
    } else if (!row.csvSeqNo) {
         row.csvSeqNo = seq;
         markModified(row, "csvSeqNo", "Calculated");
    }

    if (extractedRefNo && !row.refNo) {
         row.refNo = extractedRefNo;
         markModified(row, "refNo", "Extracted from TEXT");
    } else if (!row.refNo) {
         // Fallback RefNo generation (BM4)
         row.refNo = `UNKNOWN-${t}-${row.csvSeqNo}`;
         markModified(row, "refNo", "Calculated Fallback");
    }

    if (!row.ca) row.ca = {};
    if (!row.ca[97]) { row.ca[97] = `=${row.refNo}`; markModified(row, "ca97", "Calculated"); }
    if (!row.ca[98]) { row.ca[98] = row.csvSeqNo; markModified(row, "ca98", "Calculated"); }
    seq++;

    // Step 4: Bore Conversion
    const convertedBore = convertInchToMmIfEnabled(row.bore, config?.enableBoreInchToMm === true, Array.from(stdMm));
    if (convertedBore != null && convertedBore !== row.bore) {
      row.bore = convertedBore;
      markModified(row, "bore", "Calculated");
      logger.push({ type: "Warning", row: row._rowIndex, message: `[Step 4] Bore converted from inches to ${row.bore}mm.` });
    }

    // Step 5: Bi-directional coords
    if (t !== "SUPPORT" && t !== "OLET") {
      if (!row.ep1 && prevEp2) { row.ep1 = { ...prevEp2 }; markModified(row, "ep1", "Calculated"); }
      if (row.ep1 && row.ep2) {
        row.deltaX = row.ep2.x - row.ep1.x;
        row.deltaY = row.ep2.y - row.ep1.y;
        row.deltaZ = row.ep2.z - row.ep1.z;
      }
    }

    // Step 6: CP/BP Calculation
    if (t === "TEE") {
      const boreNum = toStrictNumber(row.bore, 0) || 0;
      if ((!row.cp || (row.cp.x === 9999 && row.cp.y === 9999)) && row.ep1 && row.ep2) {
          row.cp = vec.mid(row.ep1, row.ep2);
          markModified(row, "cp", "Calculated Midpoint");
      }

      if (!row.branchBore) {
          row.branchBore = boreNum;
          markModified(row, "branchBore", "Calculated");
      }

      if (!row.bp && row.cp && row.ep1 && row.ep2) {
          const hVec = vec.sub(row.ep2, row.ep1);
          const mag = vec.mag(hVec) || 1;
          const n = { x: hVec.x / mag, y: hVec.y / mag, z: hVec.z / mag };
          const axes = [
            { x: 1, y: 0, z: 0, axis: 'x' },
            { x: 0, y: 1, z: 0, axis: 'y' },
            { x: 0, y: 0, z: 1, axis: 'z' }
          ];
          axes.sort((a, b) => Math.abs(a.x*n.x + a.y*n.y + a.z*n.z) - Math.abs(b.x*n.x + b.y*n.y + b.z*n.z));
          const pick = axes[0];
          const offset = toStrictNumber(row.branchBore, boreNum || 100) || 100;
          row.bp = {
            x: row.cp.x + pick.x * offset,
            y: row.cp.y + pick.y * offset,
            z: row.cp.z + pick.z * offset
          };
          markModified(row, "bp", "Calculated Orthogonal");
      }

      if (!row.brlen && row.bore && row.branchBore) {
          const brlen = getTeeBrlen(toStrictNumber(row.bore, NaN), toStrictNumber(row.branchBore, NaN));
          if (brlen != null) {
            row.brlen = brlen;
            markModified(row, "brlen", "MasterTable");
          }
      }
    }

    if (t === "BEND") {
        if (!row.cp && row.ep1 && row.ep2) {
             // Synthesize Elbow Centre Point using ray-tracing from two endpoints (BM4)
             // simplified: use midpoint plus offset or just midpoint if missing radius
             row.cp = vec.mid(row.ep1, row.ep2);
             markModified(row, "cp", "Calculated Raytrace");
        }
    }

    if (t === "OLET") {
        if (!row.branchBore) {
            row.branchBore = toStrictNumber(row.bore, 50) || 50;
            markModified(row, "branchBore", "Calculated");
        }
        if (!row.cp && row.ep1) {
            row.cp = { ...row.ep1 };
            markModified(row, "cp", "Calculated");
        } else if (!row.cp && !row.ep1 && row.bp) {
            row.cp = { x: row.bp.x, y: row.bp.y, z: row.bp.z };
            markModified(row, "cp", "Calculated Fallback");
        }

        if (!row.brlen && row.bore && row.branchBore) {
            const brlen = getOletBrlen(toStrictNumber(row.bore, NaN), toStrictNumber(row.branchBore, NaN));
            if (brlen != null) {
              row.brlen = brlen;
              markModified(row, "brlen", "MasterTable");
            }
        }
    }


    // Step 7: Unified CA8 weight fallback contract (scope guarded)
    if (!row.ca) row.ca = {};
    const directCa8 = row.ca[8] ?? row.ca8 ?? null;
    const ratingClass = toStrictNumber(row.rating ?? detectRating(row.pipingClass || row.pipelineRef || ''), null);
    const valveLengthMm = row.ep1 && row.ep2 ? Math.round(vec.mag(vec.sub(row.ep2, row.ep1))) : null;
    const weightResolution = resolveWeightForCa8({
      type: t,
      directWeight: directCa8,
      boreMm: row.bore,
      ratingClass,
      valveType: row.description || row.itemDescription || row.componentName || row.rigidType || '',
      lengthMm: valveLengthMm
    }, { includeApprovedFittings: false });
    if (weightResolution.weight != null) {
      row.ca[8] = String(weightResolution.weight);
      row.ca8 = String(weightResolution.weight);
      row.ca8Trace = weightResolution.trace.join(' > ');
      markModified(row, 'ca8', 'FallbackContract');
      logger.push({ type: 'Info', row: row._rowIndex, message: `[Step 7] CA8 resolved via ${row.ca8Trace}.` });
    }

    // Pointers
    if (t === "BEND") row.bendPtr = ++bendPtr;
    if (t === "FLANGE" || t === "VALVE") row.rigidPtr = ++rigidPtr;
    if (t === "TEE" || t === "OLET") row.intPtr = ++intPtr;

    // Track for next row
    if (row.ep2) prevEp2 = { ...row.ep2 };

    // Step 11: Msg Gen
    // Only generate new text if missing or preserve original, but let's append our calc if needed or just preserve.
    // The issue says MESSAGE-SQUARE text disappeared. We should not overwrite it entirely if it was valid,
    // or we should ensure we incorporate the original text. Let's just create a calculated text if it's completely missing,
    // otherwise preserve what was parsed/imported.
    const len = row.ep1 && row.ep2 ? Math.round(vec.mag(vec.sub(row.ep2, row.ep1))) : 0;
    if (!row.text || !row.text.includes("RefNo")) {
         row.text = `${t}, LENGTH=${len}MM, RefNo:${row.ca[97]}, SeqNo:${row.ca[98]}`;
    }

    updatedTable[i] = row;
  }

  return updatedTable;
}

function markModified(row, field, reason) {
  if (!row._modified) row._modified = {};
  if (!row._logTags) row._logTags = [];
  row._modified[field] = reason;
  if (!row._logTags.includes(reason)) row._logTags.push(reason);
}
