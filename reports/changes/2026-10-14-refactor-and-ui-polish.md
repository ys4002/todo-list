# QA report: refactor, notifications and UI polish (2026-10-14)

Build under test: `master` a38e7f1 (merged into `feature/qa-refactor-ui-polish` as a4df4c1; no product files differ from master).
Cases: `reports/changes/2026-10-14-refactor-and-ui-polish-cases.md` (130 cases). Method: gstack `/qa-only` (report only, no product edits), Playwright/Chromium scripts driven against the real stack (backend 8080 on a disposable schema, since dropped; frontend 3000), seeded users created through the Register page.

**Environments.** Dev server (`npm run dev`, StrictMode on) and the production build served with `vite preview` on 3000. Both were run; every difference is stated below. Chromium only.

## Verdict

**No blocker. Two dev-mode-only defects (DEF-1 medium, DEF-2 low-medium); production build is correct on both.** All automated, regression, notification, UI and security rows pass except those listed under Defects and "Not tested".

## Defects

| ID | Sev | Where | Summary | Status |
|---|---|---|---|---|
| DEF-1 | Medium (dev only) | `NotificationProvider`, `LoginPage` | `npm run dev`, `/login?expired=1` or `?registered=1`: two identical toasts at t=1s; at t=7s and t=20s one `toast-leaving` toast remains forever (opacity 0, `pointer-events:auto`, 67px tall, blocks clicks, extra `role=status` node). Prod build: 1 toast, gone at ~5s. Probable cause: StrictMode simulated unmount runs the provider cleanup effect, which clears `exitTimers`, after the page cleanup dismissed the first toast, so its 150ms removal never fires. | Reported to Team Lead (frontend id was not reachable) |
| DEF-2 | Low-medium (dev only, regression vs pre-change master) | `useModalDialog`, `ResetPasswordDialog` | Dev: opening Reset password leaves focus on the opener button (outside the dialog) instead of "New password". Pre-change master (1586929): `activeElement` = `resetNewPassword`. Prod build: correct. Cause: effect cleanup calls `opener.focus()` during StrictMode's simulated unmount. | Reported; a `feature/frontend-modal-focus-fix` worktree exists, so the fix is in progress |

Both are cleared for production behaviour; they matter for developers and for any test that runs StrictMode. Retest after the fixes merge: DEF-1 (`/login?expired=1` in dev: exactly one toast, empty at 5.2s), DEF-2 (reset dialog `activeElement` is the New password input in dev and prod; Escape returns focus to the opener).

## Observations (not defects)

- O1. Desktop 1280px: the top-right toast stack overlaps the toolbar's **Add task** button for up to 8s. Per the plan's placement (below header, top-right). Logout is never covered. Hover or Escape clears it.
- O2. A success toast outlives a route change by design: "Password changed" is still visible on `/login?passwordChanged=1` (screenshot evidence) next to the info toast, for up to its 5s.
- O3. Task `role` change (lead question 3): `?expired` and `?passwordChanged` were `role=alert` on master; now `role=status` info toasts. Intentional per plan, recorded.
- O4. Admin table at 768px: the Tasks cell wraps to 3-4 lines ("0 total, 0 open") and the Search box sits flush against the table top edge (no gap). Cosmetic.
- O5. After deleting a task via the dialog, focus lands on `<body>` (opener removed). Known limitation class; same as master.
- O6. Inputs show focus as border change plus 4px soft ring (box-shadow) with a transparent outline. The soft ring alone is low contrast, but the border turns primary (see U4c); forced-colors was not tested.

## Results

### Automated (5.1)
| ID | Result | Evidence |
|---|---|---|
| A1 | PASS | `npm test`: 192/192 (147 baseline + 45 new); also with `--sequence.shuffle`: 192/192 |
| A2 | PASS | `npm run lint` clean; `npm run build` OK |
| A3 | PASS | `git diff --stat master...HEAD -- backend frontend/src/api frontend/src/auth` empty (script) |
| A4 | PASS | package.json / pom.xml unchanged |
| A5 | PASS (partial) | diff vs master is reports only; plan-vs-merge file list not independently re-diffed beyond A3/A4 |
| A6 | PASS | shuffled run green |
| A7 | PASS by count | new tests present (45); one-to-one mapping to every 5.2 row not individually audited |

