# To-Do List App

A multi-user to-do list web app with registration, login, an admin area, and a MySQL database.

- **Users** register and log in, then create, edit, delete, search and filter their own tasks, and mark them complete or not complete (tick the checkbox, then press **Save**, or **Clear** to discard the change; nothing is sent until Save). Every task has a due date and time, and overdue tasks show an Overdue marker (they can still be completed). Users can change their own password from the Profile page.
- **Admins** can list and search users, disable or enable them, reset any user's password, and view, create, edit, complete or delete any user's tasks.
- **Sessions** last 60 minutes and renew on every action.
- **Loading:** every request shows a spinner on the button or search box that started it, and that control is disabled until the request finishes.
- **Notifications** appear as toasts that dismiss themselves (or with the close button); the theme follows your OS light or dark setting.

## Tech stack

| Part | Technology |
|---|---|
| Backend | Java 21, Spring Boot 3.5, Maven, Spring Data JPA, Spring Security (JWT) |
| Frontend | React, TypeScript, Vite, react-router-dom |
| Database | MySQL (`todo_db`, tables created automatically) |

## Prerequisites

- JDK 21 (on macOS with Homebrew, `export JAVA_HOME=/opt/homebrew/opt/openjdk@21`)
- Maven 3.9+
- Node 20+ and npm
- MySQL on `localhost:3306` with user `root` / password `root`

## Run it

Backend, on http://localhost:8080:

```bash
cd backend
mvn spring-boot:run
```

Frontend, on http://localhost:3000:

```bash
cd frontend
npm install
npm run dev
```

Open http://localhost:3000. The database and tables are created on first start.

### Default admin

Username `admin`, password `admin`. This default is insecure: change it right away from the Profile page (or set `ADMIN_PASSWORD` before the first start). The backend logs a warning while it is unchanged.

### Backend settings (environment variables, all optional)

| Variable | Default | Purpose |
|---|---|---|
| `DB_URL` | `jdbc:mysql://localhost:3306/todo_db?createDatabaseIfNotExist=true&serverTimezone=UTC` | Database URL. **Required with the `prod` profile** (no default) |
| `DB_USERNAME` / `DB_PASSWORD` | `root` / `root` | Database login. **Required with the `prod` profile** (no default) |
| `SPRING_PROFILES_ACTIVE` | none | Set to `prod` in production to make the three `DB_*` variables mandatory |
| `CORS_ALLOWED_ORIGINS` | `http://localhost:3000` | Comma-separated browser origins allowed to call the API (see Production) |
| `JWT_SECRET` | built-in dev value | Token signing key (32+ bytes). Set your own outside development |
| `JWT_EXPIRY_MINUTES` | `60` | Session length |
| `ADMIN_PASSWORD` | `admin` | Initial admin password, used on first start only |

## Production (backend) and Vercel (frontend)

Backend: with `SPRING_PROFILES_ACTIVE=prod` the app refuses to start unless `DB_URL`, `DB_USERNAME` and `DB_PASSWORD` are set and not blank. The error names the missing variables, never their values, and there is no `root`/`root` fallback. Set them from your host's secret store, never in git.

```bash
export SPRING_PROFILES_ACTIVE=prod
export DB_URL='jdbc:mysql://<db-host>:3306/todo_db?serverTimezone=UTC'
export DB_USERNAME='<db-user>'
export DB_PASSWORD='<from your secret store>'
export CORS_ALLOWED_ORIGINS='https://<your-project>.vercel.app'
java -jar target/todo-backend-0.0.1-SNAPSHOT.jar
```

`JWT_SECRET` and `ADMIN_PASSWORD` are not required by `prod` and keep their insecure dev defaults, so set them yourself.

CORS: list your exact frontend origin(s) in `CORS_ALLOWED_ORIGINS` (comma-separated, no path; `https://vercel.app` alone matches nothing). `PATCH` is allowed and `X-Auth-Token` is exposed to the browser. A bare `*` stops startup. For Vercel preview URLs you may opt in to a narrow pattern such as `https://<project>-*-<team>.vercel.app`; avoid `https://*.vercel.app`, which lets every Vercel project call your API. Credentials and cookies are not used.

Frontend on Vercel: set the build variable `VITE_API_BASE_URL` to your backend origin (for example `https://api.example.com`, no trailing slash needed; it is public, never put a secret in it). Left empty, the app calls the relative `/api`, which only works through the local dev proxy. `frontend/vercel.json` makes deep links such as `/tasks` work on refresh.

Alternative without CORS: leave `VITE_API_BASE_URL` empty and rewrite `/api/*` to the backend in `frontend/vercel.json`, placed before the SPA rule:

```json
{"rewrites":[{"source":"/api/(.*)","destination":"https://<backend-host>/api/$1"},{"source":"/(.*)","destination":"/index.html"}]}
```

## Tests

```bash
# Backend: use a private database, because concurrent runs on the same one cause false errors
cd backend
SPRING_DATASOURCE_URL='jdbc:mysql://localhost:3306/todo_mytests_db?createDatabaseIfNotExist=true&serverTimezone=UTC' mvn test

# Frontend
cd frontend
npm test && npm run build && npm run lint
```

Latest results: backend 279 passed, frontend 205 passed, no failures. Details are in `reports/`.

## Project layout

```
backend/    Spring Boot API
frontend/   React app
docs/       plan.md (design and API contract), build-summary.md, changes/ (plans for later changes)
reports/    test cases, manual end-to-end log, final test report, changes/ (QA for later changes)
```

## API overview

All endpoints are under `/api`. The full contract is in `docs/plan.md`.

| Area | Endpoints |
|---|---|
| Auth | `POST /auth/register`, `POST /auth/login`, `GET /auth/me`, `PUT /auth/password` |
| Tasks | `GET /tasks?status=&q=`, `POST /tasks`, `GET/PUT/DELETE /tasks/{id}`, `PATCH /tasks/{id}/completion` |
| Admin | `GET /admin/users?q=`, `PATCH /admin/users/{id}/status`, `PUT /admin/users/{id}/password`, and task endpoints under `/admin/users/{id}/tasks` |

## Known limitations

- A stale or invalid token sent to the login or register endpoint returns 401 (the frontend no longer sends one there).
- The 375 px mobile layout and a few visual checks were not run in a real browser; see `reports/e2e-manual.md`.
- No email features, pagination or categories.
