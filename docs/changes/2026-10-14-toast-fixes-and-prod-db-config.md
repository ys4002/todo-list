# Change plan: toast fixes and prod DB configuration (2026-10-14)

App: `apps/todo-app` (branch `master`, 0226e18). Base plan `docs/plan.md` and the API contract are unchanged. Context: `docs/changes/2026-10-14-refactor-and-ui-polish.md`, QA observations O1 and O2 in `reports/changes/2026-10-14-refactor-and-ui-polish.md`. Status: **awaiting user approval**.

## 1. Overview

**Outcome**
1. **Toast placement (O1):** at 601px and wider the toast stack no longer covers **Add task**, the toolbar or the header (Logout) at 1280px or any other width. At 600px and below nothing changes.
2. **Lingering success toast (O2):** reaching `/login` clears every earlier toast, so after a session ends (for example a `passwordChanged` logout) only the login notice is shown.
3. **Prod DB credentials:** with `SPRING_PROFILES_ACTIVE=prod` the backend needs `DB_URL`, `DB_USERNAME` and `DB_PASSWORD`. It refuses to start, with a clear message, if any is missing or blank. It never falls back to `root`/`root`. The default (dev) profile does not change.

**Scope:** the three items above, their tests, and the README and build-summary notes.

**Exclusions**
- `JWT_SECRET` and `ADMIN_PASSWORD` are not required in prod (user decision). They keep their current dev defaults, and the existing README warning stays.
- No new dependency (npm or Maven). No API, auth, route, copy or toast timing change. No change to `application-test.yml` or to how tests choose a database.
- Other prod hardening is out of scope. That includes `spring.sql.init.mode: always`, the `createDatabaseIfNotExist` URL flag and logging levels.
- Row actions (Edit/Delete, Disable/Reset) in the bottom-right of a list can still be covered by a toast for up to 8 s. This is accepted, see 2.1.

**Assumptions:** the prod profile is named `prod`. `SPRING_DATASOURCE_*` variables still override `spring.datasource.*` (standard Spring behaviour), but the prod check always requires the three `DB_*` names.

No blocking questions.

## 2. Architecture

### 2.1 Toast placement (frontend, CSS only)
- **Finding:** `.toast-viewport` is fixed top-right below the header (`top: header + 12px`, 360px wide). At 1280px the 960px container ends at x=1120, so the stack (x 908-1268, y 76+) sits over the toolbar's right end, where **Add task** is. No top-right position avoids this, because the 160px side gutter is narrower than a toast.
- **Decision:** move the stack to the **bottom-right** at all widths above 600px: `bottom: calc(var(--space-3) + env(safe-area-inset-bottom)); right: var(--space-3)` and no `top`. Width, gap, z-index, `pointer-events`, the enter and exit animations and the 600px-and-below full-width bottom rule stay as they are. Newest stays last, nearest the bottom edge. The stack is then always away from the header, page title, toolbar, inline forms and centred dialogs.
- **Trade-off:** it can cover row actions in the bottom-right of the viewport. They are secondary, and a toast pauses on hover, closes with × or Escape, and lasts 8 s at most. Rejected options: top-centre (covers the title and tabs), a narrower toast (does not fit the gutter), and dodging logic (too complex for the gain).

### 2.2 Clear toasts on arrival at `/login` (frontend)
- **Finding:** `NotificationProvider` sits above `<Routes>`, so toasts survive route changes by design. `AuthProvider` sits outside it, so `logout` cannot reach the toasts. The "Password changed" toast (5 s) therefore shows next to the `?passwordChanged=1` info toast.
- **Decision:** show only the login notice. Add `clear(): void` to the `Notifications` API. It removes every toast **immediately**, with no exit animation, so no fading node still counts as `role=status`. It also cancels every countdown and exit timer. `LoginPage`'s existing layout effect calls `notify.clear()` first, then pushes its notice, if any. This covers plain logout, expiry, disabled and password-changed redirects, and Register → `/login?registered=1`. Under StrictMode the re-run clears the dismissed first notice at once, so there is still one toast (the DEF-1 guarantee holds).
- Rejected: dismissing toasts on every route change (other pages rely on toasts surviving navigation, for example a delete failure).

