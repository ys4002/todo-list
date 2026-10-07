# todo-app: Plan

Author: Planner · Date: 2026-10-07 · Revision 3 (rev 2: date-time due, username login, confirm password, sliding session, ADMIN role, search; rev 3: change own password, admin password reset, token invalidation)

---

## 1. Overview

### 1.1 Goal
A multi-user to-do list web app. Users register and log in with a **username**, then manage **their own** tasks: create, view, search, edit, delete, mark complete or incomplete. Every task has a required complete-by **date and time**. An **admin** manages users (list, search, disable, enable) and can manage any user's tasks. Data is stored in MySQL.

### 1.2 Functional requirements
| ID | Requirement |
|---|---|
| R1 | A visitor registers with username, name, password and confirm password. Usernames are unique and case-insensitive. The password must meet the strength rules (3.2), and confirm password must match. Both are checked on the client **and** the server. |
| R2 | A registered, enabled user logs in with username and password and gets an access token. Admin and normal users use the same login page. After login, an admin goes to `/admin/users` and a user goes to `/tasks`. A logged-in user can log out. |
| R3 | A user creates a task with a title (required), a description (optional) and a due date-time (`dueAt`, required). |
| R4 | A user sees only their own tasks, sorted by `dueAt` ascending, with an All / Active / Completed filter. |
| R5 | A user edits a task's title, description, due date-time and completed flag. |
| R6 | A user marks a task completed or not completed with one click. This works **even after the due time has passed**. The completion time is recorded. |
| R7 | A user deletes a task after confirming. |
| R8 | A task that is not completed and whose `dueAt` is earlier than now shows an **Overdue** marker. The marker updates without reloading the page (checked every 60 s). |
| R9 | A user can never read or change another user's task. The API answers **404** for a task that isn't theirs, so it doesn't reveal that the task exists. |
| R10 | Unauthenticated access to protected pages redirects to Login. Unauthenticated API calls return 401. |
| R11 | **Sliding session:** a session lasts 60 minutes and is renewed by every authenticated API call (create, edit, delete, complete, list, search, …). After 60 minutes with no activity the session expires and the user is sent to Login with a "session expired" message. |
| R12 | **Admin seed:** on startup, if there is no user `admin`, the app creates `admin` / `admin` with role ADMIN. Seeding is idempotent: it never creates a duplicate or overwrites an existing admin's password, so a password changed through the UI (R16/R17) survives restarts. |
| R13 | **Admin (ROLE_ADMIN)** can list and search all users, view one user, disable or enable a user (but not themselves), and view, search, create, update, complete, uncomplete and delete any user's tasks. Non-admins get 403 on `/api/admin/**`, and the admin pages show them an Access Denied page. |
| R14 | **Disabled users** can't log in (403 "Account is disabled"). Their existing tokens are rejected on the next request (401 "Account is disabled"). |
| R15 | **Search:** a user searches their own tasks by text in the title or description (`q`), combined with the status filter. An admin searches users by username or name and searches a chosen user's tasks the same way. |
| R16 | **Change own password:** on the Profile page (`/profile`), any logged-in user (admin included) enters their current password, a new password and a confirmation. The new password must meet the registration strength rules, must not contain the username, and must differ from the current password. A wrong current password gives a 400 field error, not a 401, so the user stays logged in. |
| R17 | **Admin password reset:** an admin sets any user's password directly (no old password needed) from the Users page, with the same strength rules (checked against the *target's* username). This also works for the admin's own account and for disabled users (they stay disabled). |
| R18 | **Token invalidation after a password change:** once a user's password changes (by themselves or by an admin), **all tokens issued earlier for that user are rejected** (401 `Password has been changed. Please log in again.`). The person who made the change keeps working: if they changed their own password, the response carries a fresh token. |

### 1.3 Non-functional requirements
- Passwords are hashed with BCrypt. Hashes and passwords are never returned in responses or logged.
- Validation runs on the server (source of truth) and is repeated on the client for a better user experience.
- Backend `localhost:8080`, frontend `localhost:3000`, MySQL `localhost:3306` (root/root), database `todo_db` (tests: `todo_test_db`).
- Naming rules from CLAUDE.md: PascalCase classes and files, camelCase variables and methods, snake_case DB names.
- **Security note (must also go in `docs/build-summary.md`):** the seeded password `admin` is **insecure**. It exists only because the user asked for it. Change it right after the first login, from **Profile → Change password** (R16) or Users → Reset password on the admin's own row (R17). Alternatively, set `ADMIN_PASSWORD` before the **first** start. The seeder never resets a changed password. At startup, the backend logs a `WARN` while the admin's password still matches `admin`.

### 1.4 Decisions and assumptions
- D1. The due value is a **date-time instant** (`dueAt`). It is stored in UTC (`DATETIME(6)`), sent as ISO-8601 UTC (`2026-10-10T17:00:00Z`; any offset is accepted on input), entered with `<input type="datetime-local">`, and shown in the browser's local time.
- D2. Create rule: `dueAt` must not be more than **5 minutes in the past** (5 minutes of grace allows for clock differences and minute-level input). On **update**, any `dueAt` is accepted. Completing an overdue task is always allowed.
- D3. Login uses **username**. **Email is dropped**: there's no email verification or reset, so it adds nothing. `name` (display name) is kept from revision 1.
- D4. Sliding session uses a **renewed token in a response header** (section 2.5). No refresh token.
- D5. No pagination. Lists are expected to stay small.
- D6. Out of scope: forgot-password / self-service reset by email, email, priorities or categories, creating more admins or changing roles, deleting users, audit log.
- D7. Token invalidation uses a per-user **`token_version`** counter (section 2.5).

### 1.5 Pre-flight check (done 2026-10-07)
| Item | Result |
|---|---|
| JDK | openjdk 21.0.12 OK (set `JAVA_HOME=/opt/homebrew/opt/openjdk@21`, otherwise Maven picks up JDK 27) |
| Maven | 3.10.0 OK |
| Node / npm | v24.21.0 / 11.19.0 OK |
| MySQL | 26.7.0, port 3306 accepting connections OK |
| Ports 8080 / 3000 | free OK |

---

## 2. Architecture

### 2.1 High level
```
Browser (React SPA, :3000) --/api/* via Vite dev proxy--> Spring Boot REST API (:8080) --JPA/JDBC--> MySQL todo_db (:3306)
```
The Vite dev proxy (`/api` to `http://localhost:8080`) makes the browser see one origin. The backend also allows CORS from `http://localhost:3000` as a fallback and **exposes** the `X-Auth-Token`, `X-Auth-Expires-In` and `Location` headers.

### 2.2 Backend: layered Spring Boot, packaged by feature
Base package `com.todoapp`. Layers are Controller (HTTP and DTOs), then Service (rules, ownership, transactions), then Repository (Spring Data JPA), then Entity. Admin task endpoints **reuse `TaskService`** by passing the target user's id as the owner id, so the task rules exist only once.

```
backend/
  pom.xml
  src/main/java/com/todoapp/
    TodoApplication.java
    config/    SecurityConfig.java, JwtConfig.java
    security/  JwtTokenService.java, AuthenticatedUser.java (record: id, username, role),
               UserJwtAuthenticationConverter.java, TokenRenewalFilter.java,
               RestAuthenticationEntryPoint.java, RestAccessDeniedHandler.java, CurrentUserProvider.java
    common/    ApiError.java, FieldErrorDetail.java, GlobalExceptionHandler.java, ResourceNotFoundException.java,
               ConflictException.java, AccountDisabledException.java, InvalidCredentialsException.java,
               FieldValidationException.java (one or more fieldErrors raised by a service → 400 "Validation failed"),
               SearchQueryUtils.java (trim, validate length, escape LIKE wildcards)
    user/      User.java, Role.java (enum USER, ADMIN), UserRepository.java, AdminSeeder.java
    auth/      AuthController.java, AuthService.java, PasswordPolicy.java (must-not-contain-username check; shared by register/change/reset),
               validation/StrongPassword.java, StrongPasswordValidator.java, PasswordsMatch.java, PasswordsMatchValidator.java,
               dto/RegisterRequest.java, LoginRequest.java, LoginResponse.java, UserResponse.java, ChangePasswordRequest.java
    task/      Task.java, TaskRepository.java, TaskService.java, TaskController.java, TaskStatusFilter.java,
               dto/TaskCreateRequest.java, TaskUpdateRequest.java, TaskCompletionRequest.java, TaskResponse.java
    admin/     AdminUserController.java, AdminTaskController.java, AdminUserService.java,
               dto/AdminUserResponse.java, UserStatusRequest.java, AdminPasswordResetRequest.java
  src/main/resources/  application.yml, schema.sql
  src/test/resources/  application-test.yml
  src/test/java/com/todoapp/...      (backend-dev unit and slice tests)
  src/test/java/com/todoapp/qa/...   (QA-owned API integration tests)
```

