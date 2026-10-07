# Test report

Date: 2026-10-07 · Author: QA · Build under test: master (all four feature branches merged) + `feature/qa-tests`
Environment: JDK 21.0.12, Maven 3.10, Node 24, MySQL localhost:3306. Backend tests run against private DB `todo_qa_db`; E2E against `todo_e2e_db`.

## Results by suite

| Suite | Owner | Total | Passed | Failed | Skipped |
|---|---|---|---|---|---|
| Backend `mvn test` (all) | Dev + QA | 266 | 266 | 0 | 0 |
| of which QA API tests (A1-A51, P1-P12, S1-S8, SS1-SS5, AD1-AD24 + 1 documented behaviour) | QA | 127 | 127 | 0 | 0 |
| Frontend `npm test` (all) | Dev + QA | 165 | 165 | 0 | 0 |
| of which QA UI tests (UI1-UI36) | QA | 64 | 64 | 0 | 0 |
| `npm run build` | | | green | | |
| Manual E2E (E1-E24), see `e2e-manual.md` | QA | 24 | 20 | 0 | 4 not executed (no browser) |

Counts are test methods, which differ from plan case counts: some plan cases are parameterized or split into several methods, and one case (e.g. A4, A5, S1) may be covered by more than one.

## Plan coverage
- A1-A51, P1-P12, S1-S8, SS1-SS5, AD1-AD24: every ID has at least one automated test (`reports/test-cases.md`, section 11).
- UI1-UI36: every ID has at least one test.
- U1-U24: developer-owned, present in the merged suites (e.g. `AuthServiceTest`, `PasswordPolicyTest`, `UserJwtAuthenticationConverterTest`, `AdminSeederTest`, `TaskServiceTest`, `SearchQueryUtilsTest`, `GlobalExceptionHandlerTest`, `AdminUserServiceTest`, frontend `apiClient`/`validation`/`dateUtils` tests) and passing. QA did **not** re-map each U case line by line to a test method; this is a spot check by suite name only.
- Exit criteria 5.5: all automated suites pass and no Critical/High defects are open. Manual: E20 and the visual parts of four others are outstanding.

## Defects
None raised. Plus these first-run failures that were **test bugs, not product defects**, fixed before this report: URL double-encoding in the MockMvc helper (4 search tests, 1 admin search test) and an invalid request body in AD16.

| ID | Item | Severity | Status |
|---|---|---|---|
| OBS-1 | Stale/invalid bearer on `/api/auth/login` and `/register` gives 401 (permitAll endpoints still validate a supplied token). Reported by Team Lead as known; documented by an automated test. | Low | Open, accepted as known behaviour (owner: backend, optional) |

## Known limitations of this test run
1. No browser automation: E20 (375 px layout) and the visual side of E3, E8, E10, E11 need a manual pass. Their logic is covered by the UI tests with mocked fetch, not by a real browser.
2. AD1/AD24 "restart" is simulated in-context by re-running the seeder; the real process restart was checked in E19/E24.
3. Backend tests share a MySQL database with each other; concurrent runs against the same DB cause false errors (duplicate `admin`). Always run with a private `SPRING_DATASOURCE_URL`.
4. The QA UI tests render the real `AppRoutes`/`AuthProvider` but mock `fetch`; they do not exercise the Vite proxy or real CORS.

## Verdict
No open Critical or High defects; all automated suites green. Ready to release from a QA standpoint, subject to a quick manual browser pass for E20 and the visual checks listed above.
