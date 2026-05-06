import re

with open('js/ui/master-data-controller.js', 'r') as f:
    content = f.read()

# Edit _showSaveDialog
content = re.sub(
    r'(    const savedLabel = localStorage\.getItem\(`pcf_session_label_\$\{type\}`\);\n\s*const baseName = fileName\.replace\(/\\\\\.\[\^\.\]\+\$/, \'\'\);\n\s*labelEl\.value = savedLabel \|\| baseName;)',
    r'''    const defaultLabel =
      (this._lastMasterFileNameByType?.[type]) ||
      localStorage.getItem(`pcf_last_master_filename_${type}`) ||
      fileName || '';

    const savedLabel = localStorage.getItem(`pcf_session_label_${type}`);
    const baseName = defaultLabel.replace(/\.[^.]+$/, '');
    labelEl.value = savedLabel || baseName;''',
    content,
    flags=re.DOTALL
)

with open('js/ui/master-data-controller.js', 'w') as f:
    f.write(content)
