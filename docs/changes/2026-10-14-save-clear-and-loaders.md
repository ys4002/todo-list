# Change plan: bug review, Save/Clear for task completion, loaders for API calls (2026-10-14)

Change 3 on `apps/todo-app`. Base: `master` at 42099db (frontend 22 files / 205 tests pass, build ok; backend `mvn test` green).
`docs/plan.md` and `docs/openapi.yaml` are unchanged by this change.

## 1. Overview

### 1.1 Outcome
1. The bugs still open in the app are listed and classified; the small, safe ones are fixed in this change (section 1.4).
2. Ticking or unticking a task's checkbox no longer calls the API. It stages a pending change and shows **Save** and **Clear** on that task. Save sends the change; Clear discards it.
3. Every API call shows a loader icon in the UI, and the control that started it is disabled until it finishes, so nothing can be submitted twice.

### 1.2 Scope
- Frontend only. **Backend: N/A.** The existing `PATCH .../tasks/{id}/completion` (own and admin scope) already does what Save needs. No backend bug found that blocks this change.
- One new shared `Spinner` component (plain CSS, no new library).
- Bug fixes B1 to B8 (section 1.4).

### 1.3 Exclusions
- No "Save all" / "Clear all" for several staged tasks; each task is saved on its own.
- No "unsaved changes" warning when leaving the page; staged changes live only in the page's state and are lost on navigation or reload.
- No backend changes, no API contract changes, no new dependencies.
- No focus trap for dialogs (known limitation stays), no toast screen-reader work, no change to toast placement unless the user picks it (DEF-3, Q1).

### 1.4 Bug audit

| ID | Area | Finding (evidence) | Severity | Class |
|---|---|---|---|---|
| B1 | Search, filter tabs | `useTasks` and `useAdminUsers` set `loading` only for the first load. When the tab or search text changes, the old list stays on screen under the new tab with no sign of loading until the response arrives (`useTasks.ts:31-52`, `useAdminUsers.ts:12-29`). | Medium | **Fix now** (part of the loader work) |
| B2 | List vs mutation race | A list fetch that started before a create, edit, completion or delete finished can resolve afterwards and overwrite the list with stale data (for example a just-created task disappears, or a saved completion appears reverted until the next reload). Only stale *list* responses are cancelled today, not list-vs-mutation (`useTasks.ts:38-61`). Most likely when you type in search and then save quickly. | Medium | **Fix now** |
| B3 | Complete / incomplete | Checkbox fires the API at once and optimistically. Two fast clicks send two PATCH calls (true, then false) whose responses can arrive out of order, so the UI can end up different from the server (`useTasks.ts:74-87`). | Medium | **Fix now**: replaced by Save/Clear with an in-flight guard |
| B4 | Delete task | The confirm dialog closes at once and `remove` runs with no busy state. During the call the row can be deleted again, edited or toggled, which gives a 404 error toast (`TasksPanel.tsx:62-75`). | Low-medium | **Fix now** (row-level busy) |
| B5 | Admin disable/enable | Same pattern: the dialog closes, `setUserEnabled` runs, and the row button stays active, so a second click sends a second, opposite request (`AdminUsersPage.tsx:24-29`, `useAdminUsers.ts:31-39`). | Low-medium | **Fix now** (row-level busy) |
| B6 | Task form | (a) **Cancel** stays enabled while saving: the form closes but the create or edit still completes, and the user can open the form again and create a duplicate. (b) The edit form copies `completed` when it opens. If the row's checkbox changes while the form is open, saving the form overwrites it with the old value (`TaskForm.tsx:26, 101`). | Low-medium | **Fix now** |
| B7 | Reset password dialog | Cancel and Escape still work while the reset is in flight: the dialog closes, but the reset completes and a success toast appears later (`ResetPasswordDialog.tsx:28, 86`). | Low | **Fix now** |
| B8 | Admin table 768 px (QA O4, open cosmetic) | The Tasks cell wraps to 3 or 4 lines ("0 total, 0 open"), and the user search box touches the table. | Cosmetic | **Fix now** (CSS only; `UserTable` and its CSS are edited anyway) |
| DEF-3 | Toasts vs Reset password dialog at 1024 px | Three toasts cover part of the dialog's submit button. | Low-medium | **Needs user decision** (Q1). Default: not in this change. |
| OBS-1 | Backend auth | A stale bearer token on `/api/auth/login` or `/register` returns 401. The frontend no longer sends one. | Low | Already accepted |
| L1 | Dialogs | Dialogs do not trap focus. | Low | Already accepted (known limitation) |
| L2 | Toasts | Not tested with a screen reader, Safari or Firefox. | n/a | Already accepted (not tested) |
| L3 | Prod config | `JWT_SECRET` and `ADMIN_PASSWORD` default to dev values; the default `admin`/`admin` password. | Known | Already accepted (documented; needs ops setup) |
| L4 | `backend/Dockerfile` | Uses Java 17 images while the project targets Java 21 (file added by the user). | Low | **Needs user decision** (Q2). Default: not in this change. |
| N1 | Filter tabs a11y | `role="tablist"` without arrow-key navigation or a `tabpanel`. | Low | Out of scope; noted for later |

