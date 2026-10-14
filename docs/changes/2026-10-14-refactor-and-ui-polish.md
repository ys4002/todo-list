# Change plan: refactor, notifications and UI polish (2026-10-14)

App: `apps/todo-app` (branch `master`). Base plan: `docs/plan.md` (unchanged by this change). Status: **awaiting user approval (amended)**.

## 1. Overview

**Outcome.** The same app and API, with (a) a frontend codebase without the duplicated error handling and dialog boilerplate found below, (b) a proper transient notification (toast) system so confirmations and transient errors go away on their own, and (c) a UI raised from "tidy" to "beautiful": a branded, layered, animated design built in plain CSS on a design-token system, responsive and accessible.

**User request.** "Go through the application code and update the application. No new features as of now, but refactor the code a bit, and the UI is lacking very much; it is almost ugly." **Amendment (verbatim):** "I want the front end to look beautiful and handle notifications properly. As of now the notifications don't go away. All the UI is so simple basically with no CSS make sure to update that as well."

**In scope**
- Frontend TypeScript refactor (section 2.2).
- Notification system (section 2.3): provider, hook and toast stack; call sites moved per the decision table.
- Visual redesign (section 2.4): tokens, brand gradient, layered surfaces, auth layout, micro-interactions, illustrations, skeletons; class names, wrappers and small presentational components added where styling needs them.

**Out of scope (hard constraints)**
- **No behavior change and no API-contract change**, with one precise relaxation below. Same routes, guards, redirects (including the `?registered|expired|disabled|passwordChanged=1` URLs), requests (method, path, query, body), validation rules, messages, sort and filter logic, session timers, optimistic updates and rollbacks. Section 5.4 lists what must not regress.
- **Relaxation (notification persistence and placement only):** the messages listed as "toast" in section 2.3 move from persistent inline banners to auto-dismissing toasts in a fixed stack. Their text, role (`status`/`alert`) and trigger conditions stay the same. Two consequences are accepted: (1) Login URL-param notices are dismissed when the user leaves `/login`; (2) a mutation failure with status 401 shows no error toast, because the session handler already redirects to `/login?expired=1` or `?disabled=1` with its own notice (today the inline error unmounts with the page, so the user never sees it either). Nothing else in this list changes.
- **No backend change.** I reviewed the backend (layered, packaged by feature, services hold the rules, one `GlobalExceptionHandler`, no dead classes, naming follows `team.md`). The only nit is the `"User not found"` literal (twice in `AuthService`, once as a constant in `AdminUserService`), too small to justify a backend branch. `backend/` must have an empty diff.
- No new dependencies (npm or Maven), no UI kit, no toast library, no CSS framework, no CSS-in-JS, no CSS modules, no web fonts (system stack only), no icon library or external assets (decorative SVG is inline JSX or a CSS data URI, always `aria-hidden`).
- No new features: no new routes, pages, settings, theme toggle, pagination or sorting controls, and no new success messages (for example, enable/disable stays silent on success).
- No user-visible copy changes, except the non-heading brand label "Todo" (header and auth pages) and the toast close button's accessible name "Dismiss notification".
- `docs/plan.md`, `docs/openapi.yaml` (not present) and existing test assertions are not modified. Tests are **added**. An existing-test edit is allowed only if the Team Lead approves it as a pure selector update with unchanged intent; section 5.3.1 shows none is expected.

**Assumptions and resolved defaults**
- Dark mode follows `prefers-color-scheme` only (no toggle).
- `ConfirmDialog` gets the visual-only `tone?: 'danger' | 'primary'` prop (Enable uses `primary`).
- Brand accent is deep teal to blue (section 2.4). The user can name another hue at approval; only `tokens.css` would change.
- Minimum viewport 375px; latest Chrome, Safari and Firefox.
- Baseline test count: `vitest list` shows **147** tests (the earlier "165" was wrong). F1 records the real count from `npm test` on `master` before starting; "all existing tests" below means that set.

No blocking questions.

## 2. Architecture

### 2.1 Affected areas and dependencies
- Only `frontend/src/**`, plus one `<meta name="color-scheme" content="light dark">` line in `frontend/index.html`.
- Frontend architecture is unchanged: React 19 + TS + Vite, React Router, `AuthContext`, hooks for data, `api/` client. One new context (`notifications/`) following the `AuthContext` pattern. No new layers.
- **Where the provider mounts:** `NotificationProvider` wraps the `<Routes>` returned by `AppRoutes` in `App.tsx`. Both `App` and the test helpers (`src/test/testUtils.tsx`, `src/qa/qaUtils.tsx`, which render `AuthProvider > AppRoutes`) therefore get it with **no test-util edit**. The toast stack survives route changes because `AppRoutes` stays mounted. (Fallback, only if needed: add the provider to both test utils; this is allowed.)
- F1, F2 and F3 touch the same components, so **one frontend developer does them in order on one branch** (section 4).

### 2.2 Refactor targets (frontend TS), each justified by what I found

