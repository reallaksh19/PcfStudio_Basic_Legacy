/**
 * js/smart_fixer/core/mock-data.js
 * Converts the user's tabular data into raw PCF text format for the text box.
 *
 * Mock data:
 * E	N	UP	Bore	len1	axis1	len3	axis3
 * Pipe	0	0	0	100
 * Pipe	100	0	0	100	100	East
 * Flange	233	0	0	100	50	East
 * pipe	335	0	0	100	500	East
 * Flange	841	0	0	100	50	East
 * Flange	891	0	0	100	50	East
 * bend	941		0	100	200	East
 * pipe	1161		0	100			500	up
 * Flange	1161		535	100			100	up
 * Flange	1161		635	100			100	up
 */

const mockTable = [
    { type: 'PIPE', e: 0, n: 0, u: 0, bore: 100, l1: 100, a1: 'E', l3: 0, a3: '' },
    { type: 'PIPE', e: 100, n: 0, u: 0, bore: 100, l1: 133, a1: 'E', l3: 0, a3: '' },
    { type: 'FLANGE', e: 233, n: 0, u: 0, bore: 100, l1: 50, a1: 'E', l3: 0, a3: '' },
    { type: 'PIPE', e: 335, n: 0, u: 0, bore: 100, l1: 500, a1: 'E', l3: 0, a3: '' },
    { type: 'FLANGE', e: 841, n: 0, u: 0, bore: 100, l1: 50, a1: 'E', l3: 0, a3: '' },
    { type: 'FLANGE', e: 891, n: 0, u: 0, bore: 100, l1: 50, a1: 'E', l3: 0, a3: '' },
    { type: 'BEND', e: 941, n: 0, u: 0, bore: 100, l1: 200, a1: 'E', l3: 0, a3: '' },
    { type: 'PIPE', e: 1161, n: 0, u: 0, bore: 100, l1: 0, a1: '', l3: 500, a3: 'U' },
    { type: 'FLANGE', e: 1161, n: 0, u: 535, bore: 100, l1: 0, a1: '', l3: 100, a3: 'U' },
    { type: 'FLANGE', e: 1161, n: 0, u: 635, bore: 100, l1: 0, a1: '', l3: 100, a3: 'U' }
];

export function getMockPCFText() {
    let pcf = [];

    mockTable.forEach((row, i) => {
        pcf.push(row.type);

        let e2 = row.e;
        let n2 = row.n;
        let u2 = row.u;

        // Calculate EP2 based on length and axis
        if (row.l1 > 0 && row.a1 === 'E') e2 += row.l1;
        if (row.l1 > 0 && row.a1 === 'N') n2 += row.l1;
        if (row.l1 > 0 && row.a1 === 'U') u2 += row.l1;

        if (row.l3 > 0 && row.a3 === 'E') e2 += row.l3;
        if (row.l3 > 0 && row.a3 === 'N') n2 += row.l3;
        if (row.l3 > 0 && row.a3 === 'U') u2 += row.l3;

        // Special handling for BEND/ELBOW which needs a CENTRE-POINT and changing axes
        if (row.type === 'BEND') {
            const e1 = row.e;
            const n1 = row.n;
            const u1 = row.u;
            const e_cen = row.e + row.l1; // Moving east
            const n_cen = row.n;
            const u_cen = row.u;
            // Endpoint 2 starts moving UP
            const ep2_e = e_cen;
            const ep2_n = n_cen;
            const ep2_u = u_cen + 20; // some bend radius

            pcf.push(`    END-POINT ${e1.toFixed(4)} ${n1.toFixed(4)} ${u1.toFixed(4)} ${row.bore.toFixed(4)}`);
            pcf.push(`    END-POINT ${ep2_e.toFixed(4)} ${ep2_n.toFixed(4)} ${ep2_u.toFixed(4)} ${row.bore.toFixed(4)}`);
            pcf.push(`    CENTRE-POINT ${e_cen.toFixed(4)} ${n_cen.toFixed(4)} ${u_cen.toFixed(4)}`);
        } else {
            pcf.push(`    END-POINT ${row.e.toFixed(4)} ${row.n.toFixed(4)} ${row.u.toFixed(4)} ${row.bore.toFixed(4)}`);
            if (row.type !== 'SUPPORT' && (e2 !== row.e || n2 !== row.n || u2 !== row.u)) {
                pcf.push(`    END-POINT ${e2.toFixed(4)} ${n2.toFixed(4)} ${u2.toFixed(4)} ${row.bore.toFixed(4)}`);
            } else if (row.type === 'FLANGE') {
                 // For flanges, just add a small thickness if no l1/l3 provided
                 if(row.a3==='U') {
                    pcf.push(`    END-POINT ${row.e.toFixed(4)} ${row.n.toFixed(4)} ${(row.u + row.l3 || 50).toFixed(4)} ${row.bore.toFixed(4)}`);
                 } else {
                    pcf.push(`    END-POINT ${(row.e + row.l1 || 50).toFixed(4)} ${row.n.toFixed(4)} ${row.u.toFixed(4)} ${row.bore.toFixed(4)}`);
                 }
            }
        }

        pcf.push(`    COMPONENT-ATTRIBUTE1 MOCK-DATA-ROW-${i+1}`);
        pcf.push(""); // newline between components
    });

    return pcf.join('\n');
}