/**
 * Pcfx_FileIO.js
 * 
 * Handles serialization/deserialization of PCFX JSON structures.
 */

export const PcfxFileIO = {
  serialize: function(pcfxDocument) {
    return JSON.stringify(pcfxDocument, null, 2);
  },
  
  deserialize: function(jsonString) {
    try {
      const doc = JSON.parse(jsonString);
      return { ok: true, data: doc };
    } catch (e) {
      return { ok: false, error: "Invalid JSON format: " + e.message };
    }
  }
};