| # | Finding (file evidence) | Change | Behavior impact |
|---|---|---|---|
| R1 | The server field-error mapping loop is copied in **4** places: `TaskForm.tsx`, `ChangePasswordForm.tsx`, `ResetPasswordDialog.tsx`, `RegisterPage.tsx`. `ApiRequestError.fieldMessage()` is used only by a test. | New `src/utils/formErrors.ts` exporting `fieldErrorsFrom<K extends string>(error: ApiRequestError, fields: readonly K[]): FieldErrors<K>`, built on `error.fieldMessage(field)`. Replace all 4 loops. | None (first message wins, same field filter, same "no known field → form error" branch). |
| R2 | `error instanceof Error ? error.message : 'Something went wrong'` appears 7 times (two local `messageOf` helpers in `useTasks.ts`, `AdminUsersPage.tsx`, plus 5 inline copies). | `errorMessageOf(error: unknown): string` in `formErrors.ts`; use it everywhere. | None. |
| R3 | `ConfirmDialog` and `ResetPasswordDialog` each register their own Escape listener and duplicate backdrop markup; neither returns focus to the opener. | New `src/hooks/useModalDialog.ts`: `useModalDialog(onClose)` handles Escape and restores focus to the previously focused element on unmount. Initial focus stays per dialog. No focus trap (known limitation). | Adds focus return only (a11y). |
| R4 | `<p role="status" className="success-banner">` repeated in 3 places. | **Superseded by F2**: all three become success toasts (section 2.3). No `SuccessBanner` component. | See 2.3. |
| R5 | `AdminUsersPage.tsx` mixes fetching, cancellation and the enable/disable mutation with rendering. | New `src/hooks/useAdminUsers.ts` (`useAdminUsers(q)` → `{ users, loading, error, setError, toggleEnabled(user) }`), moving the effect and `confirmToggle` body verbatim. In F2 the toggle failure goes to `notify.error` instead of `setError`. | None in F1. |
| R6 | `LoginPage.tsx` compares `error.message === 'Account is disabled'`, duplicating `DISABLED_MESSAGE` from `AuthContext.tsx`. | Use `DISABLED_MESSAGE`. | None. |
| R7 | `AdminUserTasksPage.tsx` has an intentional `.catch(() => {})` (header falls back; `TasksPanel` surfaces the error). | Keep; add a one-line comment saying why. | None. |

**Considered and rejected:** a generic `useForm` hook, a `FormField` textarea variant, a `Dialog` shell component, any backend refactor (reasons unchanged: extra indirection for little gain).

### 2.3 Notification system (F2)

**Files** (`src/notifications/`):
- `notificationContext.ts`: types (`NotificationType = 'success' | 'error' | 'info'`), the context, and `useNotifications()`, which returns a **stable** (memoized) API `{ success(msg), error(msg), info(msg), dismiss(id) }`; each push returns the toast id. It throws if used outside the provider (fail fast; every app render has the provider).
- `NotificationProvider.tsx`: state (list of `{ id, type, message, leaving }`), timers in a `useRef` map, and the viewport.
- `Toast.tsx`: one toast (icon, message, close button, progress bar).

**Behavior**
| Rule | Spec |
|---|---|
| Duration | success and info 5000 ms; error 8000 ms. Constants exported for tests. |
| Pause | Timer pauses on `mouseenter` and `focusin` of that toast and resumes with the remaining time on `mouseleave`/`focusout` (focus no longer inside). The CSS progress bar uses `animation-play-state: paused` on `:hover, :focus-within` so it matches. |
| Close | Close button (`aria-label="Dismiss notification"`, `×` glyph `aria-hidden`), and Escape while focus is inside the toast (handler calls `stopPropagation` so an open dialog does not also close). |
| Cap | At most 3 visible; pushing a 4th removes the oldest. |
| Dedupe | Pushing the same `type` + `message` as a visible toast does not add a new one; it restarts that toast's timer. This also absorbs StrictMode double effects. |
| Exit | Dismissal sets `leaving` (exit animation), then removes the toast 150 ms later. Under reduced motion there is no animation; the 150 ms removal still applies. |
| Unmount | The provider clears all timers on unmount. |
| Focus | Toasts never take focus. Known limitation: closing a toast by keyboard leaves focus to the browser default. |

**Markup and a11y.** The viewport is a persistent `<section aria-label="Notifications" className="toast-viewport">` rendered after `<Routes>` (last in tab order), with **no `role` and no `aria-live`** of its own, so role counts stay as tests expect. Each toast is a `div` with `role="status"` (success, info; implicit polite) or `role="alert"` (error; implicit assertive), and `aria-atomic="true"`. The message is a React text node. **No `ul`/`li`** anywhere in the stack (the `/tasks` listitem contract). Position: desktop fixed top-right, below the sticky header (`top: calc(var(--header-height) + var(--space-3))`), width 360px, newest last; at 600px and below it is full width at the bottom with `--space-3` side margins and `env(safe-area-inset-bottom)`. The viewport is `pointer-events: none` and toasts are `auto`; the z-index is above dialogs.

