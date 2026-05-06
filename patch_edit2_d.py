import re

with open('js/ui/master-data-controller.js', 'r') as f:
    content = f.read()

# Update handleMatMapUpload where renderPreview is called.
content = re.sub(
    r'(      // Render preview table from parsed map\n\s*const headers = \["code", "desc"\];\n\s*this\.renderPreview\("matmap", result, headers\);)',
    r'      // Render preview table from parsed map\n      const headers = ["code", "desc"];\n      // Note: matmap does not need Converted Bore, but to be consistent or just leave it.\n      this.renderPreview("matmap", result, headers);',
    content
)

with open('js/ui/master-data-controller.js', 'w') as f:
    f.write(content)
