import re

with open('js/ray-app.js', 'r') as f:
    content = f.read()

# Import notice
content = re.sub(
    r'(import \{ initConvertedBoreTools \} from \'\./ui/converted-bore-tools\.js\';)',
    r"\1\nimport { initLinelistKeyNotice } from './ui/linelist-key-notice.js';",
    content
)

# Init notice
content = re.sub(
    r'(    initConvertedBoreTools\(\);\n)',
    r'\1    initLinelistKeyNotice();\n',
    content
)


with open('js/ray-app.js', 'w') as f:
    f.write(content)
