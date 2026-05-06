import re

files = [
    'js/pcf-fixer/store/useStore.js',
    'js/pcf-fixer-runtime/store/useStore.js'
]

for file_path in files:
    with open(file_path, 'r') as f:
        content = f.read()

    # Replace setDataTable properly
    content = re.sub(
        r'setDataTable: \(table\) => \{ get\(\)\.logTestEvent\(\'DATA_TABLE_CHANGE\', \{ length: table\.length \} \); set\(\{ dataTable: table \}\); \},',
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

    with open(file_path, 'w') as f:
        f.write(content)
