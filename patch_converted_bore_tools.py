import re

with open('js/ui/converted-bore-tools.js', 'r') as f:
    content = f.read()

# Add imports
content = re.sub(
    r'(import { CONVERTED_BORE_COL, guessBoreSourceColumn } from \'\.\./services/bore-converter\.js\';)',
    r'\1\nimport { guessPreferredBoreSourceColumn, shouldUsePreferredBoreSource } from \'../services/bore-source-selector.js\';',
    content
)

# Add AUTO_CONVERTED set and rowsFor function
content = re.sub(
    r'(const TYPES = \[\'linelist\', \'weights\', \'pipingclass\'\];)',
    r'\1\nconst AUTO_CONVERTED = new Set();',
    content
)

content = re.sub(
    r'(function headersFor\(type\) \{\n\s*const rows =\n\s*type === \'linelist\' \? dataManager\.getLinelist\(\) :\n\s*type === \'weights\' \? dataManager\.getWeights\(\) :\n\s*type === \'pipingclass\' \? dataManager\.getPipingClassMaster\(\) : \[\];\n\s*return Object\.keys\(rows\?\.\[0\] \|\| \{\}\);\n\})',
    r'\1\n\nfunction rowsFor(type) {\n  return type === \'linelist\' ? dataManager.getLinelist() :\n    type === \'weights\' ? dataManager.getWeights() :\n    type === \'pipingclass\' ? dataManager.getPipingClassMaster() : [];\n}',
    content
)

# Update guessed source and add auto-convert block
content = re.sub(
    r'(\s*const saved = dataManager\.getConvertedBoreSource\?\.\(type\) \|\| \'\';\n)\s*const guessed = saved \|\| guessBoreSourceColumn\(headers, type\);',
    r'\1  const preferred = guessPreferredBoreSourceColumn(headers, type) || guessBoreSourceColumn(headers, type);\n  const guessed = shouldUsePreferredBoreSource(saved, preferred, headers, type)\n    ? preferred\n    : (saved || preferred);',
    content
)

auto_convert_block = """
  setTimeout(() => {
    const rows = rowsFor(type);
    if (!rows.length || !guessed) return;

    const signature = `${type}|${rows.length}|${guessed}`;
    if (AUTO_CONVERTED.has(signature)) return;
    AUTO_CONVERTED.add(signature);

    const res = dataManager.convertMasterBores(type, guessed);
    if (status) {
      status.textContent = `✓ Auto Convert to Bore: ${res.converted} rows, unresolved ${res.unresolved}, source: ${res.sourceColumn}`;
      status.style.color = 'var(--green-ok)';
    }
    gate('ConvertedBoreTools', 'AutoConvertToBore', `${type} auto converted bore`, {
      type,
      sourceColumn: guessed,
      converted: res.converted,
      unresolved: res.unresolved
    });
  }, 0);
"""

content = re.sub(
    r'(const status = document\.getElementById\(`\$\{id\}-status`\);\n)',
    r'\1' + auto_convert_block,
    content
)


with open('js/ui/converted-bore-tools.js', 'w') as f:
    f.write(content)