No bug was found in overdue logic, search matching or authorization that this change touches.

### 1.5 Assumptions (the plan proceeds on these unless the user objects)
- A1. Save/Clear applies to the **list checkbox** only. The edit form keeps its own "Completed" checkbox under the form's Save (that is already a save step).
- A2. Staged changes survive filter-tab and search changes, keyed by task id. If the task is hidden by the new filter, its staged change is kept and reappears with the task. Staged changes are lost on navigation or reload (exclusion).
- A3. A staged change does not move the task between tabs. The list, Overdue badge and strike-through follow the **saved** state until Save succeeds.
- A4. Search box loader: shown while the debounce is pending and while any list refetch (search **or** tab change) is in flight. This is one indicator for "the list is updating". It sits inside the search box.
- A5. A failed Save shows the existing error toast (`notifyMutationError`, matching REG-5e) **and** keeps the change staged. A row-level line "Not saved. Try again." is also shown so the failure is visible next to the task.
- A6. Logout makes no API call, and the session is restored from storage without a call, so neither needs a loader. The admin page's `getUser` header lookup runs at the same time as the task list load, so the panel skeleton covers it; no extra loader.

### 1.6 Questions for the user (not blocking; the defaults above apply)
- Q1. DEF-3: fix toast overlap with dialogs in this change? Recommended option: while any dialog is open, move the toast stack to top-right at widths of 1024 px and up. This is a small CSS and `NotificationProvider` change. Default: leave it as accepted.
- Q2. `backend/Dockerfile` Java 17 → 21: change it here? Default: no, because it is a user-owned deployment file.

## 2. Architecture

### 2.1 Shared `Spinner` (new: `components/Spinner.tsx`, CSS in `styles/index.css`)
```tsx
<Spinner />                         // decorative: <span class="spinner" aria-hidden="true" />
<Spinner label="Updating tasks…" /> // + <span role="status" class="visually-hidden">label</span>
```
- Props: `label?: string`, `size?: 'sm' | 'md'` (default `sm` = 1em, so it scales with the button text).
- CSS: a circle with a `currentColor` border and one transparent side, `@keyframes spin` 0.8s linear infinite. Inside the existing `@media (prefers-reduced-motion: reduce)` block it does not rotate; it shows a static dotted ring instead. The meaning never depends on motion, because the busy text also changes (below).
- Buttons that are busy follow one pattern: `disabled`, `aria-busy="true"`, `<Spinner />` before the label, and a progressive label ("Saving…"). The button keeps its width (`min-width` from the idle label) so the layout does not jump.
- `LoadingSkeleton` stays for first loads.

### 2.2 Save/Clear completion flow
State:
- `TasksPanel` holds `staged: Map<number, boolean>` (task id → desired `completed`).
- `useTasks` exposes `busyIds: ReadonlySet<number>` (ids with a completion save or a delete in flight). It also exposes `refreshing: boolean` (a list fetch is in flight after the first load).
- `useTasks.toggle` is replaced by `setCompleted(task, completed): Promise<void>`. It is **not optimistic**: it adds the id to `busyIds`, calls PATCH, runs `applyServerTask` on success, and rethrows on failure after showing the toast.

