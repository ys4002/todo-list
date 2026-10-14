# Change plan: toast fixes, prod DB configuration and Vercel CORS (2026-10-14)

App: `apps/todo-app` (branch `master`, 0226e18). Base plan `docs/plan.md` and the API contract (paths, bodies, statuses) are unchanged. Context: `docs/changes/2026-10-14-refactor-and-ui-polish.md`, QA observations O1 and O2 in `reports/changes/2026-10-14-refactor-and-ui-polish.md`. Status: **awaiting user approval** (two choices to confirm, section 1, "Decisions for the user").

## 1. Overview

**Outcome**
1. **Toast placement (O1):** at 601px and wider the toast stack no longer covers **Add task**, the toolbar or the header (Logout) at 1280px or any other width. At 600px and below nothing changes.
2. **Lingering success toast (O2):** reaching `/login` clears every earlier toast, so after a session ends (for example a `passwordChanged` logout) only the login notice is shown.
3. **Prod DB credentials:** with `SPRING_PROFILES_ACTIVE=prod` the backend needs `DB_URL`, `DB_USERNAME` and `DB_PASSWORD`. It refuses to start, with a clear message, if any is missing or blank. It never falls back to `root`/`root`. The dev profile does not change.
4. **Frontend on Vercel:** the backend's allowed CORS origins come from `CORS_ALLOWED_ORIGINS`, with a default of `http://localhost:3000`, so dev and tests are unchanged. The frontend can call an absolute backend URL through build-time `VITE_API_BASE_URL` (empty default keeps today's relative `/api`). A `frontend/vercel.json` SPA fallback makes deep links such as `/tasks` work on refresh.

**Decisions for the user (at approval)**
- **D-A: how the Vercel frontend reaches the backend. Recommended: Option 1.**
  - *Option 1 (recommended, what this plan builds):* set `VITE_API_BASE_URL=https://<backend-host>` in the Vercel project and `CORS_ALLOWED_ORIGINS=https://<project>.vercel.app` on the backend. This is what the user asked for (CORS handled), it is explicit, and it needs no proxy.
  - *Option 2 (documented only, no extra code):* add a Vercel external rewrite `/api/:path*` → `https://<backend-host>/api/:path*` to `vercel.json`. The browser then sees one origin, so CORS is not needed and `VITE_API_BASE_URL` stays empty. Costs: the backend host is written in a committed file, and every call takes an extra hop through Vercel. Both options are supported after this change. The choice only affects the deploy settings.
- **D-B: is `CORS_ALLOWED_ORIGINS` required under `prod`? Recommended: optional.** It keeps the localhost default, as the earlier decision "prod requires only the DB variables" implies, and the backend logs the effective allowed origins once at startup (INFO; origins are not secret), so a missing value is visible. Alternative: add it to the prod fail-fast check. That fits Option 1 but breaks Option 2 deployments, which need no CORS.

**Scope:** items 1-4, their tests, and the README and build-summary notes.

**Exclusions**
- `JWT_SECRET` and `ADMIN_PASSWORD` are not required in prod (user decision). They keep their dev defaults; the README warning stays.
- The pasted snippet (`addMapping("/**").allowedOrigins("https://vercel.app")…allowedHeaders("*")`) is **not** used as-is, for three reasons:
  - `https://vercel.app` never matches a real deployment origin such as `https://<project>.vercel.app`, because origins match exactly.
  - It omits `PATCH`, which the API uses for `/api/tasks/{id}/completion`, `/api/admin/users/{userId}/tasks/{taskId}/completion` and `/api/admin/users/{userId}/status`.
  - It would drop the exposed headers `X-Auth-Token`, `X-Auth-Expires-In` and `Location`, and sliding sessions need the first two.

  The existing `CorsConfigurationSource` bean is kept and only its origin list becomes configurable.
- No CORS credentials or cookies (JWT travels in the `Authorization` header). No `max-age` tuning. No Vercel project setup, deployment or backend hosting; those are the user's deploy steps.
- No new dependency (npm or Maven). No route, copy or toast-timing change. `application-test.yml` is unchanged. Other prod hardening (`spring.sql.init.mode: always`, the `createDatabaseIfNotExist` flag, log levels) is out of scope.
- Accepted: row actions in the bottom-right of a list can still be covered by a toast for up to 8 s (2.1).