### 2.3 Prod profile (backend)
- **Finding:** `application.yml` already reads `${DB_URL:…}`, `${DB_USERNAME:root}` and `${DB_PASSWORD:root}`, so a missing variable in prod silently becomes `root`/`root`. Removing the defaults is **not enough** on its own: Spring Boot's configuration-properties binder leaves an unresolvable `${DB_URL}` as literal text instead of failing. The app would then fail later with a misleading JDBC error, or try to log in with the literal password `${DB_PASSWORD}`.
- **Decision:**
  1. New `src/main/resources/application-prod.yml`, which overrides only `spring.datasource.url/username/password` with `${DB_URL}`, `${DB_USERNAME}`, `${DB_PASSWORD}` (no defaults).
  2. New `config/ProdDatabaseEnvironmentCheck.java`, an `EnvironmentPostProcessor` registered in new `src/main/resources/META-INF/spring.factories` (Boot 3.5 key `org.springframework.boot.env.EnvironmentPostProcessor`). When the `prod` profile is active, it checks that each of `DB_URL`, `DB_USERNAME`, `DB_PASSWORD` is present and not blank. If any is missing it throws `IllegalStateException("Missing required environment variables for the 'prod' profile: <names>")`. The message lists **names only, never values**. The check runs before the context starts, so it needs no database. With any other profile it does nothing.
- Layering is unchanged: one config class, no new layer, no dependency.

**Env variables (prod):** `SPRING_PROFILES_ACTIVE=prod` (activates the check), plus `DB_URL`, `DB_USERNAME`, `DB_PASSWORD` (required). `JWT_SECRET`, `JWT_EXPIRY_MINUTES` and `ADMIN_PASSWORD` stay optional with their current defaults.

```bash
export SPRING_PROFILES_ACTIVE=prod
export DB_URL='jdbc:mysql://<db-host>:3306/todo_db?serverTimezone=UTC'
export DB_USERNAME='<db-user>'
export DB_PASSWORD='<from your secret store>'
java -jar target/todo-backend-0.0.1-SNAPSHOT.jar
```