Row (`TaskItem`) behaviour:
| Situation | Checkbox shows | Row UI |
|---|---|---|
| No staged change | saved `completed` | Edit, Delete |
| Staged (value ≠ saved) | staged value | "Unsaved change" chip, **Save** (primary small) and **Clear** (ghost small). Edit and Delete stay available. |
| Checkbox toggled back to the saved value | saved value | The staged entry is removed (same as Clear) |
| Saving | staged value | Save shows Spinner + "Saving…". Checkbox, Save, Clear, Edit and Delete are disabled. The row has `aria-busy="true"`. |
| Save failed | staged value | Staged change kept, Save enabled again, row error line `role="alert"` "Not saved. Try again.", plus a toast (A5) |
| Deleting | saved value | Delete shows Spinner + "Deleting…"; all row controls disabled; `aria-busy` |
| Task open in the edit form | the form's value | Row checkbox, Save, Clear and Delete disabled (fixes B6b); Edit button shows "Editing" |

Interactions:
- **Several staged tasks:** each row is independent. Saves on different rows can run at the same time; one row's busy state does not block another.
- **Save success:** remove the staged entry. If the task still matches the filter, focus goes to its checkbox. If it dropped out (for example Completed on the Active tab), focus goes to the list container (`tabIndex=-1`, labelled "Tasks"). The panel's polite live region announces "'<title>' marked as completed" or "marked as not completed".
- **Clear:** remove the staged entry, focus the row checkbox, announce "Change discarded for '<title>'".
- **Edit with a staged change:** the form's Completed checkbox starts from the **staged** value, so nothing is lost. A successful form save removes the staged entry; Cancel keeps it.
- **Delete with a staged change:** after a successful delete the staged entry is removed. If the delete fails, it is kept.
- **Filter/search change:** see A2 and A3. Staged entries for ids the server says were deleted (404 on Save) are removed, and the existing 404 toast shows.
- **Overdue:** the badge is based on the saved state, so an overdue task staged as completed still shows Overdue plus "Unsaved change" until saved. After Save it clears as it does today.
- **Admin view of another user's tasks:** `AdminUserTasksPage` uses the same `TasksPanel` with `scope={kind:'admin'}`, so the behaviour is identical. Save calls the admin-scope PATCH, which is already authorised for ADMIN only.

Accessibility:
- The checkbox keeps its label "Mark '<title>' as completed". While staged it gets `aria-describedby` → the "Unsaved change" chip id.
- Buttons: Save `aria-label="Save completion change for '<title>'"`, Clear `aria-label="Discard completion change for '<title>'"`. These are distinct from the search box's existing "Clear" button.
- The live region is one `<p role="status" aria-live="polite" class="visually-hidden">` per panel.
- Every new control can be reached with Tab in DOM order: checkbox → Save → Clear → Edit → Delete.

### 2.3 Loader placement per call

| Call | Where the loader shows | Disabled while in flight |
|---|---|---|
| Login, Register | Inside the submit button: "Logging in…" / "Registering…" | Submit (already); the form's fields stay editable |
| Task create / edit (`TaskForm`) | Inside the submit button: "Adding…" / "Saving…" | Submit **and Cancel** (B6a) |
| Complete / incomplete (Save) | Inside the row Save button | Whole row (see 2.2) |
| Delete task | Inside the row Delete button (the dialog closes at once, as today) | Whole row (B4) |
| Change password | Inside the submit button: "Changing…" | Submit |
| Admin reset password | Inside the dialog submit button: "Resetting…" | Submit, Cancel and Escape (B7: `useModalDialog` gets an `enabled`/guard so `onClose` is ignored while pending) |
| Admin disable / enable | Inside the row button: "Disabling…" / "Enabling…" (the dialog closes at once, as today) | That row's Disable/Enable and Reset password buttons (B5). `useAdminUsers` exposes `busyIds`. |
| Task list first load / admin users first load | Existing `LoadingSkeleton` (unchanged) | n/a |
| Task list refetch (search, tab change, B2 refetch) | Spinner inside `SearchBox` (right side, before its Clear button), labelled "Updating tasks…"; list wrapper `aria-busy="true"` and opacity 0.6 | Nothing (the user can keep typing; old responses are already cancelled) |
| Admin user search refetch | Same `SearchBox` spinner, "Updating users…"; table wrapper `aria-busy` | Nothing |

