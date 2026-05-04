/**
 * pcf-output-validator.js — Phase 5E generated PCF syntax/structure checks
 */

const TOP_LEVEL = new Set(['ISOGEN-FILES','UNITS-BORE','UNITS-CO-ORDS','UNITS-WEIGHT','UNITS-BOLT-DIA','UNITS-BOLT-LENGTH','PIPELINE-REFERENCE','MESSAGE-SQUARE','PIPE','FLANGE','BEND','TEE','OLET','VALVE','REDUCER-CONCENTRIC','REDUCER-ECCENTRIC','SUPPORT','MISC-COMPONENT']);
const BLOCKS = new Set(['PIPE','FLANGE','BEND','TEE','OLET','VALVE','REDUCER-CONCENTRIC','REDUCER-ECCENTRIC','SUPPORT','MISC-COMPONENT']);
const CA8_ALLOWED = new Set(['FLANGE','VALVE']);
function clean(v){ return String(v ?? '').trim(); }
function issue(severity,code,message,extra={}){ return { phase:'5E', validator:'pcf-output-validator', severity, code, message, ...extra }; }
function parseNum(s){ const n = Number.parseFloat(String(s)); return Number.isFinite(n) ? n : null; }
function validateCoordPrecision(line, decimals, diagnostics, lineNo){
  const nums = clean(line).split(/\s+/).slice(1).map(parseNum).filter(v=>v!=null);
  if (nums.length < 4) return;
  const parts = clean(line).split(/\s+/).slice(1,5);
  for (const p of parts) {
    const m = String(p).match(/^-?\d+(?:\.(\d+))?$/);
    const actual = m?.[1]?.length ?? 0;
    if (actual !== decimals) diagnostics.push(issue('error','PCF-DECIMAL-PRECISION',`Coordinate value ${p} does not match configured decimal precision ${decimals}.`,{lineNo,line}));
  }
}
function parseBlocks(lines){
  const out=[]; let cur=null;
  const flush=()=>{ if(cur) out.push(cur); cur=null; };
  for(let i=0;i<lines.length;i++){
    const t=lines[i].trim();
    if(BLOCKS.has(t)){ flush(); cur={type:t,lineNo:i+1,lines:[]}; continue; }
    if(cur) cur.lines.push({lineNo:i+1,text:lines[i]});
  }
  flush(); return out;
}
export function validatePcfOutputText(pcfText, options={}){
  const diagnostics=[];
  const decimals = Number.isInteger(options.decimalPrecision) ? options.decimalPrecision : 4;
  if (options.requireCrlf !== false && /(?<!\r)\n/.test(String(pcfText||''))) diagnostics.push(issue('error','PCF-LINE-ENDINGS','PCF output must use CRLF line endings when configured.'));
  const lines = String(pcfText||'').split(/\r?\n/);
  for(let i=0;i<lines.length;i++){
    const raw=lines[i]; const t=raw.trim(); if(!t) continue;
    const keyword=t.split(/\s+/)[0];
    const isIndented = /^\s+/.test(raw);
    if (!isIndented && (TOP_LEVEL.has(keyword) || TOP_LEVEL.has(t))) {
      // Valid top-level keyword.
    } else if (isIndented) {
      if (!raw.startsWith('    ')) diagnostics.push(issue('error','PCF-SUBLINE-INDENT','PCF sub-line must be indented by 4 spaces.',{lineNo:i+1,line:raw}));
    } else {
      diagnostics.push(issue('error','PCF-UNKNOWN-TOPLINE','Unknown unindented PCF line.',{lineNo:i+1,line:raw}));
    }
    if (/^(\s*)(END-POINT|CENTRE-POINT|BRANCH1-POINT|CO-ORDS)\b/.test(raw)) validateCoordPrecision(raw,decimals,diagnostics,i+1);
  }
  const blocks=parseBlocks(lines);
  for(const b of blocks){
    const textLines=b.lines.map(x=>x.text.trim());
    if(b.type==='SUPPORT'){
      if(!textLines.some(l=>l.startsWith('CO-ORDS'))) diagnostics.push(issue('error','PCF-SUPPORT-COORDS','SUPPORT must include CO-ORDS.',{block:b}));
      if(!textLines.some(l=>l.startsWith('<SUPPORT_NAME>'))) diagnostics.push(issue('error','PCF-SUPPORT-NAME','SUPPORT must include <SUPPORT_NAME>.',{block:b}));
      if(textLines.some(l=>/^COMPONENT-ATTRIBUTE\d+\b/.test(l))) diagnostics.push(issue('error','PCF-SUPPORT-CA','SUPPORT must not include CA1–CA10 lines.',{block:b}));
    }
    if(b.type==='OLET' && textLines.some(l=>l.startsWith('END-POINT'))) diagnostics.push(issue('error','PCF-OLET-ENDPOINT','OLET must not include END-POINT lines.',{block:b}));
    if(!CA8_ALLOWED.has(b.type) && textLines.some(l=>/^COMPONENT-ATTRIBUTE8\b/.test(l))) diagnostics.push(issue('error','PCF-CA8-SCOPE',`CA8 is not allowed on ${b.type}.`,{block:b}));
  }
  return { pass: diagnostics.filter(d=>d.severity==='error').length===0, diagnostics, summary:{ blocks:blocks.length, errors:diagnostics.filter(d=>d.severity==='error').length, warnings:diagnostics.filter(d=>d.severity==='warning').length } };
}
try { if(typeof window!=='undefined') window.validatePcfOutputText = validatePcfOutputText; } catch(_) {}