**Call-site decisions**
| Call site | Message | Decision | Reason |
|---|---|---|---|
| `ChangePasswordForm` | "Password changed" | **success toast**; remove the inline `success` state | Confirmation of a completed action |
| `AdminUsersPage` after reset | "Password updated for <u>" | **success toast**; remove `notice` state | Confirmation; the dialog has already closed |
| `useTasks.toggle` failure | server message | **error toast** (the rollback is unchanged) | A transient event, not page state |
| `useTasks.remove` failure | server message | **error toast** | Same |
| `useAdminUsers.toggleEnabled` failure (for example a 409 on self) | server message | **error toast** | Same |
| `useTasks` / `useAdminUsers` list **load** failure | server message | **stays inline `ErrorBanner`** | It describes page state (an empty list would otherwise look like "No tasks yet"). It must persist. It also keeps UI25 unambiguous (see 5.3.1). |
| `LoginPage` `?registered=1` | "Registration successful. Please log in." | **success toast** on arrival | |
| `LoginPage` `?expired=1`, `?passwordChanged=1` | existing text | **info toast** on arrival | Informational, not a failure |
| `LoginPage` `?disabled=1` | existing text | **error toast** on arrival | The account is blocked |
| Login, Register, TaskForm, ChangePasswordForm, ResetPasswordDialog form-level errors and all field errors | existing | **stay inline** | Tied to the form the user is looking at |

**Login URL params: toast on arrival, the param is NOT stripped.** `LoginPage` pushes the notice in a mount effect keyed on the param and dismisses it in the effect cleanup (so it does not follow the user to `/tasks` after login). Stripping the param would regress the redirect contract that tests and 5.4 assert (`where()` is `/login?registered=1` / `?expired=1`; `auth.test.tsx`, `qa/routingSession.test.tsx`, `qa/registerLogin.test.tsx`, `pages/authPages.test.tsx`). Side effect, same as today: a refresh re-shows the notice.

**401 suppression.** The mutation-error helper skips `ApiRequestError` with `status === 401` (see the relaxation in section 1).

### 2.4 Visual design (F3, plain CSS)

**Styling files.** `src/styles/tokens.css` (all tokens plus dark overrides) and `src/styles/index.css` (`@import './tokens.css';`, then base, layout, typography, buttons, forms, banners, badges, header, auth, cards, toolbar, task list, table, dialog, toasts, states and skeletons, empty states, utilities, responsive, reduced motion, forced colors). `main.tsx` keeps importing only `index.css`. **No raw color literals (hex, `rgb()`, `hsl()`) outside `tokens.css`.**

**Tokens** (starting values; QA verifies AA)
- Brand, light: `--color-primary #0f766e` (white text 5.5:1), `--color-primary-hover #115e59`, `--color-primary-soft #e6f6f4`, `--color-on-primary #ffffff`, `--color-focus #0e7490`, `--gradient-brand linear-gradient(135deg, #0f766e 0%, #0e7490 50%, #1e40af 100%)` (white text at least 5.3:1 at every stop), `--color-on-brand #ffffff`.
- Brand, dark: primary `#2dd4bf`, primary-hover `#5eead4`, primary-soft `#0b2a2a`, on-primary `#042f2e`, focus `#5eead4`, gradient-brand `linear-gradient(135deg, #115e59, #155e75 50%, #1e3a8a)`.
- Neutrals: light bg `#f4f6f8`, surface `#ffffff`, surface-muted `#f0f3f6`, text `#141a24`, text-muted `#566070`, border `#dde2e8`, border-strong `#c2c9d3`; dark bg `#0d1117`, surface `#161b22`, surface-muted `#1d232c`, text `#e6e9ef`, text-muted `#a3abb9`, border `#2a313c`, border-strong `#3a4250`.
- Status (light / dark): danger `#c62828`/`#f87171` (+ hover `#a61f1f`, soft `#fdecec`/`#3b1416`); success `#1e7a3a`/`#4ade80` (soft `#e8f6ec`/`#0f2a1a`); info `#1d4ed8`/`#93c5fd` (soft `#eaf1ff`/`#0f1d3a`).
- Atmosphere: `--bg-tint-1` (primary at 8% alpha), `--bg-tint-2` (blue at 7%), `--gradient-surface linear-gradient(180deg, var(--color-surface), var(--color-surface-muted) 260%)`. The body background is two large soft radial tints over `--color-bg`.
- Shadows (layered): `--shadow-sm` (1px plus 3px, low alpha), `--shadow-md` (4px plus 16px with negative spread), `--shadow-lg` (24px plus 64px, for dialogs and toasts), `--shadow-brand` (primary at 40% alpha, for primary button hover). Dark mode uses darker alpha plus a 1px inner top highlight on cards.
- Type: system stack; scale `xs .75` / `sm .875` / `md 1` / `lg 1.125` / `xl 1.375` / `2xl 1.75` / `3xl 2.25rem`; weights 400/500/600/700; heading letter-spacing `-0.015em` (`-0.02em` at 2xl and above); uppercase labels `+0.06em`; `font-variant-numeric: tabular-nums` on dates, counts, table cells and the task meta row.
- Spacing (4px base, `--space-1`…`--space-12`), radius (`sm 6`, `md 10`, `lg 16`, `pill 999`), motion (`--ease-out cubic-bezier(.2,.8,.2,1)`, `--dur-fast 120ms`, `--dur 200ms`), layout (`--container-max 960px`, `--header-height 64px`, `--control-height 40px`, 44px at 600px and below).

