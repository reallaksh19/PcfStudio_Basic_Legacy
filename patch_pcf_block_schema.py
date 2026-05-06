import re

file_path = 'js/pcf-engine/pcf-block-schema.js'

with open(file_path, 'r') as f:
    content = f.read()

# Add shouldEmitCANumericValue helper
helpers = r"""function enforceNumeric(val) {
  const n = parseFloat(String(val));
  return isNaN(n) ? String(val) : String(n);
}

function shouldEmitCANumericValue(val) {
  if (val === null || val === undefined) return false;

  const text = String(val).trim();
  if (!text) return false;

  const normalized = text.toUpperCase();
  if (
    normalized === 'NULL' ||
    normalized === 'N/A' ||
    normalized === 'NA' ||
    normalized === 'UNDEFINED' ||
    normalized === 'UNDEFINED MM'
  ) {
    return false;
  }

  const numeric = Number(text.replace(/,/g, ''));
  if (Number.isFinite(numeric) && Math.abs(numeric) === 0) {
    return false;
  }

  return true;
}
"""

content = re.sub(
    r'(function enforceNumeric\(val\) \{\n\s*const n = parseFloat\(String\(val\)\);\n\s*return isNaN\(n\) \? String\(val\) : String\(n\);\n\})',
    helpers,
    content
)

# Replace emitCABlock logic
content = re.sub(
    r'(for \(const slot of allowed\) \{\n\s*const val = ca\?\.\[slot\];\n\s*if \(val == null \|\| val === \'\'\) continue;)',
    r'for (const slot of allowed) {\n    const val = ca?.[slot];\n    if (!shouldEmitCANumericValue(val)) continue;',
    content
)


with open(file_path, 'w') as f:
    f.write(content)
