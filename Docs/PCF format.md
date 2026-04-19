# PCF Output Formatting Rules

This document outlines the specific syntax and formatting rules applied by the PCF Converter Assembler across various piping components.

## General Component Rules
- **Coordinates:** Emitted as `X Y Z` mapped directly from processed geometry (derived from original CSV inputs, scaled/oriented based on `coordinateSettings`).
- **Units:** Appended explicitly to numeric values where applicable (e.g., `MM` for bore, `KG` for weight, `DEG` for angle).
- **Component Attributes:** Common attributes (`CA1`...`CA10`) map variables like Design Pressure, Design Temperature, Material, and Wall Thickness into the component payload if present.
- **Message Square:** Components append `ITEM-DESCRIPTION` and `ITEM-CODE` for ISOGEN BOM rendering based on `msgTemplates` configuration.

## Specific Component Requirements

### PIPE
- **PIPELINE-REFERENCE:** Injected globally as standard, but also appended directly as a property onto every `PIPE` component payload.
- **Bore:** Requires matching Bore at both `END-POINT 1` and `END-POINT 2`. If one is missing or 0, it falls back to the other endpoint's bore, or the component's main `Bore` value.
- **Coordinates:** Emits `END-POINT 1` and `END-POINT 2`.

### BEND / ELBOW
- **SKEY:** Hardcoded `SKEY BEBW` or falls back to mapped default in configuration.
- **BEND-RADIUS:** Required field. If radius is missing or 0, a generic `0 MM` is populated.
- **ANGLE:** Required field. Evaluated from `Angle` property if available, emitted in degrees (`DEG`).
- **Bore Fallback:** Requires bore at EP1, EP2, and CP (Centre Point). All fall back to each other or the main component bore to prevent validation failures.
- **Coordinates:** Emits `END-POINT 1`, `END-POINT 2`, and `CENTRE-POINT`.

### TEE
- **SKEY:** Hardcoded `SKEY TEBW` or maps from default config.
- **Bore Fallback:** Like bends, requires bore at EP1, EP2, CP, and BP (Branch Point). `BP` bore specifically falls back to the component `BranchBore` or main `Bore`.
- **Coordinates:** Emits `END-POINT 1`, `END-POINT 2`, `CENTRE-POINT`, and `BRANCH1-POINT`.

### OLET
- **SKEY:** Hardcoded `SKEY CEBW` or maps from default config.
- **Endpoint Suppression:** Explicitly skips emitting `END-POINT 1` and `END-POINT 2`, regardless of coordinate presence, as OLETs only attach to run pipes via center/branch coordinates.
- **Coordinates:** Emits `CENTRE-POINT` and `BRANCH1-POINT`.

### SUPPORT (Ancillaries)
- **Coordinate Tag:** Uses `CO-ORDS` rather than `END-POINT` or `CENTRE-POINT`.
- **Friction & Gap Mapping Rules:** Complex logic derives the `<SUPPORT_NAME>` and `<SUPPORT_GUID>` attributes based on Restraint configuration.
    - **Block 1 (Friction is Null/Empty or 0.3 AND Gap is Null/Empty):**
        - If Type contains `LIM` and `GUI` -> `TBA`
        - If Type contains `LIM` -> `TBA`
        - If Type contains `GUI` -> `VG100`
        - If Type contains `REST` -> `CA150`
    - **Block 2 (Friction is 0.15):**
        - If Type contains `LIM` and `GUI` -> `TBA`
        - If Type contains `LIM` -> `TBA`
        - If Type contains `GUI` -> `TBA`
        - If Type contains `REST` -> `CA150`
        - If Type contains `DATUM` -> `CA150`
    - **Fallback:** Defaults to `CA150`.
- **UCI String:** The generated GUID string maps to the `<SUPPORT_GUID>` property formatted as `UCI:{NodeName}`.