**Components and screens** (the 5.3 contract always wins)
| Area | Design |
|---|---|
| Buttons | Base = secondary (gradient-surface, strong border, `shadow-sm`). `.primary` = `--gradient-brand` with on-brand text; on hover it lifts `translateY(-1px)` and gains `--shadow-brand`, and `:active` presses back. `.danger` is solid danger. `.ghost` and `.ghost.danger` as before. `.small` is 32px. `:focus-visible` is a 2px focus outline with 2px offset on every interactive element (white inside the header). `:disabled` uses opacity .55, `not-allowed`, and no hover or lift. `.button-link` is a link styled as a small ghost button. |
| Header (`AppHeader`) | Sticky bar on `--gradient-brand` with on-brand text and `shadow-md`. Brand `<span className="brand">Todo</span>` (600, `-0.02em`) with a small CSS-only check mark (`::before`). Nav `NavLink`s are pills: translucent white on hover, `.active` is a surface background with primary text. On the right, the **avatar-initial chip** is a new sibling `<span className="avatar" aria-hidden="true">` placed **before** (not inside) the existing `span aria-label="Signed in as"`. It shows 1-2 initials from `user.name` (falls back to the first letter of the username) via a new pure `src/utils/initials.ts`. Logout is a ghost button in on-brand color. At 600px and below the row wraps and the nav scrolls horizontally. Nav stays plain links in `<nav>` (no `ul`/`li`). |
| Auth pages | New presentational `src/components/AuthLayout.tsx` used by Login and Register. At 900px and wider it is a split: a left `div.auth-aside` (`aria-hidden="true"`) on `--gradient-brand`, decorated with CSS-only blurred radial "orbs", a faint grid (`repeating-linear-gradient`) and a static inline-SVG checklist illustration, plus the large brand label; the right side holds the centered `.auth-card` (max 420px, `shadow-lg`, radius-lg). Below 900px the gradient becomes a 180px top band and the card overlaps it. **No new copy and no new landmark.** The aside has no text, and the existing `<p className="auth-brand">Todo</p>` stays inside the card column. Submit is `.primary.block`. |
| Cards | `.card`: gradient-surface, border, radius-lg, `shadow-sm`, padding `--space-6` (`--space-4` on mobile). Page `h1` 2xl/700. |
| Forms | Labels sm/500. Inputs at control height with a strong border; hover darkens the border; focus uses a primary border plus a 4px primary-soft ring (transition). `[aria-invalid=true]` gets a danger border and ring. `.field-error` is sm danger with an inline `aria-hidden` "!" glyph via CSS. |
| Checkbox (task complete, edit "Completed") | `appearance: none`, 20px, radius 6px, strong border. When checked: brand gradient fill with a white check from a CSS data-URI SVG and a 180ms "pop" keyframe (scale .85 → 1.08 → 1). Visible `:focus-visible` ring. `@media (forced-colors: active)` restores `appearance: auto`. |
| Task list and items | Each item enters with a 160ms fade/translate (`@keyframes item-in`). Rows have hover surface-muted and radius-md. When completed, the title color goes muted and a strike line draws across (a `background-size` 0 → 100% transition on `.task-title`; text unchanged). Overdue: danger meta plus the badge. The description is clamped to 3 lines. Actions are `.ghost.small` / `.ghost.danger.small` and wrap at 480px and below. |
| Toolbar | Segmented filter tabs (surface-muted track; the selected `[aria-selected=true]` tab gets a surface "thumb" with `shadow-sm` and primary text), a search box with a CSS data-URI magnifier, and **Add task** `.primary`. It stacks at 600px and below. |
| Task form | A nested surface-muted panel with a primary-soft left accent. Due date and Completed sit in a row at 600px and wider; actions are right-aligned. |
| Badges | Pill, xs/600, soft background, colored text, and a 6px `currentColor` dot via `::before` (decorative). The text stays alone in the span. |
| Admin table | Wrapped in `div.table-scroll` (radius-lg, border, `shadow-sm`, overflow-x auto, no role). `thead` is surface-muted with uppercase xs muted labels at `+0.06em`. Rows have hover and a subtle zebra; cells use tabular numbers; username `td` is 600; `.row-actions` is nowrap. The search box is max 360px. |
| Empty states | New `src/components/EmptyState.tsx` (`{ message, variant: 'tasks' \| 'users' \| 'search' }`) renders `div.empty-state` containing a static inline SVG (`aria-hidden="true" focusable="false"`, colored with tokens through `currentColor`/CSS variables) and the existing `<p>` with the unchanged text. Used in `TaskList` and `AdminUsersPage`. |
| Loading (skeletons) | New `src/components/LoadingSkeleton.tsx` (`{ label, rows, variant: 'list' \| 'table' }`) renders `<p role="status" className="visually-hidden">{label}</p>` plus a `div.skeleton` (`aria-hidden="true"`) of `div` rows (**not** `li` or `tr`) with a shimmer that is static under reduced motion. It replaces `<p role="status">Loading tasks…</p>` and `Loading users…`. **Verified:** no existing test asserts the loading text or role (grep of `*.test.ts(x)`), and the text and `role=status` are kept anyway, so the 5.3 copy contract holds. |
| Banners (inline errors) | `ErrorBanner`: `.banner.banner-error` with a danger-soft background, 3px danger left border and an inline SVG alert icon (`aria-hidden`). It replaces `.error-banner`. |
| Toasts | Surface with `shadow-lg`, radius-md, and a 4px left bar in the type color. Icon (check, info, alert; inline SVG, `aria-hidden`), message (sm/500), close `×` (ghost, 32px). A 2px progress bar (`aria-hidden`) animates from 100% to 0% over the duration through the `--toast-duration` custom property; it pauses on hover/focus and is hidden under reduced motion. Enter is slide/fade from the right (from the bottom on mobile); exit is fade/scale. |
| Dialogs | Blurred backdrop, surface with `shadow-lg` and radius-lg, max 440px, fade/scale-in. `ConfirmDialog` `tone` prop as above. One heading each. |
| Profile, Admin user tasks, Not found, Access denied | As before (`dl` 2-column grid; muted back link with arrow in text; centered card with `.button-link`), on the new tokens. |

