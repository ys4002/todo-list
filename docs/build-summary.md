# todo-app: Build Summary

Date: 2026-10-07 · Team: planner, team-lead, backend, frontend, qa

## What was built
A multi-user to-do list web app.

- **Users** register (username, display name, password + confirm), log in, and manage their own tasks: create, edit, delete, mark complete or incomplete. Every task has a required due date and time. Overdue tasks (not completed, past due) show an Overdue marker but can still be completed. Tasks can be filtered (All / Active / Completed) and searched. Users change their own password from the Profile page after confirming the old one.
- **Sessions** last 60 minutes and renew on every authenticated request (new token returned in the `X-Auth-Token` response header and stored by the frontend).
- **Admin** (seeded `admin` / `admin`) lists and searches users, disables or enables them (an admin cannot disable themselves), resets any user's password, and views, creates, edits, completes and deletes any user's tasks.
- A user's tasks are never visible to other users. Another user's task returns 404.

## Stack
- Backend: Java 21, Spring Boot 3.5, Maven, Spring Data JPA, Spring Security with JWT (HS256), MySQL. Port 8080.
- Frontend: React, TypeScript, Vite, react-router-dom. Port 3000 (`/api` proxied to 8080).
- Database: `todo_db` on `localhost:3306` (tables `users`, `tasks`, created automatically by `schema.sql`).

## How to run
```bash
# Backend (needs MySQL running on localhost:3306, user root / password root)
export JAVA_HOME=/opt/homebrew/opt/openjdk@21 PATH="/opt/homebrew/opt/openjdk@21/bin:$PATH"
cd backend && mvn spring-boot:run          # or: mvn package && java -jar target/todo-backend-0.0.1-SNAPSHOT.jar

# Frontend
cd frontend && npm install && npm run dev  # http://localhost:3000
```
Login at http://localhost:3000/login. Admin: `admin` / `admin` (insecure default; change it from the Profile page).

Optional backend environment variables: `JWT_SECRET` (32+ bytes), `JWT_EXPIRY_MINUTES` (default 60), `ADMIN_PASSWORD` (first start only), `DB_URL`, `DB_USERNAME`, `DB_PASSWORD`.

## Tests
Run backend tests against a private database: concurrent runs on the shared `todo_test_db` cause false "duplicate admin" errors.
```bash
cd backend && SPRING_DATASOURCE_URL='jdbc:mysql://localhost:3306/todo_mytests_db?createDatabaseIfNotExist=true&serverTimezone=UTC' mvn test
cd frontend && npm test && npm run build && npm run lint
```
Results (re-run by the Team Lead on the merged code): backend 279 passed, 0 failed; frontend 205 passed, 0 failed; build, lint and `npm audit --audit-level=high` green. Full detail in `reports/test-report.md`, `reports/test-cases.md` and `reports/e2e-manual.md`; the 2026-10-14 change is covered by `reports/changes/`.

