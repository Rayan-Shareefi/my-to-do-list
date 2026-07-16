# CLAUDE.md — Security Rules for This Project

Any AI assistant or developer working on this codebase must follow these rules:

1. **No SQL injection.** All database queries must use prepared statements
   (`db.prepare(...).run()` / `.get()` / `.all()`). Never build SQL by
   concatenating user input into a string.

2. **No secrets in code.** API keys, JWT secrets, and passwords must never be
   hardcoded. They must be read from environment variables via `process.env`,
   loaded from a `.env` file that is excluded from version control by
   `.gitignore`. The server refuses to start if `JWT_SECRET` is missing.

3. **Passwords are always hashed.** User passwords are hashed with `bcrypt`
   before being stored. Plain-text passwords are never written to the
   database or logs.

4. **Input validation.** Every user-supplied field (username, password,
   todo title, todo id) is validated for type, format, and length before
   being used.

5. **Authentication required for user data.** All `/api/todos` routes require
   a valid JWT (`Authorization: Bearer <token>`). Each todo is scoped to
   `user_id`, so one user can never read or modify another user's todos.

6. **Rate limiting.** All `/api/` routes are protected by a rate limiter to
   reduce abuse and brute-force attempts against login/register.

7. **Payload size limits.** Request bodies are capped at 10kb to prevent
   payload-based denial-of-service.

8. **Generic error messages.** Errors returned to the client never leak
   internal details (stack traces, SQL errors, DB structure). Login failures
   return the same generic message whether the username or the password was
   wrong, to prevent user enumeration.

9. **CORS reflects the requesting origin.** For local student-project use
   (where the frontend may be opened directly as a `file://` page or served
   from any local port), CORS reflects whatever origin makes the request,
   including the `null` origin browsers send for local files. This is looser
   than a production allowlist on purpose — see rule 16 below for the
   trade-off.

10. **Stricter rate limiting on auth routes.** `/api/login` and
    `/api/register` use a dedicated, tighter rate limiter than the rest of
    the API, to slow down brute-force password guessing.

11. **Backend-side output sanitization.** User-supplied text (e.g. todo
    titles) has `<` and `>` stripped server-side before storage, as
    defense-in-depth against XSS — this does not replace, but supplements,
    proper escaping on the frontend when rendering.

12. **Strict boolean validation.** Fields expected to be booleans (e.g.
    `done`) must be checked with `typeof x !== 'boolean'`, not coerced
    silently, so malformed input is rejected explicitly.

13. **Known accepted risk: JWT stored in localStorage.** The frontend stores
    the JWT in `localStorage` for simplicity. This is a known trade-off: if an
    XSS vulnerability were ever introduced elsewhere in the app, the token
    could be read and stolen by malicious JS. This is mitigated by: (a) a
    short 2-hour token expiry, (b) backend-side output sanitization (rule 11)
    reducing the chance of stored XSS in the first place, and (c) the token
    only grants access to that single user's own todos (rule 5). For a
    production system, the recommended upgrade is an HttpOnly, Secure cookie
    combined with a CSRF token — intentionally out of scope for this
    project's size.

14. **Password policy.** Passwords must be at least 6 characters. Kept
    intentionally simple for this student project — no complexity rules
    (uppercase/digit/symbol) are enforced, so registering and testing the
    app stays easy. A production system should require longer passwords
    with complexity rules or, better, encourage passphrases/password
    managers instead.

15. **No framework fingerprinting.** The `X-Powered-By` header is disabled
    (`app.disable('x-powered-by')`) so responses don't advertise the
    underlying framework/version to attackers.

16. **Known accepted risk: CORS reflects any origin.** For local
    development/demo convenience, CORS is not locked to one specific origin
    (see rule 9). This is safe here because the API requires a valid JWT
    for all sensitive routes regardless of origin — CORS alone was never the
    only line of defense. Locking to one origin via an allowlist is the
    right move once this is deployed somewhere with a fixed frontend URL.

17. **Known accepted risk: no server-side token revocation (logout).**
    `logout()` only removes the JWT from the client's `localStorage`; the
    token itself remains valid on the server until it naturally expires
    (2 hours). A stolen token could still be used until expiry even after
    the legitimate user "logs out." Mitigated by the short 2-hour expiry.
    A full fix (a server-side blacklist table, or short-lived tokens with a
    refresh-token flow) is a reasonable production upgrade but is
    intentionally out of scope for this project's size.

18. **Known accepted risk: `sanitize()` uses a simple regex, not a
    dedicated library.** Stripping `<`/`>` server-side is a backend
    defense-in-depth layer, not the primary XSS defense — the primary
    defense is the frontend rendering titles via `textContent`/`escapeHtml()`
    rather than `innerHTML`. A production system would use a library like
    `DOMPurify` for more robust sanitization, but that dependency was judged
    unnecessary for this project's scope given the frontend's existing
    escaping already prevents script execution.

These rules are enforced directly in `backend/server.js` — search for the
`// Security:` comments to see each one applied in code, not just described
here.
