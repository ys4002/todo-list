# QA retest: toast fixes, prod DB config, CORS/Vercel (2026-10-14)

Plan: `docs/changes/2026-10-14-toast-fixes-and-prod-db-config.md` (rows R1-R13, section 6). Build under test: `master` 1e441fe (branch `feature/qa-toast-prod-cors`).
Method: lean targeted retest (lead's usage constraint), report-only, no product edits. Playwright/Chromium (headless shell) scripts against the real stack; disposable schema `todo_qa_change2` (dropped), users created through the API/Register page. The gstack `/qa-only` section files and health-score template were not run, to save usage; results are recorded directly as PASS/FAIL with evidence. Chromium only.

## Summary
12 of 13 rows PASS. **One defect (DEF-3, low/medium): at 1024x768 with 3 toasts and the Reset password dialog open, the stack covers part of the dialog and its "Reset password" submit button** (acceptance criterion 1 of 5.2 says no intersection with an open dialog at 1024). R2 at 375: the same overlap exists but is the unchanged full-width bottom rule (expected "375 matches master").

## Results
| Row | Result | Evidence |
|---|---|---|
| R1 | **PARTIAL FAIL** (DEF-3) | 3 toasts, `boundingBox()` of every `.toast` vs header, h1, tabs, search, Add task: **no intersection** at 1024x768, 1280x800, 1440x900 on `/tasks` and `/admin/users`, light and dark. With the Reset password dialog open: no overlap at 1280, 1440, 768; **overlap with the dialog box and its buttons at 1024x768** (light and dark). Stack position at 1024x768: x=652..1012, y=566..756 (bottom-right). O1 closed otherwise. |
| R2 | PASS (with note) | 768x1024: no overlap with the dialog. 375x812: stack full width (x=12, 351 wide) at the bottom, no horizontal scroll, no header/tabs/Add task overlap; it overlaps the open dialog's buttons exactly as before: `git diff 0226e18 HEAD -- frontend/src/styles/index.css` changes only the base `.toast-viewport` rule; the max-width 600px rule is untouched. |
| R3 | PASS | User changes password -> toast "Password changed" (1 `role=status`); admin resets that user's password via API (200); user clicks My Tasks -> `/login?passwordChanged=1`: exactly one `.toast`, one `role=status`, text "Your password was changed. Please log in again."; no "Password changed". The admin reset was an API call, not a second browser context UI. |
| R4 | PASS | Change-password toast then **Logout**: `/login`, 0 toasts, 0 `role=status`. Error toast ("Toggle boom", `role=alert`) then a 401 on the next request: `/login?expired=1`, only the expiry notice, 0 `role=alert`. Plain logout after login: 0 toasts. Expiry was a mocked 401 (not the client timer). |
| R5 | PASS | Same flows and the 3-toast layout run on `npm run dev` (StrictMode) and on `vite preview`: identical. DEF-1: `/login?expired=1` shows exactly one toast. DEF-2: Reset password dialog focus is on "New password" (`#resetNewPassword`). `?registered`: Register -> `/login?registered=1`, one toast "Registration successful. Please log in."; login -> `/tasks` with no toast. Not re-run: the rest of list 5.3 (timing, pause, cap and dedupe are covered by the 205 unit tests). |
| R6 | PASS | `SPRING_PROFILES_ACTIVE=prod java -jar` (jar from `mvn package -DskipTests`): `DB_PASSWORD` unset, and `DB_PASSWORD=` empty -> exit 1 in about 0.4 s, `IllegalStateException: Missing required environment variables for the 'prod' profile: DB_PASSWORD`; no value printed. |
| R7 | PASS (variation) | prod with `DB_URL`/`DB_USERNAME`/`DB_PASSWORD` set to `todo_qa_change2`: starts in 2.0 s, logs `CORS allowed origins: [http://localhost:4173]`, admin login 200. Default profile with no `DB_*`/`CORS_*`/profile variables: starts, CORS log `[http://localhost:3000]`, admin login 200. **Variation:** to avoid touching the real `todo_db`, the default-profile run used `SPRING_DATASOURCE_URL` for the disposable schema (and `JWT_EXPIRY_MINUTES=60`); the `root`/`root`/`todo_db` defaults themselves were not exercised. |
| R8 | PASS | Backend 8080 (`CORS_ALLOWED_ORIGINS=http://localhost:4173`), build with `VITE_API_BASE_URL=http://localhost:8080` served by `vite preview` on 4173: login -> `/tasks`; create (POST 201), toggle (PATCH `/api/tasks/1/completion` 200), delete (DELETE 204); every response `Access-Control-Allow-Origin: http://localhost:4173`; zero console errors; stored session token changed after the PATCH (renewal from `X-Auth-Token`); an in-page `fetch` read `X-Auth-Token` and `X-Auth-Expires-In: 3600` (exposed). **Not tested in the browser:** admin disable (PATCH `/status`); PATCH is covered by the toggle and the preflight probe. |
| R9 | PASS | Same build on 4174: login blocked ("Access ... from origin 'http://localhost:4174' has been blocked by CORS policy"), page shows "Network error", stays on `/login`. |
| R10 | PASS | Preflight (PATCH, `authorization,content-type`): `http://localhost:4173` -> 200, ACAO echoes the origin, Allow-Methods `GET,POST,PUT,PATCH,DELETE,OPTIONS`, Allow-Headers `authorization, content-type`, Expose `Location, X-Auth-Token, X-Auth-Expires-In`. `http://evil.example`, `https://vercel.app`, `http://localhost:3000`, `http://localhost:4174` -> 403, no ACAO. Authenticated GET with the allowed Origin: ACAO + `X-Auth-Token`. `Access-Control-Allow-Credentials` appeared in no response. |
| R11 | PASS | `CORS_ALLOWED_ORIGINS='*'`, real startup: exit 1, `app.cors.allowed-origins must not be '*'; list exact origins or explicit patterns`. |
| R12 | PASS | Default build + `vite preview` on 3000 with the proxy: all flows above ran through it (login, tasks, admin). `frontend/vercel.json` is valid JSON: one rewrite `/(.*)` -> `/index.html`. |
| R13 | PASS | Default `npm run build` output: no `VITE_API_BASE_URL`, `vercel.app` or `localhost:8080` in `frontend/dist`. The cross-origin build (env set) contains `localhost:8080` once, as intended. `git diff 0226e18 HEAD`: docs use placeholders (`<db-host>`, `<from your secret store>`); test fixtures use obviously fake values; the committed prod YAML holds `${DB_*}` only. No `credentials: 'include'`. |

## Full suites (on master 1e441fe)
- `mvn test` (private schema `todo_qa_change2_mvn`, dropped): **279 run, 0 failures, 0 errors**, BUILD SUCCESS.
- `npm test`: **205 passed** (22 files). `npm run lint`: clean. `npm run build`: OK. `npm audit --audit-level=high`: 0 vulnerabilities.
- `git diff --stat 0226e18 HEAD -- frontend/src/auth`: only `auth.test.tsx` (the approved flaky-test fix); no production auth code changed.

## Security greps (section 6)
- S1 (`dangerouslySetInnerHTML|innerHTML|eval(` in `frontend/src`): no matches. PASS.
- S4 (absolute `http(s)://` in styles, index.html, components, notifications, excluding the SVG xmlns): no matches. PASS.
- Notifications use no `localStorage`/`sessionStorage`. PASS.
- CORS (A05), R10: exact-origin allow list, unknown origins refused, no Allow-Credentials, bare `*` rejected at startup. PASS. A dated addendum to `reports/security-report.md` was not written; this file holds the evidence.

## Defect
**DEF-3 (low-medium, frontend, CSS placement): toast stack overlaps the Reset password dialog's submit button at 1024x768.**
Repro: `npm run dev` or `vite preview`, viewport 1024x768, sign in as admin, open `/admin/users`, reset three different users' passwords (3 success toasts, bottom-right), then click "Reset password" on a fourth user while the toasts are still up (5 s each). Expected (plan 5.2 criterion 1): the stack does not intersect an open dialog. Actual: the dialog is centred (x 292..732, bottom y 622) and the stack occupies x 652..1012, y 566..756, so the toasts cover the right part of the "Reset password" button (x 568..707, y 557..597). At 1280x800 and wider, and at 768x1024, there is no overlap. The dialog can still be submitted by keyboard, and the toasts last 5 s. This is the same class as the accepted trade-off in 2.1 (toasts over bottom-right content) but it contradicts the stated criterion; the lead decides severity.

## Observations (not defects)
- With 3 toasts at the bottom-right, Playwright could not click row actions beneath them (for example "Reset password for <user>" on the lowest rows) until they expired, the trade-off accepted in plan 2.1.

## Not tested
- Real Vercel deployment and deep-link refresh (local only; `vercel.json` validated as JSON).
- Admin disable (PATCH `/status`) from the cross-origin browser build; admin password reset from a second browser context; client-timer expiry (mocked 401 used); Firefox/Safari; real default-DB (`todo_db`, `root`/`root`) startup (disposable datasource override used); screenshots were reviewed but not committed.
- Wildcard origin patterns (`https://x-*.vercel.app`) at real startup (unit tests B-T6/B-T7 only).
