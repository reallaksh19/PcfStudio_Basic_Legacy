import re

file_path = 'js/ui/ca-matrix-popup.js'

with open(file_path, 'r') as f:
    content = f.read()

# Update CA8 Label
content = re.sub(
    r"'CA8': 'Flange Wt \(kg\)', 'CA9': 'Den \(kg/m³\)',",
    r"'CA8': 'Comp Wt. (kg)', 'CA9': 'Den (kg/m³)',",
    content
)

# Update row indices
content = re.sub(
    r'(<tr data-group-row="\$\{key\}" data-original-line="\$\{group\.lineNo\}")>',
    r'\1 data-row-indices="${group.rows.join(\',\')}">',
    content
)

with open(file_path, 'w') as f:
    f.write(content)
