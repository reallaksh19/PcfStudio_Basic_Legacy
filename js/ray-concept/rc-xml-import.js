/**
 * rc-xml-import.js — AVEVA PipeStress XML → Raw CSV bridge for Stage-1 parser.
 */

function text(node, tag) {
  if (!node) return '';
  const direct = node.getElementsByTagName(tag)?.[0];
  if (direct?.textContent != null) return direct.textContent.trim();
  const all = node.getElementsByTagName('*');
  for (const el of all) {
    if ((el.localName || el.nodeName) === tag) return el.textContent?.trim?.() ?? '';
  }
  return '';
}

function normalizeType(type = '') {
  const t = String(type || '').trim().toUpperCase();
  if (!t) return '';
  if (t === 'REDU') return 'REDUCER';
  if (t === 'ELBO') return 'ELBOW';
  return t;
}

function parsePosition(pos) {
  const [east = '', north = '', up = ''] = String(pos || '').trim().split(/\s+/);
  return { east, north, up };
}

function toCsv(headers, rows) {
  const esc = (v) => {
    const s = String(v ?? '');
    if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
    return s;
  };
  return [
    headers.join(','),
    ...rows.map((row) => headers.map((h) => esc(row[h] ?? '')).join(','))
  ].join('\n');
}

export function convertAvevaXmlToRawCsv(xmlText) {
  const doc = new DOMParser().parseFromString(xmlText, 'application/xml');
  const parserErr = doc.querySelector('parsererror');
  if (parserErr) throw new Error('Invalid XML input');
  const root = doc.documentElement;
  const rootName = root?.localName || root?.nodeName;
  if (rootName !== 'PipeStressExport') {
    throw new Error(`Unsupported XML root "${rootName}". Expected PipeStressExport (PSI116 schema).`);
  }

  const branchName = text(doc, 'Branchname');
  const nodes = [...doc.getElementsByTagName('Node'), ...[...doc.getElementsByTagName('*')].filter(n => n.localName === 'Node')]
    .filter((n, i, arr) => arr.indexOf(n) === i);

  const headers = [
    'Sequence', 'NodeNo', 'NodeName', 'componentName', 'Description', 'Type', 'RefNo', 'Point', 'PPoint',
    'Bore', 'O/D', 'Radius', 'Material', 'Rigid', 'East', 'North', 'Up',
    'Restraint Type', 'Restraint Friction', 'Restraint Gap',
    'CA1', 'CA2', 'CA3', 'CA4', 'CA5', 'CA6', 'CA7', 'CA8', 'CA9', 'CA10',
    'PipingClass', 'Rating', 'LineNo_key', 'Pipeline Ref', 'Branchname'
  ];

  const rows = [];
  let sequence = 1;

  for (const node of nodes) {
    const rawType = text(node, 'ComponentType');
    const type = normalizeType(rawType);
    const endpoint = text(node, 'Endpoint');
    const point = ['0', '1', '2', '3'].includes(endpoint) ? endpoint : '1';
    const od = text(node, 'OutsideDiameter');
    const wt = text(node, 'WallThickness');
    const nominalBore = text(node, 'NominalDiameter') || text(node, 'NominalBore') || text(node, 'NB');
    const bore = od || nominalBore;
    const pos = parsePosition(text(node, 'Position'));
    const restraint = node.getElementsByTagName('Restraint')?.[0] || null;

    rows.push({
      Sequence: sequence++,
      NodeNo: text(node, 'NodeNumber'),
      NodeName: text(node, 'NodeName'),
      componentName: rawType || type,
      Description: rawType || type,
      Type: rawType || type,
      RefNo: text(node, 'ComponentRefNo'),
      Point: point,
      PPoint: '',
      Bore: bore,
      'O/D': od,
      Radius: text(node, 'BendRadius'),
      Material: text(node, 'Material') || '',
      Rigid: text(node, 'Rigid'),
      East: pos.east,
      North: pos.north,
      Up: pos.up,
      'Restraint Type': text(restraint, 'Type'),
      'Restraint Friction': text(restraint, 'Friction'),
      'Restraint Gap': text(restraint, 'Gap'),
      CA1: '', CA2: '', CA3: '', CA4: wt, CA5: text(node, 'InsulationThickness'), CA6: '',
      CA7: text(node, 'CorrosionAllowance'), CA8: text(node, 'Weight'), CA9: '', CA10: '',
      PipingClass: '',
      Rating: '',
      LineNo_key: '',
      'Pipeline Ref': branchName,
      Branchname: branchName
    });
  }

  return {
    csvText: toCsv(headers, rows),
    branchName,
    headers,
    rowCount: rows.length,
    mapping: {
      'Pipeline Ref (2D CSV)': 'Branchname (XML)',
      'RefNo': 'ComponentRefNo',
      'Type': 'ComponentType',
      'Point': 'Endpoint',
      'East/North/Up': 'Position',
      'Bore': 'OutsideDiameter (fallback: NominalDiameter/NominalBore/NB)',
      'CA8 (Comp Wt.)': 'Weight'
    }
  };
}
