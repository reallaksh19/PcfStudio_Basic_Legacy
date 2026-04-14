# Expected Data Table Output with "Fixing Action" Column

## Before Running Fixes

| Seq | Type  | Start          | End            | Length | Bore | Fixing Action |
|-----|-------|----------------|----------------|--------|------|---------------|
| 1   | PIPE  | 0,0,0          | 1000,0,0       | 1000   | 273  | **INSERT PIPE: Fill 550.00mm gap**<br>New component: PIPE<br>EP1: (1000.00, 0.00, 0.00)<br>EP2: (1550.00, 0.00, 0.00)<br>Length: 550.00mm, Bore: 273.00mm |
| 2   | PIPE  | 1550,0,0       | 2500,0,0       | 950    | 273  | **INSERT PIPE: Fill 550.00mm gap**<br>New component: PIPE<br>EP1: (1000.00, 0.00, 0.00)<br>EP2: (1550.00, 0.00, 0.00)<br>Length: 550.00mm, Bore: 273.00mm |
| 3   | ELBOW | 2500,0,0       | 2500,1000,0    | 1000   | 273  | _(no action)_ |
| 4   | PIPE  | 2500,1000,0    | 2500,2000,0    | 1000   | 273  | **INSERT PIPE: Fill 100.00mm gap**<br>New component: PIPE<br>EP1: (2500.00, 2000.00, 0.00)<br>EP2: (2500.00, 2100.00, 0.00)<br>Length: 100.00mm, Bore: 273.00mm |
| 5   | PIPE  | 2500,2100,0    | 2500,3000,0    | 900    | 273  | **INSERT PIPE: Fill 100.00mm gap**<br>New component: PIPE<br>EP1: (2500.00, 2000.00, 0.00)<br>EP2: (2500.00, 2100.00, 0.00)<br>Length: 100.00mm, Bore: 273.00mm |

---

## After Applying All Fixes

| Seq | Type  | Start          | End            | Length | Bore | Fixing Action | Modified |
|-----|-------|----------------|----------------|--------|------|---------------|----------|
| 1   | PIPE  | 0,0,0          | 1000,0,0       | 1000   | 273  | _(cleared)_   | ⬜ |
| 2   | PIPE  | 1000,0,0       | 1550,0,0       | 550    | 273  | _(cleared)_   | ✅ GENERATED |
| 3   | PIPE  | 1550,0,0       | 2500,0,0       | 950    | 273  | _(cleared)_   | ⬜ |
| 4   | ELBOW | 2500,0,0       | 2500,1000,0    | 1000   | 273  | _(cleared)_   | ⬜ |
| 5   | PIPE  | 2500,1000,0    | 2500,2000,0    | 1000   | 273  | _(cleared)_   | ⬜ |
| 6   | PIPE  | 2500,2000,0    | 2500,2100,0    | 100    | 273  | _(cleared)_   | ✅ GENERATED |
| 7   | PIPE  | 2500,2100,0    | 2500,3000,0    | 900    | 273  | _(cleared)_   | ⬜ |

---

## Example Fixing Action Descriptions

### Scenario 1: Small Gap (≤ 6mm) - SNAP
```
SNAP: Merge endpoints to midpoint
  PIPE EP2: Move 3.50mm → (1001.75, 0.00, 0.00)
  PIPE EP1: Move 3.50mm → (1001.75, 0.00, 0.00)
```

### Scenario 2: Medium Gap (> 6mm, ≤ 2×bore) - INSERT PIPE
```
INSERT PIPE: Fill 550.00mm gap
  New component: PIPE
  EP1: (1000.00, 0.00, 0.00)
  EP2: (1550.00, 0.00, 0.00)
  Length: 550.00mm, Bore: 273.00mm
```

### Scenario 3: Large Gap (> 2×bore) - FILL GAP
```
FILL GAP: Insert connector for 5000.00mm gap
  Gap exceeds 2×bore threshold
  From: (1000.00, 0.00, 0.00)
  To: (6000.00, 0.00, 0.00)
```

### Scenario 4: Overlap (same bore) - TRIM
```
TRIM: Reduce PIPE by 25.50mm
  Endpoint 2: Move to intersection
  New coord: (1500.00, 0.00, 0.00)
  Overlap with PIPE resolved
```

### Scenario 5: Overlap (different bore) - REVIEW
```
REVIEW REQUIRED: 15.20mm overlap detected
  PIPE (bore 273mm)
  PIPE (bore 219mm)
  Different bores - manual review needed
```

### Scenario 6: Direction Change - INSERT ELBOW
```
INSERT ELBOW: Direction change at (2500.00, 0.00, 0.00)
  Create intermediate node
  Add 2 PIPE segments
  Total length: 1500.00mm
```

---

## How to Read Fixing Action Column

The "Fixing Action" column tells you:

1. **What will happen** - SNAP, INSERT, FILL, TRIM, REVIEW
2. **Which component(s)** are affected
3. **Exact coordinates** of changes
4. **Measurements** - distances, lengths, bores

This lets you **review before applying** fixes, and provides a clear audit trail of what was done.

---

## Usage in Data Table UI

```javascript
// In data table renderer
function renderFixingActionCell(row) {
    if (!row.fixingAction) {
        return '<td class="fixing-action">—</td>';
    }

    return `<td class="fixing-action" style="white-space: pre-wrap; font-family: monospace; font-size: 0.75rem; max-width: 300px;">
        ${escapeHtml(row.fixingAction)}
    </td>`;
}
```

The column should be:
- **Monospace font** for alignment
- **Pre-wrap** to preserve line breaks
- **Max-width** to prevent table stretching
- **Tooltip** on hover for full text