**Key decisions**
| Concern | Choice | Why / alternatives |
|---|---|---|
| Persistence | Spring Data JPA + `mysql-connector-j` | Standard. Every task query is scoped by `user_id`. |
| Schema | `schema.sql` (`CREATE TABLE IF NOT EXISTS`) + `spring.sql.init.mode=always` + `ddl-auto=validate` | Built in. Flyway is overkill here. |
| DB creation | `jdbc:mysql://localhost:3306/todo_db?createDatabaseIfNotExist=true&serverTimezone=UTC` | No manual setup. Hibernate `jdbc.time_zone=UTC`. |
| Auth | Stateless JWT (HS256) via `spring-boot-starter-oauth2-resource-server` (Nimbus encoder and decoder) | A Spring starter, so no third-party JWT library. (Alternatives were jjwt or HttpSession.) |
| Roles | `users.role` = `USER`/`ADMIN`. The token has a `role` claim (for information), but **authorities come from the DB on each request** in `UserJwtAuthenticationConverter` → `ROLE_USER` / `ROLE_ADMIN` | A DB lookup on each request (by primary key) lets disabling a user take effect immediately (R14) and stops anyone escalating their role through the token. |
| Authorization | URL rules: `/api/admin/**` → `hasRole("ADMIN")`; other `/api/**` → `authenticated()` | Simple, all in one place. |
| Password hashing | `BCryptPasswordEncoder` (strength 10) | Built in. |
| Validation | `spring-boot-starter-validation`; custom `@StrongPassword` (field) and `@PasswordsMatch` (class-level) constraints | Built in. |
| Search | JPQL `LIKE` with `lower(...)` and `ESCAPE '\'`; `%`, `_` and `\` in `q` are escaped so they match literally | No search library. |
| Token invalidation | `users.token_version` (INT, starts at 0) goes up by 1 on every password change. Tokens carry a `ver` claim. The converter rejects a token whose `ver` ≠ the DB value | Exact integer compare, simpler than comparing a `password_changed_at` timestamp with `iat` (second precision, clock skew). Reuses the per-request DB lookup that already exists. |
| Password rules | `@StrongPassword` (format) and `@PasswordsMatch(first, second)` (generic class-level constraint) on DTOs. `PasswordPolicy` service checks "must not contain username" (the username comes from the DTO on register, from the DB on change/reset) and throws `FieldValidationException` | One rule set for register, change and reset. |
| Admin seed | `AdminSeeder` (`ApplicationRunner`): if `existsByUsername("admin")` is false, insert ADMIN / enabled / BCrypt(`app.admin.password`). Otherwise do nothing. WARN log if the password still matches `admin` | Idempotent. Bypasses the strength rule because it writes through the repository, not the register DTO. |
| Config | `app.jwt.secret: ${JWT_SECRET:<dev default ≥32 bytes>}`, `app.jwt.expiry-minutes: ${JWT_EXPIRY_MINUTES:60}`, `app.jwt.issuer: todo-app`, `app.admin.username: admin`, `app.admin.password: ${ADMIN_PASSWORD:admin}`, `app.task.create-grace-minutes: 5` | Expiry can be changed so QA can test with 2 minutes. |
| Clock | `java.time.Clock` bean (UTC), injected into services and the token service | Makes time-based tests (overdue, expiry, grace) deterministic. |
| Tests | `spring-boot-starter-test` + `spring-security-test` against MySQL `todo_test_db` | No extra library. |
| Lombok | Not used. DTOs are records. | Fewer libraries. |

### 2.3 Database schema (`todo_db`)
```sql
CREATE TABLE IF NOT EXISTS users (
  id             BIGINT       NOT NULL AUTO_INCREMENT,
  username       VARCHAR(30)  NOT NULL,          -- stored trimmed + lower-cased
  name           VARCHAR(100) NOT NULL,
  password_hash  VARCHAR(100) NOT NULL,          -- BCrypt
  role           VARCHAR(20)  NOT NULL DEFAULT 'USER',
  token_version  INT          NOT NULL DEFAULT 0, -- +1 on every password change; must equal the JWT `ver` claim
  enabled        BOOLEAN      NOT NULL DEFAULT TRUE,
  created_at     DATETIME(6)  NOT NULL,
  updated_at     DATETIME(6)  NOT NULL,
  PRIMARY KEY (id),
  CONSTRAINT uk_users_username UNIQUE (username),
  CONSTRAINT ck_users_role CHECK (role IN ('USER', 'ADMIN'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS tasks (
  id            BIGINT        NOT NULL AUTO_INCREMENT,
  user_id       BIGINT        NOT NULL,
  title         VARCHAR(100)  NOT NULL,
  description   VARCHAR(1000) NULL,
  due_at        DATETIME(6)   NOT NULL,          -- UTC instant
  completed     BOOLEAN       NOT NULL DEFAULT FALSE,
  completed_at  DATETIME(6)   NULL,
  created_at    DATETIME(6)   NOT NULL,
  updated_at    DATETIME(6)   NOT NULL,
  PRIMARY KEY (id),
  CONSTRAINT fk_tasks_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
  INDEX idx_tasks_user_due (user_id, due_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```
JPA: `User.role` is `@Enumerated(EnumType.STRING)`. `Task.dueAt`, `completedAt`, `createdAt` and `updatedAt` are `Instant`. `Task.setCompleted(boolean, Instant now)` handles `completedAt`. Timestamps are set with `@PrePersist`/`@PreUpdate`.

### 2.4 Frontend: React + TypeScript + Vite
Global state is the auth session (React Context). Task lists are managed per page with a `useTasks(scope)` hook. One `TaskList`/`TaskForm` component set serves both "my tasks" and "admin: user X's tasks", because `tasksApi` takes a **scope** (`{ kind: 'own' }` → `/api/tasks`, `{ kind: 'admin', userId }` → `/api/admin/users/{userId}/tasks`) and the payloads are the same.

```
frontend/
  package.json, vite.config.ts (port 3000, strictPort, proxy /api → :8080, vitest jsdom), tsconfig*.json, index.html
  src/
    main.tsx, App.tsx
    api/        types.ts, apiClient.ts, authApi.ts, tasksApi.ts (scope-aware), adminApi.ts
    auth/       AuthContext.tsx (AuthProvider, useAuth), tokenStorage.ts,
                ProtectedRoute.tsx, PublicOnlyRoute.tsx, AdminRoute.tsx
    pages/      LoginPage.tsx, RegisterPage.tsx, TasksPage.tsx, ProfilePage.tsx,
                AdminUsersPage.tsx, AdminUserTasksPage.tsx, ForbiddenPage.tsx, NotFoundPage.tsx
    components/ ChangePasswordForm.tsx, ResetPasswordDialog.tsx,
                AppHeader.tsx (nav by role, Profile link, username, Logout), TaskList.tsx, TaskItem.tsx, TaskForm.tsx,
                TaskFilterTabs.tsx, SearchBox.tsx, PasswordRulesChecklist.tsx, UserTable.tsx,
                ConfirmDialog.tsx, FormField.tsx, ErrorBanner.tsx, TasksPanel.tsx (filter + search + list + form; used by both task pages)
    hooks/      useTasks.ts, useDebouncedValue.ts, useNow.ts (ticks every 60 s for Overdue)
    utils/      dateUtils.ts (toIsoUtc, toDateTimeLocalValue, formatDueAt, isOverdue), validation.ts (mirrors 3.2)
    styles/     index.css
    test/       setupTests.ts
    **/*.test.ts(x)     frontend-dev tests next to the source
    qa/         *.test.tsx      QA-owned UI tests
```

| Concern | Choice | Why |
|---|---|---|
| Routing | `react-router-dom` v7 | Approved in revision 1 (pending Team Lead confirmation). |
| HTTP | Native `fetch` wrapper | No axios. |
| Debounce | Small `useDebouncedValue` hook (300 ms, `setTimeout`) | No lodash. |
| Dates | `datetime-local` + `Date`/`Intl` (`toLocaleString`) | No date library. |
| Token storage | `localStorage`: `todo_app_token`, `todo_app_user`, `todo_app_expires_at` (epoch ms) | Survives a refresh. React escapes output and the app never uses `dangerouslySetInnerHTML`. |
| Styling | Plain CSS | No UI kit. |

**Routes**
| Path | Access | Page |
|---|---|---|
| `/login` | public only (logged-in users go to their home page) | LoginPage (banners: `?registered=1`, `?expired=1`, `?disabled=1`) |
| `/register` | public only | RegisterPage → on success `/login?registered=1` |
| `/tasks` | any authenticated user (admin included, for their own tasks) | TasksPage |
| `/profile` | any authenticated user | ProfilePage (username, name, role, member since; Change password form) |
| `/admin` | | redirect to `/admin/users` |
| `/admin/users` | ADMIN | AdminUsersPage |
| `/admin/users/:userId/tasks` | ADMIN | AdminUserTasksPage |
| `/` | | home page by role: ADMIN → `/admin/users`, USER → `/tasks` |
| `*` | | NotFoundPage |
A non-admin who visits `/admin/*` sees ForbiddenPage ("Access denied") and no admin API call is made.

### 2.5 Sliding session design (D4)
**Approach: renewed token in a response header.** On every request **authenticated** with a valid token for an enabled user, the backend adds:
```
X-Auth-Token: <new JWT, exp = now + 60 min>
X-Auth-Expires-In: 3600
```
The frontend `apiClient` reads these headers on **every** response. If they are present, it saves the new token and `expiresAt = Date.now() + expiresIn*1000`.

- **Why:** it is the simplest way to get "renewed on any operation". There's no refresh endpoint, no refresh-token storage or rotation, and no extra request. It's built with `TokenRenewalFilter` (a `OncePerRequestFilter` placed after `BearerTokenAuthenticationFilter`). The filter sets the headers before passing the request on, whenever the `SecurityContext` holds an `AuthenticatedUser`.
- **Rejected:** a short-lived access token plus a refresh endpoint, which needs refresh-token persistence and revocation and a client retry flow. That's too heavy for this app.
- **Rules:** headers are added for any authenticated request, whatever the final status (2xx/400/403/404). They are **not** added on 401 or on public endpoints. Login returns its token in the body. Old tokens stay valid until their own `exp`, which is acceptable because tokens are stateless and disabling a user is enforced from the DB. GET requests count as activity too (listing and searching are user operations). The app doesn't poll, so a user who does nothing still expires after 60 minutes.
- **Expiry on the client:** `AuthContext` sets a timer for `expiresAt`. When it fires, it logs the user out and goes to `/login?expired=1`. Any 401 from the API does the same, with the query chosen by message: `Account is disabled` → `?disabled=1`, `Password has been changed. Please log in again.` → `?passwordChanged=1`, anything else → `?expired=1`. On app load, a stored token that has passed `expiresAt` is thrown away.
- **Password change and renewal:** `TokenRenewalFilter` writes `X-Auth-Token` *before* the controller runs, so after a password change that header would hold a token with the old `ver`. So whenever the caller's own `token_version` changes (`PUT /api/auth/password`, or `PUT /api/admin/users/{ownId}/password`), the controller **overwrites** `X-Auth-Token` (`response.setHeader`) with a token carrying the new `ver`. The frontend needs no special case: it just stores the header as usual. Every other existing token for that user stops working on its next request.

---

## 3. API Contract

Base URL `http://localhost:8080/api`. JSON UTF-8. Instants are ISO-8601. The server **outputs UTC with a `Z`** (`2026-10-10T17:00:00Z`) and **accepts** any explicit offset (`Z` or `+05:30`). A date-time without an offset is rejected. Protected endpoints need `Authorization: Bearer <token>`. Authenticated responses carry `X-Auth-Token` and `X-Auth-Expires-In` (2.5).

### 3.1 Error shape (every 4xx/5xx)
```json
{
  "timestamp": "2026-10-07T14:03:22.123Z",
  "status": 400,
  "error": "Bad Request",
  "message": "Validation failed",
  "path": "/api/auth/register",
  "fieldErrors": [
    { "field": "confirmPassword", "message": "Passwords do not match" }
  ]
}
```
`fieldErrors` is always present (`[]` when the error isn't about a field). One field can appear more than once.

| Status | When | `message` |
|---|---|---|
| 400 | Bean validation failure | `Validation failed` |
| 400 | Malformed JSON, wrong type, unparsable instant, non-numeric path id, invalid `status` param | `Malformed request` |
| 401 | Missing, invalid or expired token | `Authentication required` |
| 401 | Valid token but the user is disabled or no longer exists | `Account is disabled` |
| 401 | Valid token but its `ver` ≠ the user's `token_version` (password changed since it was issued) | `Password has been changed. Please log in again.` |
| 400 | Change password with a wrong current password | `Validation failed`, fieldError `currentPassword`: `Current password is incorrect` (deliberately **not** 401) |
| 401 | Bad login credentials | `Invalid username or password` (same message for an unknown user and a wrong password) |
| 403 | Login with correct credentials but the account is disabled | `Account is disabled` |
| 403 | Non-admin calling `/api/admin/**` | `Access denied` |
| 404 | Task not found or not owned (for admin: not owned by `{userId}`) | `Task not found` |
| 404 | Admin endpoint with an unknown `{userId}` | `User not found` |
| 404 | Unknown route | `Resource not found` |
| 405 | Wrong method | `Method not allowed` |
| 409 | Username taken | `Username is already taken` |
| 409 | Admin disables their own account | `You cannot disable your own account` |
| 500 | Unexpected | `Unexpected error` (no stack trace or SQL) |

### 3.2 Validation rules
| Field | Rule | Message(s) |
|---|---|---|
| `username` (register) | required; trimmed; 3–30 chars; regex `^[A-Za-z][A-Za-z0-9._-]{2,29}$` (starts with a letter; then letters, digits, `.`, `_`, `-`); stored lower-case; unique, case-insensitive | `Username is required` / `Username must be 3-30 characters, start with a letter, and use only letters, digits, '.', '_' or '-'` |
| `username` (login) | required (trimmed, lower-cased before lookup; no pattern check) | `Username is required` |
| `name` | required, trimmed, 1–100 | `Name is required` / `Name must be at most 100 characters` |
| `password` (register) | required; 8–64 chars; at least 1 upper-case, 1 lower-case, 1 digit, 1 special (any character that isn't a letter or digit); no whitespace | `Password must be 8-64 characters with no spaces and include an upper-case letter, a lower-case letter, a digit and a special character` |
| `password` (register) | must not contain the username (case-insensitive) | `Password must not contain the username` |
| `confirmPassword` | required; must equal `password` exactly | `Confirm password is required` / `Passwords do not match` |
| `password` (login) | required | `Password is required` |
| `title` | required, trimmed, not blank, 1–100 | `Title is required` / `Title must be at most 100 characters` |
| `description` | optional, ≤1000; a blank value is stored as `null` | `Description must be at most 1000 characters` |
| `dueAt` | required instant; **create only:** `>= now − 5 min` | `Due date and time is required` / `Due date and time cannot be in the past` |
| `completed` | required boolean (PUT, PATCH) | `Completed is required` |
| `enabled` | required boolean (admin status PATCH) | `Enabled is required` |
| `currentPassword` (change) | required; must match the stored hash (checked in the service after bean validation passes) | `Current password is required` / `Current password is incorrect` |
| `newPassword` (change, admin reset) | same format rule as the register `password` (same message); must not contain the username (own or target's): `Password must not contain the username`; **change only:** must differ from the current password | `New password must be different from the current password` |
| `confirmNewPassword` (change, admin reset) | required; must equal `newPassword` | `Confirm new password is required` / `Passwords do not match` |
| `q` (query) | optional; trimmed; blank = no filter; ≤100 chars; matched case-insensitively as a substring (`%`, `_`, `\` treated literally) | `Search text must be at most 100 characters` (fieldError `q`) |
| `status` (query) | optional `all`/`active`/`completed`, case-insensitive, default `all` | `Malformed request` |

Order of checks for change password: bean validation (format, confirm) → current password → must differ from the current password → must not contain the username. Every failure is a 400. The admin reset doesn't check "differs from current", because the admin doesn't know the old password and the check would let an admin probe it. The frontend `validation.ts` mirrors these rules with the **same messages**. `PasswordRulesChecklist` shows each password rule live (length, upper-case, lower-case, digit, special character, no spaces, doesn't contain the username).

### 3.3 Auth endpoints

**POST `/api/auth/register`** (public)
```json
{ "username": "Alice_01", "name": "Alice Smith", "password": "Str0ng!Pass", "confirmPassword": "Str0ng!Pass" }
```
- `201 Created`, `UserResponse`:
```json
{ "id": 2, "username": "alice_01", "name": "Alice Smith", "role": "USER", "createdAt": "2026-10-07T14:03:22.123Z" }
```
- `400` validation · `409` username taken (this includes `admin` in any case)

**POST `/api/auth/login`** (public)
```json
{ "username": "alice_01", "password": "Str0ng!Pass" }
```
- `200 OK`
```json
{
  "token": "eyJhbGciOiJIUzI1NiJ9...",
  "tokenType": "Bearer",
  "expiresIn": 3600,
  "user": { "id": 2, "username": "alice_01", "name": "Alice Smith", "role": "USER", "createdAt": "2026-10-07T14:03:22.123Z" }
}
```
- `400` validation · `401` invalid credentials · `403` account disabled (only returned **after** the password is verified)
- JWT claims: `sub` = user id, `username`, `role`, `ver` = `token_version`, `iss` = `todo-app`, `iat`, `exp` = iat + `expiry-minutes`.

**GET `/api/auth/me`** (authenticated) → `200` `UserResponse` · `401`

**PUT `/api/auth/password`** (authenticated; change own password)
```json
{ "currentPassword": "Str0ng!Pass", "newPassword": "N3w#Secret", "confirmNewPassword": "N3w#Secret" }
```
- `200 OK`: the same body shape as login (`token`, `tokenType`, `expiresIn`, `user`). The `token` has the new `ver`, and `X-Auth-Token` carries **the same new token**.
- Effect: password hash updated, `token_version` + 1, so every older token for this user is rejected.
- `400` validation (incl. `currentPassword` "Current password is incorrect", `newPassword` same-as-current / contains username / weak, `confirmNewPassword` mismatch). The password is unchanged and the caller's session stays valid. · `401` no, expired or invalidated token.

Logout happens on the client only.

### 3.4 Task endpoints (authenticated; caller's own tasks)
`TaskResponse`:
```json
{
  "id": 42,
  "title": "Buy groceries",
  "description": "Milk, eggs, bread",
  "dueAt": "2026-10-10T17:00:00Z",
  "completed": false,
  "completedAt": null,
  "overdue": false,
  "createdAt": "2026-10-07T14:05:00Z",
  "updatedAt": "2026-10-07T14:05:00Z"
}
```
`overdue` = `!completed && dueAt < server now` (for information; the UI recomputes it live with the browser clock).

| Method & path | Body | Success | Errors |
|---|---|---|---|
| `GET /api/tasks?status=&q=` | | `200` `TaskResponse[]`, only the caller's tasks matching status AND (`q` in title OR description), sorted `dueAt` asc then `createdAt` asc; `[]` if none | 400 (status/q), 401 |
| `GET /api/tasks/{id}` | | `200` `TaskResponse` | 400, 401, 404 |
| `POST /api/tasks` | `{ "title", "description", "dueAt" }` | `201`, `Location: /api/tasks/{id}`, `TaskResponse` (`completed=false`) | 400, 401 |
| `PUT /api/tasks/{id}` | `{ "title", "description", "dueAt", "completed" }` | `200` `TaskResponse` | 400, 401, 404 |
| `PATCH /api/tasks/{id}/completion` | `{ "completed": true }` | `200` `TaskResponse` | 400, 401, 404 |
| `DELETE /api/tasks/{id}` | | `204` | 401, 404 |

Rules: unknown or extra body fields (`id`, `completed` on POST, `userId`) are ignored. When `completed` goes from false to true, `completedAt` = now. From true to false, `completedAt` = null. If it doesn't change, `completedAt` is left as it was. A past `dueAt` is allowed on PUT, and completing an overdue task is allowed.

### 3.5 Admin endpoints (`ROLE_ADMIN` only; non-admin → 403, no token → 401)
`AdminUserResponse`:
```json
{ "id": 2, "username": "alice_01", "name": "Alice Smith", "role": "USER", "enabled": true,
  "createdAt": "2026-10-07T14:03:22.123Z", "taskCount": 3, "openTaskCount": 2 }
```
| Method & path | Body | Success | Errors |
|---|---|---|---|
| `GET /api/admin/users?q=` | | `200` `AdminUserResponse[]`, all users (admin included) whose username or name contains `q`, sorted by username asc | 400 (q), 401, 403 |
| `GET /api/admin/users/{userId}` | | `200` `AdminUserResponse` | 400, 401, 403, 404 `User not found` |
| `PATCH /api/admin/users/{userId}/status` | `{ "enabled": false }` | `200` `AdminUserResponse` (doing nothing when the value is already set is OK) | 400, 401, 403, 404, **409** if `userId` is the caller |
| `GET /api/admin/users/{userId}/tasks?status=&q=` | | `200` `TaskResponse[]` (same rules as 3.4) | 400, 401, 403, 404 user |
| `GET /api/admin/users/{userId}/tasks/{taskId}` | | `200` | 404 user / 404 task (task not owned by `userId`) |
| `POST /api/admin/users/{userId}/tasks` | same as 3.4 POST | `201`, `Location: /api/admin/users/{userId}/tasks/{id}` | 400, 404 user |
| `PUT /api/admin/users/{userId}/tasks/{taskId}` | same as 3.4 PUT | `200` | 400, 404 |
| `PATCH /api/admin/users/{userId}/tasks/{taskId}/completion` | `{ "completed": bool }` | `200` | 400, 404 |
| `DELETE /api/admin/users/{userId}/tasks/{taskId}` | | `204` | 404 |

| `PUT /api/admin/users/{userId}/password` | `{ "newPassword": "...", "confirmNewPassword": "..." }` | `200` `AdminUserResponse`. Target's hash updated and `token_version` + 1 (the target's sessions end). If `userId` is the caller, `X-Auth-Token` carries a new token with the new `ver`, so the admin stays logged in. Allowed for disabled users (they stay disabled) | 400 (strength / contains the target's username / mismatch), 401, 403, 404 `User not found` |

Admins can manage tasks of disabled users. Disabling a user doesn't change their tasks.

### 3.6 Security config summary
- `permitAll`: `POST /api/auth/register`, `POST /api/auth/login`, `OPTIONS /**`. `/api/admin/**` → `hasRole("ADMIN")`. Everything else → `authenticated()`.
- CSRF is disabled. Sessions are `STATELESS`. Filter order: `BearerTokenAuthenticationFilter`, then `TokenRenewalFilter`.
- `UserJwtAuthenticationConverter`: loads the user by `sub`. If the user is missing or disabled it throws `DisabledException`, which becomes 401 `Account is disabled`. If the `ver` claim ≠ `token_version` it throws `CredentialsExpiredException`, which becomes 401 `Password has been changed. Please log in again.`. Otherwise the principal is `AuthenticatedUser`, with authority `ROLE_<role from DB>`.
- CORS: origin `http://localhost:3000`; methods GET, POST, PUT, PATCH, DELETE, OPTIONS; allowed headers `Authorization`, `Content-Type`; **exposed** headers `Location`, `X-Auth-Token`, `X-Auth-Expires-In`.

---

## 4. Tasks by Role

Branches: `feature/backend-<topic>`, `feature/frontend-<topic>`, `feature/qa-<topic>`. Merge `master` into your branch before you start. Only the Team Lead merges to `master`.
**File ownership:** backend-dev owns `backend/**` except `backend/src/test/java/com/todoapp/qa/**`. frontend-dev owns `frontend/**` except `frontend/src/qa/**`. qa owns those two `qa` folders and `reports/**`. `docs/**` belongs to the Planner and Team Lead.

### 4.1 Backend (`backend-dev`)
| ID | Task | Deliverable / acceptance | Depends on |
|---|---|---|---|
| B1 | **Scaffold + error handling**: `pom.xml` (Java 21; starters web, data-jpa, validation, security, oauth2-resource-server, test; `mysql-connector-j`; `spring-security-test`), `TodoApplication`, `application.yml` (2.2 config), `schema.sql` (2.3), `application-test.yml` (`todo_test_db`), `Clock` bean, the whole `common/` package (`ApiError`, `GlobalExceptionHandler` covering all of 3.1, exceptions, `SearchQueryUtils`) | `mvn spring-boot:run` starts on :8080 and creates the tables. Unit tests for the handler mapping and for LIKE escaping (U14, U16) pass. | Team Lead approval of section 6 |
| B2 | **Persistence + admin seed**: `User` (incl. `tokenVersion`, `changePassword(hash)` that bumps the version), `Role`, `Task` (+ `setCompleted`), `UserRepository` (`findByUsername`, `existsByUsername`, admin search query with task counts), `TaskRepository` (`findByIdAndUserId`, search query: owner + optional completed + optional pattern, ordered), `AdminSeeder` | Repository tests on `todo_test_db`. U10, U13 pass. Restarting twice leaves exactly one admin. | B1 |
| B3 | **Security**: `SecurityConfig` (3.6), `JwtConfig`, `JwtTokenService`, `AuthenticatedUser`, `UserJwtAuthenticationConverter` (enabled + `ver` checks), `TokenRenewalFilter`, entry point and access-denied handler (ApiError JSON, with the disabled message), `CurrentUserProvider` | U8, U9, U22 pass. MockMvc: no token / bad token / expired token → 401; disabled user's token → 401 `Account is disabled`; stale `ver` → 401 password-changed message; renewal headers on authenticated responses only. | B2 |
| B4 | **Auth API + change password**: `AuthController`, `AuthService` (normalise username, uniqueness, hash, login checks the password and then whether the account is enabled, `changePassword` with the check order in 3.2, new token + header overwrite), `PasswordPolicy`, `@StrongPassword`, `@PasswordsMatch`, DTOs incl. `ChangePasswordRequest`, `/me` | Contract 3.3. U1–U7, U20, U21 pass. MockMvc for 201/400/409/200/401/403 and the password change. | B3 |
| B5 | **Task API + search**: `TaskController`, `TaskService` (methods take `ownerId`; create grace rule; `completedAt` rules; status + `q`), `TaskStatusFilter`, DTOs incl. `overdue` | Contract 3.4. U11–U13 pass. MockMvc incl. two-user ownership and search tests. | B3 (B4 for end-to-end login) |
| B6 | **Admin API**: `AdminUserService` (list/search with counts, get, setEnabled with self-check, `resetPassword` with `PasswordPolicy` + version bump; new-token header when the target is the caller), `AdminUserController`, `AdminTaskController` (checks the user exists, then delegates to `TaskService` with `userId`), DTOs. Then a full run against real MySQL and run notes for the Team Lead | Contract 3.5. U15, U23 pass. MockMvc: USER → 403, ADMIN → 200, self-disable → 409, password reset (other user / self). All `mvn test` green. | B5 |

### 4.2 Frontend (`frontend-dev`)
Build against section 3. Mock `fetch` in tests with `vi.spyOn(globalThis, 'fetch')` (no MSW).

| ID | Task | Deliverable / acceptance | Depends on |
|---|---|---|---|
| F1 | **Scaffold**: Vite React-TS, `vite.config.ts` (3000, strictPort, proxy, vitest jsdom + setup), router and test libraries, scripts `dev`/`build`/`test`/`lint`, base CSS | `npm run dev` on :3000. `build` and `test` green. | Team Lead approval of section 6 |
| F2 | **API layer + utils**: `types.ts` (exact mirror of section 3 incl. `Role`, `AdminUser`, `TaskScope`), `apiClient.ts` (bearer header; reads `X-Auth-Token`/`X-Auth-Expires-In` on every response and calls `onTokenRenewed`; parses ApiError; 204; `onUnauthorized(message)` on 401 only, **not** on 403), `authApi.ts` (incl. `changePassword`), `tasksApi.ts` (scope-aware), `adminApi.ts` (incl. `resetUserPassword`), `dateUtils.ts`, `validation.ts` (incl. change-password rules) | U17–U19, U24 pass. | F1 |
| F3 | **Auth state + routing**: `tokenStorage`, `AuthContext` (login, logout, user and role, token renewal, expiry timer, discard expired token on load, 401 → `/login?expired=1` / `?disabled=1` / `?passwordChanged=1` by message, see 2.5), `ProtectedRoute`, `PublicOnlyRoute`, `AdminRoute` (→ ForbiddenPage), `App.tsx` routes (2.4), `AppHeader` (nav: "My Tasks" and "Profile" for everyone, "Users" for ADMIN; username; Logout), `/profile` route, `ForbiddenPage`, `NotFoundPage` | Tests: redirects, home page by role, renewal updates storage, expiry timer logs out. | F2 |
| F4 | **Login, Register & Profile**: `FormField`, `ErrorBanner`, `PasswordRulesChecklist` (takes a `username` prop; reused by change and reset); `ProfilePage` + `ChangePasswordForm` (current / new / confirm new, live checklist, client checks incl. "different from current", server `fieldErrors`; on success: banner "Password changed", fields cleared, new token from the response stored, user stays on the page; a 400 on `currentPassword` must **not** log out); Register has username, name, password, confirm password with live checks and server `fieldErrors`; Login shows the banners (registered / expired / disabled / passwordChanged: "Your password was changed. Please log in again."), the 401 and 403 messages, and a submit button disabled while a request is pending; after login, go to the home page for the role | Component tests for the cases in 5.3 UI1–UI9, UI31–UI34, UI36. | F3 |
| F5 | **Task UI (shared)**: `TasksPanel` (`TaskFilterTabs` + `SearchBox` with 300 ms debounce and a Clear button + `TaskList` + empty states "No tasks yet" / "No tasks match your search"), `TaskItem` (due date-time in local format, **Overdue** marker via `useNow` 60 s tick, completed style, optimistic toggle with rollback, delete via `ConfirmDialog`), `TaskForm` (create/edit; `datetime-local` with `min` set to now on create; converts to UTC ISO; Completed checkbox in edit mode; client and server errors), `useTasks(scope)`, `TasksPage` | Component tests for UI13–UI23. `TasksPanel` accepts a `scope` prop and works unchanged for the admin page. | F3 |
| F6 | **Admin UI**: `AdminUsersPage` (`SearchBox` for users, `UserTable`: username, name, role, Enabled/Disabled badge, task counts, Enable/Disable button with confirm; the button is disabled with a tooltip on the admin's own row; "Reset password" action on every row, including the admin's own, that opens `ResetPasswordDialog` (new + confirm, checklist against the target's username, server errors, success notice "Password updated for <username>"); "View tasks" link), `AdminUserTasksPage` (heading "Tasks of <username>" + disabled badge, then `<TasksPanel scope={{kind:'admin', userId}} />`, back link) | Component tests for UI27–UI30, UI35. `npm run build` with no TS errors. | F5 |

Accessibility baseline: every input has a `<label>`; errors use `role="alert"`; the checkbox has `aria-label="Mark '<title>' as completed"`; the Overdue marker is text (not only colour); the search input has `aria-label="Search tasks"` / `"Search users"`; dialogs can be used with the keyboard (Esc cancels). QA uses these labels as selectors.

### 4.3 QA (`qa`)
| ID | Task | Deliverable | Depends on |
|---|---|---|---|
| Q1 | Test-case matrix with traceability to R1–R18 | `reports/test-cases.md` | plan approved |
| Q2 | **API tests: auth, tasks, search, change password** (Spring Boot Test + MockMvc, `test` profile): A1–A51, P1–P12 | `backend/src/test/java/com/todoapp/qa/AuthApiQaTest.java`, `TaskApiQaTest.java`, `TaskSearchQaTest.java`, `PasswordChangeQaTest.java` | B4, B5 merged |
| Q3 | **API tests: security, session, admin**: S1–S8, SS1–SS5, AD1–AD24 | `.../qa/SecurityQaTest.java`, `SessionQaTest.java`, `AdminApiQaTest.java` | B6 merged |
| Q4 | **UI tests** (Vitest + RTL, mocked fetch): UI1–UI36 | `frontend/src/qa/*.test.tsx` | F4–F6 merged |
| Q5 | **Manual E2E** on the real stack: E1–E24 (run the expiry test with `JWT_EXPIRY_MINUTES=2`) | `reports/e2e-manual.md` | all merged |
| Q6 | Run every suite, log defects to the Team Lead (ID, steps, expected vs actual, severity, suggested owner), retest, write the final report | `reports/test-report.md` | Q2–Q5 |

### 4.4 Suggested order
1. Team Lead approves section 6, then B1 and F1 start in parallel. Q1 starts right away.
2. Backend: B1 → B2 → B3 → B4 → B5 → B6. Frontend: F1 → F2 → F3 → F4 and F5 (in parallel) → F6.
3. Q2 starts after B5, Q3 after B6, Q4 after F6. Q5 and Q6 come last.

---

## 5. Test Plan

Test data: `admin`/`admin` (seeded); `alice_01` / `Str0ng!Pass`; `bob_02` / `An0ther#Pass`. "Now" is the server clock (UTC). Each backend QA class cleans `tasks` and non-admin `users` in `todo_test_db` before it runs. Time-sensitive tests use the injectable `Clock`, or build tokens with `JwtTokenService` and explicit iat/exp values.

**Count:** Unit 24 · API 100 (A 51, P 12, S 8, SS 5, AD 24) · UI 36 · Manual E2E 24 · **Total 184**.

### 5.1 Unit tests (dev-owned; QA checks they exist and pass)
| ID | Unit | Case | Expected |
|---|---|---|---|
| U1 | `AuthService.register` | ` Alice_01 ` | saved as `alice_01`; BCrypt hash; role USER; enabled |
| U2 | `AuthService.register` | `ALICE_01` already exists as `alice_01` | `ConflictException` |
| U3 | `PasswordsMatchValidator` | equal / different / confirm null | valid / `confirmPassword` "Passwords do not match" / "Confirm password is required" |
| U4 | `StrongPasswordValidator` | `Str0ng!Pass` ✓; `Sh0rt!` ✗; `str0ng!pass` ✗ (upper); `STR0NG!PASS` ✗ (lower); `Strong!Pass` ✗ (digit); `Str0ngPass1` ✗ (special); `Str0ng !Pass` ✗ (space); 65 chars ✗ | as listed |
| U5 | register | password `Alice_01!x` for username `alice_01` | "Password must not contain the username" |
| U6 | `AuthService.login` | wrong password / unknown user | the same `InvalidCredentialsException` |
| U7 | `AuthService.login` | disabled user, correct password / disabled user, wrong password | `AccountDisabledException` / `InvalidCredentialsException` |
| U8 | `JwtTokenService` | generate then decode | `sub`, `username`, `role`, `iss`, exp = iat + 60 min |
| U9 | `UserJwtAuthenticationConverter` | enabled ADMIN / enabled USER / disabled / deleted user | `ROLE_ADMIN` / `ROLE_USER` / `DisabledException` / `DisabledException` |
| U10 | `AdminSeeder` | empty DB → run twice; admin exists with a changed password | exactly one admin, ROLE ADMIN, password matches `admin`; existing hash unchanged |
| U11 | `TaskService.create` | dueAt = now − 10 min / now − 2 min / now + 1 h | error / OK / OK |
| U12 | `TaskService.get/update/delete` | ownerId ≠ task owner | `ResourceNotFoundException` |
| U13 | `Task.setCompleted` | false→true, true→false, true→true, completing an overdue task | completedAt now / null / unchanged / OK |
| U14 | `SearchQueryUtils` | `" Milk "`, `"50%"`, `"a_b"`, `"\\"`, blank, 101 chars | `%milk%`; `%50\%%`; `%a\_b%`; escaped backslash; null (no filter); error |
| U15 | `AdminUserService.setEnabled` | target = caller / unknown id / other user | Conflict / NotFound / updated |
| U16 | `GlobalExceptionHandler` | every exception in 3.1 | status + body shape |
| U17 | FE `dateUtils` | `toIsoUtc('2026-10-10T22:30')` in a +05:30 TZ → `2026-10-10T17:00:00.000Z`; `toDateTimeLocalValue` round trip; `isOverdue` (past+open ✓, past+completed ✗, future ✗) | as listed |
| U18 | FE `apiClient` | response with `X-Auth-Token` → `onTokenRenewed`; 401 → `onUnauthorized(message)`; 403 → error, no logout; 400 fieldErrors parsed; 204 → undefined; network failure → "Network error" | as listed |
| U19 | FE `validation.ts` | same cases as U3–U5 and the username rule | same messages as the server |
| U20 | `PasswordPolicy` | `alice_01` + `xALICE_01!9` / `alice_01` + `N3w#Secret` | error "Password must not contain the username" / OK |
| U21 | `AuthService.changePassword` | wrong current / new = current / valid | `FieldValidationException(currentPassword)`, no DB change / `FieldValidationException(newPassword)` / new hash saved, `tokenVersion` +1, returned token `ver` = new version |
| U22 | `UserJwtAuthenticationConverter` | token `ver` 0, DB `token_version` 1 / both 1 | `CredentialsExpiredException` / authenticated |
| U23 | `AdminUserService.resetPassword` | unknown id / password contains the target's username / valid on a disabled user / target = caller | NotFound / FieldValidationException / hash updated, version +1, still disabled / result tells the controller to issue a new token |
| U24 | FE `validation.ts` (change password) | empty current; weak new; confirm mismatch; new = current | `Current password is required`; strength message; `Passwords do not match`; `New password must be different from the current password` |

### 5.2 API tests (QA)
**Registration and login**
| ID | Case | Expected |
|---|---|---|
| A1 | Valid register | 201; `username` lower-cased; role USER; no password or hash fields |
| A2 | Register `ALICE_01` again | 409 "Username is already taken" |
| A3 | Register `Admin` | 409 |
| A4 | Username `ab`, 31 chars, `1abc`, `bad name`, `al!ce` | 400 `username` |
| A5 | Each weak password from U4 | 400 `password` with the strength message |
| A6 | Password contains the username | 400 "Password must not contain the username" |
| A7 | confirmPassword different / missing | 400 `confirmPassword` "Passwords do not match" / "Confirm password is required" |
| A8 | Missing name; name 101 chars | 400 `name` |
| A9 | Malformed JSON | 400 "Malformed request" |
| A10 | DB after A1 | `password_hash` is BCrypt (`$2a$`/`$2b$`), not plain text |
| A11 | Login `ALICE_01` (upper-case) with correct password | 200, token, `expiresIn` 3600, user.role USER |
| A12 | Wrong password | 401 "Invalid username or password" |
| A13 | Unknown username | 401, same message |
| A14 | Empty username/password | 400 fieldErrors |
| A15 | Login `admin`/`admin` | 200, role ADMIN |
| A16 | `/auth/me` with token / with no, garbage, expired or wrong-secret token | 200 incl. role / 401 "Authentication required" |

**Tasks: happy path**
| ID | Case | Expected |
|---|---|---|
| A17 | POST valid (dueAt now + 1 h) | 201, Location, completed false, overdue false |
| A18 | POST without description | 201, description null |
| A19 | POST dueAt `2026-12-10T22:30:00+05:30` | 201; returned `2026-12-10T17:00:00Z`; DB `due_at` = 17:00 UTC |
| A20 | 3 tasks at +2 d 09:00, +1 d 18:00, +1 d 08:00 | GET order: +1 d 08:00, +1 d 18:00, +2 d 09:00 |
| A21 | Same dueAt | ordered by createdAt asc |
| A22 | `?status=active` / `completed` / `ACTIVE` | filtered correctly; case-insensitive |
| A23 | GET by id | 200 |
| A24 | PUT all fields | 200; updatedAt > createdAt |
| A25 | PUT completed true then false | completedAt set, then null |
| A26 | PATCH completion true | 200, completedAt set |
| A27 | Task made overdue (PUT dueAt now − 1 d) → GET → PATCH complete | GET overdue true; PATCH 200, completed true, overdue false |
| A28 | DELETE | 204, then GET 404 |
| A29 | New user's list | `[]` |

**Tasks: validation and edge cases**
| ID | Case | Expected |
|---|---|---|
| A30 | Title missing / blank / 101 chars | 400 `title` |
| A31 | Title 100 chars + description 1000 chars | 201 |
| A32 | Description 1001 chars | 400 `description` |
| A33 | dueAt missing | 400 `dueAt` "Due date and time is required" |
| A34 | Create with dueAt now − 1 h | 400 "Due date and time cannot be in the past" |
| A35 | Create with dueAt now − 2 min (inside the grace window) | 201, overdue true |
| A36 | dueAt `2026-13-40T10:00:00Z` / `2026-10-10` / `2026-10-10T10:00` (no offset) | 400 |
| A37 | PUT with dueAt in the past | 200 |
| A38 | PUT without `completed` | 400 `completed` |
| A39 | PATCH `{}` / `{"completed":"yes"}` | 400 |
| A40 | `?status=done` | 400 |
| A41 | `/tasks/abc` | 400 |
| A42 | Any method on `/tasks/999999` | 404 "Task not found" |
| A43 | DELETE twice | 204, then 404 |
| A44 | POST with extra `id`, `completed:true`, `userId` | 201, completed false, owner is the caller |
| A45 | Unicode, emoji and `<script>` text | stored and returned exactly as sent |
| A46 | `DELETE /api/tasks` | 405 |

**Search**
| ID | Case | Expected |
|---|---|---|
| A47 | Tasks "Buy Milk", "Call mom" (description "about milk"), "Gym"; `q=MILK` | returns the first two (title and description, case-insensitive) |
| A48 | `q=milk&status=completed` with only "Call mom" completed | only "Call mom" |
| A49 | `q=zzz` | `[]` |
| A50 | Titles "50% off" and "500 items"; `q=50%`. Titles "a_b" and "axb"; `q=a_b` | only "50% off"; only "a_b" (wildcards are literal) |
| A51 | `q=` (blank) → all; `q` of 101 chars → 400 `q`; Bob searching for text in Alice's task title → `[]` | as listed |

**Security / isolation**
| ID | Case | Expected |
|---|---|---|
| S1 | Bob calls GET/PUT/PATCH/DELETE on Alice's task | 404 for each; Alice's task unchanged |
| S2 | Bob's list | none of Alice's tasks |
| S3 | Every task, auth/me and admin endpoint without a token | 401 ApiError JSON |
| S4 | Token payload changed (`sub` or `role` changed, original signature) | 401 |
| S5 | Preflight from `http://localhost:3000` | 200; allow-origin set; `Access-Control-Expose-Headers` includes `X-Auth-Token`, `X-Auth-Expires-In`, `Location` |
| S6 | Any 500 | no stack trace or SQL |
| S7 | USER token on every `/api/admin/**` endpoint | 403 "Access denied" |
| S8 | Change Bob's role in the DB to ADMIN while his old token (role claim USER) is still valid → GET `/api/admin/users` | 200 (authorities come from the DB). Revert after the test. |

**Change own password** (`PUT /api/auth/password`; Alice logged in with token T1, plus a second login token T2)
| ID | Case | Expected |
|---|---|---|
| P1 | Valid change with T1 | 200; body has `token`, `expiresIn`, `user`; `X-Auth-Token` header == body `token` |
| P2 | Log in with the old password / the new password | 401 / 200 |
| P3 | Call `GET /api/tasks` with T1 and with T2 (both issued before P1) | 401 "Password has been changed. Please log in again." for both |
| P4 | Call `GET /api/tasks` with the new token from P1 | 200 (the user stays logged in) |
| P5 | Wrong `currentPassword` | **400** (not 401); fieldError `currentPassword` "Current password is incorrect"; response still has `X-Auth-Token`; old password still works; token still valid |
| P6 | Each weak `newPassword` from U4 | 400 `newPassword` strength message |
| P7 | `newPassword` contains the username (case-insensitive) | 400 "Password must not contain the username" |
| P8 | `confirmNewPassword` different / missing | 400 `confirmNewPassword` "Passwords do not match" / "Confirm new password is required" |
| P9 | `newPassword` == current password | 400 `newPassword` "New password must be different from the current password" |
| P10 | `currentPassword` missing; malformed JSON | 400 fieldError / "Malformed request" |
| P11 | No token; expired token; token of a disabled user | 401 "Authentication required" / 401 / 401 "Account is disabled" |
| P12 | Admin changes own password via `/api/auth/password` | 200 with a new token; `admin`/`admin` login → 401; new password login → 200 |

**Sliding session**
| ID | Case | Expected |
|---|---|---|
| SS1 | Authenticated GET/POST/PUT/PATCH/DELETE (2xx) | every response has `X-Auth-Token` + `X-Auth-Expires-In: 3600`; the new token works; new `exp` ≈ now + 60 min |
| SS2 | Token that expires in 5 min → any call → decode the new token | new `exp` ≈ now + 60 min (later than the original) |
| SS3 | Authenticated request that ends in 400/403/404 | header present |
| SS4 | 401 (expired/invalid token), `/auth/login`, `/auth/register` | no `X-Auth-Token` header |
| SS5 | Token whose `exp` has passed | 401 "Authentication required"; no renewal |

**Admin**
| ID | Case | Expected |
|---|---|---|
| AD1 | After startup (and after a context restart) | exactly one `admin` row, role ADMIN, enabled, BCrypt hash |
| AD2 | `GET /admin/users` | all users incl. admin, sorted by username, `taskCount`/`openTaskCount` correct, no hash |
| AD3 | `?q=ALI` / `?q=Smith` (name) / `?q=zzz` | alice_01 / alice_01 / `[]` |
| AD4 | `GET /admin/users/{id}`; unknown id | 200; 404 "User not found" |
| AD5 | Disable Bob | 200 `enabled:false` |
| AD6 | Bob logs in after AD5 (correct / wrong password) | 403 "Account is disabled" / 401 "Invalid username or password" |
| AD7 | Bob's token issued before AD5 → GET /tasks | 401 "Account is disabled" |
| AD8 | Enable Bob → login | 200 |
| AD9 | Admin disables their own id | 409 "You cannot disable your own account"; admin still enabled |
| AD10 | Status body `{}` / `{"enabled":"no"}` | 400 |
| AD11 | `GET /admin/users/{alice}/tasks?status=active&q=milk` | same result as Alice's own search |
| AD12 | Admin POSTs a task for Alice | 201; Location under `/api/admin/...`; Alice's `GET /tasks` includes it |
| AD13 | Admin PUT, PATCH complete, PATCH uncomplete, DELETE on Alice's task | 200/200/200/204; Alice sees each change |
| AD14 | Admin uses `/admin/users/{bob}/tasks/{aliceTaskId}` | 404 "Task not found" |
| AD15 | Admin task endpoints with unknown userId | 404 "User not found" |
| AD16 | Admin `/api/tasks` (own tasks) and admin create with invalid body | works like a normal user; 400 with the same validation rules |
| AD17 | Admin `PUT /admin/users/{alice}/password` with a valid new password (no old password sent) | 200 `AdminUserResponse`; Alice's new password login 200, old password 401 |
| AD18 | Alice's token issued before AD17 | 401 "Password has been changed. Please log in again." |
| AD19 | Reset with a weak password / one containing `alice_01` / mismatched confirm | 400 on `newPassword` / `newPassword` / `confirmNewPassword` |
| AD20 | Reset with new == Alice's current password | 200 (the same-as-old check is not applied to admin reset) |
| AD21 | Reset for an unknown userId | 404 "User not found" |
| AD22 | Reset with a USER token (incl. Alice targeting herself) / no token | 403 "Access denied" / 401 |
| AD23 | Reset disabled Bob's password, then Bob logs in with the new password | 200; Bob still disabled → login 403 "Account is disabled" |
| AD24 | Admin resets **own** password via the admin route; then restart the context (seeder runs again) | 200 + `X-Auth-Token` (new token works; the admin's previous token → 401); after restart the new password still works, `admin`/`admin` → 401, one admin row, no default-password WARN |

### 5.3 UI tests (QA, Vitest + RTL, mocked fetch)
| ID | Screen | Case | Expected |
|---|---|---|---|
| UI1 | Register | submit empty | errors for username, name, password, confirm password; no API call |
| UI2 | Register | type a password | checklist items tick live; a weak password blocks submit with the server-identical message |
| UI3 | Register | confirm password differs | "Passwords do not match" under confirm; no API call |
| UI4 | Register | invalid username `1abc` | username rule message |
| UI5 | Register | API 409 / 400 fieldErrors | "Username is already taken" shown next to the field; values kept (passwords cleared) |
| UI6 | Register | success | `/login?registered=1` with a success banner |
| UI7 | Login | 401 / 403 | "Invalid username or password" / "Your account is disabled. Contact the administrator." |
| UI8 | Login | success USER / ADMIN | token, user and expiresAt stored; goes to `/tasks` / `/admin/users` |
| UI9 | Login | pending request | submit disabled |
| UI10 | Routing | `/tasks` logged out | `/login` |
| UI11 | Routing | `/login` logged in (USER / ADMIN) | `/tasks` / `/admin/users` |
| UI12 | Routing | USER opens `/admin/users` | Access Denied page; no admin fetch |
| UI13 | Tasks | empty | "No tasks yet" |
| UI14 | Tasks | rendering | API order; dueAt shown in local time; overdue open task shows "Overdue"; overdue completed task doesn't |
| UI15 | Tasks | time passes (fake timers, +61 s past dueAt) | "Overdue" appears without a reload |
| UI16 | Tasks | filter tabs | requests `?status=active`/`completed`; tab highlighted |
| UI17 | Tasks | search | typing sends one request after 300 ms with `q` + the current status; Clear resets; "No tasks match your search" |
| UI18 | Tasks | toggle | flips at once; PATCH `{completed:true}`; rolls back and shows an error on failure |
| UI19 | Tasks | complete an overdue task | allowed; Overdue marker removed |
| UI20 | TaskForm | create: empty title, no due date, due date in the past | errors; no API call |
| UI21 | TaskForm | create valid | POST body `{title, description, dueAt}` with `dueAt` UTC ISO; item added; form closes |
| UI22 | TaskForm | edit | `datetime-local` pre-filled in local time; PUT body has all 4 fields; past dueAt allowed; item updated |
| UI23 | TaskForm / Delete | server fieldErrors; delete cancel / confirm | errors next to the fields; cancel makes no call; confirm sends DELETE and removes the item |
| UI24 | Session | response carries `X-Auth-Token` | localStorage token and expiresAt updated |
| UI25 | Session | API 401 "Authentication required" / "Account is disabled" | logged out → `/login?expired=1` / `?disabled=1` with a banner |
| UI26 | Session | expiry timer reaches expiresAt (fake timers); stored token already expired on load | logout → `/login?expired=1`; no protected page shown |
| UI27 | Header | Logout; nav by role | storage cleared → `/login`; "Users" link only for ADMIN |
| UI28 | Admin users | list + search | table rows with badges and counts; search sends `q` after 300 ms |
| UI29 | Admin users | disable/enable | confirm dialog → PATCH status → badge updates; own row's button disabled; 409 message shown if returned |
| UI30 | Admin user tasks | `/admin/users/2/tasks` | heading "Tasks of alice_01"; list/search/create/edit/complete/delete call `/api/admin/users/2/tasks...` |
| UI31 | Profile | open `/profile` (logged in / logged out) | shows username, name, role, member since + the Change password form; Profile link in the header / redirect to `/login` |
| UI32 | Profile | submit empty; weak new password; mismatched confirm; new = current | the matching field messages (U24); checklist shows failing rules; no API call |
| UI33 | Profile | API 400 `currentPassword` "Current password is incorrect" | error under Current password; user **not** logged out; still on `/profile` |
| UI34 | Profile | success (200 + new token) | "Password changed" banner; fields cleared; localStorage token == new token; still logged in |
| UI35 | Admin users | Reset password on a row (incl. own row) | dialog shows the target's username and a checklist against it; mismatch or weak blocks submit; valid → `PUT /api/admin/users/{id}/password` with `{newPassword, confirmNewPassword}` → success notice; server 400 shown in the dialog; Cancel makes no call |
| UI36 | Session | any API 401 "Password has been changed. Please log in again." | logged out → `/login?passwordChanged=1` with "Your password was changed. Please log in again." |

### 5.4 Manual E2E checklist (QA, real stack)
| ID | Steps | Expected |
|---|---|---|
| E1 | Start MySQL, backend and frontend | :8080 and :3000 up; tables exist; `admin` row seeded; WARN about the default admin password in the log |
| E2 | Register Alice: weak password, then mismatched confirm, then valid | rule errors, then mismatch error, then success banner |
| E3 | Log in as Alice | `/tasks`, empty state, username in the header |
| E4 | Add 3 tasks with different date-times | sorted; local times shown correctly; DB `due_at` in UTC |
| E5 | Edit title and date-time | persists after refresh |
| E6 | Complete one; switch filters | correct; persists |
| E7 | Search "milk" with All, then Active | correct results each time |
| E8 | Create a task due in 2 minutes and wait | Overdue appears without a refresh; completing it removes the marker |
| E9 | Delete with confirm | gone after refresh and from the DB |
| E10 | DevTools Network: do any action | `X-Auth-Token` in the response; localStorage token changes |
| E11 | Backend with `JWT_EXPIRY_MINUTES=2`: (a) act every ~60 s for 4 min; (b) stay idle for 2.5 min | (a) stays logged in; (b) redirected to login with the "session expired" banner |
| E12 | Register and log in as Bob | sees no Alice tasks |
| E13 | Replay Alice's task URL with Bob's token | 404 |
| E14 | Bob opens `/admin/users`; calls `/api/admin/users` with his token | Access Denied page; 403 |
| E15 | Log in as admin/admin | goes to `/admin/users`; search for users works |
| E16 | Admin opens Alice's tasks: create, edit, complete, uncomplete, delete, search | each change visible to Alice after refresh |
| E17 | Bob logged in in a second browser; admin disables Bob; Bob clicks anything | Bob redirected to login with the "disabled" message; Bob's login shows the disabled message |
| E18 | Admin enables Bob; admin tries to disable self | Bob can log in; own Disable button is disabled (API returns 409 if forced) |
| E19 | Restart the backend | data persists; still one admin; admin password unchanged |
| E20 | 375 px wide window, Tasks, Profile and Admin pages | usable, no horizontal scroll |
| E21 | Alice → Profile: wrong current password; then new = old; then a valid change | errors under the fields and still logged in; then success, still logged in; after logout the old password fails and the new one works |
| E22 | Alice logged in in two browsers; change the password in browser 1; act in browser 2 | browser 2 → login page with the "password was changed" banner; browser 1 keeps working |
| E23 | Admin resets Bob's password from Users while Bob is logged in elsewhere; non-admin Bob calls `PUT /api/admin/users/{alice}/password` with his token | Bob's next action → login with the banner; Bob logs in with the new password; the API call → 403 |
| E24 | Admin changes the seeded `admin` password from Profile, then restarts the backend | admin stays logged in after the change; after restart `admin`/`admin` fails, the new password works, no default-password WARN |

### 5.5 Exit criteria
- All U, A, S, SS, AD and UI tests pass. All E checks pass, or have documented low-severity exceptions approved by the Team Lead.
- `mvn test`, `npm test` and `npm run build` are green. No open Critical or High defects.
- `reports/test-report.md` lists suite, total, passed, failed, skipped, and defects with their status.

---

## 6. Libraries needing Team Lead decision
| Library | Purpose | Alternatives considered | Recommendation |
|---|---|---|---|
| `spring-boot-starter-oauth2-resource-server` | JWT issue/verify (HS256), bearer filter | jjwt (third-party); HttpSession | **Approve** (Spring starter) |
| `react-router-dom` | Client routing incl. role-guarded routes | Hand-written view switching | **Approve** |
| `@testing-library/react`, `@testing-library/user-event`, `@testing-library/jest-dom`, `jsdom` | Component tests with Vitest | Vitest alone | **Approve** (test tooling) |
| *No new libraries in revisions 2 and 3.* Search, debounce, date handling, password rules token renewal and token invalidation (`token_version`) all use built-ins. *Still not used:* Lombok, axios, Redux, date-fns/dayjs, lodash, UI kits, Flyway, H2, Testcontainers, MSW, Playwright | | | |

---

## 7. Open questions
None. (The revision-2 note about change-password being out of scope no longer applies: R16/R17 let users change the seeded `admin` password through the UI.)
