import re

with open('js/ui/master-data-controller.js', 'r') as f:
    content = f.read()

content = re.sub(
    r'(        const headers = Object\.keys\(data\[0\] \|\| \{\}\);\n\s*this\.renderMappingUI\(\'weights\', headers\);\n\s*this\.renderPreview\(\'weights\', data, headers\);)',
    r'''        const mapHeaders = Object.keys(data[0] || {});
        this.renderMappingUI('weights', mapHeaders);
        const headers = this._previewHeadersWithConvertedBore(data);
        this.renderPreview('weights', data, headers);''',
    content
)

content = re.sub(
    r'(        const headers = Object\.keys\(data\[0\] \|\| \{\}\);\n\s*this\.renderMappingUI\(\'linelist\', headers\);\n\s*this\.populateSourceSelect\(headers\);\n\s*this\.renderX1Builder\(headers\);\n\s*document\.getElementById\("linelist-mapping-section"\)\.style\.display = "";\n\s*document\.getElementById\("linelist-attr-section"\)\.style\.display = "";\n\s*this\.renderPreview\(\'linelist\', data, headers\);)',
    r'''        const mapHeaders = Object.keys(data[0] || {});
        this.renderMappingUI('linelist', mapHeaders);
        this.populateSourceSelect(mapHeaders);
        this.renderX1Builder(mapHeaders);
        document.getElementById("linelist-mapping-section").style.display = "";
        document.getElementById("linelist-attr-section").style.display = "";

        const headers = this._previewHeadersWithConvertedBore(data);
        this.renderPreview('linelist', data, headers);''',
    content
)


with open('js/ui/master-data-controller.js', 'w') as f:
    f.write(content)
