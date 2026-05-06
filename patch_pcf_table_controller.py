import re

file_path = 'js/ui/pcf-table-controller.js'

with open(file_path, 'r') as f:
    content = f.read()

helpers = r"""
    _num(value) {
        const n = parseFloat(String(value ?? '').replace(/[^0-9.+-]/g, ''));
        return Number.isFinite(n) ? n : NaN;
    }

    _getFirstValue(row, keys) {
        for (const key of keys) {
            if (!key) continue;
            const value = row?.[key];
            if (value !== undefined && value !== null && String(value).trim() !== '') {
                return value;
            }
        }
        return '';
    }

    _weightLengthKeys(primaryKey) {
        return [
            primaryKey,
            'Length (RF-F/F)',
            'RF-F/F',
            'RF F/F',
            'RF/RTJ F/F',
            'Face to Face',
            'F-F',
            'F/F',
            'Length',
            'Len',
            'Len_Calc'
        ].filter(Boolean);
    }

    _componentWeightKeywords(component, rigidType) {
        const source = String(rigidType || component || '').toUpperCase();
        if (source.includes('FLANGE') || source === 'F') return ['FLANGE', 'FLG'];
        if (source.includes('VALVE') || source === 'V') return ['VALVE', 'VLV'];
        if (source.includes('ELBOW') || source.includes('BEND') || source === 'E') return ['ELBOW', 'ELB', 'BEND'];
        if (source.includes('TEE') || source === 'T') return ['TEE'];
        if (source.includes('RED') || source.includes('REDUCER')) return ['REDUCER', 'RED'];
        if (source.includes('CAP')) return ['CAP'];
        return source ? [source.split(/[\s_-]/)[0]] : [];
    }

    _findSmartWeightMatch({
        weightMaster,
        component,
        rigidType,
        bore,
        rating,
        length,
        sizeKey,
        ratingKey,
        lengthKey,
        weightKey,
        descKey
    }) {
        const boreNum = this._num(bore);
        const ratingNum = this._num(rating);
        const lengthNum = this._num(length);

        if (!Array.isArray(weightMaster) || !weightMaster.length) return null;
        if (!Number.isFinite(boreNum) || !Number.isFinite(ratingNum) || !Number.isFinite(lengthNum)) return null;

        const keywords = this._componentWeightKeywords(component, rigidType);

        const candidates = weightMaster.filter(r => {
            const desc = String(r?.[descKey] || '').toUpperCase();
            if (keywords.length && !keywords.some(kw => desc.includes(kw))) return false;

            const rRating = this._num(r?.[ratingKey]);
            const rSize = this._num(r?.[sizeKey]);
            const rLength = this._num(this._getFirstValue(r, this._weightLengthKeys(lengthKey)));

            if (!Number.isFinite(rRating) || !Number.isFinite(rSize) || !Number.isFinite(rLength)) return false;

            // Strict matching:
            // Rating must match exactly/near exactly.
            // Size must match Converted Bore / DN.
            // Length must match face-to-face / Len_Calc.
            if (Math.abs(rRating - ratingNum) > 0.1) return false;
            if (Math.abs(rSize - boreNum) > 0.1) return false;
            if (Math.abs(rLength - lengthNum) > 0.1) return false;

            return true;
        });

        if (!candidates.length) return null;

        // If duplicate exact matches exist, use first deterministic row.
        const best = candidates[0];
        const weight = String(best?.[weightKey] ?? '').trim();

        return weight
            ? {
                row: best,
                weight,
                matchCount: candidates.length
            }
            : null;
    }
"""

# Need to escape backslashes if putting into re.sub
content = content.replace('    _fetchRowAttrs(rowIdx) {', helpers.replace('\\', '\\\\') + '\n    _fetchRowAttrs(rowIdx) {')

with open(file_path, 'w') as f:
    f.write(content)