**Accessibility (all screens):** visible focus on every interactive element; text and muted text at least 4.5:1, large text and UI borders, focus ring and checkbox border at least 3:1, in both schemes **and on the brand gradient**; no meaning by color alone; touch targets at least 40px (44px on mobile) except desktop `.small` row actions; tab order follows DOM; Escape closes dialogs and focused toasts; every decorative SVG is `aria-hidden="true" focusable="false"`; `prefers-reduced-motion: reduce` disables all transforms, keyframes, shimmer and progress animation (state changes are instant); no `outline: none` without a replacement.

## 3. API Contract

**Unchanged.** No endpoint, method, path, query, request or response field, status code, header (`X-Auth-Token`, `X-Auth-Expires-In`) or error shape changes. `docs/plan.md` section 3 remains the contract. `docs/openapi.yaml` is not present and creating it is out of scope. `src/api/**` and `src/auth/**` must have **no diff**.

## 4. Tasks by Role

Backend: **no tasks**.

One branch: `feature/frontend-refactor-ui-polish` from current `master`. The same developer does F1, F2 and F3 **in order**, with **one commit per task** so the Team Lead can review each diff separately. Each task touches more than 3 files, so the **Code Simplifier** runs at the end of each, scoped to that task's files, before its commit; tests, lint and the security self-check are rerun afterwards.

| ID | Owner | Depends on | Files | Deliverable | Security acceptance criterion |
|---|---|---|---|---|---|
| **F1** TS refactor | `dev-frontend` | none | new `utils/formErrors.ts` (+ `.test.ts`), `hooks/useModalDialog.ts` (+ `.test.tsx`), `hooks/useAdminUsers.ts`; edit `TaskForm`, `ChangePasswordForm`, `ResetPasswordDialog`, `ConfirmDialog`, `RegisterPage`, `LoginPage`, `AdminUsersPage`, `AdminUserTasksPage`, `hooks/useTasks.ts` | R1-R3 and R5-R7 (R4 is superseded). New 5.2 F1 tests. All existing tests pass unmodified; lint and build are clean. Commit "Frontend: refactor shared error and dialog handling". | Error text is only the server `message` or the fixed fallback; no `dangerouslySetInnerHTML`/`innerHTML`; `api/` and `auth/` diffs are empty. |
| **F2** Notifications | `dev-frontend` | F1 | new `notifications/notificationContext.ts`, `NotificationProvider.tsx`, `Toast.tsx`, `notifications.test.tsx`, `pages/notificationsFlow.test.tsx`; edit `App.tsx` (provider inside `AppRoutes`), `hooks/useTasks.ts`, `hooks/useAdminUsers.ts`, `pages/AdminUsersPage.tsx`, `pages/LoginPage.tsx`, `components/ChangePasswordForm.tsx`, `styles/index.css` (a functional "Toasts" section: position, stacking, enter/exit, reduced motion; F3 re-themes it) | Section 2.3 implemented exactly per the call-site table. New 5.2 F2 tests. **All existing tests pass unmodified** (5.3.1). Commit "Frontend: transient toast notifications". | Toast messages render as React text only; no message is logged or put in the URL; 401 suppression does not hide non-401 errors; no new dependency. |
| **F3** UI polish | `dev-frontend` | F2 | new `styles/tokens.css`, `components/AuthLayout.tsx`, `components/EmptyState.tsx`, `components/LoadingSkeleton.tsx`, `utils/initials.ts` (+ `.test.ts`); rewrite `styles/index.css`; `index.html` (meta only); class and wrapper edits in `AppHeader`, `LoginPage`, `RegisterPage`, `TasksPanel`, `TaskFilterTabs`, `SearchBox`, `TaskForm`, `TaskList`, `TaskItem`, `UserTable`, `AdminUsersPage`, `AdminUserTasksPage`, `ProfilePage`, `ChangePasswordForm`, `ConfirmDialog` (`tone`), `ResetPasswordDialog`, `ErrorBanner`, `Toast`, `NotFoundPage`, `ForbiddenPage`, `PasswordRulesChecklist` | Section 2.4 implemented; 5.3 contract respected. Self-check at 375, 768 and 1280px in light and dark, keyboard-only and reduced-motion. Before/after screenshots (Login, Register, Tasks with the form open plus an overdue item plus a toast, Admin users, a dialog, the empty state, the skeleton), kept out of git, with paths in the handoff. `npm test`, `npm run lint`, `npm run build`, `npm audit --audit-level=high` pass. Commit "Frontend: design tokens and UI polish". | No inline `style` built from user data (the only inline style allowed is the numeric `--toast-duration`); no `dangerouslySetInnerHTML`; no external URLs in CSS, HTML or SVG; the SVGs are static. |
| **Q1** Regression and UI acceptance | `qa` | F3 handed off | `reports/changes/2026-10-14-refactor-and-ui-polish.md` on `feature/qa-refactor-ui-polish` | Run section 5 on the merged branch (automated, 5.4 regression on the real stack, 5.5 UI and toast acceptance, 5.6 security), recording PASS/FAIL with evidence and "scenarios not tested". Use `/qa-only` (never `/qa`). | Every 5.6 row is recorded; any FAIL goes to the Team Lead with reproduction steps. |

