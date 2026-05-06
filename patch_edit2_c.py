import re

with open('js/ui/master-data-controller.js', 'r') as f:
    content = f.read()

# Update renderPreview calls in file upload handle
content = re.sub(
    r'(      \} else if \(type === "pipingclass"\) \{\n\s*dataManager\.setPipingClassMaster\(result\.data\);\n\s*document\.getElementById\("pipingclass-mapping-section"\)\.style\.display = "";\n\s*this\.renderPreview\(\'pipingclass\', result\.data, result\.headers\);\n\s*\})',
    r'      } else if (type === "pipingclass") {\n        dataManager.setPipingClassMaster(result.data);\n        document.getElementById("pipingclass-mapping-section").style.display = "";\n        const headersWithBore = this._previewHeadersWithConvertedBore(result.data);\n        this.renderPreview(\'pipingclass\', result.data, headersWithBore);\n      }',
    content
)

content = re.sub(
    r'(      // Render Mapping UI for all types \(including Linelist for Key Columns\)\n\s*this\.renderMappingUI\(type, result\.headers\);\n\s*this\.renderPreview\(type, result\.data, result\.headers\);)',
    r'      // Render Mapping UI for all types (including Linelist for Key Columns)\n      this.renderMappingUI(type, result.headers);\n      const headersWithBore = this._previewHeadersWithConvertedBore(result.data);\n      this.renderPreview(type, result.data, headersWithBore);',
    content
)

content = re.sub(
    r'(    // Re-render preview with ColumnX1 column\n\s*const allHeaders = Object\.keys\(enriched\[0\] \|\| \{\}\);\n\s*this\.renderPreview\(\'linelist\', enriched, allHeaders\);)',
    r'    // Re-render preview with ColumnX1 column\n    const allHeaders = this._previewHeadersWithConvertedBore(enriched);\n    this.renderPreview(\'linelist\', enriched, allHeaders);',
    content
)

with open('js/ui/master-data-controller.js', 'w') as f:
    f.write(content)
