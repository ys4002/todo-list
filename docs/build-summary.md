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
Results (re-run by the Team Lead on the merged code): backend 266 passed, 0 failed; frontend 165 passed, 0 failed; build and lint green. Full detail in `reports/test-report.md`, `reports/test-cases.md` and `reports/e2e-manual.md`.

## Key decisions
- **Auth tokens:** `spring-boot-starter-oauth2-resource-server` (Spring's own JWT support) instead of a third-party JWT library. Approved by the Team Lead.
- **Sliding session:** every authenticated response carries a fresh token in `X-Auth-Token`. No refresh endpoint.
- **Password change:** `users.token_version` is bumped on every password change and is checked on each request, so old tokens stop working at once. The user who made the change gets a fresh token.
- **Schema:** `schema.sql` run by Spring, no Flyway. No Lombok.
- **Frontend:** `react-router-dom` (routing); Testing Library packages and `jsdom` (component tests); ESLint tooling (`eslint`, `@eslint/js`, `typescript-eslint`, `eslint-plugin-react-hooks`, `globals`), `@testing-library/dom` and `@types/node`. All approved by the Team Lead.
- **Public auth calls** (login, register) send no bearer token.

## Known limitations
- The default `admin` / `admin` password is insecure. It is meant for first use only; the backend logs a warning while it is unchanged.
- OBS-1 (low): a stale or invalid bearer token sent to `/api/auth/login` or `/register` returns 401. The frontend no longer sends one there.
- Not executed (no browser automation available to QA): E20 (375 px layout) and the visual side of E3, E8, E10 and E11. Their logic is covered by automated UI tests. A person should click through the app once.
- No email, password reset by email, pagination, or categories (out of scope).
