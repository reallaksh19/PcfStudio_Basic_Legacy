import re

file_path = 'js/ray-concept/rc-tab.js'

with open(file_path, 'r') as f:
    content = f.read()

# 1B: Wire the button properly
content = re.sub(
    r'(root\.querySelector\(\'#rc-btn-reset-ca\'\)\.addEventListener\(\'click\', \(\) => runResetCA\(root\)\);)',
    r'\1\n  root.querySelector(\'#rc-btn-reset-line-pc-rating\')?.addEventListener(\'click\', () => {\n    resetLineNoKeyPcRating(root);\n  });',
    content
)

# 1C: Enable/disable with Reset CA
# Find disabled = false (handled by setBtn in this codebase!)
content = re.sub(
    r'(setBtn\(root, \'#rc-btn-reset-ca\', true\);)',
    r'\1\n    setBtn(root, \'#rc-btn-reset-line-pc-rating\', true);',
    content
)

# And there might be places where we need to disable it.
content = re.sub(
    r'(setBtn\(root, \'#rc-btn-reset-ca\', false\);)',
    r'\1\n    setBtn(root, \'#rc-btn-reset-line-pc-rating\', false);',
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
    r'(async function runResetCA\(root\) \{)',
    reset_code + r'\n\1',
    content
)

with open(file_path, 'w') as f:
    f.write(content)
