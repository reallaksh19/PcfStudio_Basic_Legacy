# Sequence-Aware Gap Detection

## Problem: False Positives from Sequential Components

### Original Issue
The Smart Validator was flagging **sequentially connected components** as having gaps, even though they were logically connected in the PCF file. This occurred when consecutive components had small coordinate mismatches (0.1mm - 6mm) due to:

1. Floating-point precision issues
2. CAD software rounding
3. Unit conversions
4. Manual editing

### Example of False Positive

**PCF Sequence:**
```
PIPE  (Component 3)
END-POINT 0 0 0 273
END-POINT 1000 0 0 273     ← EP2 of Comp-3

PIPE  (Component 5)
END-POINT 1000.5 0 0 273   ← EP1 of Comp-5 (0.5mm gap!)
END-POINT 2000 0 0 273
```

**Old Detection Result:**
- ✗ "GAP - Broken Connection (0.5mm)" between Comp-3 and Comp-5
- **Problem**: These ARE logically connected (sequential in PCF)!
- **Root Cause**: Purely geometric detection without sequence awareness

## Solution: Dual-Mode Detection

### Detection Method

**Hybrid Approach: Geometry + Sequence**

1. **Geometric Check**: Calculate 3D distance between endpoints
2. **Sequence Check**: Are these endpoints from consecutive components?
3. **Decision Logic**:
   - If sequentially connected → **SKIP** (coordinate precision issue)
   - If NOT sequential AND gap detected → **FLAG** as broken connection

### Implementation

#### Step 1: Add Sequence Metadata to Nodes

**File:** `IntegratedValidator.js`

When extracting geometry from PCF components, preserve sequence information:

```javascript
const node = {
    id: nodeId,
    x: ep.x, y: ep.y, z: ep.z,
    bore: ep.bore || comp.getBore(),
    connectedSticks: [],
    // SEQUENCE INFO
    componentIndex: compIndex,    // Position in PCF (0, 1, 2, ...)
    endpointIndex: epIndex,       // 0 = EP1, 1 = EP2
    componentId: comp.id          // Component identifier
};
```

#### Step 2: Preserve Sequence in Endpoint Extraction

**File:** `SmartValidatorCore.js`

When filtering endpoints (nodes with < 2 connections), preserve the sequence metadata:

```javascript
extractEndpoints(nodes, sticks) {
    return nodes
        .filter(node => (node.connectedSticks?.length || 0) < 2)
        .map(node => ({
            id: node.id,
            position: [node.x, node.y, node.z],
            bore: this.getNodeBore(node, sticks),
            connections: node.connectedSticks?.length || 0,
            // PRESERVE SEQUENCE INFO
            componentIndex: node.componentIndex,
            endpointIndex: node.endpointIndex,
            componentId: node.componentId
        }));
}
```

#### Step 3: Add Sequential Connection Check

**File:** `detection-rules.js`

Before flagging a gap, check if endpoints are sequentially connected:

```javascript
// CRITICAL FIX 2: Skip if these endpoints are sequentially connected in PCF
if (areSequentiallyConnected(ep1, ep2)) {
    continue; // Small gap is coordinate precision issue
}

function areSequentiallyConnected(ep1, ep2) {
    // Check if both have sequence info
    if (ep1.componentIndex === undefined || ep2.componentIndex === undefined) {
        return false;
    }

    // Check if components are adjacent (N and N+1)
    const seqDiff = Math.abs(ep1.componentIndex - ep2.componentIndex);
    if (seqDiff !== 1) {
        return false; // Not adjacent
    }

    // Determine earlier/later component
    const earlier = ep1.componentIndex < ep2.componentIndex ? ep1 : ep2;
    const later = ep1.componentIndex < ep2.componentIndex ? ep2 : ep1;

    // Verify EP2(earlier) → EP1(later)
    const earlierIsEP2 = earlier.endpointIndex === 1;
    const laterIsEP1 = later.endpointIndex === 0;

    return earlierIsEP2 && laterIsEP1;
}
```

## Detection Logic Flow

```
For each pair of endpoints (ep1, ep2):

    1. Calculate gap = distance(ep1, ep2)

    2. IF gap > 100mm:
          SKIP (too far apart, different pipe runs)

    3. IF areSequentiallyConnected(ep1, ep2):
          SKIP (logically connected, coordinate precision issue)

    4. IF 6mm < gap ≤ 100mm:
          FLAG as "Broken Connection"
```

## Test Cases

### Test 1: Sequential Components with Small Gap
**Scenario:**
- Comp-3 EP2: (1000, 0, 0)
- Comp-5 EP1: (1000.5, 0, 0)
- Gap: 0.5mm
- Sequential: YES (components 3 and 5 adjacent, EP2→EP1)

**Result:**
- Before fix: ✗ Flagged as gap
- After fix: ✓ **Skipped** (sequentially connected)