`SearchBox` gets one new prop `busy?: boolean` (and `busyLabel?: string`).

### 2.4 B2 fix (list vs mutation race)
In `useTasks`, keep a `mutationSeq` ref that every successful mutation increments. Each list fetch remembers the value it started with. If the value differs when the response arrives, the response is ignored and one refetch starts (a `reloadKey` state increment). The refetch keeps `refreshing` true so the spinner stays visible. No change is needed in `useAdminUsers`: its mutation (`setUserEnabled`) does not change list membership, and it replaces rows by id.

### 2.5 Affected areas and preserved behaviour
Files (all `frontend/`):
- New: `src/components/Spinner.tsx`.
- Edit: `src/components/TaskItem.tsx`, `TaskList.tsx`, `TasksPanel.tsx`, `TaskForm.tsx`, `SearchBox.tsx`, `ChangePasswordForm.tsx`, `ResetPasswordDialog.tsx`, `UserTable.tsx`, `src/hooks/useTasks.ts`, `useAdminUsers.ts`, `useModalDialog.ts`, `src/pages/AdminUsersPage.tsx`, `LoginPage.tsx`, `RegisterPage.tsx`, `src/styles/index.css`, and the related tests.

Preserved behaviour:
- Error toasts and their text, the dedupe, and the cap.
- Dialog focus return (DEF-2 fix) and dialog initial focus.
- Validation messages and field errors.
- 401 → logout.
- The admin cannot disable themselves.
- Sort order (dueAt, createdAt).
- Search and filter semantics.
- The skeleton on first load.
- Light and dark themes, and the 375/768/1024 px layouts (Save/Clear wrap into the existing `.task-actions` row on narrow screens).
- Changed on purpose: an immediate checkbox → API call becomes Save/Clear, so the rollback on failure (REG-5e) becomes "stays staged".

## 3. API Contract
No change. Uses the existing `PATCH /api/tasks/{id}/completion` and `PATCH /api/admin/users/{userId}/tasks/{id}/completion` with `{ "completed": boolean }`.

## 4. Tasks by Role

**Backend: N/A** (no backend change needed).

**Frontend (`dev-frontend`)**, one branch, in this order:
1. F1 `Spinner` component and CSS (spin, reduced-motion static state, button `aria-busy` style, `min-width` keep), plus a unit test.
2. F2 `useTasks`: replace `toggle` with non-optimistic `setCompleted`; add `busyIds` for completion and delete, `refreshing`, and the `mutationSeq` + refetch fix (B2). Tests for B2 (a list response resolved after a create is ignored and refetched), `busyIds` and `refreshing`.
3. F3 Save/Clear UI in `TaskItem`, `TaskList` and `TasksPanel` (staged map, live region, focus rules, edit/delete interplay, row busy, row error). `TaskForm`: initial `completed` from the staged value; Cancel disabled while pending; spinner in submit (B6).
4. F4 Loaders and double-submit guards: `SearchBox` busy; Login, Register, ChangePassword and ResetPassword buttons; `useModalDialog` close guard (B7); `useAdminUsers.busyIds` + `UserTable` row spinners (B5); B8 CSS (`.cell-tasks { white-space: nowrap }`, a gap above the table).
5. F5 Update the existing tests that assumed an immediate toggle API call (tasksPanel tests, REG-5e equivalents). Run `npm test`, `npm run build` and `npm audit --audit-level=high`. Run Code Simplifier (more than 3 files).

**QA (`dev-qa`)**: run the rows in 5.4 on merged `master`. Write the results to `reports/changes/2026-10-14-save-clear-and-loaders.md`.

## 5. Test Plan