Order: F1, F2, F3 (same developer), then Team Lead `/review` of the branch, then Q1, then merge. `/code-review` is not mandatory (no auth, security or API change); the Team Lead confirms empty diffs under `src/auth/` and `src/api/`.

## 5. Test Plan

### 5.1 Automated (dev runs, QA re-runs)
- `cd frontend && npm test`: **all existing tests pass with no edits**, plus the new tests in 5.2.
- `npm run lint`, `npm run build` (`tsc -b`) and `npm audit --audit-level=high` are clean.
- `git diff --stat master -- backend frontend/src/api frontend/src/auth` is **empty**.

### 5.2 New tests
| Task | Case | Expected |
|---|---|---|
| F1 | `fieldErrorsFrom` with `[{title,A},{title,B},{dueAt,C},{foo,D}]`, fields `['title','dueAt']` | `{title:'A', dueAt:'C'}`; with no or unknown field errors → `{}` |
| F1 | `errorMessageOf(new Error('x'))` / `('boom')` / `(undefined)` | `'x'` / `'Something went wrong'` / `'Something went wrong'` |
| F1 | `useModalDialog`: Escape; other keys; unmount | `onClose` called once; other keys do nothing; focus is restored and the listener removed |
| F2 | Role per type (unit test with a probe component in the provider) | success and info → `role=status`; error → `role=alert`; the viewport has no role or `aria-live` |
| F2 | Auto-dismiss (`vi.useFakeTimers`) | success is gone after 5000 + 150 ms and still present at 4999 ms; error is still present at 7999 ms and gone after 8000 + 150 ms |
| F2 | Pause on hover and on focus | `mouseenter` at 3000 ms, advance 10 s → still present; `mouseleave`, advance the remaining 2000 + 150 ms → gone. Same with `focusin`/`focusout` |
| F2 | Close button and Escape | Clicking "Dismiss notification" removes the toast; Escape inside a toast removes it and, with a `ConfirmDialog` open, the dialog stays open |
| F2 | Cap | 4 distinct pushes → 3 visible, the oldest gone |
| F2 | Dedupe | 2 identical pushes → 1 toast; its timer restarts (present 4 s after the second push) |
| F2 | Outside provider | `useNotifications()` throws a clear error |
| F2 | Flow (`renderApp`): toggle failure | Rollback plus error toast; it auto-dismisses after 8 s (fake timers); the inline load banner is absent |
| F2 | Flow: toggle 401 | No error toast; redirect to `/login?expired=1` with exactly one element matching `/session has expired/i` |
| F2 | Flow: `/login?registered=1`, then log in | The toast is shown on `/login` and gone after navigating to `/tasks` |
| F2 | Flow: change password success, then submit again with a wrong current password | Success toast; then the inline field error, and the toast is unaffected |
| F2 | Flow: list load 500 | Inline `role=alert` banner persists after 10 s (fake timers); no toast |
| F3 | `initials('Alice Smith')`, `('alice_01')` fallback, `('')`, extra spaces | `'AS'`, `'A'`, `''`, trimmed |
| F3 | Loading skeleton | While the list is pending: `getByRole('status')` has the text "Loading tasks…"; the skeleton is `aria-hidden`; `queryAllByRole('listitem')` is empty |
| F3 | Avatar chip | `getByLabelText('Signed in as')` text is exactly the username; the avatar is `aria-hidden` |

