import re

with open('js/ui/master-data-controller.js', 'r') as f:
    content = f.read()

# Edit 1: Upload handlers default session label
# Search for handleUpload
# Add handling to this._lastMasterFileNameByType
# Search for msd-label

def replace_handle_upload():
    global content

    # We need to find: `const file = e.target.files?.[0];` or similar in handleUpload, handleMatMapUpload, handleDumpUpload.
    # Actually the instruction says:
    # "In each upload handler, immediately after you get the file: const file = e.target.files?.[0]; add ..."
    # Let's use re.sub for all these.

    pass
