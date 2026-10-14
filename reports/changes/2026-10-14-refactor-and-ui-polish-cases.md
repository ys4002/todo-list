# Test cases: refactor, notifications and UI polish (2026-10-14)

Author: QA · Source: `docs/changes/2026-10-14-refactor-and-ui-polish.md` (sections 2.3, 2.4, 5.1-5.6) · Branch: `feature/qa-refactor-ui-polish`

**Result column** is blank on purpose; Phase 2 fills it (PASS / FAIL / BLOCKED / N/T) with evidence in `reports/changes/2026-10-14-refactor-and-ui-polish.md`.

## 0. Setup (Phase 2, merged build only)

- Backend 8080 with a **disposable schema** (`todo_qa_change`, MySQL `root`/`root`), frontend 3000 (`npm run dev` or build+preview). Ports are reserved for merged master.
- Seed (README): admin `admin`/`admin`. Create `userA` and `userB` through Register in REG-2. Scratch notes and screenshots in `mktemp -d`, never in git.
- Browsers: latest Chrome (primary, devtools network and contrast), Safari and Firefox spot checks. Viewports 375, 768, 1280 px. OS light and dark.
- Fault injection: devtools "Request blocking" or "Offline", and a local override (`curl`-free) by blocking `PATCH /tasks/*`, `DELETE /tasks/*`, `GET /tasks`. For a 401, delete the token key in storage then act, or let the session expire. For 409 on admin self-toggle, use the admin API path by DevTools replay if the button is disabled.
- Automated/static: `bash reports/changes/frontend-checks.sh master` (covers A2, A3, A4, S1, S3, S4, S6, U9). Output pasted into the report.

## 1. Automated (section 5.1)

| ID | Steps | Expected | Result |
|---|---|---|---|
| A1 | `cd frontend && npm test` on merged build; note the count versus the 147 baseline | All existing tests pass unedited, plus new F1/F2/F3 tests; count = 147 + new. `git diff master...HEAD -- '*.test.ts*'` shows no edited assertions in existing test files (additions only) | |
| A2 | `npm run lint`; `npm run build` | Both clean | |
| A3 | `git diff --stat master...HEAD -- backend frontend/src/api frontend/src/auth` | Empty | |
| A4 | `git diff master...HEAD -- frontend/package.json frontend/package-lock.json backend/pom.xml` | Empty (no new dependency) | |
| A5 | `git diff --stat master...HEAD` file list vs plan section 4 | No file outside `frontend/src/**` and `frontend/index.html` (docs/reports excepted); index.html diff is only the `color-scheme` meta | |
| A6 | Run `npm test` twice, second time `npx vitest run --sequence.shuffle` | No order-dependent failures (fake-timer/toast leakage) | |
| A7 | New-test inventory: check that each 5.2 row has a test (formErrors, errorMessageOf, useModalDialog, role per type, auto-dismiss, pause hover/focus, close+Escape, cap, dedupe, outside provider, 5 flow tests, initials, skeleton, avatar) | Every row mapped to a test name | |

## 2. Manual behaviour regression (section 5.4)