### 5.3 Markup and text contract the existing tests depend on (must not change)
- **Tasks page:** the only `listitem`s on `/tasks` are task `<li>`s, so the header nav, toolbar, **toast stack, skeleton and empty state** use no `ul`/`li`. Each task `<li>` has `.task-title` with exactly the title, the text "Due {formatted}" and, when overdue, an element whose whole text is `Overdue`. Checkbox label `Mark '<title>' as completed`; buttons `Edit '<title>'` / `Delete '<title>'`.
- **Toolbar:** `role=tablist` with `role=tab` `All`/`Active`/`Completed` and `aria-selected`; search labels `Search tasks` / `Search users` with a `Clear` button; **`Add task` has no accessible description** (no `title` and no `aria-describedby`).
- **Forms:** form names `New task`, `Edit task`, `Change password`, `Log in`, `Register`; `form[aria-label="New task"] button[type=submit]` exists; all field labels and button names as today. Icons never change accessible names.
- **Dialogs:** `role=dialog` with exactly one heading each; field errors keep `role=alert`; no toast is rendered inside a dialog.
- **Status and alert counts:** on `/login?registered=1` there is exactly **one** `role=status` (the toast; the inline banner is removed and the viewport has no role). On `/tasks` after a toggle failure, and on `/admin/users` after a toggle 409, there is exactly **one** `role=alert` (the toast). Spinners, skeletons and decorations carry no role.
- **Admin table:** the username alone in its `<td>`, rows are `<tr>`, the row name contains the username, `Enabled`/`Disabled` alone in the badge; links `View tasks` and `Back to users`.
- **Profile:** the details `dl` is the first `dl`. **Password rules:** `ul[aria-label="Password rules"] > li[data-met]`.
- **Header:** links `Profile`, `Users` (admin); `aria-label="Signed in as"` whose text is exactly the username (avatar outside it); button `Logout`. Headings `Page not found`, `Access denied`.
- **Copy unchanged:** validation messages, notices (registered, expired, disabled, password changed, "Password changed", "Password updated for <u>"), empty states, loading text.

#### 5.3.1 Existing tests that assert these messages, and why they stay green unedited
| Test | Asserts | After F2/F3 |
|---|---|---|
| `qa/registerLogin` UI6 | `getByRole('status')` /registration successful/ | A success toast with `role=status`, the only status on the page; pushed in the mount effect, which is flushed inside RTL's `act` |
| `qa/registerLogin` "banners" loop; `pages/authPages` "shows the ?%s banner", UI6 | `getByText(exact notice text)` synchronously after `renderApp` | Toast text is identical; effect flushed in `render`'s `act` |
| `qa/routingSession` UI25 (401 → `?expired`/`?disabled`) | `getByText(/session has expired/i)`, `/account is disabled/i` (single match) | The login toast is the only match: the load error stays inline and unmounts, and mutation 401s are suppressed |
| `qa/routingSession` UI25 (403) | `findByRole('alert')` | The load error stays an inline `ErrorBanner` |
| `qa/tasks` UI18; `components/tasksPanel` UI18 | `findByRole('alert')` / `findByText('Unexpected error')`; checkbox rolled back | An error toast (`role=alert`), the single alert; rollback unchanged |
| `qa/adminUsers` UI29 | `findByRole('alert')` with the 409 message; badge unchanged | An error toast; the dialog has already closed |
| `qa/adminUsers` (reset ×2); `pages/adminPages` (reset ×2) | `findByText('Password updated for …')` | A success toast |
| `qa/profile`; `pages/authPages` (Profile) | `findByText('Password changed')` | A success toast |
| `qa/adminUsers` (reset dialog 400) | `within(dialog).getAllByRole('alert')` | Inline dialog errors unchanged |
| Fake-timer suites (`qa/tasks`, `qa/routingSession` UI26, `components/tasksPanel`, `auth/auth.test`) | timers and redirects | Toast timers are faked too; no assertion depends on a toast lingering past an advance. Verify by running. |
| `qa/routingSession` (admin header) | `getByLabelText('Signed in as')` has the username text | The avatar is a sibling, not a child |

**Selector updates requested: none.** If F2 or F3 still finds a failing existing test, the developer stops and sends the Team Lead the exact diff, to be approved as a "pure selector update with unchanged intent" or rejected (the fix then goes in product code).

### 5.4 Behavior regression list (manual on the real stack: backend 8080 with a disposable schema, frontend 3000)
1. Routing: `/` redirects per role; `/login` and `/register` redirect when logged in; unknown route → Not found; non-admin on `/admin/*` → Access denied.
2. Register: validation, live checklist, 409 username error, passwords cleared on error; success → `/login?registered=1` (URL kept) with the **success toast**.
3. Login: wrong password → **inline** error; disabled account → **inline** disabled text; expired, disabled and password-changed notices appear **as toasts** after the matching session end, and the URL keeps its param.
4. Session: sliding renewal through `X-Auth-Token`; expiry → `/login?expired=1`.
5. Tasks: create (past due rejected, 5-minute grace), edit (including Completed), toggle (optimistic, rolled back with an **error toast** on failure), delete through the confirm dialog (failure → error toast), filter tabs, 300 ms debounced search, sort by due then created, Overdue appearing without reload. List load failure → **persistent inline** banner.
6. Admin: user search, disable/enable with confirmation (failure → error toast; success silent), self-disable button disabled with its tooltip, reset password ("Password updated for <u>" toast), per-user task page.
7. Profile: details; change password renews the token and shows the "Password changed" toast; wrong current password → field error.
8. Dialogs: Escape closes, initial focus is correct, focus returns to the opener.
9. Network tab: requests for steps 2-7 are identical to `master`.

