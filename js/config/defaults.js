/**
 * defaults.js — DEFAULT_CONFIG
 * ALL application rules, mappings, thresholds, and PCF syntax live here.
 * Nothing in the app is hardcoded. Every value here has a corresponding
 * editor in the Config Tab.
 * Schema version: used to detect stale localStorage configs.
 */

export const SCHEMA_VERSION = "1.2.2"; // Bumped: added enabledChecks, froze V1/V13

export const DEFAULT_CONFIG = {
  _version: SCHEMA_VERSION,

  // 1. HEADER ALIASES: canonical name → accepted CSV header variants (case-insensitive)
  headerAliases: {
    Sequence: ["sequence", "seq", "no.", "no", "#", "row", "s.no"],
    NodeNo: ["nodeno", "node no", "node_no", "node number", "nd no"],
    NodeName: ["nodename", "node name", "node_name", "support name", "node tag"],
    componentName: ["componentname", "component name", "comp name", "tag", "valve tag", "comp tag", "name"],
    Type: ["type", "comp type", "component type", "comp_type", "category", "component"],
    RefNo: ["refno", "ref no", "ref_no", "reference", "ref", "component ref", "comp ref"],
    Point: ["point", "pt", "point no", "pt no", "point_no"],
    PPoint: ["ppoint", "prev point", "parent point"],
    Bore: ["bore", "nb", "dn", "nominal bore", "size", "bore (mm)", "nb (mm)", "dn (bore)", "o/d", "od", "outside diameter", "outer diameter", "o.d."],
    "O/D": ["o/d", "od", "outside diameter", "outer diameter", "o.d."],
    "Wall Thickness": ["wall thickness", "wt", "wall", "wall thk", "thickness", "wt (mm)", "wall (mm)", "thk"],
    "Corrosion Allowance": ["corrosion allowance", "ca", "corr", "corrosion", "ca (mm)", "c.a.", "ca_mm"],
    Radius: ["radius", "bend radius", "r", "elbow radius", "bend r"],
    SIF: ["sif", "stress intensification", "stress factor"],
    Weight: ["weight", "wt (kg)", "mass", "component weight", "weight (kg)", "wt", "rf/rtj kg"],
    Material: ["material", "mat", "material code", "material spec", "material grade", "spec"],
    Rigid: ["rigid", "fixed", "anchor", "boundary"],
    East: ["east", "x", "e", "x-coord", "easting", "x (mm)", "east (mm)"],
    North: ["north", "y", "n", "y-coord", "northing", "y (mm)", "north (mm)"],
    Up: ["up", "z", "u", "elevation", "z-coord", "el", "up (mm)", "z (mm)", "elev"],
    // Single-Row Format Aliases
    StartX: ["start x", "start_x", "begin x", "x1", "startx"],
    StartY: ["start y", "start_y", "begin y", "y1", "starty"],
    StartZ: ["start z", "start_z", "begin z", "z1", "startz"],
    EndX: ["end x", "end_x", "finish x", "x2", "endx"],
    EndY: ["end y", "end_y", "finish y", "y2", "endy"],
    EndZ: ["end z", "end_z", "finish z", "z2", "endz"],
    Status: ["status", "stat", "flag"],
    Pressure: ["pressure", "pr.", "pr", "design pressure", "p1", "press", "design pr.", "op. pressure"],
    "Restraint Type": ["restraint type", "support type", "rest. type", "vg", "support code", "rest type"],
    "Restraint Stiffness": ["restraint stiffness", "stiffness", "spring k"],
    "Restraint Friction": ["restraint friction", "friction"],
    "Restraint Gap": ["restraint gap", "gap"],
    "Insulation thickness": ["insulation thickness", "insulation", "insul", "insul thickness", "insul thk", "it", "insulation (mm)"],
    "Hydro test pressure": ["hydro test pressure", "hydro", "hydro test", "test pressure", "hp", "hydro pressure"],
    // New mappings
    "Design Temperature": ["temperature", "temp.", "design temp", "design temperature", "operating temperature", "operating temp"],
    "Fluid Density": ["density", "fluid density", "fluid den"],
    "Fluid Phase": ["phase", "fluid phase", "state"],
    "Line Number": ["line no.", "line no", "lineno", "line number", "pipeline ref", "line"],
    "Line No.(Derived)": [], // computed column — not from CSV, derived via lineNoLogic
    "Piping Class": ["piping class", "class", "spec"],
    "Service": ["service", "fluid service"],
    "Description": ["description", "typedesc", "desc"],
    "Length": ["length", "len", "rf-f/f"],
    "Position": ["position", "ps"]
  },

  // 2. UNIT STRIPPING RULES
  unitStripping: {
    Bore: { suffixes: ["mm", "nb", "dn"], type: "number" },
    "O/D": { suffixes: ["mm"], type: "number" },
    "Wall Thickness": { suffixes: ["mm"], type: "number" },
    "Corrosion Allowance": { suffixes: ["mm"], type: "number" },
    Radius: { suffixes: ["mm"], type: "number" },
    Weight: { suffixes: ["kg", "kgs"], type: "number" },
    East: { suffixes: ["mm"], type: "number" },
    North: { suffixes: ["mm"], type: "number" },
    Up: { suffixes: ["mm"], type: "number" },
    StartX: { suffixes: ["mm"], type: "number" },
    StartY: { suffixes: ["mm"], type: "number" },
    StartZ: { suffixes: ["mm"], type: "number" },
    EndX: { suffixes: ["mm"], type: "number" },
    EndY: { suffixes: ["mm"], type: "number" },
    EndZ: { suffixes: ["mm"], type: "number" },
    Pressure: { suffixes: ["kpa", "bar", "psi"], type: "number" },
    "Insulation thickness": { suffixes: ["mm"], type: "number" },
    "Hydro test pressure": { suffixes: ["kpa", "bar"], type: "number" },
  },

  // 2b. PRESSURE RATING MAP: Keyword → Rating value
  // Lookup order: longest keyword first (hardcoded) to avoid false matches
  // (e.g., "1500" must be checked before "150", "15" before "1")
  pressureRatingMap: {
    "10000": 10000,
    "15000": 15000,
    "20000": 20000,
    "2500": 2500,
    "1500": 1500,
    "5000": 5000,
    "900": 900,
    "600": 600,
    "300": 300,
    "200*": 20000,
    "150*": 15000,
    "100*": 10000,
    "150": 150,
  },

  // 2c. RATING PREFIX MAP: piping class prefix → rating
  // Check 2-char prefix first, then 1-char fallback
  ratingPrefixMap: {
    twoChar: { '10': 10000, '20': 20000, '15': 1500, '25': 2500 },
    oneChar: { '1': 150, '3': 300, '6': 600, '9': 900, '5': 5000 }
  },

  // 3. COMPONENT TYPE MAP: CSV Type → PCF keyword
  componentTypeMap: {
    BRAN: "PIPE", ELBO: "BEND", TEE: "TEE", FLAN: "FLANGE",
    VALV: "VALVE", OLET: "OLET", ANCI: "SUPPORT",
    REDC: "REDUCER-CONCENTRIC", REDE: "REDUCER-ECCENTRIC", REDU: "REDUCER-ECCENTRIC",
    GASK: "SKIP", PCOM: "MISC-COMPONENT",
    // Additional type mappings for common variations
    FBLI: "FLANGE",  // Flange blind variation
    BEND: "BEND",    // Direct BEND type (some CSVs use BEND instead of ELBO)
    BLIND: "FLANGE", // Common alias
    PIPE: "PIPE",    // Pass-through for directly injected types
    SUPPORT: "SUPPORT",
    WELD: "WELD",
    INSTRUMENT: "INSTRUMENT"
  },

  // 4. PCF SYNTAX RULES per component keyword
  pcfRules: {
    PIPE: {
      keyword: "PIPE", points: { EP1: "1", EP2: "2" },
      coordinateKeyword: "END-POINT", requiresSKEY: false,
      skeyStyle: "SKEY", defaultSKEY: null, centrePointTokens: 4,
      angleFormat: "degrees", caSlots: ["CA1", "CA2", "CA3", "CA4", "CA5", "CA6", "CA7", "CA9", "CA10"], extraFields: [],
    },
    BEND: {
      keyword: "BEND", points: { EP1: "1", EP2: "2", CP: "0" },
      coordinateKeyword: "END-POINT", requiresSKEY: true,
      skeyStyle: "<SKEY>", defaultSKEY: "BEBW", centrePointTokens: 4,
      angleFormat: "hundredths", caSlots: ["CA1", "CA2", "CA3", "CA4", "CA5", "CA6", "CA7", "CA9", "CA10"], extraFields: ["ANGLE", "BEND-RADIUS"],
    },
    TEE: {
      keyword: "TEE", points: { EP1: "1", EP2: "2", CP: "0", BP: "3" },
      coordinateKeyword: "END-POINT", requiresSKEY: true,
      skeyStyle: "<SKEY>", defaultSKEY: "TEBW", centrePointTokens: 4,
      angleFormat: "degrees", caSlots: ["CA1", "CA2", "CA3", "CA4", "CA5", "CA6", "CA7", "CA9", "CA10"], extraFields: [],
    },
    FLANGE: {
      keyword: "FLANGE", points: { EP1: "1", EP2: "2" },
      coordinateKeyword: "END-POINT", requiresSKEY: true,
      skeyStyle: "<SKEY>", defaultSKEY: "FLWN", centrePointTokens: 4,
      angleFormat: "degrees", caSlots: ["CA1", "CA2", "CA3", "CA4", "CA5", "CA6", "CA7", "CA8", "CA9", "CA10"], extraFields: [],
    },
    VALVE: {
      keyword: "VALVE", points: { EP1: "1", EP2: "2" },
      coordinateKeyword: "END-POINT", requiresSKEY: true,
      skeyStyle: "<SKEY>", defaultSKEY: "VBFL", centrePointTokens: 4,
      angleFormat: "degrees", caSlots: ["CA1", "CA2", "CA3", "CA4", "CA5", "CA6", "CA7", "CA8", "CA9", "CA10"],
      itemDescSource: "componentName", extraFields: [],
    },
    OLET: {
      keyword: "OLET", points: { CP: "0", BP: "3" },
      coordinateKeyword: null, requiresSKEY: true,
      skeyStyle: "<SKEY>", defaultSKEY: "OLWL", centrePointTokens: 4,
      angleFormat: "degrees", caSlots: ["CA1", "CA2", "CA3", "CA4", "CA5", "CA6", "CA7", "CA9", "CA10"], extraFields: [],
      noEndpoints: true // Explicitly instruct assembler to skip END-POINT lines
    },
    "REDUCER-CONCENTRIC": {
      keyword: "REDUCER-CONCENTRIC", points: { EP1: "1", EP2: "2" },
      coordinateKeyword: "END-POINT", requiresSKEY: true,
      skeyStyle: "<SKEY>", defaultSKEY: "RCBW", centrePointTokens: 4,
      angleFormat: "degrees", caSlots: ["CA1", "CA2", "CA3", "CA4", "CA5", "CA6", "CA7", "CA8", "CA9", "CA10"], extraFields: [],
    },
    "REDUCER-ECCENTRIC": {
      keyword: "REDUCER-ECCENTRIC", points: { EP1: "1", EP2: "2" },
      coordinateKeyword: "END-POINT", requiresSKEY: true,
      skeyStyle: "<SKEY>", defaultSKEY: "REBW", flatDirection: "DOWN", centrePointTokens: 4,
      angleFormat: "degrees", caSlots: ["CA1", "CA2", "CA3", "CA4", "CA5", "CA6", "CA7", "CA8", "CA9", "CA10"], extraFields: ["FLAT-DIRECTION"],
    },
    SUPPORT: {
      keyword: "SUPPORT", points: { COORDS: "0" },
      coordinateKeyword: "CO-ORDS", requiresSKEY: false,
      skeyStyle: "SKEY", defaultSKEY: null, centrePointTokens: 4,
      angleFormat: "degrees", caSlots: [],
      supportNameField: "Restraint Type", supportGUIDField: "NodeName",
      extraFields: ["<SUPPORT_NAME>", "<SUPPORT_GUID>"],
    },
    "MISC-COMPONENT": {
      keyword: "MISC-COMPONENT", points: { EP1: "1", EP2: "2" },
      coordinateKeyword: "END-POINT", requiresSKEY: true,
      skeyStyle: "<SKEY>", defaultSKEY: "COMP", centrePointTokens: 4,
      angleFormat: "degrees", caSlots: ["CA1", "CA2", "CA3", "CA4", "CA5", "CA6", "CA7", "CA8", "CA9", "CA10"], extraFields: [],
    },
  },

  // 5. CA ATTRIBUTE DEFINITIONS
  // writeOn: "all-except-support" | string[] of PCF keywords
  // zeroValue: null = write "0 {unit}" | string = write that literal when value is 0
  caDefinitions: {
    CA1: { label: "Design Pressure", csvField: "Pressure", unit: "KPA", default: 700, writeOn: "all-except-support", zeroValue: null },
    CA2: { label: "Design Temp.", csvField: null, unit: "C", default: 120, writeOn: "all-except-support", zeroValue: null },
    CA3: { label: "Material", csvField: "Material", unit: null, default: "106", writeOn: "all-except-support", zeroValue: null },
    CA4: { label: "Wall Thickness", csvField: "Wall Thickness", unit: "MM", default: 9.53, writeOn: "all-except-support", zeroValue: "Undefined MM" },
    CA5: { label: "Insulation Thk", csvField: "Insulation thickness", unit: "MM", default: 0, writeOn: "all-except-support", zeroValue: null },
    CA6: { label: "Insulation Density", csvField: "Insulation Density", unit: "KG/M3", default: 210, writeOn: "all-except-support", zeroValue: null },
    CA7: { label: "Corrosion Allow.", csvField: "Corrosion Allowance", unit: "MM", default: 3, writeOn: "all-except-support", zeroValue: "0 MM" },
    CA8: { label: "Component Weight", csvField: "Weight", unit: "KG", default: 100, writeOn: ["FLANGE", "VALVE", "REDUCER-CONCENTRIC", "REDUCER-ECCENTRIC"], zeroValue: null },
    CA9: { label: "Fluid Density", csvField: "Fluid Density", unit: "KG/M3", default: 1000, writeOn: "all-except-support", zeroValue: null },
    CA10: { label: "Hydro Test Press.", csvField: "Hydro test pressure", unit: "KPA", default: 1500, writeOn: "all-except-support", zeroValue: null },
    CA97: { label: "Ref No.", csvField: "Ref No.", unit: null, default: "", writeOn: "all", zeroValue: null, readonly: true },
    CA98: { label: "CSV Seq No.", csvField: "Seq No.", unit: null, default: "", writeOn: "all", zeroValue: null, readonly: false },
  },

  // 6. MESSAGE-SQUARE TEMPLATES
  msgTemplates: {
    PIPE: "PIPE, {material}, LENGTH={length}MM, {direction}",
    BEND: "BEND, {angle}DEG, RADIUS={radius}, {material}, {direction}",
    TEE: "TEE, {bore}X{branchBore}, {material}, {direction}",
    FLANGE: "FLANGE, {material}, LENGTH={length}MM, {direction}",
    VALVE: "VALV, {componentName}, {material}, LENGTH={length}MM, {direction}",
    OLET: "OLET, {bore}X{branchBore}, {material}",
    "REDUCER-CONCENTRIC": "REDUCER-CONCENTRIC, {bore}X{branchBore}, {material}",
    "REDUCER-ECCENTRIC": "REDUCER-ECCENTRIC, {bore}X{branchBore}, {material}, FLAT={flatDirection}",
    SUPPORT: "SUPPORT, {restraintType}, {nodeName}",
  },

  // 7. ANOMALY DETECTION RULES
  anomalyRules: {
    pressureChangeWithinHeader: { enabled: true, threshold: 0.05, severity: "WARNING", description: "Pressure changed >{threshold}% within same pipeline header" },
    temperatureChangeWithinHeader: { enabled: true, threshold: 5, severity: "INFO", description: "Temperature changed >{threshold}°C within same pipeline header" },
    wallVsBoreRatioAbnormal: { enabled: true, minRatio: 0.01, maxRatio: 0.25, severity: "INFO", description: "Wall/bore ratio outside normal range" },
    boreSizeChangeNoReducer: { enabled: true, severity: "WARNING", description: "Bore changes at non-TEE/REDUCER component" },
    branchBoreExceedsRun: { enabled: true, severity: "WARNING", description: "Branch bore exceeds run bore at TEE" },
    lineNoChangeNoProcessChange: { enabled: true, severity: "INFO", description: "RefNo prefix changed but design parameters unchanged" },
    zeroRadiusOnBend: { enabled: true, severity: "WARNING", description: "BEND has radius=0 — BEND-RADIUS will be missing" },
    insulationGapWithinHeader: { enabled: true, severity: "INFO", description: "Insulation thickness drops from non-zero to zero mid-header" },
  },

  // 8. COORDINATE SETTINGS
  coordinateSettings: {
    pipelineMode: "repair", // 'strict' | 'repair' | 'sequential'
    multiPass: true,        // Enable two-pass refinement in repair mode
    maxSegmentLength: 13100, // Max pipe length before splitting (mm)
    continuityTolerance: 25.0,
    rayShooter: {
      enabled: true,          // Master toggle for Stage 1C ray shooter
      anciConvertMode: "ON",  // ON: Collapse ANCI to 6mm PIPE. OFF: Keep ANCI full length
      maxRayLength: 20000,    // Max ray length in mm (20m default)
      passP3Stage1A: false,   // P3: include gate-collapsed (Stage 1A) rows as candidates (default OFF)
    },
    sequentialMaxGap: 7000, // Max gap to fill in Sequential Mode (mm)
    decimalPlaces: 4,
    flangePcfThickness: 6,  // mm — START flange EP2 is capped to this distance from EP1 in the PCF output
    zeroLengthTolerance: 6,  // mm — pipes/olets shorter than this are dropped from PCF output
    axisMap: { E: "East", N: "North", U: "Up" },
    transform: { enabled: false, offsetE: 0, offsetN: 0, offsetU: 0, scaleE: 1, scaleN: 1, scaleU: 1 },
    // Overlap resolution: detects PIPE components that engulf inner components and splits them.
    // Disable for CSVs that already provide correct pipe spool lengths (no engulfment).
    overlapResolution: {
      enabled: true,   // set false if CSV already has correct pipe spool endpoint coords
      boreTolerance: 10.0,    // mm — max bore difference to consider component "on same run"
      minPipeLength: 10.0,   // mm — minimum gap length to generate a sub-pipe (bridges gasket gaps)
      gapFillEnabled: true,  // fill gaps between consecutive components with synthetic PIPE segments
      minComponentNameLength: 3, // Only strictly enforce name mismatch if len >= this
    },
    common3DLogic: {
      enabled: true, // Master toggle for all cleanup rules
      maxPipeRun: 12000,
      skew3PlaneLimit: 2000,
      skew2PlaneLimit: 3000,
      minPipeSize: 0,
      minComponentSize: 3,
      maxOverlap: 1000,
      maxDiagonalGap: 6000, // Max gap for diagonal connections (indeterminate direction)
    },
    finalPassGapFilling: {
      enabled: true,
      pipeStretchLimit: 25.0,
      immutableStretchLimit: 6.0
    },
    boreRatioSettings: {
      enabled: true,
      minRatio: 0.5,
      maxRatio: 2.0,
      maxGapLength: 1000, // Apply ratio check for gaps <= this length. Larger gaps may force strict match.
    },
    // Sequencer Mode: "Strict" (Prev_F/Next_F) or "Fuzzy" (Topology Snapping)
    sequencerMode: "Fuzzy",
    // Pipeline Mode: 'strict' | 'repair' (default) | 'sequential'
    pipelineMode: "repair", // Corresponds to Fuzzy
    multiPass: false, // Fuzzy Single
    // Smart Editor: Max gap to consider as a "Model Error" (candidate for gap filling)
    modelGapLimit: 15000.0,
    // Sort Skipped and Zero Length components to bottom in Table View / Debug View
    sortSkippedZero: true,
    // Chain-Based PCF Build Order: follow Prev/Next links rather than pure coordinate DFS
    chainBasedOrder: true,
    // Support Configuration
    supportSettings: {
      guidSourceColumn: "NodeName", // Default source for GUID
      nameRules: {
        // Block 1: Friction is Empty/Null/0.3 AND Gap is Empty/Null
        block1: {
          condition: { friction: ["", "NULL", "0.3"], gap: ["", "NULL"] },
          mappings: [
            { condition: "LIM and GUI", val: "TBA" }, // Requires complex parsing logic in Assembler
            { condition: "LIM", val: "TBA" },
            { condition: "GUI", val: "VG100" },
            { condition: "REST", val: "CA150" }
          ]
        },
        // Block 2: Friction is 0.15
        block2: {
          condition: { friction: ["0.15"] },
          mappings: [
            { condition: "LIM and GUI", val: "TBA" },
            { condition: "LIM", val: "TBA" },
            { condition: "GUI", val: "TBA" },
            { condition: "REST", val: "CA150" },
            { condition: "DATUM", val: "CA150" }
          ]
        },
        fallback: "CA150"
      }
    }
  },

  // 9. OUTPUT SETTINGS
  outputSettings: {
    pipelineReference: "PIPELINE-REF",
    pcfCanonicalName: "",   // Prefix for PIPELINE-REFERENCE line (e.g. "PROCESS", "UTILITY")
    projectIdentifier: "P1",
    area: "A1",
    lineEnding: "CRLF",
    fileEncoding: "UTF-8",
    includeMessageSquare: true,
    isogenFile: "ISOGEN.FLS",
    units: { bore: "MM", coords: "MM", weight: "KGS", boltDia: "MM", boltLength: "MM" },
  },

  // 10. INPUT SETTINGS
  inputSettings: {
    headerRowIndex: 0,
    autoDetectDelimiter: true,
    fallbackDelimiter: ",",
    previewRowCount: 30,

    // Streaming Parse — process rows incrementally via PapaParse step mode
    streamingParse: false,        // false = batch (default), true = streaming
    streamingChunkSize: 500,      // rows per UI yield in streaming mode

    // Input Sanitization — clean headers and cell values on import
    sanitize: {
      trimWhitespace: true,       // Trim leading/trailing whitespace from all cells
      stripBOM: true,             // Remove UTF-8 BOM (\uFEFF) from first header
      normalizeUnicode: true,     // Normalize smart quotes, em-dashes, etc.
      collapseSpaces: true,       // Collapse multiple spaces to single space in headers
      lowercaseHeaders: false,    // Force headers to lowercase before alias matching
    },
  },

  // 11. SMART DATA LOGIC (Linelist & Material Integration)
  smartData: {
    autoLoadPipingClassMasters: false, // Default = No
    e3dElevationOffset: 100000,        // mm added to Line Dump "Up" coord to align with component z-coords
    autoLoadWeightsAndMatMap: false, // Default = No
    lineNoLogic: {
      strategy: "token", // 'token' | 'regex' | 'column_lookup'
      tokenDelimiter: "-",
      tokenIndex: 2, // 0-based index
      regexPattern: "([A-Z0-9]+-[0-9]+-[0-9]+[A-Z0-9]*)", // Example regex
      regexGroup: 1,
      lookupColumn: "LineNo_Derived" // For column_lookup strategy
    },
    pipingClassLogic: {
      strategy: "token", // 'token' | 'regex'
      tokenDelimiter: "-",
      tokenIndex: 4, // 0-based; default = 5th segment
      regexPattern: "([0-9]+[A-Z]+[0-9]*)",
      regexGroup: 1
    },
    smartProcessKeywords: {
      P1: ["Design Pressure", "Des Press", "Press", "P1", "Design_P"],
      T1: ["Design Temperature", "Des Temp", "Temp", "T1", "Design_T"],
      InsThk: ["Insulation Thickness", "Ins Thk", "Insul", "Insulation"],
      InsType: ["Insulation Type", "Ins Type", "Insul Type", "Insulation Class", "Insulation Grade"],
      HP: ["Hydro Test Pressure", "Test Press", "Hydro", "HP"],
      PipingClass: ["Piping Class", "Class", "Spec", "Pipe Spec"],
      DensityGas: ["Density (Gas)", "Gas Density", "Rho Gas"],
      DensityLiq: ["Density (Liquid)", "Liq Density", "Density (Liq)", "Rho Liq"],
      DensityMixed: ["Density (Mixed)", "Mixed Density"],
      Phase: ["Phase", "Fluid State", "State"]
    },
    densityLogic: {
      mixedPreference: "Liquid", // 'Liquid' | 'Mixed'
      defaultLiquid: 1000,       // Default if Liquid is null/0
      defaultGas: 1.2
    }
  },

  // 12. VALIDATOR RULE ENABLE/DISABLE FLAGS
  // false = rule is FROZEN and must not be used for auto-fix or acceptance decisions.
  // Reason is documented inline. Do NOT re-enable without a full rule rewrite.
  enabledChecks: {
    V1:  false, // FROZEN — current impl invents geometry (assigns fixingAction on zero-coord).
                //          Zero (0,0,0) must be flagged only; geometry must never be synthesised
                //          inside a validator. Violates Core Doctrine 1 (Native Topology Preservation).
    V13: false, // FROZEN — wrong semantic layer. Spec §12 bore=0 rule applies at CO-ORDS emission
                //          time only. Validating datatable row.bore against 0 is incorrect;
                //          the datatable bore reflects actual pipe bore at the support location.
  },
};