| ID | Steps | Expected | Result |
|---|---|---|---|
| REG-1a | Logged out, open `/` | Redirect to `/login` | |
| REG-1b | Log in as userA, open `/`; as admin, open `/` | userA lands on `/tasks`; admin lands on the admin landing as on master | |
| REG-1c | Logged in, open `/login` and `/register` | Both redirect away (to the role home) | |
| REG-1d | Open `/nope` logged in and logged out | "Page not found" heading, logged-in shows the page with the link; unchanged vs master | |
| REG-1e | As userA open `/admin/users` and `/admin/users/1/tasks` | "Access denied" heading, `.button-link` back | |
| REG-2a | Register with empty fields, short password, mismatched confirm | Same validation messages as master, inline under fields | |
| REG-2b | Type a password | Live checklist `ul[aria-label="Password rules"]` items toggle `data-met` | |
| REG-2c | Register an existing username (any case) | 409 inline username field error; both password fields cleared | |
| REG-2d | Valid register | URL is `/login?registered=1` (param kept); one success toast "Registration successful. Please log in." with `role=status`; no inline banner | |
| REG-3a | Wrong password | Inline form error (no toast) | |
| REG-3b | Disable userA as admin, log in as userA | Inline "Account is disabled" text (no toast) | |
| REG-3c | Open `/login?expired=1`, `?passwordChanged=1`, `?disabled=1` directly | expired and passwordChanged = info toast; disabled = error toast; text identical to master; URL param kept | |
| REG-3d | Reach each notice through the real flow: let session expire; change password; disabled mid-session (admin disables userA while userA is on `/tasks`, userA acts) | Redirect `/login?expired=1` / `?passwordChanged=1` / `?disabled=1` with the matching toast | |
| REG-4a | Network tab: any API call after login | Response `X-Auth-Token` replaces stored token (sliding renewal); `X-Auth-Expires-In` honoured | |
| REG-4b | Remove/alter the token or wait past expiry, then act | Redirect `/login?expired=1`, one expired toast | |
| REG-5a | Create task: valid | Appears sorted by due date then created | |
| REG-5b | Create with a past due date (more than 5 min ago); and with one 3 minutes ago | First rejected with field error; second accepted (5-min grace) | |
| REG-5c | Edit a task incl. toggling Completed in the edit form | Saved, list updates, no toast | |
| REG-5d | Toggle checkbox (success) | Optimistic flip, no toast | |
| REG-5e | Toggle checkbox with `PATCH` blocked/failing (500) | Checkbox rolled back; one error toast (`role=alert`) with server message; gone after ~8 s; no inline load banner | |
| REG-5f | Delete via confirm dialog, success; then failure (block `DELETE`) | Success silent; failure error toast, dialog closed, task still present | |
| REG-5g | Filter tabs All / Active / Completed | Correct subsets, `aria-selected` correct | |
| REG-5h | Type in search quickly | Request fires once, ~300 ms after the last keystroke (network tab); Clear button resets | |
| REG-5i | Task due in about 1-2 minutes | Overdue badge appears without reload within about 60 s | |
| REG-5j | Block `GET /tasks` and reload `/tasks` | Persistent inline `ErrorBanner` (`role=alert`), no toast, still there after 15 s | |
| REG-6a | Admin: user search | Filters list; Clear resets | |
| REG-6b | Disable then enable userA via confirm dialog | Silent on success; badge flips Enabled/Disabled; Enable uses the primary tone | |
| REG-6c | Toggle fails (block `PATCH /admin/users/*`) | One error toast, badge unchanged | |
| REG-6d | Admin's own row | Toggle button disabled with its tooltip | |
| REG-6e | Reset password for userA (valid, then invalid) | Valid: dialog closes, success toast "Password updated for userA". Invalid: inline `role=alert` errors inside the dialog, no toast | |
| REG-6f | "View tasks" for userA, then "Back to users" | Per-user task page loads header and tasks; back link works | |
| REG-7a | Profile page | Details `dl` correct (first `dl`) | |
| REG-7b | Change password success | Token renewed (network), "Password changed" success toast, form cleared | |
| REG-7c | Change password with wrong current password | Inline field error; no toast | |
| REG-8a | Open ConfirmDialog and ResetPasswordDialog; press Escape | Closes | |
| REG-8b | Observe initial focus on open | Same element as master (confirm: its default button; reset: first field) | |
| REG-8c | After close (Escape, Cancel, confirm) | Focus returns to the opener button | |
| REG-9 | Replay REG-2 to REG-7 on master and on the merged build, export HAR for both, diff method/path/query/body | Request set identical | |

## 3. Notification cases (N1-N7)

