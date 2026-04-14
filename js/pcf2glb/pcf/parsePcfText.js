import { splitPcfBlocks } from './splitPcfBlocks.js';

export function parsePcfText(text, log, file) {
  const { headers, blocks: rawBlocks } = splitPcfBlocks(text, log);

  const blocks = [];
  const warnings = [];

  for (const raw of rawBlocks) {
    const { type, lines } = raw;
    const parsed = {};
    const rawAttrs = {};

    // Line 0 is the block declaration. Rest are attributes
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i];
      const trimmed = line.trim();
      if (!trimmed) continue;

      const firstSpace = trimmed.indexOf(' ');
      const key = firstSpace > -1 ? trimmed.substring(0, firstSpace) : trimmed;
      const value = firstSpace > -1 ? trimmed.substring(firstSpace + 1).trim() : true;

      // Known structural attributes for parsing
      if (key === 'END-POINT' || key === 'CENTRE-POINT' || key === 'BRANCH1-POINT') {
         if (!parsed[key]) parsed[key] = [];
         parsed[key].push(value);
      } else if (key.startsWith('COMPONENT-ATTRIBUTE') || key === 'PIPING-CLASS' || key === 'RATING' || key === 'PIPELINE-REFERENCE') {
         if (!parsed[key]) parsed[key] = value;
         else parsed[key] += ' | ' + value;
      } else if (key === 'SKEY') {
         parsed[key] = value;
      } else {
         if (!rawAttrs[key]) rawAttrs[key] = value;
         else rawAttrs[key] += ' | ' + value;
      }
    }

    blocks.push({
      type,
      lines,
      parsed,
      rawAttrs
    });
  }

  log.info('BLOCK_PARSE_COMPLETE', { count: blocks.length });

  return {
    meta: {
      sourceFile: file?.name || 'unknown',
      lineCount: text.split(/\r?\n/).length,
    },
    headers,
    blocks,
    warnings,
  };
}
