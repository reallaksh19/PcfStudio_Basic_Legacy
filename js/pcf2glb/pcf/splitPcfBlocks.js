export function splitPcfBlocks(text, log) {
  const lines = text
    .split(/\r?\n/)
    .map(l => l.trimEnd())
    .filter(l => l.trim() !== '');

  const blockStarts = new Set([
    'PIPE', 'BEND', 'ELBOW', 'TEE', 'OLET',
    'VALVE', 'FLANGE', 'REDUCER', 'SUPPORT',
    'INSTRUMENT', 'GASKET', 'MISC-COMPONENT', 'CROSS', 'CAP',
    'COUPLING', 'LAPJOINT-STUBEND', 'WELD', 'MATERIALS', 'BOLT'
  ]);

  const blocks = [];
  let current = null;
  const rawHeaders = [];

  for (const line of lines) {
    const trimmed = line.trim();
    const token = trimmed.split(/\s+/)[0];

    if (blockStarts.has(token) && !line.startsWith(' ') && !line.startsWith('\t')) {
      if (current) blocks.push(current);
      current = { type: token, lines: [line] };
    } else if (current) {
      current.lines.push(line);
    } else {
      rawHeaders.push(line);
    }
  }

  if (current) blocks.push(current);

  if (rawHeaders.length > 0) {
    log.info('PARSED_HEADERS', { lines: rawHeaders.length });
  }

  return { headers: rawHeaders, blocks };
}