| ID | Steps | Expected | Result |
|---|---|---|---|
| N1a | Trigger a success toast (change password) and time it | Disappears at about 5 s (+150 ms exit) | |
| N1b | Trigger an info toast (`/login?expired=1`) | About 5 s | |
| N1c | Trigger an error toast (toggle failure) | About 8 s; still visible at 7 s | |
| N1d | Trigger 10 assorted toasts over time | None remains beyond its duration; no orphan in DOM (`.toast-viewport` empty afterwards) | |
| N2a | Hover a toast at about 3 s for 15 s, then leave | Stays; progress bar frozen; after leave dismisses after the remaining time (~2 s) | |
| N2b | Tab into the toast close button, wait 15 s, Tab away | Same pause on focus and resume on blur | |
| N2c | Hover toast A while toast B is not hovered | B still dismisses on its own timer | |
| N3a | Click × | Immediate exit animation, gone within about 150 ms | |
| N3b | Focus inside toast, press Escape | Closes; Tab to × reachable | |
| N3c | Open a ConfirmDialog while a toast shows; focus the toast and press Escape | Toast closes, dialog stays open | |
| N3d | Close button accessible name | "Dismiss notification" | |
| N4a | Trigger 4 different failures quickly (4 tasks, block PATCH, toggle each) | At most 3 visible; oldest removed | |
| N4b | Trigger the same failure twice (same task, same message) | One toast; timer restarted (visible 4 s after second trigger for success type; for error 7 s after) | |
| N4c | Same message different type | Two toasts (dedupe key is type + message) | |
| N5a | 1280 px: toast position | Fixed top-right, below sticky header, 360 px max, does not cover Logout | |
| N5b | 375 px: toast position | Full width at bottom with side margins, above the home indicator area (safe-area), no overlap with the form | |
| N5c | Toast while a dialog is open | Toast above the dialog backdrop; dialog markup contains no toast | |
| N5d | Route change with toast showing (e.g. change password then navigate) | Toast survives the route change and finishes its timer | |
| N6a | VoiceOver on: success/info toast | Announced politely; error announced immediately; message read once | |
| N6b | Icons and progress bar | Silent (`aria-hidden`); viewport has no role/`aria-live`; section named "Notifications" | |
| N6c | DOM: `document.querySelectorAll('[role=status],[role=alert]')` on `/login?registered=1` and after a toggle failure | Exactly one `status` / exactly one `alert` | |
| N7a | Open `/login?expired=1` | Info toast, once (also under React StrictMode dev: not duplicated) | |
| N7b | Log in from it | On `/tasks` the toast is not present | |
| N7c | Reload `/login?expired=1` | Toast shown again | |
| N7d | `/login?registered=1`: leave to `/register` via link | Toast dismissed on leaving `/login` | |

## 4. UI acceptance (U1-U9)