**Assumptions:** the profile is named `prod`. The Vercel project's root directory is `frontend/`, so `frontend/vercel.json` is picked up. `SPRING_DATASOURCE_*` still overrides `spring.datasource.*` (standard Spring), but the prod check always requires the three `DB_*` names.

No blocking questions.

## 2. Architecture

### 2.1 Toast placement (frontend, CSS only)
- **Finding:** `.toast-viewport` is fixed top-right under the header (`top: header + 12px`, 360px wide). At 1280px the 960px container ends at x=1120, so the stack (x 908-1268, y 76+) sits over the toolbar's right end, where **Add task** is. No top-right spot avoids this, because the 160px gutter is narrower than a toast.
- **Decision:** move the stack to the **bottom-right** above 600px: `bottom: calc(var(--space-3) + env(safe-area-inset-bottom)); right: var(--space-3)`, no `top`. Everything else stays: width, gap, z-index, `pointer-events`, the animations and the 600px-and-below full-width bottom rule. The stack is then always away from the header, title, toolbar, inline forms and centred dialogs.
- **Trade-off:** it can cover bottom-right row actions. They are secondary, and a toast pauses on hover, closes with × or Escape, and lasts 8 s at most. Rejected: top-centre (covers the title and tabs), a narrower toast, and dodging logic.

### 2.2 Clear toasts on arrival at `/login` (frontend)
- **Finding:** `NotificationProvider` sits above `<Routes>`, so toasts survive navigation by design. `AuthProvider` sits outside it, so `logout` cannot reach the toasts.
- **Decision:** add `clear(): void` to `Notifications`. It removes every toast **immediately**, with no exit animation, so no fading `role=status` node is left, and it cancels all countdown and exit timers. `LoginPage`'s existing layout effect calls `notify.clear()` first, then pushes its notice, if any. This covers plain logout, expiry, disabled, password-changed and Register → `/login?registered=1`. Under StrictMode the re-run clears the dismissed first notice at once, so the DEF-1 single-toast guarantee holds.
- Rejected: clearing on every route change (a delete-failure toast must survive navigation).

### 2.3 Prod profile (backend)
- **Finding:** `application.yml` reads `${DB_URL:…}`, `${DB_USERNAME:root}` and `${DB_PASSWORD:root}`, so a missing variable in prod silently becomes `root`/`root`. Removing the defaults alone is **not enough**: Spring Boot's binder leaves an unresolvable `${DB_URL}` as literal text instead of failing. That gives a misleading JDBC error, or a login attempt with the literal password `${DB_PASSWORD}`.
- **Decision:**
  1. New `application-prod.yml` overriding only `spring.datasource.url/username/password` with `${DB_URL}`, `${DB_USERNAME}`, `${DB_PASSWORD}` (no defaults).
  2. New `config/ProdDatabaseEnvironmentCheck.java`, an `EnvironmentPostProcessor` registered in new `META-INF/spring.factories` (Boot 3.5 key `org.springframework.boot.env.EnvironmentPostProcessor`). When the `prod` profile is active it requires each of the three to be present and not blank. Otherwise it throws `IllegalStateException("Missing required environment variables for the 'prod' profile: <names>")`. The message has **names only, never values**. It runs before the context starts, so it needs no DB. With any other profile it does nothing.

### 2.4 Configurable CORS (backend) and API base URL (frontend)
- **Backend:** `application.yml` gains `app.cors.allowed-origins: ${CORS_ALLOWED_ORIGINS:http://localhost:3000}`. `SecurityConfig.corsConfigurationSource` reads it and passes the parsed list to `setAllowedOriginPatterns`, so exact origins and opt-in wildcard patterns such as `https://todo-app-*-myteam.vercel.app` both work.
  - **Parsing:** split on commas, trim, drop blank entries, strip one trailing `/`. A bare `*` or an empty result fails startup with a clear `IllegalStateException`. This is a package-private static method, unit-tested.
  - **Unchanged:** methods `GET, POST, PUT, PATCH, DELETE, OPTIONS` (verified against all controllers), allowed headers `Authorization, Content-Type` (explicit, not `*`), exposed headers `Location, X-Auth-Token, X-Auth-Expires-In`, and no `allowCredentials`, so `Access-Control-Allow-Credentials` is never sent.
  - **Startup log:** one INFO line with the effective origins (D-B).
