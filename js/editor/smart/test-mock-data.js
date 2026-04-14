/**
 * test-mock-data.js — Mock PCF data with known errors for testing
 */

/**
 * Mock PCF with broken connections (gaps between components)
 */
export const MOCK_PCF_WITH_GAPS = `ISOGEN-FILES
UNITS-MILLIMETERS

PIPE
END-POINT 0 0 0 273
END-POINT 1000 0 0 273
COMPONENT-ATTRIBUTE-PIPE-LENGTH 1000.00

PIPE
END-POINT 1550 0 0 273
END-POINT 2500 0 0 273
COMPONENT-ATTRIBUTE-PIPE-LENGTH 950.00

ELBOW
END-POINT 2500 0 0 273
END-POINT 2500 1000 0 273
COMPONENT-ATTRIBUTE-ANGLE 90

PIPE
END-POINT 2500 1000 0 273
END-POINT 2500 2000 0 273
COMPONENT-ATTRIBUTE-PIPE-LENGTH 1000.00

PIPE
END-POINT 2500 2100 0 273
END-POINT 2500 3000 0 273
COMPONENT-ATTRIBUTE-PIPE-LENGTH 900.00`;

/**
 * Expected data table BEFORE fix
 */
export const EXPECTED_TABLE_BEFORE_FIX = [
    {
        sequence: 1,
        type: 'PIPE',
        startX: 0, startY: 0, startZ: 0,
        endX: 1000, endY: 0, endZ: 0,
        bore: 273,
        length: 1000.00,
        isModified: false
    },
    {
        sequence: 2,
        type: 'PIPE',
        startX: 1550, startY: 0, startZ: 0,  // GAP of 550mm
        endX: 2500, endY: 0, endZ: 0,
        bore: 273,
        length: 950.00,
        isModified: false
    },
    {
        sequence: 3,
        type: 'ELBOW',
        startX: 2500, startY: 0, startZ: 0,
        endX: 2500, endY: 1000, endZ: 0,
        bore: 273,
        isModified: false
    },
    {
        sequence: 4,
        type: 'PIPE',
        startX: 2500, startY: 1000, startZ: 0,
        endX: 2500, endY: 2000, endZ: 0,
        bore: 273,
        length: 1000.00,
        isModified: false
    },
    {
        sequence: 5,
        type: 'PIPE',
        startX: 2500, startY: 2100, startZ: 0,  // GAP of 100mm
        endX: 2500, endY: 3000, endZ: 0,
        bore: 273,
        length: 900.00,
        isModified: false
    }
];

/**
 * Expected issues detected
 */
export const EXPECTED_ISSUES = [
    {
        id: 'BC_0_1',
        type: 'BROKEN_CONNECTION',
        severity: 'ERROR',
        gap: 550.0,
        component1: 'comp-1',  // PIPE ending at 1000
        component2: 'comp-2',  // PIPE starting at 1550
        node1Pos: [1000, 0, 0],
        node2Pos: [1550, 0, 0],
        autoFixable: false,  // Too large for snap
        suggestedFix: 'insertPipe'
    },
    {
        id: 'BC_1_2',
        type: 'BROKEN_CONNECTION',
        severity: 'ERROR',
        gap: 100.0,
        component1: 'comp-4',  // PIPE ending at 2000
        component2: 'comp-5',  // PIPE starting at 2100
        node1Pos: [2500, 2000, 0],
        node2Pos: [2500, 2100, 0],
        autoFixable: false,  // > 6mm tolerance
        suggestedFix: 'insertPipe'
    }
];

/**
 * Expected data table AFTER fix (inserting pipes)
 */
