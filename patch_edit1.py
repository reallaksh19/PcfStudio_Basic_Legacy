import re

with open('js/ui/master-data-controller.js', 'r') as f:
    content = f.read()

# Edit handleUpload
content = re.sub(
    r'(async handleUpload\(file, type\) \{\n\s*if \(\!file\) return;\n)',
    r'\1\n    this._lastMasterFileNameByType = this._lastMasterFileNameByType || {};\n    this._lastMasterFileNameByType[type] = file.name;\n    localStorage.setItem(`pcf_last_master_filename_${type}`, file.name);\n\n',
    content
)

# Edit handleMatMapUpload
content = re.sub(
    r'(async handleMatMapUpload\(file\) \{\n\s*if \(\!file\) return;\n)',
    r'\1\n    this._lastMasterFileNameByType = this._lastMasterFileNameByType || {};\n    this._lastMasterFileNameByType.matmap = file.name;\n    localStorage.setItem(`pcf_last_master_filename_matmap`, file.name);\n\n',
    content
)

# Edit handleDumpUpload
content = re.sub(
    r'(async handleDumpUpload\(file\) \{\n\s*if \(\!file\) return;\n)',
    r'\1\n    this._lastMasterFileNameByType = this._lastMasterFileNameByType || {};\n    this._lastMasterFileNameByType.linedump = file.name;\n    localStorage.setItem(`pcf_last_master_filename_linedump`, file.name);\n\n',
    content
)

# Edit _showSaveDialog
content = re.sub(
    r'(\_showSaveDialog\(type, fileName, rowCount\) \{.*?)\n\s*const savedLabel = localStorage\.getItem\(`pcf_session_label_\$\{type\}`\);\n\s*const baseName = fileName\.replace\(/\\\\\.\[\^\.\]\+\$/, \'\'\);\n\s*labelEl\.value = savedLabel \|\| baseName;',
    r'\1\n\n    const defaultLabel = (this._lastMasterFileNameByType?.[type]) || localStorage.getItem(`pcf_last_master_filename_${type}`) || fileName || \'\';\n    const savedLabel = localStorage.getItem(`pcf_session_label_${type}`);\n    const baseName = defaultLabel.replace(/\\.[^.]+$/, \'\');\n    labelEl.value = savedLabel || baseName;',
    content,
    flags=re.DOTALL
)

with open('js/ui/master-data-controller.js', 'w') as f:
    f.write(content)
