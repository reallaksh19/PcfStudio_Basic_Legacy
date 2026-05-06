import re

with open('js/ui/master-data-controller.js', 'r') as f:
    content = f.read()

# Add _previewHeadersWithConvertedBore(data) inside MasterDataController class.
# Let's insert it before handleDataChange(type).
insert_code = """
  _previewHeadersWithConvertedBore(data) {
    const headers = Object.keys(data?.[0] || {});
    if (!headers.includes('Converted Bore')) {
      headers.push('Converted Bore');
    }
    return headers;
  }
"""

content = re.sub(
    r'(  handleDataChange\(type\) \{\n    // Guard: renderMappingUI calls updateHeaderMap which fires _notifyChange again.)',
    insert_code + r'\n\1',
    content
)

# Update renderPreview calls in handleDataChange
content = re.sub(
    r'const headers = Object\.keys\(data\[0\] \|\| \{\}\);\n\s*this\.renderPreview\(\'linelist\', data, headers\);',
    r'const headers = this._previewHeadersWithConvertedBore(data);\n        this.renderPreview(\'linelist\', data, headers);',
    content
)
content = re.sub(
    r'const headers = Object\.keys\(data\[0\] \|\| \{\}\);\n\s*this\.renderPreview\(\'weights\', data, headers\);',
    r'const headers = this._previewHeadersWithConvertedBore(data);\n        this.renderPreview(\'weights\', data, headers);',
    content
)
content = re.sub(
    r'const headers = Object\.keys\(data\[0\] \|\| \{\}\);\n\s*this\.renderMappingUI\(\'pipingclass\', headers\);\n\s*this\.renderPreview\(\'pipingclass\', data, headers\);',
    r'const mapHeaders = Object.keys(data[0] || {});\n        this.renderMappingUI(\'pipingclass\', mapHeaders);\n        const headers = this._previewHeadersWithConvertedBore(data);\n        this.renderPreview(\'pipingclass\', data, headers);',
    content
)


with open('js/ui/master-data-controller.js', 'w') as f:
    f.write(content)
