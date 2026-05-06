import os
import re

files_to_fix = [
    'js/ray-concept/rc-tab.js',
]

for fp in files_to_fix:
    with open(fp, 'r') as f:
        content = f.read()

    # Python's re.sub backslash replacements likely introduced \' and \\
    # Let's fix escaped single quotes that are bare in JS.
    content = content.replace("\\'", "'")

    with open(fp, 'w') as f:
        f.write(content)