| ID | Steps | Expected | Result |
|---|---|---|---|
| U1a | 375 / 768 / 1280 px on Login and Register | Split layout at 900 px and wider (aside is decorative, card centred, max 420 px); below 900 px a 180 px gradient band with the card overlapping; no horizontal scroll | |
| U1b | Same widths on Tasks in states: empty, loading, list, form open, confirm dialog, toast | No page horizontal scroll, no overlap/clipping; toolbar stacks at 375 px; task actions wrap at 480 px and below | |
| U1c | Same widths on Admin users, Admin user tasks, Profile, Not found, Access denied | Only `.table-scroll` scrolls horizontally; header wraps and nav scrolls at 600 px and below | |
| U1d | 899 / 900 px and 600 / 601 px boundaries | Breakpoints switch cleanly | |
| U2a | OS dark: visit every screen in U1 | All surfaces, gradients, inputs, badges, toasts, dialogs, skeletons, empty states themed; no white flash on load or navigation | |
| U2b | Switch OS theme while page open | Live update; `meta color-scheme` present | |
| U3a | Contrast, light: body, muted text, labels, badges, buttons (all variants), links, error/field text, toasts per type | Text at least 4.5:1; large text and UI borders, checkbox border, focus ring at least 3:1 | |
| U3b | Contrast on the brand gradient: header text, nav pills (idle, hover, active), ghost Logout, auth aside brand label, primary button | Text at least 4.5:1 across all gradient stops; focus ring visible on the gradient | |
| U3c | Same as U3a/U3b in dark | Same thresholds | |
| U3d | Run axe (devtools/lighthouse) on Login, Register, Tasks, Admin users | No serious/critical violations | |
| U4a | Keyboard only: register, login, create/edit/toggle/delete task, admin disable and reset password, logout | Everything reachable with visible focus; tab order follows DOM; toast × is last in tab order | |
| U4b | Dialog open/close with keyboard | Escape closes; focus returns to opener (see REG-8) | |
| U4c | No `outline: none` without replacement | Inspect `:focus-visible` on button, link, input, checkbox, tab, nav link | |
| U5 | Hover, focus-visible, active, disabled on default, primary, danger, ghost, ghost danger, small, `.button-link` | Distinct states; primary lifts 1 px with brand shadow and presses back on active; disabled has opacity .55, not-allowed cursor, no lift | |
| U6a | Throttle network, load Tasks and Admin users | Skeleton shown (shimmer), hidden text "Loading tasks…" / "Loading users…" with `role=status`; skeleton `aria-hidden`; no `li`/`tr` in skeleton | |
| U6b | Empty states: no tasks, no search results (tasks), no users match | Illustrated empty state with the unchanged text; variant matches; SVG `aria-hidden` | |
| U6c | Inline error banner (load failure) | Danger-soft banner with left border and icon, `role=alert` | |
| U6d | Validation styling | `aria-invalid` fields get danger border and ring; field error shows "!" glyph | |
| U6e | Checkbox | Checked state gradient fill with check; pop animation; strike line draws across completed title; focus ring visible | |
| U7a | Task with 100-char unbroken title and 1000-char description | Title wraps/breaks without overflow; description clamped to 3 lines | |
| U7b | Username 40+ chars in header, admin table and toast ("Password updated for <long>") | Wraps or ellipsizes, no layout break; toast max 360 px on desktop | |
| U8a | OS "Reduce motion" on: use the app | No transforms, keyframes, shimmer, check pop, item enter, toast slide or progress animation | |
| U8b | Reduced motion: toast still auto-dismisses | Gone at the normal time | |
| U9a | `grep -nE '#[0-9a-fA-F]{3,8}\b\|rgba?\(\|hsla?\(' frontend/src/styles/index.css` | No matches (also run by the script) | |
| U9b | Scan CSS for spacing/radius/font-size literals vs tokens | Predominantly `var(--space-*)`, `--radius-*`, type scale tokens; list any exceptions | |
| U9c | Visual pass: heading sizes, card padding, button heights across pages | Consistent; control height 40 px (44 px at 600 px and below) | |
| U10 | Markup contract spot checks in the DOM (5.3): only task `li`s on `/tasks`; `Add task` has no `title`/`aria-describedby`; avatar `aria-hidden` sibling before `[aria-label="Signed in as"]`, whose text is exactly the username; one heading per dialog; table `td` username alone; badge text alone | All hold | |
| U11 | Header avatar chip | Initials from `name` (1-2 chars) or first letter of username; matches `initials.ts` cases | |

## 5. Edge cases (section 5.5 list)

