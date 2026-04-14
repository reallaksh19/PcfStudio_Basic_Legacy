/**
 * pcf-models.js — PCF Data Structure Models
 * Defines canonical data structures for PCF components
 */

/**
 * PCF Component Model
 */
export class PCFComponent {
    constructor(data = {}) {
        this.id = data.id || `comp-${Date.now()}`;
        this.sequence = data.sequence || 0;
        this.type = data.type || 'PIPE';
        this.endpoints = data.endpoints || [];  // Array of {x, y, z, bore}
        this.attributes = data.attributes || {};
        this.isModified = data.isModified || false;
        this.isGenerated = data.isGenerated || false;
    }

    /**
     * Get primary endpoint (first endpoint)
     */
    getStartPoint() {
        return this.endpoints[0] || null;
    }

    /**
     * Get secondary endpoint (last endpoint)
     */
    getEndPoint() {
        return this.endpoints[this.endpoints.length - 1] || null;
    }

    /**
     * Calculate component length
     */
    getLength() {
        if (this.endpoints.length < 2) return 0;
        const start = this.getStartPoint();
        const end = this.getEndPoint();
        return Math.sqrt(
            Math.pow(end.x - start.x, 2) +
            Math.pow(end.y - start.y, 2) +
            Math.pow(end.z - start.z, 2)
        );
    }

    /**
     * Get bore diameter
     */
    getBore() {
        const ep = this.getStartPoint();
        return ep?.bore || this.attributes.BORE || 100;
    }

    /**
     * Convert to PCF text format
     */
    toPCFText() {
        const lines = [this.type];

        // Add endpoints
        this.endpoints.forEach(ep => {
            lines.push(`END-POINT ${ep.x.toFixed(2)} ${ep.y.toFixed(2)} ${ep.z.toFixed(2)} ${ep.bore || this.getBore()}`);
        });

        // Add attributes
        Object.entries(this.attributes).forEach(([key, value]) => {
            lines.push(`COMPONENT-ATTRIBUTE-${key} ${value}`);
        });

        return lines.join('\n');
    }

    /**
     * Convert to data table row
     */
    toTableRow() {
        const start = this.getStartPoint();
        const end = this.getEndPoint();

        return {
            sequence: this.sequence,
            type: this.type,
            startX: start?.x || 0,
            startY: start?.y || 0,
            startZ: start?.z || 0,
            endX: end?.x || 0,
            endY: end?.y || 0,
            endZ: end?.z || 0,
            bore: this.getBore(),
            length: this.getLength(),
            attributes: { ...this.attributes },
            isModified: this.isModified,
            fixingAction: this.fixingAction || ''  // NEW: Fixing action description
        };
    }

    /**
     * Create from parsed PCF component
     */
    static fromParsedComponent(parsed) {
        const endpoints = [];

        // Extract endpoints from points array or object
        if (Array.isArray(parsed.points)) {
            endpoints.push(...parsed.points.map(p => ({
                x: p.x || 0,
                y: p.y || 0,
                z: p.z || 0,
                bore: p.bore || parsed.bore || 100
            })));
        }

        return new PCFComponent({
            id: parsed.id,
            type: parsed.type,
            endpoints,
            attributes: parsed.attributes || {},
            isModified: false
        });
    }
}

/**
 * Data Table Row Model
 */
export class DataTableRow {
    constructor(component) {
        Object.assign(this, component.toTableRow());
    }

    /**
     * Convert back to PCF component
     */
    toComponent() {
        return new PCFComponent({
            sequence: this.sequence,
            type: this.type,
            endpoints: [
                { x: this.startX, y: this.startY, z: this.startZ, bore: this.bore },
                { x: this.endX, y: this.endY, z: this.endZ, bore: this.bore }
            ],
            attributes: { ...this.attributes },
            isModified: this.isModified
        });
    }
}