### 5.1 New or updated automated tests (Vitest + Testing Library)
- T1 Ticking the checkbox makes **no** fetch; Save and Clear appear; "Unsaved change" is described.
- T2 Save → one PATCH with the right `completed` and scope (own and admin); the row updates; Save and Clear disappear; the live region text is right; focus goes to the checkbox (or the list when the task leaves the filter).
- T3 Clear → no fetch; the checkbox shows the saved state again; focus is on the checkbox.
- T4 Toggling twice → no Save or Clear (auto-cleared).
- T5 Two tasks staged; saving one leaves the other staged.
- T6 Save failure (500) → toast plus row error; still staged; Save enabled again.
- T7 While saving: Save shows the spinner and "Saving…", all row controls are disabled, and a second click sends no second request.
- T8 Staged then a tab or search change → the staged state reappears when the task is listed again.
- T9 Edit form opened on a staged task starts with the staged Completed value; a successful save clears the staged entry; while editing, the row checkbox is disabled.
- T10 Delete → the row is busy; the dialog cannot be triggered again for that row; on success the staged entry is gone.
- T11 B2: a list response that started before a successful create does not remove the created task.
- T12 SearchBox spinner is shown during the debounce and the refetch; `role=status` "Updating tasks…"; it is hidden when idle. The same applies to a tab change.
- T13 Login, Register, Change password, Reset password and TaskForm submit buttons show the spinner and busy label and are disabled while pending. TaskForm Cancel and the Reset dialog Cancel/Escape are ignored while pending.
- T14 Admin Disable/Enable row → spinner, row buttons disabled, one request only.
- T15 `Spinner` renders `aria-hidden` without a label and `role=status` with one.

### 5.2 Acceptance criteria
1. No completion API call happens until Save; Clear restores the saved state with no API call.
2. Each API call listed in 2.3 shows a visible loader while it is in flight, and its trigger cannot send a second request.
3. Failures keep the user's staged input or form values, and show an error both at the control and in a toast where a toast exists today.
4. Everything works by keyboard alone; screen readers get busy and result announcements; with reduced motion there is no spinning animation.
5. Bugs B1 to B8 are fixed and have regression tests (B8 is checked visually).
6. Frontend `npm test` all pass, `npm run build` ok, `npm audit --audit-level=high` clean; backend untouched (`mvn test` still green).

### 5.3 Regression list
REG-1 (routing), REG-2 (register), REG-3 (login notices), REG-5a-d and f (task CRUD, search, filters), REG-8 (dialog focus, DEF-2), N1-N7 (toasts, DEF-1), the admin flows (list, search, view tasks, disable/enable, reset), the 375/768/1024/1280 layouts in light and dark, and the existing security probe matrix (unchanged endpoints; spot-check the user A vs user B task PATCH = 404 and non-admin admin PATCH = 403).

### 5.4 QA retest rows (manual or Playwright, real stack)
- S1 Stage, Save and Clear on My Tasks and on Admin → user tasks (network tab: PATCH only on Save).
- S2 Stage 3 tasks, save 1, clear 1, change tab and back → the third is still staged.
- S3 Block PATCH (500) → staged kept, toast and row error shown.
- S4 Throttle network (Slow 3G): every call in 2.3 shows its loader; double clicks send one request (count requests).
- S5 Type a search, then save a task within 300 ms → the list is correct after both settle (B2).
- S6 Reduced motion on: the spinner does not rotate; the busy labels are still shown.
- S7 Keyboard only: stage → Tab to Save → Enter; Clear; focus lands as specified; VoiceOver spot check if available (otherwise "not tested").
- S8 768 px admin table: the Tasks cell is on one line and the search box has a gap (B8).
- S9 375 px: Save and Clear wrap correctly in a task row; no horizontal scroll.

## 6. Security
Touched only on the client side. No new endpoints, roles or data. Save uses the existing scoped PATCH, so ownership and admin checks stay on the server. Security criteria:
- Admin-scope Save still goes to `/api/admin/users/{id}/tasks/...` and only an ADMIN can reach that page. Spot-check: non-admin gets 403 and another user's task gets 404.
- No staged state is stored outside memory: nothing is written to localStorage or the URL.
- Busy guards are only for UX. The server stays the source of truth.

## 7. Web quality and search visibility
N/A. Only private, authenticated pages (`/tasks`, `/profile`, `/admin/*`) and the login and register forms change. No indexable pages, metadata, `robots.txt` or sitemap are affected.
