# QA report: Save/Clear completion and API loaders (change 3, 2026-10-14)

Tested: merged `master` 81fc9f3 (QA worktree, branch `feature/qa-save-clear-loaders`), against `docs/changes/2026-10-14-save-clear-and-loaders.md` (sections 2.2, 2.3, 5.2, 5.3, 5.4, 6).
Environment: backend `mvn spring-boot:run` on 8080 and Vite dev on 3000, disposable schema `todo_qa_test` (dropped afterwards), users `qa_a`, `qa_b`, `qa_c` created through the API/UI, default admin used only in that schema.
Browser: gstack headless browse (`$B`). Aside is not installed, so the headless fallback was used. Used `/qa-only` (report only); no product code touched. The gstack evidence recorder and deadline tools were not used; evidence is the commands and outputs summarised below plus the screenshots in `2026-10-14-save-clear-and-loaders-evidence/`.
Method note: `$B` has no network throttling or request log. I injected a `window.fetch` wrapper in the page that records every request (the "network tab" evidence: method and URL), adds a fixed delay (0.3 to 5 s, standing in for Slow 3G) and can return a 500 for PATCH. It is lost on reload, so it was re-injected after each reload or login. The real backend-down failure (S3) was also tested without the wrapper.

## 1. Automated checks vs baseline

| Check | Result |
|---|---|
| Frontend `npm test` (baseline 23 files / 236 tests) | PASS: 23 files, 236 tests |
| Frontend `npm run build` | PASS |
| `npm audit --audit-level=high` | PASS: 0 vulnerabilities |
| Backend `mvn test` (untouched) | PASS: exit 0, 279 tests, 0 failures, 0 errors (surefire reports) |

## 2. Retest rows S1-S9

| Row | Result | Evidence |
|---|---|---|
| S1 stage, Save, Clear on My Tasks | PASS | Ticking a checkbox: 0 requests (`window.__reqs` empty), Save and Clear and "Unsaved change" chip (`aria-describedby=task-staged-N`) appear. Save: exactly one `PATCH /api/tasks/{id}/completion`; Clear: 0 requests, checkbox back to saved value, focus on checkbox, live region "Change discarded for 'A task 2'". |
| S1 on Admin → user tasks | PASS | `PATCH /api/admin/users/2/tasks/2/completion` only on Save; no request on tick or Clear; live region "'A task 2' marked as not completed"; focus on checkbox; DB value confirmed through the admin API. |
| S2 three staged, save 1, clear 1, change tab and back | PASS | Task 1 saved (1 PATCH), task 2 cleared, task 3 stayed staged on All, Active (hidden because saved state is completed, per A3), Completed (visible with chip) and back. |
| S3 Save failure keeps staged + row error + toast | PASS | Injected 500: Save/Clear/chip kept, Save enabled again, row `role=alert` "Not saved. Try again.", toast shown; a retry then succeeded. Also with the backend process stopped (502): same result, toast "Request failed (502)". Exception: DEF-A (same-tick double dispatch). |
| S4 loaders and double clicks | PASS with 2 low defects | Every row of 2.3 checked with a delay (see section 3). Double click with a 40-60 ms gap: 1 request for Save, Login, Register, Change password, Reset password, TaskForm. Same-tick double dispatch: Save sends 1 request but see DEF-A; TaskForm sends 2 POSTs (DEF-B). Login, Register, Change password and Reset password were not tested with a same-tick double dispatch. |
| S5 B2: search then save within 300 ms | PASS | Staged a task, set search "task 8", clicked Save 100 ms later (list delay 700 ms): requests PATCH, GET `q=task+8`, GET `q=task+8` (stale response ignored, one refetch); final list correct (task completed, dropped off Active tab), search spinner stayed visible during the refetch. |
| S6 reduced motion | PASS (static check only) | Emulation was not available. Stylesheet inspection: `@media (prefers-reduced-motion: reduce)` has `*{animation:none !important}` and `.spinner{border-style:dotted}`; busy labels ("Saving…") are text. |
| S7 keyboard | PASS (VoiceOver not tested) | Tab order from the checkbox: Save → Clear → Edit → Delete. Space ticks, Enter on Save sends the PATCH. Focus after Save: checkbox if the task stays in the filter; `.task-list-region` (tabindex -1, label "Tasks") when it dropped out (Completed and Active tabs, admin and own). Live region texts correct. |
| S8 768 px admin table | PARTIAL at first, PASS after the DEF-C fix (section 5b) | Tasks cells are `white-space: nowrap` on one line; gap between search box and table is 17 px. But the table (867 px) is wider than its scroll container (684 px) so the Disable and Reset password buttons are cut off. No page-level scroll. |
| S9 375 px | PASS | Save/Clear wrap into the actions row, no horizontal scroll (scrollWidth 375), Save 88x44, Clear 61x44. At 768 and 1280 no horizontal scroll, buttons 32 px. |

