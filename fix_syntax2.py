import os

with open('js/ui/pcf-table-controller.js', 'r') as f:
    content = f.read()

content = content.replace("[\\\\s_-]", "[\\s_-]")

with open('js/ui/pcf-table-controller.js', 'w') as f:
    f.write(content)
