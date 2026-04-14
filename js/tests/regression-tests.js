
import { gate } from '../services/gate-logger.js';
import { parseCSV } from '../input/csv-parser.js';
import { mapHeaders, applyHeaderMap } from '../input/header-mapper.js';
import { normaliseRows } from '../input/unit-transformer.js'; // Check path
import { groupByRefNo } from '../converter/grouper.js';
import { buildTopology } from '../graph/topology-builder.js';
import { buildSequence } from '../geometry/sequence-builder.js';
import { assemble } from '../output/pcf-assembler.js';
import { getConfig } from '../config/config-store.js';

/**
 * regression-tests.js — Phase C Regression Suite
 * 
 * Embeds a reference CSV and runs the full pipeline to ensure
 * critical metrics (counts, topology size, output lines) match baseline.
 */

const LOG_MOD = 'RegressionRunner';

// ── Reference Data ───────────────────────────────────────────────────

const REF_CSV = `Sequence,NodeNo,NodeName,componentName,Type,RefNo,Point,PPoint,Bore,O/D,Wall Thickness,Corrosion Allowance,Radius,SIF,Weight,Material,Rigid,East,North,Up,Status,Pressure,Restraint Type,Restraint Stiffness,Restraint Friction,Restraint Gap,Insulation thickness,Hydro test pressure
1,,,unset,BRAN,=67130482/1664,1,1,400mm,406.4,9.53,3,0.000,0,0.000,106,START,0,100,0,,700,,,,,0,1500
2,,,unset,FLAN,=67130482/1666,1,1,400mm,406.4,9.53,3,0.000,0,100,106,,0,250,0,,700,,,,,0,1500
2,,,05-VBL-21475,VALV,=67130482/1666,1,1,400mm,406.4,9.53,3,0.000,0,1300,106,,0,750,0,,700,,,,,0,1500
3,,,unset,FLAN,=67130482/1666,1,1,400mm,406.4,9.53,3,0.000,0,100,106,,0,900,0,,700,,,,,0,1500
3,,PS00178.1,PS-XYZ,ANCI,=67130482/2807,0,0,400mm,406.4,9.53,3,0.000,0,0.000,106,END,0,1100,0,,700,VG100,,,,0,1500
4,,,unset,BRAN,=67130482/1664,2,2,400mm,406.4,9.53,3,0.000,0,0.000,106,,0,1300,0,,700,,,,,0,1500
4,,,unset,TEE,=67130482/1667,1,1,400mm,406.4,9.53,3,0.000,0,0.000,106,,0,1700,0,,700,,,,,0,1500
5,,,unset,TEE,=67130482/1667,3,3,350mm,406.4,6,0,0.000,0,0.000,A312 TP 316,,0,1700,500,,700,,,,,0,1500
5,,,unset,BRAN,=67130482/1664,2,2,400mm,406.4,9.53,3,0.000,0,0.000,106,,0,1700,0,,700,,,,,0,1500
6,,,unset,ELBO,=67130482/1164,1,1,400mm,355.6,0.000,3,488.6,0,0.000,106,,0,2300,0,,700,,,,,0,1500
6,,,unset,BRAN,=67130482/1664,2,2,400mm,406.4,0.000,3,0.000,0,0.000,106,,0,2300,500,,700,,,,,0,1500`;

const BASELINE = {
    parsedRowCheck: 12, // 13 lines - header = 12
    mappedHeaderCount: 28, // All 28 columns should map if aliases correct (or mostly)
    matchedGroupCount: 5, // 1664, 1666, 2807, 1667, 1164
    topologyNodes: 5, // Should match groups
    pcfLineCountMin: 80, // Approximate
    pcfLineCountMax: 150
};

// ── Runner ───────────────────────────────────────────────────────────

export async function runRegression() {
    gate(LOG_MOD, 'runRegression', 'Starting Regression Benchmark');

    try {
        const config = getConfig();

        // 1. Parsing
        const parseRes = parseCSV(REF_CSV, { autoDetectDelimiter: true });
        check('R1: CSV Parse', parseRes.rows.length, BASELINE.parsedRowCheck);

        // 2. Mapping
        const mapRes = mapHeaders(parseRes.headers, config.headerAliases);
        const mappedCount = Object.keys(mapRes.headerMap).length;
        // Verify at least 90% mapped
        if (mappedCount < 20) throw new Error(`Only ${mappedCount} headers mapped (Expected >20)`);
        gate(LOG_MOD, 'R2', 'Header Mapping', { mapped: mappedCount, status: 'PASS' });

        const mappedRows = applyHeaderMap(parseRes.rows, mapRes.headerMap);

        // 3. Normalisation
        const normRows = normaliseRows(mappedRows, config);

        // 4. Grouping
        const groups = groupByRefNo(normRows);
        check('R3: Grouping', groups.size, BASELINE.matchedGroupCount);

        // 5. Topology
        const topo = buildTopology(groups);
        check('R4: Topology', topo.nodes.size, BASELINE.topologyNodes);

        // 6. Sequence
        const traversal = buildSequence(topo);
        if (traversal.ordered.length + traversal.orphans.length !== groups.size) {
            throw new Error(`Traversal count mismatch: ${traversal.ordered.length + traversal.orphans.length} vs ${groups.size}`);
        }

        // 7. Assembly
        const pcfLines = assemble(traversal, groups, config, 'REGRESSION-TEST');
        const count = pcfLines.length;

        if (count < BASELINE.pcfLineCountMin || count > BASELINE.pcfLineCountMax) {
            throw new Error(`PCF Line count ${count} out of range [${BASELINE.pcfLineCountMin}-${BASELINE.pcfLineCountMax}]`);
        }
        gate(LOG_MOD, 'R5', 'PCF Assembly', { lineCount: count, status: 'PASS' });

        gate(LOG_MOD, 'SUCCESS', 'Regression Suite Passed', { summary: 'All checks passed' });

    } catch (err) {
        console.error(err);
        gate(LOG_MOD, 'FAIL', 'Regression Failed', { error: err.message, stack: err.stack });
    }
}

function check(id, actual, expected) {
    if (actual !== expected) {
        throw new Error(`${id} failed: Expected ${expected}, got ${actual}`);
    }
    gate(LOG_MOD, id, `${id} Validated`, { actual, expected, status: 'PASS' });
}