## 3. Loaders (2.3) and edge cases (2.2)

| Item | Result | Evidence |
|---|---|---|
| Login "Logging in…" | PASS | Button disabled, `aria-busy`, spinner, fields stay editable, 1 POST (40 ms gap) |
| Register "Registering…" | PASS | same |
| TaskForm create "Adding…" | PASS | Submit and Cancel disabled, spinner; Cancel click and Escape ignored while pending (form stayed open until done). Edit "Saving…" not run separately (same component). |
| Row Save "Saving…" | PASS | Whole row disabled, `aria-busy=true`, spinner |
| Delete "Deleting…" | PASS | Dialog closes at once; Delete shows spinner; Save, Clear, Edit, Delete disabled; row removed, staged entry gone with it. |
| Change password "Changing…" | PASS | 1 PUT, toast "Password changed" |
| Reset password "Resetting…" | PASS | Submit shows spinner; Cancel disabled; Cancel click and Escape ignored while pending; 1 PUT; success toast; new password works (login 200) |
| Admin Disable "Disabling…" | PASS | Dialog closes, spinner in that row, that row's Disable/Enable and Reset password disabled, another row's buttons stayed enabled, 1 PATCH; Enable also works |
| List refetch spinner (tab change) | PASS | `role=status` "Updating tasks…" in the search box, list `aria-busy` and opacity 0.6, gone when idle |
| Search spinner during debounce | PASS | Shown 0.2 s after typing, before the request |
| Admin user search "Updating users…" | PASS | spinner + `aria-busy`, gone when done |
| Edit form on a staged task | PASS | Form's Completed starts from the staged value; row checkbox, Save, Clear, Delete disabled and Edit reads "Editing"; Cancel keeps staged; form Save (PUT) removes the staged entry |
| Several staged tasks independent | PASS | Saves on different rows ran independently |
| Staged state not stored | PASS | localStorage keys only `todo_app_token`, `todo_app_user`, `todo_app_expires_at`; sessionStorage empty; URL unchanged |
| Delete failure keeps staged entry; Save 404 removes it | NOT TESTED | see section 6 |

## 4. Regression and security spot-checks

| Check | Result | Evidence |
|---|---|---|
| User A PATCH on user B's task completion | PASS: 404 | `curl` with A's token on B's task |
| Non-admin on the admin completion PATCH | PASS: 403 | |
| No token on own PATCH | PASS: 401 | |
| Admin PATCH on own user/task pair | PASS: 200; wrong user/task pair 404 | |
| REG-5a-d, f (CRUD, search, filters) | PASS (spot) | create, edit, delete, search, tabs exercised during the above |
| Admin flows (list, search, view tasks, disable/enable, reset) | PASS | |
| Dark theme | PASS (approximation) | `prefers-color-scheme` cannot be emulated in `$B`; I applied the dark token values from `tokens.css` to `:root` and screenshotted a staged and a saving row (`qa_dark_saving.png`): contrast fine. |
| Layouts 375 / 768 / 1280 | PASS for My Tasks and admin (no page scroll) | 1024 only checked indirectly |
| Console errors | Only an expected 502 while the backend was stopped | |

