export function Pro2D_exportSimpleSvg(doc) {
  const pieces = [];
  pieces.push(`<svg xmlns="http://www.w3.org/2000/svg" width="800" height="500" viewBox="0 0 800 500">`);
  Object.values(doc?.entities || {}).forEach((e) => {
    if (e.type === 'PIPE') {
      const a = doc.nodes?.[e.geometry?.nodeIds?.[0]]?.pt;
      const b = doc.nodes?.[e.geometry?.nodeIds?.[1]]?.pt;
      if (!a || !b) return;
      pieces.push(`<line x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}" stroke="#e2e8f0" stroke-width="2" data-pro2d-id="${e.id}" data-pro2d-type="PIPE" data-pro2d-route="${e.routeId || ''}" />`);
    } else if (['VALVE','FLANGE','REDUCER','SUPPORT','BEND','TEE'].includes(e.type)) {
      const c = e.geometry?.center || { x: 0, y: 0 };
      pieces.push(`<circle cx="${c.x}" cy="${c.y}" r="6" fill="#f59e0b" data-pro2d-id="${e.id}" data-pro2d-type="${e.type}" />`);
      pieces.push(`<text x="${c.x + 8}" y="${c.y - 8}" font-size="10" fill="#cbd5e1">${e.type}</text>`);
    }
  });
  pieces.push(`</svg>`);
  return pieces.join('');
}
