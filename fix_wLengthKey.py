import re

file_path = 'js/ui/pcf-table-controller.js'

with open(file_path, 'r') as f:
    content = f.read()

content = re.sub(
    r'(const wLengthKey = dm\.headerMap\?\.weights\?\.length       \|\| \'Length \(RF-F/F\)\';\n)\s*const wLengthKey = dm\.headerMap\?\.weights\?\.length       \|\| \'Length \(RF-F/F\)\';',
    r'\1',
    content
)

with open(file_path, 'w') as f:
    f.write(content)
