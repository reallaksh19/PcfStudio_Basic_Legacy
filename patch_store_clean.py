import re
import os

files = [
    'js/pcf-fixer/store/useStore.js',
    'js/pcf-fixer-runtime/store/useStore.js'
]

for file_path in files:
    with open(file_path, 'r') as f:
        content = f.read()

    # Add normalizeDataTable helper
    content = re.sub(
        r'(import \{ create \} from \'zustand\';)',
        r'\1\n\nfunction normalizeDataTable(table) {\n  if (Array.isArray(table)) return table;\n  if (Array.isArray(table?.components)) return table.components;\n  if (Array.isArray(table?.rows)) return table.rows;\n  if (Array.isArray(table?.dataTable)) return table.dataTable;\n  if (Array.isArray(table?.data)) return table.data;\n  return [];\n}\n',
        content
    )

    # Replace setDataTable
    content = re.sub(
        r'setDataTable: \(table\) => \{ get\(\)\.logTestEvent\(\'DATA_TABLE_CHANGE\', \{ length: table\.length \}\); set\(\{ dataTable: table \}\); \},',
        r'''setDataTable: (table) => {
    const safeTable = normalizeDataTable(table);
    get().logTestEvent('DATA_TABLE_CHANGE', {
      length: safeTable.length,
      normalizedFrom: Array.isArray(table) ? 'array' : typeof table
    });
    set({ dataTable: safeTable });
  },''',
        content
    )

    # Replace setExternalDataTable
    content = re.sub(
        r'setExternalDataTable: \(rows\) => \{\n\s*const components = rows\.map\(\(row, idx\) => \{',
        r'''setExternalDataTable: (rows) => {
      const safeRows = normalizeDataTable(rows);
      const components = safeRows.map((row, idx) => {''',
        content
    )

    # Harden getPipes
    content = re.sub(
        r'return s\.dataTable\.filter\(r => \(r\.type \|\| ""\)\.toUpperCase\(\) === \'PIPE\' && \!s\.hiddenElementIds\.includes\(r\._rowIndex\)\);',
        r'return normalizeDataTable(s.dataTable).filter(r => (r.type || "").toUpperCase() === \'PIPE\' && !s.hiddenElementIds.includes(r._rowIndex));',
        content
    )

    # Harden getImmutables
    content = re.sub(
        r'return s\.dataTable\.filter\(r => \(r\.type \|\| ""\)\.toUpperCase\(\) \!\=\= \'PIPE\' && \!s\.hiddenElementIds\.includes\(r\._rowIndex\)\);',
        r'return normalizeDataTable(s.dataTable).filter(r => (r.type || "").toUpperCase() !== \'PIPE\' && !s.hiddenElementIds.includes(r._rowIndex));',
        content
    )

    with open(file_path, 'w') as f:
        f.write(content)