export const EXPECTED_TABLE_AFTER_FIX = [
    {
        sequence: 1,
        type: 'PIPE',
        startX: 0, startY: 0, startZ: 0,
        endX: 1000, endY: 0, endZ: 0,
        bore: 273,
        length: 1000.00,
        isModified: false
    },
    {
        sequence: 2,
        type: 'PIPE',
        startX: 1000, startY: 0, startZ: 0,  // NEW: Gap filler
        endX: 1550, endY: 0, endZ: 0,
        bore: 273,
        length: 550.00,
        isModified: true,
        isGenerated: true
    },
    {
        sequence: 3,
        type: 'PIPE',
        startX: 1550, startY: 0, startZ: 0,
        endX: 2500, endY: 0, endZ: 0,
        bore: 273,
        length: 950.00,
        isModified: false
    },
    {
        sequence: 4,
        type: 'ELBOW',
        startX: 2500, startY: 0, startZ: 0,
        endX: 2500, endY: 1000, endZ: 0,
        bore: 273,
        isModified: false
    },
    {
        sequence: 5,
        type: 'PIPE',
        startX: 2500, startY: 1000, startZ: 0,
        endX: 2500, endY: 2000, endZ: 0,
        bore: 273,
        length: 1000.00,
        isModified: false
    },
    {
        sequence: 6,
        type: 'PIPE',
        startX: 2500, startY: 2000, startZ: 0,  // NEW: Gap filler
        endX: 2500, endY: 2100, endZ: 0,
        bore: 273,
        length: 100.00,
        isModified: true,
        isGenerated: true
    },
    {
        sequence: 7,
        type: 'PIPE',
        startX: 2500, startY: 2100, startZ: 0,
        endX: 2500, endY: 3000, endZ: 0,
        bore: 273,
        length: 900.00,
        isModified: false
    }
];

/**
 * Expected PCF text AFTER fix
 */
export const EXPECTED_PCF_AFTER_FIX = `ISOGEN-FILES
UNITS-MILLIMETERS

PIPE
END-POINT 0.00 0.00 0.00 273
END-POINT 1000.00 0.00 0.00 273
COMPONENT-ATTRIBUTE-PIPE-LENGTH 1000.00

PIPE
END-POINT 1000.00 0.00 0.00 273
END-POINT 1550.00 0.00 0.00 273
COMPONENT-ATTRIBUTE-PIPE-LENGTH 550.00
COMPONENT-ATTRIBUTE-GENERATED true

PIPE
END-POINT 1550.00 0.00 0.00 273
END-POINT 2500.00 0.00 0.00 273
COMPONENT-ATTRIBUTE-PIPE-LENGTH 950.00

ELBOW
END-POINT 2500.00 0.00 0.00 273
END-POINT 2500.00 1000.00 0.00 273
COMPONENT-ATTRIBUTE-ANGLE 90

PIPE
END-POINT 2500.00 1000.00 0.00 273
END-POINT 2500.00 2000.00 0.00 273
COMPONENT-ATTRIBUTE-PIPE-LENGTH 1000.00

PIPE
END-POINT 2500.00 2000.00 0.00 273
END-POINT 2500.00 2100.00 0.00 273
COMPONENT-ATTRIBUTE-PIPE-LENGTH 100.00
COMPONENT-ATTRIBUTE-GENERATED true

PIPE
END-POINT 2500.00 2100.00 0.00 273
END-POINT 2500.00 3000.00 0.00 273
COMPONENT-ATTRIBUTE-PIPE-LENGTH 900.00`;

/**
 * Test runner function
 */
export function runMockTest(validator, fixer, syncEngine) {
    console.log('🧪 Running Mock PCF Test...\n');

    // Step 1: Load mock PCF
    console.log('Step 1: Loading mock PCF with gaps');
    const components = syncEngine.loadFromText(MOCK_PCF_WITH_GAPS);
    console.log(`  ✓ Loaded ${components.length} components\n`);

    // Step 2: Validate
    console.log('Step 2: Running validation');
    const issues = validator.validate({ components });
    console.log(`  ✓ Found ${issues.length} issues`);
    console.log(`  Expected: ${EXPECTED_ISSUES.length} issues\n`);

    // Step 3: Apply fixes
    console.log('Step 3: Applying fixes');
    issues.forEach((issue, idx) => {
        const result = fixer.fixIssue(issue, { components });
        console.log(`  ${result.success ? '✓' : '✗'} Fix ${idx + 1}: ${result.action || result.error}`);
    });
    console.log();

    // Step 4: Generate outputs
    console.log('Step 4: Generating outputs');
    const updatedPCF = syncEngine.toPCFText();
    const updatedTable = syncEngine.toDataTable();
    console.log(`  ✓ PCF text: ${updatedPCF.split('\n').length} lines`);
    console.log(`  ✓ Data table: ${updatedTable.length} rows`);
    console.log(`  Expected: ${EXPECTED_TABLE_AFTER_FIX.length} rows\n`);

    // Step 5: Verify
    console.log('Step 5: Verification');
    const tableSizeMatch = updatedTable.length === EXPECTED_TABLE_AFTER_FIX.length;
    console.log(`  ${tableSizeMatch ? '✓' : '✗'} Table size: ${updatedTable.length} vs ${EXPECTED_TABLE_AFTER_FIX.length}`);

    return { components, issues, updatedPCF, updatedTable, success: tableSizeMatch };
}
