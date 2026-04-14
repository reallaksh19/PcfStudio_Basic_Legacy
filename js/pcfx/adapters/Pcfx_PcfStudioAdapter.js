/**
 * Pcfx_PcfStudioAdapter.js
 * 
 * Adapts PCF-Studio internal data structures (like Data Table rows) 
 * to and from the PCFX JSON standard.
 */

import { createEmptyPcfxDocument, createComponentNode } from '../Pcfx_Core.js';
import { PcfxFileIO } from '../Pcfx_FileIO.js';
import { PcfxRules } from '../Pcfx_Rules.js';

export function exportTableRowsToPcfx(rows) {
  const doc = createEmptyPcfxDocument();
  
  rows.forEach((row, index) => {
    // Generate a unique ID if one doesn't exist
    const id = row.entityId || `comp_${index}_${row.type || 'UNKNOWN'}`;
    const comp = createComponentNode(id, row.type || "UNKNOWN");
    
    // Map geometry
    if (row.ep1) comp.geometry.endpoints.push({ id: `${id}_ep1`, ...row.ep1 });
    if (row.ep2) comp.geometry.endpoints.push({ id: `${id}_ep2`, ...row.ep2 });
    if (row.bp)  comp.geometry.branchPoint = { id: `${id}_bp`, ...row.bp };
    if (row.cp)  comp.geometry.centerPoint = { id: `${id}_cp`, ...row.cp };
    
    // Map attributes
    comp.attributes = {
      bore: row.bore,
      pipelineRef: row.pipelineRef,
      itemCode: row.itemCode,
      description: row.description
    };
    
    doc.components.push(comp);
  });
  
  return doc;
}

export function importPcfxToTableRows(pcfxDoc) {
  const validation = PcfxRules.validateDocument(pcfxDoc);
  if (!validation.isValid) {
    console.warn("PCFX Import Warnings:", validation.warnings);
  }
  
  const rows = [];
  
  if (Array.isArray(pcfxDoc.components)) {
    pcfxDoc.components.forEach((comp, index) => {
      const row = {
        _rowIndex: index + 1,
        entityId: comp.id,
        type: comp.type,
        ...comp.attributes
      };
      
      // Reconstruct geometry
      if (comp.geometry?.endpoints?.length > 0) row.ep1 = comp.geometry.endpoints[0];
      if (comp.geometry?.endpoints?.length > 1) row.ep2 = comp.geometry.endpoints[1];
      if (comp.geometry?.branchPoint) row.bp = comp.geometry.branchPoint;
      if (comp.geometry?.centerPoint) row.cp = comp.geometry.centerPoint;
      
      rows.push(row);
    });
  }
  
  return rows;
}

export async function openPcfxFile() {
  return new Promise((resolve, reject) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.pcfx,.json';
    input.onchange = (e) => {
      const file = e.target.files[0];
      if (!file) {
        reject(new Error("No file selected"));
        return;
      }
      
      const reader = new FileReader();
      reader.onload = (event) => {
        const result = PcfxFileIO.deserialize(event.target.result);
        if (result.ok) {
          resolve(result.data);
        } else {
          reject(new Error(result.error));
        }
      };
      reader.onerror = () => reject(new Error("File read error"));
      reader.readAsText(file);
    };
    input.click();
  });
}