# To-Do List App (Backend + Frontend, with Authentication)

A full-stack to-do list app: Node.js/Express/SQLite backend with JWT
authentication, and a plain HTML/JS frontend.

## Project Structure
```
backend/            # Express API, database, tests
  server.js
  db.js
  tests/
    api.test.js        # main test suite
    tdd-demo.test.js    # TDD red -> green demo (see below)
  package.json
  .env.example
frontend/            # Static UI
  index.html
  app.js
CLAUDE.md            # Security rules, enforced in code
README.md
```

## How to Run It

### 1. Backend
```bash
cd backend
cp .env.example .env      # then edit .env and set a real JWT_SECRET
npm install
npm test                  # runs all automated tests
npm start                 # starts the API on http://localhost:3000
```

### 2. Frontend
Just open `frontend/index.html` in a browser (or serve it with any static
server, e.g. `npx serve frontend`). Make sure the backend is running on
`http://localhost:3000` first — the frontend calls it directly.

### What `npm install && npm test && npm start` does
- `npm install` — downloads the packages the project needs (Express, SQLite driver, bcrypt, JWT, Jest, etc.) into `node_modules`. Only needs to be run once, or after packages change.
- `npm test` — runs the automated test suite (Jest) and prints pass/fail for each test.
- `npm start` — starts the actual server so the app is live at `http://localhost:3000`.

Run these **inside the `backend` folder**, one after another (or chained
with `&&` as shown, which runs each step only if the previous one succeeds).

## Technical Requirement Coverage
Per the assignment, the app implements all three required areas of user data
handling with validation and protection:
- **Form input** — registration/login form, and the "new task" form; both
  validated on the backend (username format, password length, title length).
- **Authentication** — full register/login system using bcrypt password
  hashing and JWT tokens. All todo routes require a valid token.
- **Secure data storage** — SQLite via parameterized queries only; passwords
  are hashed, never stored in plain text; todos are scoped per-user.

## Security Rules
See [`CLAUDE.md`](./CLAUDE.md) for the full list of rules and how each one is
enforced directly in `backend/server.js` (see the `// Security:` comments).

## TDD Demo (Red → Green)
`backend/tests/tdd-demo.test.js` is written specifically for the live demo:

1. Before the route existed, running `npm test` showed this test **failing**
   (`404` instead of `200`) — this is the "Red" step.
2. The route `GET /api/todos/count` was then added to `server.js` in a few
   lines, using the already-existing pattern of a parameterized query scoped
   to `req.userId`.
3. Running `npm test` again shows it **passing** — the "Green" step.

To reproduce this live: comment out the `/api/todos/count` route in
`server.js`, run `npm test` (watch it fail), then uncomment it and run
`npm test` again (watch it pass).

## Automated Tests (14 tests, all passing)
`backend/tests/api.test.js` covers:
- Registration (success, duplicate username rejected, weak password rejected)
- Login (success, wrong password rejected)
- Todos require authentication (no token → 401)
- Full CRUD: create, list, update (toggle done), delete
- **Authorization boundary**: one user cannot view or edit another user's todo
- **Security test**: SQL injection payload in the title field is stored
  safely as plain text and the `todos` table survives

`backend/tests/tdd-demo.test.js` adds 1 more test for the count endpoint
(see TDD Demo section above).

Run with: `npm test` (from inside `backend/`)

## Security Review & Fixes
This project went through a manual security review covering SQL injection,
XSS, CSRF, exposed secrets, unvalidated input, excessive permissions, and
unprotected endpoints. Findings and fixes:

### 1. SQL Injection (High — the main documented vulnerability)
**Vulnerability**: The first draft of this code built SQL queries by
concatenating the todo title directly into the query string:
```js
db.exec(`INSERT INTO todos (title) VALUES ('${title}')`) // SQL injection risk
```
A malicious input like `'); DROP TABLE todos; --` could have deleted the
entire `todos` table.

**Fix**: Every query was rewritten using **prepared statements** via
`better-sqlite3`:
```js
db.prepare('INSERT INTO todos (user_id, title) VALUES (?, ?)').run(req.userId, title.trim());
```
A dedicated automated test (`SQL injection attempt in title is stored safely...`
in `api.test.js`) sends that exact malicious payload and asserts the table
still exists and responds normally afterward.

### 2. Overly permissive CORS (Medium)
**Vulnerability**: `Access-Control-Allow-Origin` was set to `*`, letting any
website make requests to the API.

**Fix**: Restricted to a single configured origin via the `FRONTEND_ORIGIN`
environment variable (see `.env.example`), defaulting to
`http://localhost:5500`.

### 3. No brute-force protection on login (Medium)
**Vulnerability**: Login/register shared the same generous rate limit
(100 requests/minute) as the rest of the API, allowing fast password-guessing.

**Fix**: Added a dedicated stricter limiter (`authLimiter`) on
`/api/login` and `/api/register`: 10 attempts per 15 minutes per IP.

### 4. XSS relying only on frontend escaping (Low)
**Vulnerability**: The frontend correctly escapes todo titles before
rendering them, but the backend accepted any characters, including `<` and
`>`, so any other client consuming this API would be exposed to stored XSS.