## Key decisions
- **Auth tokens:** `spring-boot-starter-oauth2-resource-server` (Spring's own JWT support) instead of a third-party JWT library. Approved by the Team Lead.
- **Sliding session:** every authenticated response carries a fresh token in `X-Auth-Token`. No refresh endpoint.
- **Password change:** `users.token_version` is bumped on every password change and is checked on each request, so old tokens stop working at once. The user who made the change gets a fresh token.
- **Schema:** `schema.sql` run by Spring, no Flyway. No Lombok.
- **Frontend:** `react-router-dom` (routing); Testing Library packages and `jsdom` (component tests); ESLint tooling (`eslint`, `@eslint/js`, `typescript-eslint`, `eslint-plugin-react-hooks`, `globals`), `@testing-library/dom` and `@types/node`. All approved by the Team Lead.
- **Public auth calls** (login, register) send no bearer token.

## Change 2026-10-14: refactor, notifications and UI polish
Frontend only; no backend, API-contract or dependency change. Plan: `docs/changes/2026-10-14-refactor-and-ui-polish.md`; QA: `reports/changes/2026-10-14-refactor-and-ui-polish.md`.
- **Refactor:** shared error helpers (`utils/formErrors.ts`), `useModalDialog` hook (Escape handling and focus return), `useAdminUsers` hook; duplicated error-mapping and magic-string code removed.
- **Notifications:** success confirmations and failed task/admin actions now show as toasts (`src/notifications/`) that auto-dismiss (5 s, errors 8 s), pause on hover or focus, have a close button, and are announced with `role=status` or `role=alert`. Form and field errors and list-load failures stay inline. The login notices (`?registered`, `?expired`, `?passwordChanged`, `?disabled`) are toasts that go away when you leave `/login`. A 401 on a failed action shows no error toast because the session handler redirects with its own notice.
- **UI:** design tokens (`src/styles/tokens.css`), light and dark theme following the OS setting, redesigned header, auth screens, tasks, admin table and dialogs; responsive to 375 px; plain CSS and system fonts, no new libraries.
- **Defects found by QA and fixed:** DEF-1 (duplicate toast under React StrictMode in `npm run dev`) and DEF-2 (Reset password dialog lost initial focus in dev). Neither affected the production build.

## Change 2026-10-14 (2): toast fixes, prod database profile, CORS and Vercel
Plan: `docs/changes/2026-10-14-toast-fixes-and-prod-db-config.md`.
- **Toasts:** the stack moved to bottom-right above 600 px (it no longer covers "Add task"), and arriving at `/login` clears earlier toasts so only the login notice shows.
- **Prod database profile:** `application-prod.yml` plus `ProdDatabaseEnvironmentCheck` (an `EnvironmentPostProcessor`) make `DB_URL`, `DB_USERNAME` and `DB_PASSWORD` mandatory with `SPRING_PROFILES_ACTIVE=prod`, failing fast with names only. Needed because Spring leaves an unresolved `${DB_URL}` as literal text instead of failing. `application.yml` dev defaults are unchanged.
- **CORS:** allowed origins come from `CORS_ALLOWED_ORIGINS` (default `http://localhost:3000`); exact origins or explicit opt-in patterns, a bare `*` is rejected, no credentials, `PATCH` allowed, `X-Auth-Token`, `X-Auth-Expires-In` and `Location` exposed. Optional under `prod` (localhost default, origins logged at startup).
- **Frontend:** `VITE_API_BASE_URL` (empty default keeps relative `/api`) and `frontend/vercel.json` SPA fallback.
- **Test fix:** the "maps 401" session tests in `auth.test.tsx` now wait for the async redirect (intermittent failure in about 3 of 10 runs before; 0 of 12 after).
- **Known limitations:** in prod `JWT_SECRET` and `ADMIN_PASSWORD` still default to dev values; an unset `CORS_ALLOWED_ORIGINS` allows only localhost; `backend/Dockerfile` (user-added) uses Java 17 images while the project targets Java 21.

## Known limitations
- Dialogs do not trap focus (focus is restored to the opener on close; Escape works).
- Toast announcements were not tested with a screen reader (VoiceOver): toasts are inserted with their text already inside, so some screen readers may not announce success and info toasts. Safari, Firefox, axe, forced-colors mode, and the full keyboard-only walk were also not tested.
- Cosmetic, from QA (open): on the admin table at 768 px the Tasks cell wraps to 3 or 4 lines. (The toast overlap with "Add task" and the lingering success toast were fixed in change 2.)
- The default `admin` / `admin` password is insecure. It is meant for first use only; the backend logs a warning while it is unchanged.
- OBS-1 (low): a stale or invalid bearer token sent to `/api/auth/login` or `/register` returns 401. The frontend no longer sends one there.
- Not executed (no browser automation available to QA): E20 (375 px layout) and the visual side of E3, E8, E10 and E11. Their logic is covered by automated UI tests. A person should click through the app once.
- No email, password reset by email, pagination, or categories (out of scope).
