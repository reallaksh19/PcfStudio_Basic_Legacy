import re

file_path = 'js/ui/pcf-table-controller.js'

with open(file_path, 'r') as f:
    content = f.read()

# Add wLengthKey
content = re.sub(
    r'(const wRatingKey = dm\.headerMap\?\.weights\?\.rating\s*\|\| \'Rating\';)',
    r"\1\n            const wLengthKey = dm.headerMap?.weights?.length       || 'Length (RF-F/F)';",
    content
)

# Find CA8 Step 5 in loadMasterForRow
step5_old = r"""// Step 5: flange weight → CA8\n\s*if \(ratingNum !== null\) \{\n\s*const boreNum = parseFloat\(bore\) \|\| 0;\n\s*const flangeRows = weightMaster\.filter\(r => \{\n\s*const desc = String\(r\[wDescKey\] \|\| ''\)\.toUpperCase\(\);\n\s*return desc\.includes\('FLANGE'\) \|\| desc\.includes\('FLG'\);\n\s*\}\);\n\s*let bestRow = null, bestDiff = Infinity;\n\s*for \(const r of flangeRows\) \{\n\s*const rRaw  = parseFloat\(String\(r\[wRatingKey\] \|\| ''\)\.replace\(/\[#LB\]/gi, ''\)\);\n\s*const rSize = parseFloat\(String\(r\[wSizeKey\]  \|\| ''\)\.replace\(/\[\^\\d\.\]/g, ''\)\);\n\s*if \(isNaN\(rRaw\)\s*\|\| isNaN\(rSize\)\) continue;\n\s*if \(Math\.abs\(rRaw - ratingNum\) > 0\.1\) continue;\n\s*const diff = Math\.abs\(rSize - boreNum\);\n\s*if \(diff < bestDiff\) \{ bestDiff = diff; bestRow = r; \}\n\s*\}\n\s*if \(bestRow\) \{\n\s*const wt = String\(bestRow\[wWeightKey\] \|\| ''\)\.trim\(\);\n\s*const ca8Inp = tr\.querySelector\('input\[data-ca="CA8"\]'\);\n\s*if \(ca8Inp && wt && \(\!ca8Inp\.value \|\| String\(ca8Inp\.value\)\.trim\(\) === ''\)\) ca8Inp\.value = wt;\n\s*\}\n\s*\}"""

step5_new = r"""// Step 5: CA8 component weight.
            // CA8 is group-level in this popup, but length is row-level.
            // Therefore fill CA8 only when all rows in this group resolve to the same strict
            // Length + Size + Rating + Component/RigidType match.
            if (ratingNum !== null) {
                const ca8Inp = tr.querySelector('input[data-ca="CA8"]');
                const rowIndices = String(tr.dataset.rowIndices || '')
                    .split(',')
                    .map(v => parseInt(v, 10))
                    .filter(Number.isFinite);

                const matchedWeights = [];

                for (const rowIdx of rowIndices) {
                    const srcRow = this.tableData[rowIdx];
                    if (!srcRow) continue;

                    const H = (name) => this.headers.indexOf(name);
                    const srcComponent = String(srcRow[H('Component')] || '').trim();
                    const srcRigidType = String(srcRow[H('Rigid Type')] || '').trim();
                    const srcBore = srcRow[H('DN (Bore)')];
                    const srcLength = srcRow[H('Len_Calc')];

                    const smartWeight = this._findSmartWeightMatch({
                        weightMaster,
                        component: srcComponent,
                        rigidType: srcRigidType,
                        bore: srcBore,
                        rating: ratingNum,
                        length: srcLength,
                        sizeKey: wSizeKey,
                        ratingKey: wRatingKey,
                        lengthKey: wLengthKey,
                        weightKey: wWeightKey,
                        descKey: wDescKey
                    });

                    if (smartWeight?.weight) matchedWeights.push(smartWeight.weight);
                }

                const uniqueWeights = [...new Set(matchedWeights.map(v => String(v).trim()).filter(Boolean))];

                if (
                    ca8Inp &&
                    uniqueWeights.length === 1 &&
                    (!ca8Inp.value || String(ca8Inp.value).trim() === '')
                ) {
                    ca8Inp.value = uniqueWeights[0];
                } else if (ca8Inp && uniqueWeights.length > 1) {
                    ca8Inp.placeholder = 'Mixed length matches — row fill only';
                    ca8Inp.title = 'CA8 not filled because this Line/Bore group has multiple Length + Size + Rating weight matches.';
                }
            }"""

content = re.sub(step5_old, step5_new, content)

with open(file_path, 'w') as f:
    f.write(content)