**Fix**: Added backend-side sanitization (`sanitize()`) that strips `<` and
`>` from todo titles before storing them, as defense-in-depth in addition to
the frontend's escaping. Covered by an automated test.

### 5. Loose type checking on the `done` field (Low)
**Vulnerability**: `PUT /api/todos/:id` accepted any value for `done` and
silently coerced it (`done ? 1 : 0`) instead of rejecting malformed input.

**Fix**: Added an explicit `typeof done !== 'boolean'` check that returns
`400` for anything that isn't a real boolean. Covered by an automated test.

### Password policy note
Passwords require a minimum of 6 characters — no complexity rules — kept
simple on purpose for ease of testing in a student project. See
`CLAUDE.md` rule 14.

### CORS note
CORS reflects whatever origin makes the request (including the `null`
origin browsers use for `file://` pages), so the frontend works whether you
open `index.html` directly or serve it locally. This is looser than a
production setup, and is documented as an accepted trade-off in `CLAUDE.md`
rule 16 — the API's real protection is the JWT check on every sensitive
route, not CORS.

### 6. Framework fingerprinting via `X-Powered-By` header (Low)
**Vulnerability**: Express sends an `X-Powered-By: Express` header on every
response by default, giving attackers free information about the
technology stack to target known vulnerabilities.

**Fix**: Added `app.disable('x-powered-by')` right after the Express app is
created.

### 7. Registration silently failing when opening `index.html` directly (Medium — found during real testing)
**Bug found**: When `index.html` was opened directly as a file
(`file://...`) instead of served from a web server, the browser sends an
`Origin: null` request to the API. The backend's CORS policy only allowed
one specific configured origin, so the browser silently blocked the
response — the register/login buttons appeared to do nothing, with no
visible error.

**Fix**: CORS now reflects whatever origin sent the request (including
`null`), so the app works whether opened as a file or served locally. The
frontend was also updated to show a clear error message ("Could not reach
the server...") if a network request fails outright, instead of failing
silently. Documented as an intentional trade-off for local/demo use in
`CLAUDE.md` rule 16.

### 8. Checkmark click doing nothing (Medium — found during real testing)
**Bug found**: Clicking the checkmark called `toggle(id, 0)` or
`toggle(id, 1)` — plain numbers, not real booleans. The backend's strict
`typeof done !== 'boolean'` check (see #5 above) silently rejected these
with a 400, so clicking the checkmark appeared to do nothing.

**Fix**: `toggle()` now wraps the value with `Boolean(done)` before sending
it, so the backend always receives a real `true`/`false`. Also added
visible error feedback on the todo screen if an update ever fails, instead
of failing silently.

### 9. Known accepted risk: no server-side token revocation on logout (Low)
**Observation**: `logout()` only clears the token from the browser's
`localStorage`. The JWT itself stays valid on the server until it naturally
expires (2 hours) — if it were stolen before logout, it would still work.

**Mitigation in place**: token expiry is capped at 2 hours, limiting the
exposure window. A full fix (server-side blacklist, or refresh tokens with
much shorter access-token lifetimes) is a reasonable production upgrade but
intentionally out of scope here — documented as an accepted trade-off in
`CLAUDE.md` rule 17.

### 10. Known accepted risk: simple regex sanitization instead of a library (Low)
**Observation**: `sanitize()` strips `<`/`>` with a plain regex rather than
using a dedicated library like DOMPurify, so it's not a complete XSS filter
on its own.

**Why this is acceptable here**: it's explicitly a defense-in-depth layer,
not the primary defense — the frontend renders todo titles via
`textContent`/`escapeHtml()`, not `innerHTML`, which is what actually
prevents script execution. Documented as an accepted trade-off in
`CLAUDE.md` rule 18.

### 11. Known accepted risk: JWT stored in `localStorage` (Low)
**Observation**: The frontend stores the JWT in `localStorage` rather than
an HttpOnly cookie. If an XSS bug were ever introduced elsewhere in the app,
the token could be read by malicious JavaScript and stolen.

**Mitigation in place**: token expiry is capped at 2 hours; todo titles are
sanitized server-side (see #4 above) reducing the chance stored XSS ever
reaches the page; and a stolen token only grants access to that one user's
own data (see "Reviewed and confirmed" below). Moving to HttpOnly cookies +
CSRF tokens is the recommended production upgrade, but is intentionally out
of scope for this project's size — documented as an accepted trade-off in
`CLAUDE.md` rule 13.
- **CSRF**: mitigated by using a JWT sent in the `Authorization` header
  (not cookies), so there's no ambient credential for a forged cross-site
  request to exploit.
- **Hardcoded secrets**: none. `JWT_SECRET` is read from `.env` only; the
  server refuses to start without it.
- **Excessive permissions**: every todo route filters by `user_id`, verified
  by an automated test showing one user cannot read/modify another's data.
- **Unprotected endpoints**: all `/api/todos*` routes require a valid JWT;
  only `/api/register` and `/api/login` are intentionally public.

## No Secrets in Code
There are no hardcoded API keys or passwords anywhere in the source. The only
secret, `JWT_SECRET`, is read from an environment variable and must be set in
a local `.env` file (see `backend/.env.example`), which is excluded from
version control via `.gitignore`.
