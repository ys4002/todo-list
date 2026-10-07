# todo-app: Test-Case Matrix

Author: QA · Source: `docs/plan.md` rev 3, sections 3 (contract) and 5 (test plan) · Date: 2026-10-07

**Counts:** Unit 24 · API 100 (A 51, P 12, S 8, SS 5, AD 24) · UI 36 · Manual E2E 24 · **Total 184**.

Legend. **Owner**: Dev = developer-owned unit test (QA verifies it exists and passes); QA = QA-owned automated test; Manual = run by QA on the real stack. **Status** starts as `Not run` and is updated in `reports/test-report.md`.

## 1. Requirement coverage summary

| Req | Requirement (short) | Cases |
|---|---|---|
| R1 | Register, unique case-insensitive username, strength + confirm (client and server) | U1-U5, U19, A1-A10, UI1-UI6, E2 |
| R2 | Login by username, same page for admin/user, redirect by role, logout | U6, A11-A16, UI7-UI9, UI11, UI27, E3, E15 |
| R3 | Create task (title, description, dueAt) | U11, A17-A19, A30-A36, A44, A45, UI20, UI21, E4 |
| R4 | Own tasks only, sorted by dueAt, All/Active/Completed | A20-A22, A29, S2, UI14, UI16, E4, E6, E12 |
| R5 | Edit task | A24, A25, A37, A38, UI22, E5 |
| R6 | Complete/uncomplete, even when overdue; completedAt | U13, A25-A27, A39, UI18, UI19, E6, E8 |
| R7 | Delete after confirm | A28, A42, A43, A46, UI23, E9 |
| R8 | Overdue marker, refreshes every 60 s | A27, A35, UI14, UI15, UI19, E8 |
| R9 | No access to others' tasks, 404 | U12, A42, S1, S2, AD14, E13 |
| R10 | Unauthenticated: redirect / 401 | A16, S3, UI10, UI12 |
| R11 | Sliding 60 min session | U8, SS1-SS5, UI24-UI26, E10, E11 |
| R12 | Admin seed, idempotent | U10, A15, AD1, AD24, E1, E19, E24 |
| R13 | Admin user and task management, non-admin 403 | U9, U15, S7, S8, AD2-AD16, UI12, UI28-UI30, E14-E18 |
| R14 | Disabled users blocked | U7, AD5-AD8, P11, UI7, UI25, E17, E18 |
| R15 | Search (own tasks, users, a user's tasks) | U14, A47-A51, AD3, AD11, UI17, UI28, E7, E16 |
| R16 | Change own password | U20, U21, U24, P1-P12, UI31-UI34, E21, E24 |
| R17 | Admin password reset | U23, AD17-AD24, UI35, E23 |
| R18 | Token invalidation after password change | U22, P3, P4, AD18, AD24, UI34, UI36, E22, E23 |
| NFR | BCrypt, no hashes returned, no stack traces, CORS, validation on both sides, responsive | A1, A10, AD2, S4-S6, U16-U19, E20 |

## 2. Unit tests (Dev-owned; QA verifies existence and result)

| ID | Unit | Case | Expected | Req | Owner | Status |
|---|---|---|---|---|---|---|
| U1 | AuthService.register | ` Alice_01 ` | saved `alice_01`; BCrypt; USER; enabled | R1 | Dev | Not run |
| U2 | AuthService.register | `ALICE_01` when `alice_01` exists | ConflictException | R1 | Dev | Not run |
| U3 | PasswordsMatchValidator | equal / different / confirm null | valid / "Passwords do not match" / "Confirm password is required" | R1 | Dev | Not run |
| U4 | StrongPasswordValidator | 8 listed passwords | per plan | R1 | Dev | Not run |
| U5 | register | password contains username | "Password must not contain the username" | R1 | Dev | Not run |
| U6 | AuthService.login | wrong password / unknown user | same InvalidCredentialsException | R2 | Dev | Not run |
| U7 | AuthService.login | disabled, right / wrong password | AccountDisabledException / InvalidCredentialsException | R14 | Dev | Not run |
| U8 | JwtTokenService | generate + decode | sub, username, role, iss, exp = iat + 60 min | R11 | Dev | Not run |
| U9 | UserJwtAuthenticationConverter | admin / user / disabled / deleted | ROLE_ADMIN / ROLE_USER / DisabledException x2 | R13, R14 | Dev | Not run |
| U10 | AdminSeeder | empty DB twice; changed password | one admin; hash unchanged | R12 | Dev | Not run |
| U11 | TaskService.create | now-10m / now-2m / now+1h | error / OK / OK | R3 | Dev | Not run |
| U12 | TaskService get/update/delete | foreign owner | ResourceNotFoundException | R9 | Dev | Not run |
| U13 | Task.setCompleted | f→t, t→f, t→t, overdue | completedAt now / null / unchanged / OK | R6 | Dev | Not run |
| U14 | SearchQueryUtils | trim, %, _, \, blank, 101 chars | per plan | R15 | Dev | Not run |
| U15 | AdminUserService.setEnabled | self / unknown / other | Conflict / NotFound / updated | R13 | Dev | Not run |
| U16 | GlobalExceptionHandler | every exception in 3.1 | status + body shape | NFR | Dev | Not run |
| U17 | FE dateUtils | toIsoUtc, round trip, isOverdue | per plan | R3, R8 | Dev | Not run |
| U18 | FE apiClient | renewal header, 401, 403, 400, 204, network | per plan | R11 | Dev | Not run |
| U19 | FE validation.ts | U3-U5 + username rule | same messages as server | R1 | Dev | Not run |
| U20 | PasswordPolicy | contains username / OK | error / OK | R16 | Dev | Not run |
| U21 | AuthService.changePassword | wrong current / same / valid | field errors; version +1, new `ver` | R16, R18 | Dev | Not run |
| U22 | UserJwtAuthenticationConverter | ver 0 vs DB 1 / equal | CredentialsExpiredException / authenticated | R18 | Dev | Not run |
| U23 | AdminUserService.resetPassword | unknown / contains username / disabled target / self | per plan | R17, R18 | Dev | Not run |
| U24 | FE validation.ts (change password) | empty, weak, mismatch, same | per plan messages | R16 | Dev | Not run |

## 3. API tests: registration and login (QA)

Automation: `AuthApiQaTest`.

| ID | Case | Expected | Req | Status |
|---|---|---|---|---|
| A1 | Valid register | 201; lower-case username; USER; no password/hash fields | R1, NFR | Not run |
| A2 | Register `ALICE_01` again | 409 "Username is already taken" | R1 | Not run |
| A3 | Register `Admin` | 409 | R1, R12 | Not run |
| A4 | Usernames `ab`, 31 chars, `1abc`, `bad name`, `al!ce` | 400 `username` each | R1 | Not run |
| A5 | Each weak password from U4 | 400 `password` strength message | R1 | Not run |
| A6 | Password contains username | 400 "Password must not contain the username" | R1 | Not run |
| A7 | confirmPassword different / missing | 400 mismatch / required | R1 | Not run |
| A8 | Missing name; 101-char name | 400 `name` | R1 | Not run |
| A9 | Malformed JSON | 400 "Malformed request" | NFR | Not run |
| A10 | DB `password_hash` | BCrypt `$2a$`/`$2b$` | NFR | Not run |
| A11 | Login `ALICE_01` upper-case | 200, token, expiresIn 3600, USER | R2 | Not run |
| A12 | Wrong password | 401 "Invalid username or password" | R2 | Not run |
| A13 | Unknown username | 401 same message | R2 | Not run |
| A14 | Empty username/password | 400 fieldErrors | R2 | Not run |
| A15 | Login admin/admin | 200, ADMIN | R2, R12 | Not run |
| A16 | `/auth/me` valid / none, garbage, expired, wrong secret | 200 incl. role / 401 "Authentication required" | R2, R10 | Not run |

## 4. API tests: tasks, search (QA)

Automation: `TaskApiQaTest` (A17-A46), `TaskSearchQaTest` (A47-A51).

| ID | Case | Expected | Req | Status |
|---|---|---|---|---|
| A17 | POST valid (+1 h) | 201, Location, completed false, overdue false | R3 | Not run |
| A18 | POST no description | 201, description null | R3 | Not run |
| A19 | dueAt with +05:30 offset | returned UTC `Z`; DB due_at UTC | R3 | Not run |
| A20 | 3 tasks, order | sorted by dueAt asc | R4 | Not run |
| A21 | Same dueAt | createdAt asc | R4 | Not run |
| A22 | status active/completed/ACTIVE | filtered, case-insensitive | R4 | Not run |
| A23 | GET by id | 200 | R4 | Not run |
| A24 | PUT all fields | 200; updatedAt > createdAt | R5 | Not run |
| A25 | PUT completed true then false | completedAt set then null | R5, R6 | Not run |
| A26 | PATCH completion true | 200, completedAt set | R6 | Not run |
| A27 | Overdue → GET → PATCH complete | overdue true; then completed, overdue false | R6, R8 | Not run |
| A28 | DELETE | 204 then 404 | R7 | Not run |
| A29 | New user's list | `[]` | R4 | Not run |
| A30 | Title missing/blank/101 | 400 `title` | R3 | Not run |
| A31 | Title 100 + description 1000 | 201 | R3 | Not run |
| A32 | Description 1001 | 400 `description` | R3 | Not run |
| A33 | dueAt missing | 400 required message | R3 | Not run |
| A34 | Create dueAt now-1h | 400 cannot be in past | R3 | Not run |
| A35 | Create dueAt now-2min | 201, overdue true | R3, R8 | Not run |
| A36 | Bad dueAt formats | 400 | R3 | Not run |
| A37 | PUT past dueAt | 200 | R5 | Not run |
| A38 | PUT without completed | 400 `completed` | R5 | Not run |
| A39 | PATCH `{}` / `{"completed":"yes"}` | 400 | R6 | Not run |
| A40 | `?status=done` | 400 | R4 | Not run |
| A41 | `/tasks/abc` | 400 | NFR | Not run |
| A42 | Any method on `/tasks/999999` | 404 "Task not found" | R9 | Not run |
| A43 | DELETE twice | 204 then 404 | R7 | Not run |
| A44 | Extra id/completed/userId in POST | ignored | R3, R9 | Not run |
| A45 | Unicode, emoji, `<script>` | round trip exact | NFR | Not run |
| A46 | `DELETE /api/tasks` | 405 | NFR | Not run |
| A47 | `q=MILK` | title + description, case-insensitive | R15 | Not run |
| A48 | `q=milk&status=completed` | only completed match | R15 | Not run |
| A49 | `q=zzz` | `[]` | R15 | Not run |
| A50 | `50%` and `a_b` literal wildcards | only literal matches | R15 | Not run |
| A51 | blank q / 101-char q / cross-user | all / 400 `q` / `[]` | R15, R9 | Not run |

## 5. API tests: security and isolation (QA)

Automation: `SecurityQaTest`.

| ID | Case | Expected | Req | Status |
|---|---|---|---|---|
| S1 | Bob GET/PUT/PATCH/DELETE Alice's task | 404 each; task unchanged | R9 | Not run |
| S2 | Bob's list | none of Alice's | R4, R9 | Not run |
| S3 | All protected endpoints without token | 401 ApiError JSON | R10 | Not run |
| S4 | Tampered payload | 401 | NFR | Not run |
| S5 | CORS preflight from :3000 | 200, allow-origin, expose headers | NFR | Not run |
| S6 | Any 500 | no stack/SQL | NFR | Not run |
| S7 | USER token on all `/api/admin/**` | 403 "Access denied" | R13 | Not run |
| S8 | DB role changed to ADMIN, old token | 200 (authorities from DB) | R13 | Not run |

## 6. API tests: change own password (QA)

Automation: `PasswordChangeQaTest`.

| ID | Case | Expected | Req | Status |
|---|---|---|---|---|
| P1 | Valid change | 200; body token == X-Auth-Token | R16 | Not run |
| P2 | Login old / new password | 401 / 200 | R16 | Not run |
| P3 | T1 and T2 after change | 401 password-changed message | R18 | Not run |
| P4 | New token | 200 | R18 | Not run |
| P5 | Wrong current password | 400 not 401; token still valid | R16 | Not run |
| P6 | Weak new passwords | 400 `newPassword` | R16 | Not run |
| P7 | Contains username | 400 | R16 | Not run |
| P8 | Confirm different / missing | 400 `confirmNewPassword` | R16 | Not run |
| P9 | new == current | 400 differ message | R16 | Not run |
| P10 | currentPassword missing; malformed JSON | 400 | R16 | Not run |
| P11 | No / expired / disabled-user token | 401 variants | R10, R14 | Not run |
| P12 | Admin changes own password | 200 new token; admin/admin 401 | R16, R12 | Not run |

## 7. API tests: sliding session (QA)

Automation: `SessionQaTest`.

| ID | Case | Expected | Req | Status |
|---|---|---|---|---|
| SS1 | GET/POST/PUT/PATCH/DELETE 2xx | renewal headers; new token works; exp ≈ +60 min | R11 | Not run |
| SS2 | Token expiring in 5 min | new exp later, ≈ +60 min | R11 | Not run |
| SS3 | 400/403/404 | header present | R11 | Not run |
| SS4 | 401, login, register | no header | R11 | Not run |
| SS5 | Expired token | 401, no renewal | R11 | Not run |

## 8. API tests: admin (QA)

Automation: `AdminApiQaTest`.

| ID | Case | Expected | Req | Status |
|---|---|---|---|---|
| AD1 | Startup / restart | one admin row, ADMIN, enabled, BCrypt | R12 | Not run |
| AD2 | List users | all, sorted, counts, no hash | R13 | Not run |
| AD3 | `q=ALI` / `Smith` / `zzz` | alice_01 / alice_01 / `[]` | R15 | Not run |
| AD4 | Get user / unknown | 200 / 404 "User not found" | R13 | Not run |
| AD5 | Disable Bob | 200 enabled false | R13, R14 | Not run |
| AD6 | Bob login after disable | 403 / 401 | R14 | Not run |
| AD7 | Bob's old token | 401 "Account is disabled" | R14 | Not run |
| AD8 | Enable Bob → login | 200 | R13, R14 | Not run |
| AD9 | Admin disables self | 409 | R13 | Not run |
| AD10 | Status body `{}` / bad type | 400 | R13 | Not run |
| AD11 | Admin searches Alice's tasks | same as Alice's own | R15 | Not run |
| AD12 | Admin creates task for Alice | 201; Location admin path; Alice sees | R13 | Not run |
| AD13 | Admin PUT/PATCH/PATCH/DELETE | 200/200/200/204 | R13 | Not run |
| AD14 | Bob's route + Alice's task | 404 "Task not found" | R13, R9 | Not run |
| AD15 | Unknown userId on task endpoints | 404 "User not found" | R13 | Not run |
| AD16 | Admin own tasks; invalid admin create | normal; 400 | R13 | Not run |
| AD17 | Admin resets Alice's password | 200; new works, old 401 | R17 | Not run |
| AD18 | Alice's earlier token | 401 password-changed | R18 | Not run |
| AD19 | Weak / contains username / mismatch | 400 fields | R17 | Not run |
| AD20 | new == current | 200 | R17 | Not run |
| AD21 | Unknown userId | 404 | R17 | Not run |
| AD22 | USER token / no token | 403 / 401 | R17, R13 | Not run |
| AD23 | Reset disabled Bob | stays disabled; login 403 | R17, R14 | Not run |
| AD24 | Admin resets own password; restart | new token; old token 401; persists after restart | R17, R12, R18 | Not run |

## 9. UI tests (QA, Vitest + RTL, mocked fetch)

Automation: `frontend/src/qa/*.test.tsx` (one file per area: `RegisterLoginQa`, `RoutingSessionQa`, `TasksQa`, `TaskFormQa`, `AdminQa`, `ProfileQa`).

| ID | Screen | Case | Expected | Req | Status |
|---|---|---|---|---|---|
| UI1 | Register | empty submit | 4 errors, no API call | R1 | Not run |
| UI2 | Register | password typing | checklist ticks; weak blocks | R1 | Not run |
| UI3 | Register | confirm differs | mismatch, no call | R1 | Not run |
| UI4 | Register | `1abc` | username message | R1 | Not run |
| UI5 | Register | 409 / 400 fieldErrors | message at field; passwords cleared | R1 | Not run |
| UI6 | Register | success | `/login?registered=1` banner | R1 | Not run |
| UI7 | Login | 401 / 403 | messages | R2, R14 | Not run |
| UI8 | Login | success USER / ADMIN | storage; redirect | R2 | Not run |
| UI9 | Login | pending | submit disabled | R2 | Not run |
| UI10 | Routing | `/tasks` logged out | `/login` | R10 | Not run |
| UI11 | Routing | `/login` logged in | `/tasks` / `/admin/users` | R2 | Not run |
| UI12 | Routing | USER at `/admin/users` | Access Denied, no admin fetch | R13 | Not run |
| UI13 | Tasks | empty | "No tasks yet" | R4 | Not run |
| UI14 | Tasks | rendering | order, local time, Overdue rules | R4, R8 | Not run |
| UI15 | Tasks | +61 s fake timers | Overdue appears | R8 | Not run |
| UI16 | Tasks | filter tabs | status query; highlighted | R4 | Not run |
| UI17 | Tasks | search | debounce 300 ms, Clear, empty text | R15 | Not run |
| UI18 | Tasks | toggle | optimistic; PATCH; rollback | R6 | Not run |
| UI19 | Tasks | complete overdue | allowed; marker gone | R6, R8 | Not run |
| UI20 | TaskForm | invalid create | errors, no call | R3 | Not run |
| UI21 | TaskForm | valid create | POST body; item added | R3 | Not run |
| UI22 | TaskForm | edit | prefill local; PUT 4 fields | R5 | Not run |
| UI23 | TaskForm/Delete | server errors; delete cancel/confirm | per plan | R5, R7 | Not run |
| UI24 | Session | renewal header | storage updated | R11 | Not run |
| UI25 | Session | 401 variants | `?expired=1` / `?disabled=1` | R11, R14 | Not run |
| UI26 | Session | expiry timer; expired on load | logout | R11 | Not run |
| UI27 | Header | Logout; nav by role | storage cleared; Users only ADMIN | R2, R13 | Not run |
| UI28 | Admin users | list + search | rows, badges, counts, debounce | R13, R15 | Not run |
| UI29 | Admin users | disable/enable | confirm, PATCH, badge; own disabled; 409 | R13 | Not run |
| UI30 | Admin user tasks | `/admin/users/2/tasks` | heading; admin endpoints | R13 | Not run |
| UI31 | Profile | open | details + form; logged out redirect | R16 | Not run |
| UI32 | Profile | client validation | messages; no call | R16 | Not run |
| UI33 | Profile | wrong current | field error; not logged out | R16 | Not run |
| UI34 | Profile | success | banner, cleared, token stored | R16, R18 | Not run |
| UI35 | Admin users | reset password | dialog, validation, PUT, notice | R17 | Not run |
| UI36 | Session | 401 password changed | `?passwordChanged=1` banner | R18 | Not run |

## 10. Manual E2E (QA, real stack)

Detailed steps and expected results are in `docs/plan.md` section 5.4. Results are recorded in `reports/e2e-manual.md`.

| ID | Summary | Req | Status |
|---|---|---|---|
| E1 | Stack start, tables, admin seeded, default-password WARN | R12 | Not run |
| E2 | Register Alice (weak, mismatch, valid) | R1 | Not run |
| E3 | Login as Alice | R2 | Not run |
| E4 | Add 3 tasks, sort, UTC storage | R3, R4 | Not run |
| E5 | Edit persists | R5 | Not run |
| E6 | Complete, filters | R4, R6 | Not run |
| E7 | Search with filters | R15 | Not run |
| E8 | Overdue appears live | R8, R6 | Not run |
| E9 | Delete | R7 | Not run |
| E10 | Renewal header and storage | R11 | Not run |
| E11 | 2-minute expiry (active vs idle) | R11 | Not run |
| E12 | Bob sees no Alice tasks | R4, R9 | Not run |
| E13 | Bob's token on Alice's URL → 404 | R9 | Not run |
| E14 | Bob and admin pages / API | R13 | Not run |
| E15 | Admin login and user search | R2, R13 | Not run |
| E16 | Admin manages Alice's tasks | R13, R15 | Not run |
| E17 | Disable Bob while logged in | R14 | Not run |
| E18 | Enable Bob; self-disable blocked | R13 | Not run |
| E19 | Backend restart persistence | R12 | Not run |
| E20 | 375 px layout | NFR | Not run |
| E21 | Profile password change flow | R16 | Not run |
| E22 | Two browsers, token invalidation | R18 | Not run |
| E23 | Admin reset while Bob logged in; Bob 403 | R17, R18 | Not run |
| E24 | Admin changes seeded password; restart | R12, R16 | Not run |

## 11. Automation map

| File | Cases |
|---|---|
| `backend/src/test/java/com/todoapp/qa/AuthApiQaTest.java` | A1-A16 |
| `.../qa/TaskApiQaTest.java` | A17-A46 |
| `.../qa/TaskSearchQaTest.java` | A47-A51 |
| `.../qa/PasswordChangeQaTest.java` | P1-P12 |
| `.../qa/SecurityQaTest.java` | S1-S8 |
| `.../qa/SessionQaTest.java` | SS1-SS5 |
| `.../qa/AdminApiQaTest.java` | AD1-AD24 |
| `frontend/src/qa/*.test.tsx` | UI1-UI36 |
| `reports/e2e-manual.md` (later) | E1-E24 |
| Dev-owned tests | U1-U24 (QA reviews existence in Q6) |
