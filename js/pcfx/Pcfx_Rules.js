/**
 * Pcfx_Rules.js
 * 
 * Defines validation rules and semantic checks for PCFX documents.
 */

export const PcfxRules = {
  validateDocument: function(doc) {
    const warnings = [];
    
    if (!doc.header || !doc.header.version) {
      warnings.push("Missing document header or version.");
    }
    
    if (!Array.isArray(doc.components)) {
      warnings.push("Document 'components' must be an array.");
    } else {
      const ids = new Set();
      doc.components.forEach(comp => {
        if (!comp.id) {
          warnings.push("Component missing required 'id'.");
        } else if (ids.has(comp.id)) {
          warnings.push(`Duplicate component ID found: ${comp.id}`);
        } else {
          ids.add(comp.id);
        }
      });
    }
    
    return {
      isValid: warnings.length === 0,
      warnings: warnings
    };
  }
};