### 2.4 Affected areas and dependencies
- Frontend: `src/styles/index.css`, `src/notifications/notificationContext.ts`, `src/notifications/NotificationProvider.tsx`, `src/pages/LoginPage.tsx`, plus tests.
- Backend: the three new files above, plus tests. `application.yml` is unchanged.
- Docs (Team Lead's shared files): `README.md` env table and `docs/build-summary.md`.
- B1 and F1 are independent and run in parallel. D1 follows B1.

## 3. API Contract
Unchanged. No endpoint, status, header or error-shape change. `src/api/**` and `src/auth/**` have no diff.

## 4. Tasks by Role

| ID | Owner | Branch | Files | Deliverable | Security acceptance |
|---|---|---|---|---|---|
| **B1** Prod DB profile | `dev-backend` | `feature/backend-prod-db-config` | new `application-prod.yml`, `config/ProdDatabaseEnvironmentCheck.java`, `META-INF/spring.factories`, `src/test/java/com/todoapp/config/ProdDatabaseEnvironmentCheckTest.java` | 2.3 implemented. Tests B-T1 to B-T5 pass. `mvn test` is 266 + new, all green, run on a private DB as the README says. Code Simplifier skipped (small change). | No credential value in git, in the message or in logs. No default for the three variables under `prod`. The dev profile is byte-identical (`application.yml` diff empty). |
| **F1** Toast placement and clear on login | `dev-frontend` | `feature/frontend-toast-fixes` | `styles/index.css` (Toasts section only), `notifications/notificationContext.ts`, `notifications/NotificationProvider.tsx`, `pages/LoginPage.tsx`; tests in `notifications/notifications.test.tsx`, `pages/notificationsFlow.test.tsx`, new `styles/toastPlacement.test.ts` | 2.1 and 2.2 implemented. Tests F-T1 to F-T6 pass. The 196 existing tests pass **unedited**. `npm run lint`, `npm run build` and `npm audit --audit-level=high` are clean. Self-check at 375, 768, 1280 and 1440px. | Toasts still render as text only. `clear()` touches only in-memory state (no storage, no URL). `api/` and `auth/` diffs are empty. |
| **D1** Docs | Team Lead | on `master` after B1 merges | `README.md`, `docs/build-summary.md` | README: a "Production" note with the prod variables, the example launch command from 2.3 and the fail-fast behaviour; env table marks `DB_*` as "required with `prod`". build-summary: one key decision (prod profile and fail-fast check) and a known limitation (`JWT_SECRET`/`ADMIN_PASSWORD` keep dev defaults in prod). | Placeholders only in examples. |
| **Q1** Retest | `qa` | `feature/qa-toast-fixes-prod-db` | `reports/changes/2026-10-14-toast-fixes-and-prod-db-config.md` | Section 5.4 rows with PASS/FAIL and evidence, using `/qa-only`. | Rows R6 and R7 recorded. |

## 5. Test Plan

### 5.1 New automated tests
| ID | Level | Case | Expected |
|---|---|---|---|
| B-T1 | unit (`MockEnvironment`, profile `prod`, all three set) | run the check | no exception |
| B-T2 | unit, parameterised over each variable missing, then blank (`"  "`) | run the check | `IllegalStateException` naming exactly the missing variables. The message does not contain the values of the variables that are set (use a distinctive password value and assert it is absent). |
| B-T3 | unit, no profile, or profile `test` and none set | run the check | no exception (dev and test unaffected) |
| B-T4 | boot-level: `SpringApplicationBuilder(TodoApplication.class).profiles("prod")` with an environment stripped of OS env and system properties, without `DB_PASSWORD` | run | startup throws the `IllegalStateException` before any DB connection (no DB needed, finishes in seconds) |
| B-T5 | config: load `application-prod.yml` with `YamlPropertySourceLoader` | read the three `spring.datasource.*` values | exactly `${DB_URL}`, `${DB_USERNAME}`, `${DB_PASSWORD}` (no `:` default) |
| F-T1 | static CSS guard (`styles/toastPlacement.test.ts`, reads `index.css` with `node:fs`; jsdom has no layout and Vitest runs `css: false`) | base `.toast-viewport` rule | declares `bottom:` and `right:`, no `top:`. The 600px-and-below rule is unchanged (full width, bottom). |
| F-T2 | unit (`notifications.test.tsx`, fake timers) | push success, error and info, dismiss one (leaving), then `clear()` | 0 toasts in the DOM at once (no 150 ms wait). Advancing 10 s causes no errors and no reappearance. A later push auto-dismisses normally at 5000 + 150 ms. |
| F-T3 | flow (`notificationsFlow`) | change password succeeds → "Password changed" toast; the next request returns 401 `Password has been changed. Please log in again.` | at `/login?passwordChanged=1`: `queryByText('Password changed')` is null, the info notice is shown, exactly **one** `role=status` |
| F-T4 | flow | "Password changed" toast, then click **Logout** | at `/login`: no toast in the viewport |
| F-T5 | flow (fake timers) | toggle failure error toast, then the session timer expires | at `/login?expired=1`: only the expiry notice; no `role=alert` toast |
| F-T6 | regression | existing `loginNoticeStrictMode`, the `?registered` → `/tasks` flow, and all login-notice tests | unchanged and green (one toast under StrictMode; the notice is gone after login) |

### 5.2 Acceptance criteria
1. At 1280x800, 1440x900 and 1024x768 with 3 toasts on `/tasks` and `/admin/users`, the stack's bounding box does not intersect **Add task**, the search box, the filter tabs, the header or an open dialog.
2. At 375px placement is identical to `master`.
3. After any session end, `/login` shows at most the one login notice. Toasts still survive navigation between signed-in pages.
4. `SPRING_PROFILES_ACTIVE=prod` with any of the three variables missing or blank fails at startup, and the message names the variables. With all three set the app starts. Without the profile, behaviour is as today.
5. Backend 266 and frontend 196 existing tests are green and unedited; the new tests are added.

### 5.3 Regression list
- Toast timing, pause, cap, dedupe, Escape and × (N1-N4), roles and counts (5.3 contract of the previous plan), DEF-1 (dev StrictMode: one login toast, gone at about 5.2 s).
- Login notices N7a-c (shown on arrival, gone after login, shown again on refresh).
- 401 suppression (UI25, E15), toggle and delete failure toasts, admin reset success toast.
- Mobile: the stack is full width at the bottom above the safe area, with no horizontal scroll (U1, N5b).
- Backend: all existing suites. The dev launch with no variables still connects to `root`/`root` on `todo_db`.

### 5.4 QA retest rows
| # | Check | Expected |
|---|---|---|
| R1 | Criterion 1 on the real stack (Playwright `boundingBox()` intersection, plus screenshots at 1280 and 1440, light and dark) | no intersection; O1 closed |
| R2 | 768px and 375px with 3 toasts, and with the Reset password dialog open | no overlap with the dialog buttons; 375 identical to `master` |
| R3 | O2 real flow: user A changes password (toast), then within 5 s admin resets A's password in a second browser context, and A clicks a nav link | `/login?passwordChanged=1` with only the info toast; one `role=status` |
| R4 | Plain Logout right after a success toast; expiry after an error toast | `/login` shows no stale toast |
| R5 | Regression list 5.3, dev server and `vite preview` | PASS |
| R6 | `SPRING_PROFILES_ACTIVE=prod java -jar …` with `DB_PASSWORD` unset, then set to an empty string | non-zero exit within seconds; the message names `DB_PASSWORD`; no credential value in the console output |
| R7 | prod profile with all three pointing at a disposable local schema; then default profile with no variables | both start and `/api/auth/login` works; drop the schema afterwards |
| R8 | `git diff master -- backend README.md docs` and `git grep -nE 'DB_PASSWORD=' -- ':!*.md'` | no real credential committed; examples use placeholders |

**Verification commands:** `cd backend && SPRING_DATASOURCE_URL='jdbc:mysql://localhost:3306/todo_mytests_db?createDatabaseIfNotExist=true&serverTimezone=UTC' mvn test`; `cd frontend && npm test && npm run lint && npm run build && npm audit --audit-level=high`; `git diff --stat master -- backend/src/main/resources/application.yml frontend/src/api frontend/src/auth` is empty.

**Not covered by automation:** real pixel overlap. jsdom has no layout, so R1 and R2 are QA's visual and geometry checks.

## 6. Security
- Roles, tenancy (users see only their own tasks, admins see all), public routes (`/login`, `/register`), seeded users (user A, user B, admin) and out-of-scope routes are **unchanged** from `docs/plan.md`. No endpoint, auth or permission change, so the playbook probe matrix is **N/A** for this change and `reports/security-report.md` stays valid.
- Prod credentials (A05 Security Misconfiguration, A07): fail fast with no defaults under `prod`. The error lists variable names only. Nothing logs datasource values (HikariCP does not log passwords; no new logging is added). Credentials come only from the environment or a secret store, and examples in git are placeholders.
- `clear()` and the CSS change keep messages in memory and render them as text; no new storage or URL use.
- Known limitation, for `docs/build-summary.md`: in prod, `JWT_SECRET` and `ADMIN_PASSWORD` still fall back to their insecure dev defaults (excluded by user decision). Operators must set them.
- Per-task security acceptance: section 4.

## 7. Web quality and search visibility
**N/A.** No route, rendering, metadata, robots, sitemap, 404 or 301 change. The routes are classified as before: all private (class 3) except `/login` and `/register` (class 2), and the Vite SPA serves everything. The only frontend change is toast position and toast state.
