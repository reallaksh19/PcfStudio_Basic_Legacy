/**
 * Pcfx_Core.js
 * 
 * Defines the core structure of a .pcfx document.
 * This structure corresponds exactly to the PCFX Interchange Format Spec.
 */

export function createEmptyPcfxDocument() {
  return {
    _schemaRef: "https://pcfx-standard.org/schema/v1.json",
    header: {
      version: "1.0",
      generatedBy: "PCF-Studio",
      generatedAt: new Date().toISOString(),
      sourceSystem: "Unknown",
      pcfType: "Fabrication",
      units: {
        bore: "INCH",
        coordinate: "MM",
        weight: "KGS"
      }
    },
    pipeline: {
      references: [],
      revision: "0",
      materials: []
    },
    components: [],
    welds: [],
    materials: [],
    supports: []
  };
}

export function createComponentNode(id, type) {
  return {
    id: id,
    type: type,
    geometry: {
      endpoints: [],
      centerPoint: null,
      branchPoint: null
    },
    attributes: {},
    flowDirection: "UNKNOWN",
    isImplied: false
  };
}

export function createWeldNode(id) {
  return {
    id: id,
    type: "WELD",
    coordinates: null,
    attributes: {}
  };
}