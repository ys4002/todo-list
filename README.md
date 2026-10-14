# To-Do List App

A multi-user to-do list web app with registration, login, an admin area, and a MySQL database.

- **Users** register and log in, then create, edit, delete, search and filter their own tasks, and mark them complete. Every task has a due date and time, and overdue tasks show an Overdue marker (they can still be completed). Users can change their own password from the Profile page.
- **Admins** can list and search users, disable or enable them, reset any user's password, and view, create, edit, complete or delete any user's tasks.
- **Sessions** last 60 minutes and renew on every action.
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
| `DB_URL` | `jdbc:mysql://localhost:3306/todo_db?createDatabaseIfNotExist=true&serverTimezone=UTC` | Database URL |
| `DB_USERNAME` / `DB_PASSWORD` | `root` / `root` | Database login |
| `JWT_SECRET` | built-in dev value | Token signing key (32+ bytes). Set your own outside development |
| `JWT_EXPIRY_MINUTES` | `60` | Session length |
| `ADMIN_PASSWORD` | `admin` | Initial admin password, used on first start only |

## Tests

```bash
# Backend: use a private database, because concurrent runs on the same one cause false errors
cd backend
SPRING_DATASOURCE_URL='jdbc:mysql://localhost:3306/todo_mytests_db?createDatabaseIfNotExist=true&serverTimezone=UTC' mvn test

# Frontend
cd frontend
npm test && npm run build && npm run lint
```

Latest results: backend 266 passed (not changed since), frontend 196 passed, no failures. Details are in `reports/`.

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
