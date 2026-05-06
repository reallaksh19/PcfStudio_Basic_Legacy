import re

file_path = 'js/ui/pcf-table-controller.js'

with open(file_path, 'r') as f:
    content = f.read()

# Add wLengthKey
content = re.sub(
    r'(const wRatingKey = dm\.headerMap\?\.weights\?\.rating\s*\|\| \'Rating\';)',
    r"\1\n        const wLengthKey = dm.headerMap?.weights?.length       || 'Length (RF-F/F)';",
    content,
    count=1
)

# Replace Step 5 block in `_fetchRowAttrs`
step5_old = r"""        // Step 5: weight by Rigid Type \(flange, valve, elbow, etc\.\) \+ rating \+ bore.*?if \(best\) result\.weight = String\(best\[wWeightKey\] \|\| ''\)\.trim\(\);\n\s*\}\n\s*\}"""

step5_new = r"""        // Step 5: CA8 component weight.
        // Strict smart fill: Component/Rigid Type + Length + Size + Rating.
        const rowLength = row[H('Len_Calc')];

        const smartWeight = this._findSmartWeightMatch({
            weightMaster,
            component: compType,
            rigidType,
            bore,
            rating: ratingNum,
            length: rowLength,
            sizeKey: wSizeKey,
            ratingKey: wRatingKey,
            lengthKey: wLengthKey,
            weightKey: wWeightKey,
            descKey: wDescKey
        });

        if (smartWeight) {
            result.weight = smartWeight.weight;
        }"""

content = re.sub(step5_old, step5_new, content, flags=re.DOTALL)

with open(file_path, 'w') as f:
    f.write(content)
