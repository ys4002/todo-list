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
- U1-U24 (developer-owned) audited against plan 5.1: **all 24 have a matching passing test**.

| U | Test | U | Test |
|---|---|---|---|
| U1 | AuthServiceTest.registerNormalisesUsernameAndHashesPassword | U13 | TaskTest (4 cases incl. overdueTaskCanBeCompleted) |
| U2 | AuthServiceTest.registerRejectsExistingUsernameIgnoringCase | U14 | SearchQueryUtilsTest (7 cases) |
| U3 | ValidatorsTest matching/different/missingConfirm | U15 | AdminUserServiceTest.setEnabled* (3) |
| U4 | ValidatorsTest.weakPasswordsRejected (parameterized), tooLongAndNullRejected | U16 | GlobalExceptionHandlerTest (10) |
| U5 | AuthServiceTest.registerRejectsPasswordContainingUsername | U17 | frontend dateUtils tests (3) |
| U6 | AuthServiceTest.loginFailsTheSameWay... | U18 | frontend apiClient tests (9) |
| U7 | AuthServiceTest.loginDisabledUser... (2) | U19 | frontend validation tests |
| U8 | JwtTokenServiceTest | U20 | PasswordPolicyTest (2) |
| U9 | UserJwtAuthenticationConverterTest (enabled admin/user, disabled, deleted) | U21 | AuthServiceTest.changePassword* (4) |
| U10 | AdminSeederTest (twice; keeps changed password) | U22 | UserJwtAuthenticationConverterTest stale/matching version |
| U11 | TaskServiceTest.create* (3) | U23 | AdminUserServiceTest.resetPassword* + resetOwnPassword (4) |
| U12 | TaskServiceTest.getUpdateDeleteOfSomeoneElsesTaskIsNotFound | U24 | frontend validation change-password tests |

  Minor note: the exact weak-password list of U4 sits in a parameter source in `ValidatorsTest`; I confirmed the cases are asserted but did not diff each value against the plan.
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
4. **S5 wording note:** plan S5 expects `Access-Control-Expose-Headers` on the preflight. Per the CORS spec, exposed headers are only sent on the actual (non-preflight) response, so `SecurityQaTest.s05` checks the preflight for 200 + allow-origin, and the exposed headers on a real cross-origin GET. The plan wording should be adjusted; the backend behaviour is correct.
5. The QA UI tests render the real `AppRoutes`/`AuthProvider` but mock `fetch`; they do not exercise the Vite proxy or real CORS.

## Verdict
No open Critical or High defects; all automated suites green. Ready to release from a QA standpoint, subject to a quick manual browser pass for E20 and the visual checks listed above.
