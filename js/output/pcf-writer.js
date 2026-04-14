/**
 * pcf-writer.js — Apply line endings and trigger browser download
 * Converts PCF lines array to CRLF-terminated string and creates Blob.
 *
 * Exports:
 *   toPCFString(lines, config)      → string  (CRLF or LF terminated)
 *   downloadPCF(lines, filename, config)
 */

import { info, error } from '../logger.js';

const MOD = 'pcf-writer';

/**
 * Join PCF lines with configured line ending.
 * @param {string[]} lines
 * @param {object}   config
 * @returns {string}
 */
export const toPCFString = (lines, config) => {
  const le = config?.outputSettings?.lineEnding === 'LF' ? '\n' : '\r\n';

  // Task 9: Attribute Suppression
  const filteredLines = lines.filter(line => {
    const trimmed = line.trim();

    // 1. Suppress specific tracking attributes (Task 2 & Task 1 update)
    // Must handle cases with spaces like "COMPONENT-ATTRIBUTE99    val" or just the key
    if (/^COMPONENT-ATTRIBUTE99(\s+|$)/.test(trimmed)) {
      return false;
    }
    // Strip internal pipeline refs (component-level, indented with 4 spaces).
    // Do NOT strip the header-level PIPELINE-REFERENCE XXXXX.
    if (/^\s{4}PIPELINE-REFERENCE\s+=[0-9]+\/[0-9]+/.test(line)) {
      return false;
    }
    if (/^\s{4}PIPELINE-REFERENCE/.test(line) && (line.includes('_Injected') || line.includes('_bridged') || line.includes('_Support') || line.includes('_Sp'))) {
      return false;
    }

    // 2. Suppress blank specific attributes (Task 2 & Task 1 update)
    // Matches "KEY" or "KEY   " (empty value)
    if (/^(PIPING-SPEC|PIPING-CLASS|COMPONENT-ATTRIBUTE[458])\s*$/.test(trimmed)) {
      return false;
    }

    // 3. Strict suppression for Task 1 specific requests if blank OR present
    // User requested explicit removal of PIPING-SPEC/CLASS if blank (already covered above) but let's be safer.
    // Also COMPONENT-ATTRIBUTE4, 5 if blank.

    // Check for Blank Value explicitly: Key followed by optional whitespace but no non-whitespace value
    // Regex: ^KEY\s*$ or ^KEY\s+.*$ but value is empty? No, trimmed line implies "KEY VALUE".
    // If value is empty, trimmed line is just "KEY".

    // FIX: The PCF line might be "    KEY    " (value is spaces).
    // The `trimmed` var handles leading/trailing. So "KEY" is left.
    // But if there are tabs or spaces inside: "KEY    ". `trimmed` would be "KEY".

    // We also need to handle "KEY    " where value is empty.
    // Regex: ^KEY(\s+)?$ matches "KEY" or "KEY ".

    const keyOnlyRegex = /^(PIPING-SPEC|PIPING-CLASS|COMPONENT-ATTRIBUTE4|COMPONENT-ATTRIBUTE5)(\s+)?$/;
    if (keyOnlyRegex.test(trimmed)) {
      return false;
    }

    // 4. Also suppress specific keys if they have value but are in blacklist?
    // User listed: COMPONENT-ATTRIBUTE99 (done), PIPELINE-REFERENCE (done for injected), PIPING-SPEC/CLASS (if blank)
    // "Why component attribute with blanks are still listed... were supposed to be deleted"
    // So blanks are the main target.

    return true;
  });

  return filteredLines.join(le) + le;
};

/**
 * Trigger browser file download for the PCF output.
 * @param {string[]} lines
 * @param {string}   filename   - e.g. "output.pcf"
 * @param {object}   config
 */
export const downloadPCF = (lines, filename, config) => {
  if (!Array.isArray(lines) || lines.length === 0) {
    error(MOD, 'downloadPCF', 'No PCF lines to download', {
      hint: 'Run conversion before attempting download',
    });
    return;
  }

  const content = toPCFString(lines, config);
  const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');

  a.href = url;
  a.download = filename || 'output.pcf';
  a.style.display = 'none';
  document.body.appendChild(a);

  try {
    a.click();
    info(MOD, 'downloadPCF', 'Download triggered', {
      filename: a.download, sizeBytes: blob.size, lineCount: lines.length,
    });
  } catch (e) {
    error(MOD, 'downloadPCF', 'Download click failed', {
      errorMsg: e.message, filename,
    });
  } finally {
    setTimeout(() => {
      URL.revokeObjectURL(url);
      document.body.removeChild(a);
    }, 1000);
  }
};
