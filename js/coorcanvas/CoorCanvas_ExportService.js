/**
 * CoorCanvas_ExportService.js
 * PCF text generation for the CoorCanvas pipeline.
 */

import { dist } from './CoorCanvas_GeometryUtils.js';
import { snap, snapPoint } from './CoorCanvas_SnapEngine.js';

export function formatPipeEndpoint(p, bore, roundToMm) {
  const sp = snapPoint(p, roundToMm);
  return `    END-POINT  ${sp[0].toFixed(4)} ${sp[1].toFixed(4)} 0.0000 ${bore.toFixed(4)}`;
}

export function emitPCF(elements, supports, bore, header, roundToMm) {
  const lines = [header];
  let ref = 1;
  let seq = 1;

  elements.forEach((elem) => {
    if (elem.kind === "PIPE") {
      const a = snapPoint(elem.start, roundToMm);
      const b = snapPoint(elem.end, roundToMm);
      lines.push(
        "",
        "MESSAGE-SQUARE",
        `    PIPE, RefNo:=COORD_${ref}, SeqNo:${seq}, Length:${dist(a, b).toFixed(2)}MM`,
        "PIPE",
        formatPipeEndpoint(a, bore, roundToMm),
        formatPipeEndpoint(b, bore, roundToMm),
      );
    } else {
      const ep1 = snapPoint(elem.ep1, roundToMm);
      const ep2 = snapPoint(elem.ep2, roundToMm);
      const cp  = snapPoint(elem.cp,  roundToMm);
      lines.push(
        "",
        "MESSAGE-SQUARE",
        `    BEND, RefNo:=COORD_${ref}, SeqNo:${seq}`,
        "BEND",
        formatPipeEndpoint(ep1, bore, roundToMm),
        formatPipeEndpoint(ep2, bore, roundToMm),
        `    CENTRE-POINT  ${cp[0].toFixed(4)} ${cp[1].toFixed(4)} 0.0000`,
        `    <SKEY>  ${elem.skey}`,
        `    ANGLE ${elem.angle_deg.toFixed(4)}`,
        `    BEND-RADIUS ${elem.radius.toFixed(4)}`,
      );
    }
    ref += 1;
    seq += 1;
  });

  supports.forEach((support) => {
    const pt = snapPoint(support.point, roundToMm);
    lines.push(
      "",
      "MESSAGE-SQUARE",
      `    SUPPORT, RefNo:=${support.refNo}, SeqNo:${seq}, ${support.name}, ${support.guid}`,
      "SUPPORT",
      `    CO-ORDS    ${pt[0].toFixed(4)} ${pt[1].toFixed(4)} 0.0000 0.0000`,
      `    <SUPPORT_NAME>    ${support.name}`,
      `    <SUPPORT_GUID>    ${support.guid}`,
    );
    seq += 1;
  });

  return lines.join("\n");
}
