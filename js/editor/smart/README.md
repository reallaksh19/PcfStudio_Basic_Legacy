# Smart Validator & Fixer Engine

**Plug-and-Play Geometry Validation System for PCF 3D Viewer**

## 📦 Module Structure

```
js/editor/smart/
├── index.js                    # Main export (use this!)
├── validator-config.js         # Configuration (< 70 lines)
├── geometry-utils.js          # Pure geometry functions (< 100 lines)
├── detection-rules.js         # Detection rules (< 95 lines)
├── SmartValidatorCore.js      # Validator orchestrator (< 80 lines)
├── fixer-strategies.js        # Fix strategies (< 100 lines)
├── SmartFixerCore.js          # Fixer orchestrator (< 95 lines)
├── ValidatorPanel.js          # Vanilla JS UI (< 100 lines)
├── pcf-rebuilder.js           # PCF rebuilder (< 95 lines)
└── README.md                   # This file
```

## 🚀 Quick Start

### Basic Usage

```javascript
import { createSmartValidator } from './js/editor/smart/index.js';

// Create validator with default config
const { validator, fixer } = createSmartValidator();

// Validate geometry
const issues = validator.validate({ nodes, sticks });
console.log(`Found ${issues.length} issues`);

// Auto-fix an issue
if (issues[0]?.autoFixable) {
    const result = fixer.fixIssue(issues[0], { nodes, sticks });
    console.log(result.success ? 'Fixed!' : result.error);
}
```

### With UI Panel

```javascript
import { ValidatorPanel } from './js/editor/smart/index.js';
import { useEditorStore } from './js/editor/store.js';

// Initialize UI panel
const panel = new ValidatorPanel('container-id', useEditorStore);
```

### Custom Configuration

```javascript
import { createSmartValidator, VALIDATOR_CONFIG } from './js/editor/smart/index.js';

const validator = createSmartValidator({
    tolerance: 10.0,  // Custom tolerance
    brokenConnection: {
        enabled: true,
        maxGapMultiplier: 3.0  // Increase detection range
    },
    visual: {
        errorColor: '#ff0000'
    }
});
```

## 🔧 Configuration Options

```javascript
VALIDATOR_CONFIG = {
    tolerance: 6.0,  // Base tolerance (mm)

    brokenConnection: {
        enabled: true,
        minGap: 6.0,
        maxGapMultiplier: 2.0,
        severity: 'ERROR',
        autoFixable: true
    },

    modelError: {
        enabled: true,
        minGapMultiplier: 2.0,
        maxGap: 15000,
        severity: 'WARNING',
        autoFixable: false
    },

    overlap: {
        enabled: true,
        minOverlap: 6.0,
        severity: 'ERROR',
        autoFixable: true,
        boreTolerance: 1.0
    },

    fixer: {
        maxSkewLength: 12500,
        snapThreshold: 6.0,
        oletOffsetMultiplier: 2.0,
        boreTolerance: 1.0
    },

    visual: {
        errorColor: '#ff3366',
        warningColor: '#ffaa00',
        infoColor: '#00aaff',
        focusColor: '#00ff00',
        highlightOpacity: 0.5
    }
}
```

## 📋 Detection Rules

### Rule 1: Broken Connections
**Detects:** `tolerance < gap <= 2 * bore`
**Action:** Connect nodes (snap or insert PIPE)
**Auto-fix:** Yes (if gap <= tolerance and bores match)

### Rule 2: Model Errors (Open Ends)
**Detects:** `2 * bore < gap <= 15000mm`
**Action:** Gap filling with appropriate component
**Auto-fix:** Yes (if gap <= tolerance)

### Rule 3: Overlaps
**Detects:** Components intersecting (gap < 0)
**Action:** Trim overlap at intersection point
**Auto-fix:** Yes (if bores match within tolerance)

## 🛠️ Fix Strategies

### Snap Nodes
Moves two nodes to their midpoint
- Used when gap <= tolerance
- Checks bore compatibility

### Insert PIPE
Creates new PIPE component between nodes
- Used for same-direction gaps
- Validates skew length < 12500mm