`bash reports/changes/frontend-checks.sh master`: A2, A3, A4, S1, S4, U9, F3-inline-style, N-storage, S6 PASS. S3 flagged then triaged: only the `Authorization: Bearer ${token}` template and validation field names (`password`) in the bundle, no secret value.

### Regression (5.4), on the real stack
| ID | Result | Evidence |
|---|---|---|
| REG-1a-e | PASS | `/` -> `/tasks` for user, `/admin/users` for admin; `/login` and `/register` redirect when logged in; `/nope` "Page not found"; user on `/admin/users` "Access denied" |
| REG-2a-d | PASS | required-field and mismatch messages; rules checklist present with `data-met`; duplicate username in other case -> "Username is already taken" with both password fields cleared; success -> `/login?registered=1`, success toast `role=status` (see DEF-1 for dev duplicate) |
| REG-3a | PASS | wrong password: inline `alert` "Invalid username or password", no toast |
| REG-3b | PASS | disabled login: inline "Your account is disabled. Contact the administrator.", no toast |
| REG-3c/3d | PASS | `?registered`, `?expired`, `?passwordChanged` (info), `?disabled` (error `role=alert`) toasts; real flows: bad token -> `/login?expired=1`, admin reset -> `/login?passwordChanged=1`, admin disables user mid-session -> `/login?disabled=1`; URL param kept |
| REG-4a | PASS | `X-Auth-Token` and `X-Auth-Expires-In: 3600` on responses; stored token changes after a request |
| REG-4b | PASS | tampered token -> `/login?expired=1` with one expired toast |
| REG-5a | PASS | order by due date; only task `li`s are listitems (6) |
| REG-5b | PASS | past due rejected "Due date and time cannot be in the past"; due 3 minutes ago accepted |
| REG-5c | PASS (via request log) | PUT with title, description, dueAt, completed |
| REG-5d | PASS | successful toggle: no toast |
| REG-5e | PASS | PATCH forced 500: checkbox rolled back, one error toast `role=alert`, inline load banner absent, gone at about 8.5s |
| REG-5f | PASS | DELETE forced 500: dialog closes, error toast, task still listed; success silent, task removed |
| REG-5g | PASS | tab requests `?status=completed`, `?status=active`, none |
| REG-5h | PASS | one request `?q=Cm` for the typed text |
| REG-5i | PASS | task due in 1 minute got the Overdue badge without reload (~2 min wait) |
| REG-5j | PASS | GET list forced 500: inline `banner banner-error` `role=alert` "List broke", no toast, still present after 15s |
| REG-6a | PASS | search narrows the list; zero results -> "No users match your search" |
| REG-6b | PASS | disable: silent, badge Disabled; Enable dialog button has class `primary` |
| REG-6c | PASS | PATCH forced 409: single error toast with server message, badge unchanged, dialog closed |
| REG-6d | PASS | own row Disable disabled, title "You cannot disable your own account" |
| REG-6e | PASS | invalid: two inline dialog alerts, no toast; valid: dialog closes, success toast "Password updated for userb" |
| REG-6f | PASS | "View tasks" -> `/admin/users/3/tasks` ("Tasks of userb"), "Back to users" works |
| REG-7a-c | PASS | details `dl` first; wrong current -> inline "Current password is incorrect", no toast; success -> "Password changed" toast, token renewed, fields cleared |
| REG-8a | PASS | Escape closes confirm and reset dialogs |
| REG-8b | **FAIL in dev / PASS in prod** | DEF-2: confirm dialog default focus is Cancel (same as master); reset dialog focus input in prod, opener button in dev |
| REG-8c | PASS | focus returns to the opener after Escape (Disable, Reset password) |
| REG-9 | PASS | same login/list/create/toggle/filter/search/edit/delete sequence replayed on pre-change master (1586929, dev server, scratch worktree) and the new build: request method, path, query and body identical (11 API calls) |

