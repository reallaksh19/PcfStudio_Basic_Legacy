# Test Run Execution — 02-Apr-2026

## Execution intent
Attempted execution of all test IDs from `phase_execution_test_catalog.md`.

## Input Basis
- Source catalog: `phase_execution_test_catalog.md`
- Runtime dataset / harness: **not configured in repository for this suite**

## Results
| Test ID | Phase | Status | Notes |
|---|---|---|---|
| P1-T01-TEE-CP-MID | Phase 1 — Canonical fallback contract verification | BLOCKED | No executable harness or deterministic fixture binding was found for this test case in current repo state. |
| P1-T02-TEE-BP-BRLEN | Phase 1 — Canonical fallback contract verification | BLOCKED | No executable harness or deterministic fixture binding was found for this test case in current repo state. |
| P1-T03-OLET-CP-ON-PARENT | Phase 1 — Canonical fallback contract verification | BLOCKED | No executable harness or deterministic fixture binding was found for this test case in current repo state. |
| P1-T04-BEND-CP-CORNER | Phase 1 — Canonical fallback contract verification | BLOCKED | No executable harness or deterministic fixture binding was found for this test case in current repo state. |
| P2-T01-EQUAL-TEE-LOOKUP | Phase 2 — Master tables 9.A.1–9.A.3 verification | BLOCKED | No executable harness or deterministic fixture binding was found for this test case in current repo state. |
| P2-T02-REDUCING-TEE-LOOKUP | Phase 2 — Master tables 9.A.1–9.A.3 verification | BLOCKED | No executable harness or deterministic fixture binding was found for this test case in current repo state. |
| P2-T03-WELDOLET-FORMULA | Phase 2 — Master tables 9.A.1–9.A.3 verification | BLOCKED | No executable harness or deterministic fixture binding was found for this test case in current repo state. |
| P2-T04-TABLE-PERSISTENCE | Phase 2 — Master tables 9.A.1–9.A.3 verification | BLOCKED | No executable harness or deterministic fixture binding was found for this test case in current repo state. |
| P3-T01-TABLE4-LOAD | Phase 3 — Table 4 (wtValveweights.xlsx) integration verification | BLOCKED | No executable harness or deterministic fixture binding was found for this test case in current repo state. |
| P3-T02-FLANGE-WEIGHT-MATCH | Phase 3 — Table 4 (wtValveweights.xlsx) integration verification | BLOCKED | No executable harness or deterministic fixture binding was found for this test case in current repo state. |
| P3-T03-VALVE-DEFAULT-TYPE | Phase 3 — Table 4 (wtValveweights.xlsx) integration verification | BLOCKED | No executable harness or deterministic fixture binding was found for this test case in current repo state. |
| P4-T01-DIRECT-WEIGHT-PRIORITY | Phase 4 — Weight fallback chain verification | BLOCKED | No executable harness or deterministic fixture binding was found for this test case in current repo state. |
| P4-T02-TABLE-WEIGHT-PRIORITY | Phase 4 — Weight fallback chain verification | BLOCKED | No executable harness or deterministic fixture binding was found for this test case in current repo state. |
| P4-T03-CLASS-FALLBACK-300 | Phase 4 — Weight fallback chain verification | BLOCKED | No executable harness or deterministic fixture binding was found for this test case in current repo state. |
| P4-T04-CA8-SCOPE-BLOCK | Phase 4 — Weight fallback chain verification | BLOCKED | No executable harness or deterministic fixture binding was found for this test case in current repo state. |
| P5-T01-TOGGLE-ON-CONVERT | Phase 5 — Bore conversion toggle verification | BLOCKED | No executable harness or deterministic fixture binding was found for this test case in current repo state. |
| P5-T02-TOGGLE-OFF-NO-CONVERT | Phase 5 — Bore conversion toggle verification | BLOCKED | No executable harness or deterministic fixture binding was found for this test case in current repo state. |
| P5-T03-REGRESSION-BRLEN-LOOKUP | Phase 5 — Bore conversion toggle verification | BLOCKED | No executable harness or deterministic fixture binding was found for this test case in current repo state. |
| X-T01-CRLF-OUTPUT | Cross-phase mandatory smoke tests (run after every phase) | BLOCKED | No executable harness or deterministic fixture binding was found for this test case in current repo state. |
| X-T02-SKEY-LEXICAL | Cross-phase mandatory smoke tests (run after every phase) | BLOCKED | No executable harness or deterministic fixture binding was found for this test case in current repo state. |
| X-T03-SUPPORT-CONTRACT | Cross-phase mandatory smoke tests (run after every phase) | BLOCKED | No executable harness or deterministic fixture binding was found for this test case in current repo state. |

## Diff summary (expected vs unexpected)
- Expected: Executable suite with deterministic pass/fail evaluation for all test IDs.
- Actual: Catalog is present, but automated/manual harness binding for these case definitions is absent.

## Sign-off
- Decision: **FAIL (Blocked)**
- Approver: System Execution Agent
- Date: 02-04-2026
- Gate result: **Progression to next phase is blocked** (critical assertions not executed).