- **Frontend:** `apiClient.ts` builds the URL as `apiBaseUrl() + path`. `apiBaseUrl()` reads `import.meta.env.VITE_API_BASE_URL` at call time (so tests can `vi.stubEnv`), defaults to `''` and strips trailing slashes. All API paths already start with `/api/`, so with the default the existing 196 tests see identical relative URLs. `fetch` keeps the default `credentials` (no cookies). `VITE_` values are public build-time config, not secrets.
- **Vercel SPA fallback (trivial, in scope; flag):** new `frontend/vercel.json` with `{"rewrites":[{"source":"/(.*)","destination":"/index.html"}]}`. Vercel serves existing static files before rewrites, so assets are unaffected. It does nothing for local dev, preview or tests. With Option 2 the user adds the `/api/:path*` rewrite before this one (documented in the README).

### 2.5 Env variables and launch examples
| Where | Variable | Required | Default |
|---|---|---|---|
| Backend | `SPRING_PROFILES_ACTIVE=prod` | to enable the prod check | none |
| Backend (prod) | `DB_URL`, `DB_USERNAME`, `DB_PASSWORD` | **yes** under `prod` | dev only: localhost `todo_db`, `root`/`root` |
| Backend | `CORS_ALLOWED_ORIGINS` | no (D-B) | `http://localhost:3000` |
| Backend | `JWT_SECRET`, `JWT_EXPIRY_MINUTES`, `ADMIN_PASSWORD` | no (unchanged) | unchanged |
| Vercel build | `VITE_API_BASE_URL` | Option 1 only | empty (relative `/api`) |

```bash
# Backend (prod)
export SPRING_PROFILES_ACTIVE=prod
export DB_URL='jdbc:mysql://<db-host>:3306/todo_db?serverTimezone=UTC'
export DB_USERNAME='<db-user>'
export DB_PASSWORD='<from your secret store>'
export CORS_ALLOWED_ORIGINS='https://<project>.vercel.app'   # Option 1; comma-separate several origins
java -jar target/todo-backend-0.0.1-SNAPSHOT.jar
# Vercel project settings (Option 1): Root Directory = frontend, env VITE_API_BASE_URL=https://<backend-host>
```