### Notifications (N1-N7)
| ID | Result | Evidence |
|---|---|---|
| N1a-c | PASS | success/info disappear at about 5s (+150ms); error visible at 7s, gone at 8.5s |
| N1d | PASS | all toasts removed in all scripted runs |
| N2a | PASS | hovering a toast for 12s: still there; progress bar `animation-play-state: paused` on hover, `running` after; dismisses about 8s after leaving (remaining time) |
| N2b | PASS | focused close button for 9.5s: still there |
| N2c | PASS (partial) | unhovered toasts kept their own timers in the cap test |
| N3a-d | PASS | click × removes it; Escape on the focused × removes it; with a ConfirmDialog open the toast closes and the dialog stays; accessible name "Dismiss notification" |
| N4a | PASS | 4 distinct failures -> 3 toasts (Fail 2, 3, 4) |
| N4b | PASS | same failure twice -> 1 toast |
| N4c | N/T | different type with same message not exercised |
| N5a | PASS | viewport x=908,y=76 (below the 64px header), width 360, Logout not covered (see O1) |
| N5b | PASS | 375px: width 351 with 12px side margins at the bottom edge, no horizontal scroll |
| N5c | PASS (partial) | toast not inside the dialog (0 toasts in `role=dialog`); z-order above backdrop judged from screenshot only |
| N5d | PASS | toast survives route change (O2) |
| N6a | **N/T** | VoiceOver not run (headless automation). See risk note below |
| N6b | PASS (static) | icons and progress `aria-hidden`; viewport is `section[aria-label=Notifications]` with no role or live region |
| N6c | PASS | `/login?registered=1` prod: one `status`; toggle failure: one `alert` |
| N7a | PASS prod / FAIL dev | prod one toast; dev see DEF-1 |
| N7b | PASS | after login the login toast is gone on `/tasks` (only an earlier "Password changed" toast remained, a separate 5s toast) |
| N7c | PASS | reload of `/login?expired=1` shows the toast again |
| N7d | PASS (partial) | leaving `/login` clears it per N7b |

**Risk note on announcements (lead question 2).** Each toast is created with its text already inside a `role=status`/`role=alert` element and the container has no live region. Screen readers do not reliably announce live regions that are inserted with content, so success/info toasts may be silent in some browser and screen reader pairs. I could not verify with VoiceOver. Recommend a manual VoiceOver and NVDA pass before relying on the announcements.

### UI acceptance (U1-U11)
| ID | Result | Evidence |
|---|---|---|
| U1 | PASS | 375, 768 and 1280px x 7 pages x light/dark: `scrollWidth == clientWidth` in all 42 combinations (only `.table-scroll` scrolls). Screenshots reviewed: login split at 1280 (aside + card), tasks 375 stacked toolbar, admin 768 |
| U1d | N/T | 899/900 and 600/601 boundary not stepped |
| U2 | PASS (judged) | all pages rendered in dark with themed surfaces in screenshots; no white flash noticed (not frame-captured) |
| U3a | PASS | automated text-contrast scan of every visible text node on 7 pages x 3 widths in light and dark, excluding gradient backgrounds: no failures in dark; in light only gradient-background text was unscannable |
| U3b | PASS | computed against token stops: light white on gradient 5.47 / 5.36 / 8.72; dark white 7.58 / 7.27 / 10.36; dark on-primary on primary 7.77; badges light danger 4.92, success 4.83, info 5.91; dark 5.85 / 8.82 / 9.26; muted text 5.7-7.5. Nav pill hover state (translucent white on gradient) not measured |
| U3d | N/T | axe/Lighthouse not run |
| U4a-b | PASS (partial) | login and tasks tab order follows DOM, every stop has a 2px outline (white on header, primary elsewhere, offset 2px); full keyboard-only walk of register/admin not scripted (admin dialogs Escape and focus return covered in REG-8) |
| U4c | PASS | no `outline: none` on interactive elements; inputs use border + ring (O6) |
| U5 | PASS | primary hover `translateY(-1px)` plus brand shadow; disabled Disable button opacity .55, `not-allowed`, no transform on hover. Danger/ghost variants viewed in screenshots only |
| U6a | PASS | list skeleton: hidden "Loading tasks…" `role=status`, skeleton `aria-hidden`, no `li` |
| U6b | PASS | empty-state for no users match; tasks empty not separately captured |
| U6c-d | PASS | inline error banner with danger styling; field errors show |
| U6e | PASS | gradient checkbox with strike-through completed title; `item-in` and `check-pop` keyframes exist |
| U7a | PASS | 100-char unbroken title wraps, 1000-char description clamped to 3 lines, no horizontal scroll at 375 |
| U7b | PASS | 150-char toast wraps, 351px wide at 375; long username in table/header not exercised (usernames are short) |
| U8a-b | PASS | `prefers-reduced-motion`: 0 running animations; toast still dismisses at about 7.9s |
| U9a | PASS | no colour literals in `index.css` |
| U9b-c | PASS (judged) | tokens used throughout in screenshots; no exhaustive literal scan beyond colours |
| U10 | PASS | one listitem set (task `li`s), no `ul/li` in header nav or toast stack, `Add task` without `title` or `aria-describedby`, avatar `aria-hidden` sibling before `[aria-label="Signed in as"]` whose text is exactly the username |
| U11 | PASS | "Alice Smith" -> AS, "Administrator" -> A |

