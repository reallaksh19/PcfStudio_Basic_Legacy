import re

file_path = 'js/pcf-fixer/ui/tabs/CanvasTab.jsx'

with open(file_path, 'r') as f:
    content = f.read()

content = re.sub(
    r'(const computeSpools = \(dataTable\) => \{)',
    r'\1\n    dataTable = Array.isArray(dataTable) ? dataTable : [];',
    content
)

with open(file_path, 'w') as f:
    f.write(content)
