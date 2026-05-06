import re

file_path = 'js/ray-concept/rc-tab.js'

with open(file_path, 'r') as f:
    content = f.read()

# 1A: Add button near Reset CA
content = re.sub(
    r'(<button id="rc-btn-reset-ca" style="\$\{actionPill\}" disabled title="Clear all CA-related properties for all components">Reset CA</button>)',
    r'\1\n      <button id="rc-btn-reset-line-pc-rating" style="${actionPill}" disabled title="Clear LineNoKey, Piping Class and Rating from all current 2D rows">Reset LineNoKey/PC/Rating</button>',
    content
)

# 1B: Wire the button
content = re.sub(
    r'(root\.querySelector\(\'#rc-btn-reset-ca\'\)\?\.addEventListener\(\'click\', \(\) => \{\n\s*if \(\!confirm\(\'Reset all CA attributes\? This cannot be undone\.\'\)\) return;\n\s*resetCaAttributes\(root\);\n\s*\}\);)',
    r'\1\n\n  root.querySelector(\'#rc-btn-reset-line-pc-rating\')?.addEventListener(\'click\', () => {\n    resetLineNoKeyPcRating(root);\n  });',
    content
)

# 1C: Enable/disable with Reset CA
# Find disabled = false
content = re.sub(
    r'(root\.querySelector\(\'#rc-btn-reset-ca\'\)\.disabled = false;)',
    r'\1\n    const btnResetLine = root.querySelector(\'#rc-btn-reset-line-pc-rating\');\n    if (btnResetLine) btnResetLine.disabled = false;',
    content
)
# Find disabled = true
content = re.sub(
    r'(root\.querySelector\(\'#rc-btn-reset-ca\'\)\.disabled = true;)',
    r'\1\n    const btnResetLine = root.querySelector(\'#rc-btn-reset-line-pc-rating\');\n    if (btnResetLine) btnResetLine.disabled = true;',
    content
)

# 1D: Add reset function
reset_code = """
function clearLineNoKeyPcRatingFields(row) {
  if (!row) return row;

  const next = { ...row };

  // Canonical fields used by Ray / PCF Fixer / common PCF builder.
  next.lineNoKey = '';
  next.LINENO_KEY = '';
  next.pipelineRef = '';
  next.PIPELINE_REFERENCE = '';
  next.pipingClass = '';
  next.PIPING_CLASS = '';
  next.rating = '';
  next.RATING = '';

  // CSV/header-style aliases.
  next['Line No. (Derived)'] = '';
  next['PIPELINE-REFERENCE'] = '';
  next['Piping Class'] = '';
  next['Rating'] = '';

  // Attribute dictionaries.
  if (next.attributes && typeof next.attributes === 'object') {
    next.attributes = { ...next.attributes };
    next.attributes['Line No. (Derived)'] = '';
    next.attributes['PIPELINE-REFERENCE'] = '';
    next.attributes['PIPING_CLASS'] = '';
    next.attributes['RATING'] = '';
  }

  if (next.componentAttrs && typeof next.componentAttrs === 'object') {
    next.componentAttrs = { ...next.componentAttrs };
    next.componentAttrs.LINENO_KEY = '';
    next.componentAttrs.PIPING_CLASS = '';
    next.componentAttrs.RATING = '';
  }

  return next;
}

function resetLineNoKeyPcRating(root) {
  const sourceRows =
    rcState.finalComponents && rcState.finalComponents.length
      ? rcState.finalComponents
      : rcState.components;

  if (!sourceRows || !sourceRows.length) {
    passLog(root, '⚠ No 2D rows available to reset LineNoKey/PC/Rating.', 'warn');
    return;
  }

  const resetRows = sourceRows.map(clearLineNoKeyPcRatingFields);

  if (rcState.finalComponents && rcState.finalComponents.length) {
    rcState.finalComponents = resetRows;
    rcState.finalCsv2DText = emit2DCSV(rcState.finalComponents, getRayConfig());

    // Any downstream generated output is now stale.
    rcState.isoPcfComponents = [];
    rcState.isoPcfCsvText = '';
    rcState.isoMetricPcfText = '';

    render2DTable(root, rcState.finalCsv2DText, rcState.finalComponents);
  } else {
    rcState.components = resetRows;
    rcState.csv2DText = emit2DCSV(rcState.components, getRayConfig());

    rcState.finalComponents = [];
    rcState.finalCsv2DText = '';
    rcState.isoPcfComponents = [];
    rcState.isoPcfCsvText = '';
    rcState.isoMetricPcfText = '';

    render2DTable(root, rcState.csv2DText, rcState.components);
  }

  passLog(root, `🧹 Reset LineNoKey / Piping Class / Rating for ${resetRows.length} row(s).`, 'info');
  updatePreview(root);
}
"""

content = re.sub(
    r'(function resetCaAttributes\(root\) \{)',
    reset_code + r'\n\1',
    content
)

with open(file_path, 'w') as f:
    f.write(content)