### 5.5 UI and notification acceptance (QA)
| # | Check | Expected |
|---|---|---|
| U1 | 375, 768 and 1280px on Login, Register, Tasks (empty, loading, list, form open, dialog, toast), Admin users, Admin user tasks, Profile, Not found | No page-level horizontal scroll (only `.table-scroll` scrolls), no overlap or clipping; the auth layout is split at 900px and wider and banded below; the toolbar stacks at 375px |
| U2 | Light and dark (OS setting) | Every surface, gradient, input, badge, toast and dialog is themed; no white flashes |
| U3 | Contrast (devtools or axe) | At least 4.5:1 text, 3:1 large text, UI borders and focus ring, in both schemes, including header text, nav and focus ring on the gradient |
| U4 | Keyboard-only: register, login, CRUD, toggle, admin disable and reset, logout | All reachable with a visible focus ring; Escape closes dialogs; focus returns to the opener; a toast's close button is reachable by Tab and Escape inside the toast closes it |
| U5 | Button variants | Distinct hover, focus, active and disabled states; the primary lift and shadow; no lift when disabled |
| U6 | States | Skeletons while loading; illustrated empty states; inline error banners; validation styling |
| U7 | Long content (100-char unbroken title, 1000-char description, long username in header, table and toast) | Wraps or ellipsizes; toasts wrap their text and stay at most 360px wide on desktop |
| U8 | Reduced motion | No transforms, keyframes, shimmer, check pop, item enter or toast slide or progress; toasts still auto-dismiss |
| U9 | Consistency | One spacing, radius and type scale; `grep -nE '#[0-9a-fA-F]{3,8}\b\|rgba?\(\|hsla?\(' src/styles/index.css` → nothing |
| N1 | Toast timing | Success and info disappear in about 5 s, errors in about 8 s; no toast stays forever |
| N2 | Pause | Hovering or focusing a toast stops its timer and progress bar; leaving resumes the remaining time |
| N3 | Close | The × and Escape close immediately with the exit animation |
| N4 | Cap and dedupe | Trigger 4 different failures quickly → at most 3 visible; trigger the same failure twice → one toast with its timer restarted |
| N5 | Placement | Desktop: top-right below the header, not covering Logout; 375px: full width at the bottom, above the home indicator; above an open dialog's backdrop |
| N6 | Screen reader (VoiceOver basic pass) | Success and info announced politely, errors immediately; the close button is announced as "Dismiss notification"; the decorative icons and progress bar are silent |
| N7 | Login notices | `?expired=1` shows an info toast; after logging in, it does not appear on `/tasks`; refreshing `/login?expired=1` shows it again |

**Edge cases:** the admin's own row; zero search results; a task due exactly now; completed-and-overdue (no badge); 375px reset dialog with a long username; 200% zoom; a toast while a dialog is open; rapid toggle failures on several tasks (cap); a hidden browser tab (the timer keeps running, acceptable).

### 5.6 Security (regression only)
The playbook probe matrix is **N/A for this change** (no backend, endpoint, auth or API-client diff, verified in 5.1); `reports/security-report.md` stays valid. Frontend rows:
| # | Case | Expected |
|---|---|---|
| S1 | `grep -rnE 'dangerouslySetInnerHTML\|innerHTML\|eval\(' frontend/src` | No matches |
| S2 | A task titled `<script>alert(1)</script>` with a description `<img src=x onerror=alert(1)>`; force a toggle failure on it while the server echoes the title in its message, if possible | Literal text in the list, form, dialog and toast; no alert |
| S3 | `npm run build`, then `grep -rniE 'secret\|password=\|api[_-]?key\|Bearer ' frontend/dist` | No secrets |
| S4 | `grep -rnE 'https?://' frontend/src/styles frontend/index.html frontend/src/components frontend/src/notifications` | Only the SVG `xmlns` |
| S5 | Forced 500 and network error on load and on toggle | Inline banner or toast shows only the server `message`, "Network error" or "Something went wrong" |
| S6 | `npm audit --audit-level=high` | No high or critical issues |

### 5.7 Exit criteria
5.1-5.6 pass or are triaged by the Team Lead; existing tests unedited and green; backend, `api/` and `auth/` diffs are empty; the QA report lists the scenarios not tested (other browsers, screen readers beyond a basic VoiceOver pass).

## 6. Security

Unchanged from `docs/plan.md`: roles USER and ADMIN; users access only their own tasks, admins access all users and tasks; public routes `/login`, `/register` and their endpoints; seeded users per the README; out-of-scope routes unchanged. This change adds no route, endpoint, permission or storage. Toasts hold messages in memory only (never in `localStorage` or the URL) and render them as text. Security acceptance per task: F1, F2 and F3 rows in section 4; QA rows in 5.6. Known limitations, for `docs/build-summary.md` if accepted: dialogs do not trap focus (focus is restored on close); keyboard-closing a toast leaves focus to the browser default.

## 7. Web quality and search visibility

**N/A.** All pages are private (class 3) except `/login` and `/register` (class 2, public but not for search; handling unchanged). No class 1 pages, so no SSR, sitemap, robots, Open Graph, structured data or analytics. No rendering change; the Vite SPA serves all pages; 404 and 301 handling are unchanged (client-side Not found). The only `index.html` edit is the `color-scheme` meta.
