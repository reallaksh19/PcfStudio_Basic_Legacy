
import { getConfig } from "../config/config-store.js";
import { materialService } from "./material-service.js";

const MOD = "mapping-service";

export const mappingService = {
    /**
     * Resolve Rigid Type based on logic (Length/DN checks).
     */
    resolveRigidType(dn, len, tolerance) {
        const tol = tolerance || 6.0;
        // Logic placeholder - actual logic depends on requirements
        // Returning default or simple mapping
        return { rigidType: "", weight: "" };
    },

    /**
     * Resolve Material/Wall based on Piping Class/DN.
     */
    resolveMaterial(dn, pipingClass) {
        const attrs = materialService.resolveAttributes(pipingClass);
        return {
            material: attrs.materialCode || "",
            wall: attrs.wallThickness || ""
        };
    },

    /**
     * Resolve Support Name based on Restraint Type/Friction/Gap (Block 1/2 Logic).
     * @param {Object} row - The CSV row or Attributes object containing Restraint fields.
     * @returns {string} The resolved Support Name (e.g., "CA150").
     */
    resolveSupportName(row) {
        const config = getConfig();
        const settings = config.supportSettings?.nameRules || {};

        // Helper to get value loosely (handle various keys)
        const getVal = (keys) => {
            if (!Array.isArray(keys)) keys = [keys];
            for (const k of keys) {
                if (row[k] !== undefined) return String(row[k]).trim();
            }
            return "";
        };

        // Extract relevant values
        // "Restraint Type" usually holds the Type (LIM, GUI, etc)
        // "Restraint Friction" -> Friction
        // "Restraint Gap" -> Gap
        const typeStr = getVal(["Restraint Type", "RestraintType", "Type"]).toUpperCase();
        const friction = getVal(["Restraint Friction", "RestraintFriction", "Friction"]);
        const gap = getVal(["Restraint Gap", "RestraintGap", "Gap"]);

        // Match Logic
        const matchCondition = (cond, val) => {
            if (!cond) return true; // No condition
            // val is string. cond is array of strings.
            // Check for equality or "NULL" logic
            const vUpper = val.toUpperCase();
            return cond.some(c => {
                const cUpper = c.toUpperCase();
                if (cUpper === "NULL" || cUpper === "") return vUpper === "" || vUpper === "NULL" || vUpper === "UNDEFINED";
                return vUpper === cUpper;
            });
        };

        const matchMapping = (mappings, typeStr) => {
            // mappings is object: "*LIM*": "TBA", "*LIM*": { contains: ["*GUI*"], val: "TBA" }
            // We iterate keys. If key contains wildcard, we do `includes`.
            for (const [key, target] of Object.entries(mappings)) {
                // Key e.g. "*LIM*"
                const cleanKey = key.replace(/\*/g, ""); // Remove * for simple contains check
                if (typeStr.includes(cleanKey)) {
                    // Check if it's a complex object target
                    if (typeof target === 'object') {
                        // Extra contains check
                        if (target.contains && target.contains.some(c => typeStr.includes(c.replace(/\*/g, "")))) {
                            return target.val;
                        }
                        // If complex check fails, do we skip or fall through?
                        // "process in exact same order top to bottom, once on criteria is met... skip others"
                        // If *LIM* matched, but secondary condition failed, does it count as "criteria met"?
                        // Usually specific rules come first.
                        // I'll assume if complex rule matches, return. If not, continue to next key.
                    } else {
                        return target;
                    }
                }
            }
            return null;
        };

        // Block 1
        if (settings.block1) {
            const c = settings.block1.condition;
            if (matchCondition(c.friction, friction) && matchCondition(c.gap, gap)) {
                const res = matchMapping(settings.block1.mappings, typeStr);
                if (res) return res;
            }
        }

        // Block 2
        if (settings.block2) {
            const c = settings.block2.condition;
            if (matchCondition(c.friction, friction) && matchCondition(c.gap, gap)) {
                const res = matchMapping(settings.block2.mappings, typeStr);
                if (res) return res;
            }
        }

        return settings.fallback || "CA150";
    }
};
