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

with open('js/ui/master-data-controller.js', 'w') as f:
    f.write(content)