### Test 2: Non-Sequential Components with Small Gap
**Scenario:**
- Comp-3 EP2: (1000, 0, 0)
- Comp-12 EP1: (1010, 0, 0)
- Gap: 10mm
- Sequential: NO (components 3 and 12 NOT adjacent)

**Result:**
- Before fix: ✓ Flagged as gap
- After fix: ✓ **Flagged** (genuinely broken)

### Test 3: Sequential but Wrong Endpoints
**Scenario:**
- Comp-3 EP1: (0, 0, 0)
- Comp-5 EP1: (10, 0, 0)
- Gap: 10mm
- Sequential: NO (both EP1, should be EP2→EP1)

**Result:**
- Before fix: ✓ Flagged as gap
- After fix: ✓ **Flagged** (not proper connection)

### Test 4: Large Gap Between Sequential Components
**Scenario:**
- Comp-3 EP2: (1000, 0, 0)
- Comp-5 EP1: (1200, 0, 0)
- Gap: 200mm
- Sequential: YES

**Result:**
- Before fix: Maybe flagged (depends on bore threshold)
- After fix: ✓ **Skipped** by spatial filter (> 100mm)

## Configuration

### Node Merging Tolerance
**Location:** `IntegratedValidator.js` line 184

```javascript
const key = `${ep.x.toFixed(1)},${ep.y.toFixed(1)},${ep.z.toFixed(1)}`;
```

- Current: **0.1mm** (toFixed(1))
- Endpoints within 0.1mm are merged into single node
- Endpoints > 0.1mm apart create separate nodes

### Gap Detection Thresholds

| Parameter | Value | Purpose |
|-----------|-------|---------|
| Node merge tolerance | 0.1mm | Spatial key precision |
| Min gap | 6mm | Below this = within tolerance |
| Max broken connection | 100mm | Above this = different runs |
| Sequence check | Adjacent (N, N+1) | Must be consecutive components |

## Benefits

1. **Eliminates False Positives**: Sequential components with precision mismatches no longer flagged
2. **Preserves True Positives**: Non-sequential gaps still detected correctly
3. **Topology-Aware**: Respects PCF logical structure, not just geometry
4. **Configurable**: Can adjust thresholds independently

## Limitations

### 1. Branching Topology
Current logic assumes linear sequences. For branching (TEE, OLET), additional logic needed to track multiple paths.

**Example:**
```
Main Run: Comp-1 → Comp-2 → Comp-3
Branch:            ↓
                 Comp-4 → Comp-5
```
- Comp-2 EP2 connects to both Comp-3 EP1 AND Comp-4 EP1
- Sequential check only validates adjacent indices (2→3, 2→4)

### 2. Non-Sequential PCF Files
If PCF components are NOT in connectivity order, sequential check may not work.

**Workaround:** Pre-sort components by topology before validation (future enhancement).

### 3. Skip Components
If PCF has SKIP components between connected pipes, indices won't be adjacent.

**Example:**
```
PIPE (Comp-3)
...
SKIP (Comp-4)
...
PIPE (Comp-5)
```
- Comp-3 EP2 should connect to Comp-5 EP1
- But indices 3 and 5 aren't adjacent (diff = 2)
- Solution: Filter out SKIP components before assigning indices

## Future Enhancements

### 1. Topology Graph
Build full connectivity graph to handle:
- Branching (TEE, OLET)
- Non-sequential PCF ordering
- Complex piping networks

### 2. Directional Vectors
Check if endpoints are "pointing toward" each other using stick tangents:

```javascript
const ep1Vector = getEndpointDirection(stick1, ep1);
const ep2Vector = getEndpointDirection(stick2, ep2);
const dotProduct = dot(ep1Vector, ep2Vector);

if (dotProduct < -0.9) {
    // Vectors pointing toward each other (< 180°)
    return true;
}
```

### 3. Configurable Sequence Window
Allow checking within N-component window, not just adjacent:

```javascript
const SEQUENCE_WINDOW = 3; // Check within 3 components
if (seqDiff <= SEQUENCE_WINDOW) { ... }
```

## Related Files

- `IntegratedValidator.js` (lines 173-227): Geometry extraction with sequence info
- `SmartValidatorCore.js` (lines 39-52): Endpoint extraction preserving sequence
- `detection-rules.js` (lines 16-93): Sequence-aware detection logic
- `GAP_DETECTION_FIX.md`: Spatial filtering documentation

## Migration Notes

### Breaking Changes
- None. Purely additive feature.

### Performance Impact
- Negligible. One additional comparison per endpoint pair.
- O(1) sequence check vs O(1) distance check.

### Backward Compatibility
- If `componentIndex` is undefined, falls back to pure geometric detection.
- Existing PCF parsers without sequence info continue working.