### Edge cases
| ID | Result | Evidence |
|---|---|---|
| E1 | PASS | admin's own row (REG-6d) |
| E2 | PASS | zero users match; zero tasks match not captured |
| E3 | PASS (partial) | task due 3 min ago is accepted; the "due exactly now" boundary not hit to the second |
| E4 | PASS | completing an overdue task removes the badge |
| E5 | N/T | long-username reset dialog at 375 |
| E6 | PASS | 640x400 (200%) and 320x200 (400%) on Tasks: no horizontal page scroll |
| E7 | PASS | toast with open dialog (N3c) |
| E8 | PASS | cap held with 4 rapid failures, no console errors |
| E9 | N/T | background tab |
| E10 | PASS | no console warnings across scripted runs (only expected 4xx/5xx from forced failures) |
| E11 | PASS | same |
| E12 | N/T | click × during exit |
| E13, E14 | N/T | short viewport/print; forced colors |
| E15 | PASS | 401 on toggle: redirect `/login?expired=1`, no error toast, exactly 1 match for /session has expired/i |
| E16 | PASS | disabled mid-session: one error toast, no duplicate |
| E17 | N/T (see S5) | offline mutation |
| E18 | PASS | success toast remains while the next wrong-current attempt shows the inline error |
| E19 | N/T | Safari and Firefox |

### Security (5.6)
| ID | Result | Evidence |
|---|---|---|
| S1 | PASS | no matches |
| S2a-c | PASS | title `<script>alert(1)</script>` and description `<img src=x onerror=alert(1)>` render as literal text in the list and in the delete dialog; a forced 500 message `<img src=x onerror=alert(2)> ...` renders literally in the toast; 0 `img` nodes, 0 browser dialogs fired |
| S3 | PASS | after triage (see Automated) |
| S4 | PASS | only SVG xmlns |
| S5a | PASS | forced 500 load and toggle: only the server message appears |
| S5b-c | N/T | offline / non-JSON 502 not forced |
| S6 | PASS | `npm audit --audit-level=high`: no high or critical |
| S7 | PASS | `grep localStorage|sessionStorage notifications/` empty; storage keys only `todo_app_*` |
| S8 | PASS | no data-driven inline style (script) |
| S9 | PASS (partial) | console output across runs showed no message/token logging; no explicit grep for `console.*` |

## Scenarios not tested

VoiceOver/NVDA (N6a), Safari and Firefox (E19), axe/Lighthouse, 899/900 and 600/601 breakpoint boundaries, nav hover contrast on the gradient, forced-colors, background-tab timing, offline and non-JSON error bodies (S5b-c), real mobile devices, N4c, long-username reset dialog, the full keyboard-only register/admin walk.

## Cleanup

Backend and frontend stopped, schema `todo_qa_change` dropped, scratch pre-change worktree removed. Test scripts and screenshots live in the session scratchpad (not committed: they contain seeded test credentials).