The existing security probe matrix was not re-run (endpoints unchanged); only the spot-checks above.

## 5. Defects (all closed in 5b; all sent to `frontend`, team lead copied)

| ID | Severity | Summary |
|---|---|---|
| DEF-A | Low-Medium | Same-tick double click on Save: one PATCH is sent but the Save/Clear/chip vanish while pending; if the save then fails the staged change is lost (checkbox returns to the saved value), contradicting criterion 3. A 20-60 ms gap is fine. Repro: stage a task, make PATCH fail, run `b=document.querySelector('.task-save'); b.click(); b.click()` in the console. |
| DEF-B | Low | Same-tick double click on the TaskForm submit sends 2 POSTs and creates a duplicate task (the guard depends on the re-rendered disabled state). Gap of 0 ms (setTimeout) or more: 1 POST. |
| DEF-C | Low | After the B8 `nowrap`, at 768-900 px the admin table scrolls inside `.table-scroll` and the Disable/Reset password column is cut off ("Disa…"). Fits at 1024. |

Observations, not defects: at 375 px Delete is 32 px tall and wraps alone in a staged row while Save/Clear/Edit are 44 px; the polite live region keeps its last message text after it was announced; focus after Cancel on the edit form is on `body`.
DEF-A and DEF-B need a synthetic same-tick double dispatch; real double clicks go through a separate event and pass.

## 5b. Retest after fixes (master 2c8cdb8, merged into this branch as 8567bbe)

Same stack and method as above (fresh disposable schema, same fetch-wrapper evidence).

| Defect | Result | Evidence |
|---|---|---|
| DEF-A | CLOSED (PASS) | Same-tick double click on Save with the PATCH failing: row shows "Saving…" while pending, 1 PATCH, afterwards Save/Clear/chip kept, checkbox in staged state, row error "Not saved. Try again."; same-tick double click with success: 1 PATCH, row saved. |
| DEF-B | CLOSED (PASS) | Same-tick double dispatch gives exactly one request on: TaskForm Add (1 POST, 1 task), Login (1 POST), Register (1 POST), Change password (1 PUT), Reset password (1 PUT), admin Disable (1 PATCH, confirm dialog). |
| DEF-C | CLOSED (PASS, cosmetic note) | At 768 the Actions cell stacks View tasks / Disable / Reset password vertically, all visible (`qa_admin768_after_fix.png`); Tasks cell stays `nowrap` on one line; 800, 900, 1024 fit without scrolling; no page-level horizontal scroll. Note: at 768 the table scroll area is still a few pixels wider than its container, and rows are 118 px tall. |

All rows from sections 2-4 that were run before were not repeated except the ones above; the frontend suite on master reports 239 tests (not re-run by QA after the merge).

## 6. Scenarios not tested / could not be verified

- Real `prefers-reduced-motion` and `prefers-color-scheme: dark` emulation (headless tool lacks it): reduced motion verified from CSS only; dark by overriding tokens.
- Real network throttling (Slow 3G): replaced by a fetch wrapper delay, so browser-level behavior under real throttling was not exercised.
- VoiceOver or any screen reader; Safari and Firefox; touch devices.
- Delete failure with a staged change (staged entry should be kept), and Save returning 404 for a task deleted elsewhere (staged entry removed, 404 toast).
- Edit form "Saving…" label separately, TaskForm failure path, B6b with a checkbox change while the form is open on a different tab.
- Admin row loaders at 375 px; the 1024/1280 layouts in dark mode; DEF-3 (toast over dialog) is outside this change.
- Full security probe matrix re-run (only the plan's spot-checks).
- `mvn test` uses its own databases; the real `todo_db` was never touched.

## 7. Cleanup

Servers stopped (ports 3000 and 8080 free), schema `todo_qa_test` dropped, scratch folder with tokens and temp files removed. `.gstack/` stays out of git.