| ID | Steps | Expected | Result |
|---|---|---|---|
| E1 | Admin's own row in the table | Disabled toggle with tooltip; layout fine in light/dark | |
| E2 | Zero search results (tasks and users) | Search-variant empty state, original text | |
| E3 | Task due exactly now / within grace | Not marked overdue until past due; badge appears on next minute tick | |
| E4 | Completed and overdue task | No Overdue badge | |
| E5 | Reset dialog at 375 px with a long username | No overflow; buttons reachable; Escape closes | |
| E6 | Browser zoom 200% (and 400% at 1280 px) on Login, Tasks, Admin | No clipped content or lost controls; toasts still reachable | |
| E7 | Toast while a dialog is open (trigger failure from behind is not possible; use change-password toast then open dialog) | Toast stays above backdrop; Escape in toast does not close dialog (N3c) | |
| E8 | Rapid toggle failures on 5 tasks | Cap of 3 visible, no console errors, no stuck timers | |
| E9 | Background the browser tab for 30 s with a toast showing | Timer keeps running; toast gone on return (accepted per plan) | |
| E10 | Unmount: trigger toast then navigate to `/login` via Logout | No console warning about state updates after unmount | |
| E11 | Console during full REG pass | No errors/warnings (React key, act, etc.) in dev build | |
| E12 | Double-click a toast × / click × during exit | No error; toast removed once | |
| E13 | Print or very short viewport (height 500) | Header remains usable, toast not covering the whole screen | |
| E14 | Forced colors / high contrast (Chrome rendering emulation) | Checkbox visible (native appearance), focus visible, borders present | |
| E15 | Login 401 mutation suppression: expire token, toggle a task | No error toast; one expired info toast on `/login?expired=1` (exactly one match for /session has expired/i) | |
| E16 | Disabled mid-session then mutate | `/login?disabled=1` with one error toast, not two | |
| E17 | Network offline and toggle | Error toast "Network error"-class message only (see S5) | |
| E18 | Change password success then submit again with wrong current password | Success toast unaffected while inline field error appears | |
| E19 | Safari and Firefox pass on Login, Tasks, Admin (layout, checkbox, toast, backdrop blur, sticky header) | No visible breakage; list differences | |

## 6. Frontend security (section 5.6)

| ID | Steps | Expected | Result |
|---|---|---|---|
| S1 | `grep -rnE 'dangerouslySetInnerHTML\|innerHTML\|eval\(' frontend/src` | No matches | |
| S2a | Create task titled `<script>alert(1)</script>`, description `<img src=x onerror=alert(1)>` | Rendered as literal text in list, edit form, delete dialog; no alert | |
| S2b | Make toggle/delete of that task fail so a message could echo the title (use a request override returning `{"message":"<img src=x onerror=alert(1)>"}` if possible) | Literal text in the toast; no alert | |
| S2c | Register/username and admin table with HTML-looking username (if validation allows) | Literal | |
| S3 | `npm run build`; `grep -rniE 'secret\|password=\|api[_-]?key\|Bearer ' frontend/dist` | No secrets (triage any framework-string match) | |
| S4 | `grep -rnE 'https?://' frontend/src/styles frontend/index.html frontend/src/components frontend/src/notifications` | Only SVG `xmlns` | |
| S5a | Force 500 on load and on toggle | Banner/toast shows only server `message` or "Something went wrong" | |
| S5b | Force network error (offline) on load and on toggle | Only "Network error" or "Something went wrong"; no stack, URL or token | |
| S5c | Force non-JSON 502 body | Fixed fallback text | |
| S6 | `npm audit --audit-level=high` | No high/critical | |
| S7 | Storage and URL: during toasts, inspect localStorage/sessionStorage and the URL; `grep -rn "localStorage\|sessionStorage" frontend/src/notifications` | Toast text never stored or in URL; token storage unchanged | |
| S8 | Inline styles: grep `style=` in non-test TSX; inspect DOM for `style` attributes built from data | Only the numeric `--toast-duration` | |
| S9 | Console and network log for toast messages or tokens being logged | No `console.*` output of messages or tokens | |

## 7. Counts

Automated 7 · Regression 38 · Notifications 25 · UI acceptance 28 · Edge 19 · Security 13 · **Total 130**. Probe matrix and `reports/security-report.md`: N/A for this change (plan 5.6).

## 8. Not planned (to be listed under "scenarios not tested")

Screen readers beyond a basic VoiceOver pass; browsers other than latest Chrome/Safari/Firefox; real mobile devices (emulation only); performance profiling.