### 2.6 Affected areas and dependencies
- Frontend: `src/styles/index.css`, `src/notifications/notificationContext.ts`, `src/notifications/NotificationProvider.tsx`, `src/pages/LoginPage.tsx`, `src/api/apiClient.ts`, new `vercel.json`, plus tests. `src/auth/**` has no diff.
- Backend: `application.yml` (one added property; the existing lines are untouched), `config/SecurityConfig.java`, new `application-prod.yml`, `config/ProdDatabaseEnvironmentCheck.java`, `META-INF/spring.factories`, plus tests.
- Docs (Team Lead's shared files): `README.md`, `docs/build-summary.md`.
- B1/B2 and F1/F2 are independent and run in parallel. D1 follows the merges. Q1 follows D1.

## 3. API Contract
Paths, methods, bodies, statuses and the error shape are unchanged. The only HTTP-level change: CORS response headers are now sent for the origins configured in `CORS_ALLOWED_ORIGINS` (default unchanged). `docs/openapi.yaml` is not present; creating it stays out of scope.

## 4. Tasks by Role
Backend on `feature/backend-prod-config`, one commit per task. Frontend on `feature/frontend-toast-fixes-vercel`, one commit per task. Code Simplifier is skipped on both (small changes).

| ID | Owner | Files | Deliverable | Security acceptance |
|---|---|---|---|---|
| **B1** Prod DB profile | `dev-backend` | new `application-prod.yml`, `config/ProdDatabaseEnvironmentCheck.java`, `META-INF/spring.factories`, test `config/ProdDatabaseEnvironmentCheckTest.java` | 2.3 implemented; B-T1 to B-T5 green | No credential value in git, the message or logs; no default for the three variables under `prod` |
| **B2** Configurable CORS | `dev-backend` | `application.yml` (one property), `config/SecurityConfig.java`, tests `config/CorsOriginsTest.java` (parsing) and `security/CorsConfigurationTest.java` (MockMvc) | 2.4 backend implemented; B-T6 to B-T9 green. Existing CORS tests (`SecurityQaTest.s05`, `SecurityIntegrationTest.corsPreflight…`) pass **unedited**. `mvn test` is 266 + new, all green, run on a private DB. | Unknown origins get no `Access-Control-Allow-Origin`; bare `*` rejected; no `Allow-Credentials`; exposed headers unchanged |
| **F1** Toast placement and clear on login | `dev-frontend` | `styles/index.css` (Toasts section), `notifications/notificationContext.ts`, `notifications/NotificationProvider.tsx`, `pages/LoginPage.tsx`; tests in `notifications/notifications.test.tsx`, `pages/notificationsFlow.test.tsx`, new `styles/toastPlacement.test.ts` | 2.1 and 2.2 implemented; F-T1 to F-T6 green | Toasts render as text; `clear()` is memory-only |
| **F2** API base URL and Vercel fallback | `dev-frontend` | `api/apiClient.ts`, `api/apiClient.test.ts` (add cases), new `vercel.json` | 2.4 frontend implemented; F-T7 to F-T9 green. 196 existing tests **unedited**. `npm run lint`, `npm run build` and `npm audit --audit-level=high` are clean. | No secret in `VITE_*`; no `credentials: 'include'`; the token is still sent only as the `Authorization` header |
| **D1** Docs | Team Lead | `README.md`, `docs/build-summary.md` | README "Production / Vercel" section: the 2.5 table and commands, both D-A options (including the Option 2 `vercel.json` rewrite snippet placed before the SPA rule), CORS rules (exact origins, opt-in patterns, PATCH needed), and the env table marking `DB_*` "required with `prod`". build-summary: key decisions (prod fail-fast check, configurable CORS, `VITE_API_BASE_URL`) and the known limitations in section 6. | Placeholders only |
| **Q1** Retest | `qa` | `reports/changes/2026-10-14-toast-fixes-and-prod-db-config.md` on `feature/qa-toast-prod-cors` | Rows in 5.4 with PASS/FAIL and evidence, using `/qa-only` | R6-R11 recorded with evidence |

Review: B2 touches security config, so the Team Lead runs `/review` and `/code-review` on the backend diff.

## 5. Test Plan

### 5.1 New automated tests
| ID | Level | Case | Expected |
|---|---|---|---|
| B-T1 | unit (`MockEnvironment`, `prod`, all three set) | run the check | no exception |
| B-T2 | unit, each variable missing, then blank `"  "` | run the check | `IllegalStateException` naming exactly the missing names. A distinctive password value that is set does not appear in the message. |
| B-T3 | unit, no profile or `test`, none set | run the check | no exception |
| B-T4 | boot: `SpringApplicationBuilder(TodoApplication.class).profiles("prod")`, environment stripped of OS env and system properties, no `DB_PASSWORD` | run | throws before any DB contact, within seconds |
| B-T5 | config: load `application-prod.yml` with `YamlPropertySourceLoader` | the three values | exactly `${DB_URL}`, `${DB_USERNAME}`, `${DB_PASSWORD}` |
| B-T6 | unit parsing | `" https://a.vercel.app/ , ,https://b-*-t.vercel.app"`; `"*"`; `""` | `[https://a.vercel.app, https://b-*-t.vercel.app]`; `*` → exception; empty → exception |
| B-T7 | MockMvc, `@SpringBootTest(properties = "app.cors.allowed-origins=https://todo.vercel.app,https://todo-*-team.vercel.app")`: preflight `OPTIONS /api/tasks/1/completion`, `Access-Control-Request-Method: PATCH`, `Access-Control-Request-Headers: authorization,content-type` from `https://todo.vercel.app` and from `https://todo-git-x-team.vercel.app` | response headers | `Access-Control-Allow-Origin` echoes the origin; Allow-Methods includes `PATCH`; Allow-Headers includes `authorization`; no `Access-Control-Allow-Credentials` |
| B-T8 | same context: authenticated `GET /api/tasks` with `Origin: https://todo.vercel.app` | response headers | 200; `Access-Control-Expose-Headers` contains `X-Auth-Token`, `X-Auth-Expires-In`, `Location` |
| B-T9 | same context: origins `https://vercel.app`, `https://evil.vercel.app`, `http://localhost:3000`, `http://evil.example` | preflight | no `Access-Control-Allow-Origin` (403 preflight). The default context keeps localhost via the unedited existing tests. |
| F-T1 | static CSS guard (`styles/toastPlacement.test.ts`, reads `index.css` with `node:fs`; jsdom has no layout and Vitest uses `css: false`) | base `.toast-viewport` | `bottom:` and `right:`, no `top:`; the 600px-and-below rule is unchanged |
| F-T2 | unit, fake timers | push 3 toasts, dismiss one (leaving), `clear()` | 0 toasts at once. Advancing 10 s gives no errors and no reappearance. A later push auto-dismisses at 5000 + 150 ms. |
| F-T3 | flow | "Password changed" toast, then the next request returns 401 `Password has been changed. Please log in again.` | `/login?passwordChanged=1`: no "Password changed"; info notice shown; exactly one `role=status` |
| F-T4 | flow | "Password changed" toast, then **Logout** | `/login`: no toast |
| F-T5 | flow, fake timers | toggle-failure error toast, then the session timer expires | `/login?expired=1`: only the expiry notice; no `role=alert` toast |
| F-T6 | regression | `loginNoticeStrictMode`, the `?registered` → `/tasks` flow, login-notice tests | unchanged and green |
| F-T7 | unit (`apiClient.test.ts`) | no env | `fetch` called with `/api/tasks` (relative, as today) |
| F-T8 | unit, `vi.stubEnv('VITE_API_BASE_URL','https://api.example.com/')`, then unstub | request `/api/tasks` | `fetch` called with `https://api.example.com/api/tasks`; `Authorization` header unchanged; no `credentials: 'include'` |
| F-T9 | static | `vercel.json` parses as JSON | exactly one rewrite, to `/index.html` |

### 5.2 Acceptance criteria
1. At 1280x800, 1440x900 and 1024x768 with 3 toasts on `/tasks` and `/admin/users`, the stack's box does not intersect Add task, search, tabs, the header or an open dialog. At 375px placement is identical to `master`.
2. After any session end, `/login` shows at most the one login notice. Toasts still survive navigation between signed-in pages.
3. Under `prod`, a missing or blank `DB_*` variable fails startup and the message names it. All three set → the app starts. Without `prod` → as today.
4. With `CORS_ALLOWED_ORIGINS` set, a frontend served from that origin can log in, toggle a task (PATCH) and keep its session renewed (`X-Auth-Token` readable). Other origins are refused. Unset → only `http://localhost:3000`, as today.
5. Empty `VITE_API_BASE_URL` → relative `/api` (dev proxy works as today). Set → absolute calls to that host. A deep link refreshed on Vercel serves the SPA.
6. Backend 266 and frontend 196 existing tests are green and **unedited**; the new tests are added.

### 5.3 Regression list
- Toast timing, pause, cap, dedupe, × and Escape (N1-N4); role counts; DEF-1 (dev StrictMode: one login toast); login notices N7a-c; 401 suppression (UI25, E15); toggle and delete failure toasts; admin reset success toast; mobile stack full width at the bottom.
- Dev: `npm run dev` with the proxy, and backend with no variables (`root`/`root`, `todo_db`, CORS for localhost:3000). Sliding renewal through `X-Auth-Token` (REG-4a).
- Backend: all existing suites, including both CORS tests unedited.

### 5.4 QA retest rows
| # | Check | Expected |
|---|---|---|
| R1 | Criterion 1 on the real stack (Playwright `boundingBox()` intersection, plus screenshots at 1280 and 1440, light and dark) | no intersection; O1 closed |
| R2 | 768px and 375px with 3 toasts, with the Reset password dialog open | no overlap with dialog buttons; 375 matches `master` |
| R3 | O2 real flow: user A changes password (toast); within 5 s admin resets A's password in a second browser context; A clicks a nav link | `/login?passwordChanged=1` with only the info toast; one `role=status` |
| R4 | Logout right after a success toast; expiry after an error toast | no stale toast on `/login` |
| R5 | Regression list 5.3 on the dev server and on `vite preview` | PASS |
| R6 | `SPRING_PROFILES_ACTIVE=prod java -jar …` with `DB_PASSWORD` unset, then empty | non-zero exit within seconds; the message names `DB_PASSWORD`; no credential value printed |
| R7 | prod with all three pointing at a disposable local schema; then the default profile with no variables | both start and login works; drop the schema afterwards |
| R8 | **Real cross-origin:** backend 8080 with `CORS_ALLOWED_ORIGINS=http://localhost:4173`; `VITE_API_BASE_URL=http://localhost:8080 npm run build && npx vite preview --port 4173` (proxy not used); in a browser register, log in, create, toggle (PATCH), delete, admin disable (PATCH) | no CORS errors in the console. The Network tab shows requests going to `:8080` with `Origin: http://localhost:4173` and ACAO echoed. The token is renewed from `X-Auth-Token`. |
| R9 | Same build served on port 4174 (not allowed) | the browser blocks it with a CORS error; the app shows "Network error"; nothing leaks |
| R10 | `curl` probes against 8080: preflight from the allowed origin, from `http://evil.example` and from `https://vercel.app`; a GET from the allowed origin | allowed: ACAO equals the origin, methods include PATCH, exposed headers include `X-Auth-Token`; others: no ACAO; no `Access-Control-Allow-Credentials` anywhere |
| R11 | Backend with `CORS_ALLOWED_ORIGINS='*'` | startup fails with a clear message |
| R12 | `vite preview` with an empty `VITE_API_BASE_URL` and the default backend: login and tasks through the proxy at 3000 | as today. `vercel.json` validated as JSON. Actual Vercel deep-link refresh: not testable locally; record under "not tested". |
| R13 | `git diff master` for credentials, plus `grep -rn 'VITE_API_BASE_URL\|vercel.app' frontend/dist` after a default build | no real credentials; examples use placeholders; the default build has no absolute backend URL |

**Verification commands:** `cd backend && SPRING_DATASOURCE_URL='jdbc:mysql://localhost:3306/todo_mytests_db?createDatabaseIfNotExist=true&serverTimezone=UTC' mvn test`; `cd frontend && npm test && npm run lint && npm run build && npm audit --audit-level=high`; `git diff --stat master -- frontend/src/auth` is empty.

**Not covered:** real pixel overlap in jsdom (QA R1/R2 instead), and the actual Vercel deployment and its rewrites (user's deploy step; R8 simulates cross-origin locally).

## 6. Security
- Roles, tenancy (users see only their own tasks, admins see all), public routes (`/login`, `/register` and their endpoints), seeded users (user A, user B, admin) and out-of-scope routes are **unchanged** from `docs/plan.md`.
- **Probe matrix:** no endpoint or authorization change, so the identity rows stay valid. Because `SecurityConfig` changes, QA reruns the playbook's **CORS and headers** probes (R10) and records them in `reports/security-report.md` as a dated addendum (A05).
- **Prod credentials (A05, A07):** fail fast with no defaults under `prod`. The error has names only. No new logging of datasource values; HikariCP does not log passwords. Examples in git are placeholders.
- **CORS (A05):**
  - Exact-origin allow list from configuration. Bare `*` is rejected.
  - Wildcard patterns are an explicit opt-in. A broad `https://*.vercel.app` would let any Vercel-hosted site call the API from a browser. Impact is limited because no credentials or cookies are allowed and the JWT sits in the app origin's own storage, but the README recommends exact origins or a project-scoped pattern.
  - No `Allow-Credentials`. Allowed headers stay explicit, and exposed headers stay as today.
- **Frontend:** `VITE_API_BASE_URL` is public build config (never a secret). The token is still sent only in `Authorization`. `clear()` is memory-only. Toasts render as text.
- **Known limitations, for `docs/build-summary.md`:**
  - In prod, `JWT_SECRET` and `ADMIN_PASSWORD` still fall back to their insecure dev defaults (excluded by user decision); operators must set them.
  - If D-B stays optional, an unset `CORS_ALLOWED_ORIGINS` in prod allows only localhost (fails closed; visible in the startup log).
- Per-task security acceptance: section 4.

## 7. Web quality and search visibility
**N/A, except the SPA fallback.** The routes are classified as before: all private (class 3) except `/login` and `/register` (class 2, not for search); there are no class 1 pages, so no SSR, sitemap, robots, Open Graph or structured data.
- **Serving:** on Vercel, Vercel serves the static frontend. `frontend/vercel.json` owns the SPA fallback (every unknown path → `index.html` with status 200). Not found stays client-side, so a real HTTP 404 is N/A, as in the Vite setup.
- **Redirects:** no 301s are needed.
- **robots.txt and sitemap.xml:** not added (no indexable pages).
- **Rendering:** unchanged (SPA, no SSR or pre-render).