### Insert ELBOW
Creates ELBOW at direction change
- Calculates position on major axis
- Creates intermediate node + 2 PIPEs

### Trim Overlap
Moves closest node to intersection point
- Only for same-bore overlaps
- Finds nearest node to intersection

## 🎨 UI Features

### Validator Panel
- **Run Validation** - Scan geometry for issues
- **Filter by Severity** - ERROR / WARNING / INFO
- **Focus Issue** - Camera animates to issue location
- **Auto-Fix** - One-click fix for fixable issues
- **Statistics** - Real-time issue counts

### Visual Feedback
- Color-coded severity (Error: Red, Warning: Orange)
- 3D highlight on focus
- Camera animation to issue location
- Persistent highlight during review

## 📊 Data Flow

```
┌─────────────────┐
│  3D Viewer Tab  │
└────────┬────────┘
         │
    ┌────▼────────────────┐
    │  ValidatorPanel     │
    │  - Run validation   │
    │  - Display issues   │
    │  - Handle fixes     │
    └────┬────────────────┘
         │
    ┌────▼──────────────────────────┐
    │  SmartValidatorCore           │
    │  ├─ detectBrokenConnections   │
    │  ├─ detectModelErrors         │
    │  └─ detectOverlaps            │
    └────┬──────────────────────────┘
         │
    ┌────▼──────────────────────┐
    │  SmartFixerCore           │
    │  ├─ snapNodes             │
    │  ├─ insertPipe            │
    │  ├─ insertElbow           │
    │  └─ trimOverlap           │
    └────┬──────────────────────┘
         │
    ┌────▼─────────────┐      ┌──────────────┐
    │  Editor Store    │─────→│  Data Table  │
    │  (Zustand)       │      │  (Auto-sync) │
    └──────────────────┘      └──────────────┘
```

## 🔌 Integration Points

### Existing Modules
- ✅ `js/editor/store.js` - Zustand store (updated)
- ✅ `js/ui/viewer-tab.js` - Viewer UI (updated)
- ✅ `js/viewer/viewer-3d.js` - 3D renderer (no changes)
- ✅ `js/viewer/pcf-parser.js` - Parser (no changes)

### New Exports in Store
```javascript
// store.js now exports:
- updateNode(nodeId, updates)
- updateStick(stickId, updates)
- rebuildFromGeometry()
```

## 🧪 Testing

```javascript
// Test validator
const validator = new SmartValidatorCore();
const testData = {
    nodes: [
        { id: 'n1', x: 0, y: 0, z: 0, connectedSticks: ['s1'] },
        { id: 'n2', x: 100, y: 0, z: 0, connectedSticks: [] }  // Open end
    ],
    sticks: [
        { id: 's1', connectedNodes: ['n1'], data: { bore: 100 } }
    ]
};

const issues = validator.validate(testData);
console.log(issues);  // Should detect open end
```

## 📝 API Reference

### SmartValidatorCore
- `validate(data)` - Main validation entry point
- `setConfig(config)` - Update configuration
- `getConfig()` - Get current configuration

### SmartFixerCore
- `fixIssue(issue, data)` - Fix single issue
- `getModifications()` - Get all modifications made
- `clearModifications()` - Clear modification history

### ValidatorPanel
- `render()` - Render UI
- `runValidation()` - Trigger validation
- `filterIssues(filter)` - Filter by severity
- `focusIssue(issue)` - Focus camera on issue
- `fixIssue(issue)` - Apply fix

## 🎯 Usage in Other Apps

This module is **fully independent** and can be used in any app:

```javascript
// 1. Copy the smart/ folder
// 2. Import in your app
import { createSmartValidator } from './smart/index.js';

// 3. Use with your data structure
const validator = createSmartValidator({ tolerance: 10 });
const issues = validator.validate(yourData);
```

**Requirements:**
- THREE.js library
- Data structure: `{ nodes: Array, sticks: Array }`
- Node format: `{ id, x, y, z, connectedSticks: [] }`
- Stick format: `{ id, connectedNodes: [], data: { bore } }`

## 📄 License

Part of PCF Converter App - Internal Use
