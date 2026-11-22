# Gather — Backend Implementation Prompt

**Repository:** `SecurityAy/Gather` (backend) — currently at commit `996cf88`
**Live API:** https://gatherbackend-2.onrender.com (`/health` → 200)
**Contract doc:** `API.md` (update it as part of this work)
**Stack:** Express 5 + TypeScript + Prisma + PostgreSQL + Resend (email) + Zod

You are extending an existing, working backend. The frontend is deployed and already
calls every endpoint that exists today. Your job is to add the **missing endpoints**
listed below so the frontend can replace its honest "not available" UI with real
functionality.

## Hard rules

- **Additive only.** Never change an existing route, response shape, status code, or
  field name. Existing clients depend on them. New fields may be added to responses;
  existing fields must keep their names and types.
- **Do not remove** the demo/legacy routes. `GET /tickets/validate/:qrCode` stays
  retired (`410`) exactly as it is.
- Follow the existing patterns exactly: `Router` per module, `requireAuth`,
  owner-scoping (`event: { is: { userId: ownerId, deletedAt: null } }`), Zod schemas
  at the top of the routes file, `HttpError`, `errorHandler`, rate-limiters from
  `middleware/rateLimit.ts`, `AuditLog` writes for every mutation, and
  `enqueueNotification` for every email.
- Every response carries `X-Request-Id` (already handled). Token-bearing responses
  must set `Cache-Control: no-store`.
- Register every new router in `src/app.ts` under the existing mount points
  (`/api/auth`, `/api/events`) or a new mount (`/api/me`) — do not create parallel
  mounts for the same resource.
- Add a `prisma migrate` for any schema change, plus the matching `prisma generate`.
- Write tests for each endpoint in the existing test layout and keep them green.
- Update `API.md` with a row per new route (route, auth, body/query, success).

---

## 1. Authentication & password recovery — `src/modules/auth`

### 1.1 `POST /auth/forgot-password` — Public, rate limited

```
Body: { email: string }            // Zod: email()
200:  { message: string }          // always identical, e.g. "If an account exists for that email, a reset link has been sent."
404/400: never. Do not reveal whether the account exists.
```

Behaviour:
- Find user by `email.trim().toLowerCase()`. If none, **return 200 with the same
  message** (no enumeration).
- Generate a raw token: `randomBytes(32).toString('base64url')`.
- Store `sha256(rawToken)` in a new `passwordResetTokenHash` / `passwordResetExpiresAt`
  pair on `User` (nullable). Expiry 1 hour. Invalidate any previous token for that user.
- Email the raw token via `enqueueNotification` with a new `NotificationType`
  (`PASSWORD_RESET`), linking to
  `${env.frontendUrl}/reset-password?token=<rawToken>`.
- Do **not** return the token in the HTTP response.

### 1.2 `POST /auth/reset-password` — Public, rate limited

```
Body: { token: string, password: string }   // password min 8
200:  { message: string }                    // e.g. "Your password has been updated."
400:  { message: string }                    // invalid/expired token, or weak password
```

Behaviour:
- Hash the token, find the user with a non-expired match. Missing/expired → `400`.
- Update `passwordHash`, clear `passwordResetTokenHash` / `passwordResetExpiresAt`.
- Revoke existing sessions if you issue JWTs with a `passwordChangedAt`/`tokenVersion`
  claim; otherwise document that old tokens remain valid until expiry.
- Write an `AuditLog` row (`action: 'AUTH_PASSWORD_RESET'`).

### 1.3 `PATCH /auth/me` — Bearer

```
Body: { firstName?: string, lastName?: string, email?: string }   // all optional, .strict()
200:  { user: SafeUser }                                            // same projection as GET /auth/me
400:  { message }   // invalid email
409:  { message }   // email already taken
```

Behaviour:
- Update only supplied fields. Normalise `email` (trim + lowercase) and check the
  unique constraint before writing; map `P2002` to `409`.
- Return the **same** safe user projection shape that `GET /auth/me` returns today.
- Do not allow changing `passwordHash`, `accountStatus`, or `id` through this route.

### 1.4 `POST /auth/change-password` — Bearer

```
Body: { currentPassword: string, newPassword: string }   // newPassword min 8
200:  { message: string }
400:  { message }   // current password wrong or new password weak
```

Behaviour:
- Verify `currentPassword` against `passwordHash`; wrong → `400` with a generic
  message that does not reveal which field failed.
- Update `passwordHash`. If you have token versioning, bump it here.

---

## 2. Account self-service — new `src/modules/account`

Mount at `/api/me` in `src/app.ts`.

### 2.1 `GET /me/data-export` — Bearer

```
200: {
  exportedAt: string,                 // ISO timestamp
  user: SafeUser,                     // same safe projection
  events: Array<{                     // events the user owns, excluding soft-deleted
    id, title, slug, eventStatus, eventDate, venueName,
    registrationCount, approvedAttendeeCount, createdAt
  }>,
  registrations: Array<{              // RSVPs this user's email appears on (primary guest)
    eventTitle, attendanceIntent, status, createdAt
  }>
}
```

- Read-only. Do not include password hashes, tokens, or other users' PII.
- Content-Type `application/json` with
  `Content-Disposition: attachment; filename="gather-data-export.json"`.

### 2.2 `DELETE /me` — Bearer

```
Body: {}                            // .strict() empty object
200: { message: string }
```

Behaviour:
- Soft-delete the account: set `accountStatus = 'DELETED'` (add to the
  `AccountStatus` enum), scrub PII (`email` → `deleted-<id>@example.invalid`,
  `firstName`/`lastName` → `''`), and **retain** `passwordHash` as an unusable random
  value so the row can never be logged into again.
- Soft-delete (do not hard-delete) the user's events, and cancel any `PENDING`
  registrations on other users' events so capacity is released.
- Invalidate all sessions for that user.
- Write an `AuditLog` row with `actorId` = the deleted user id.

### 2.3 `GET/PUT /me/preferences` — Bearer

```
GET 200: { preferences: { emailNotifications: boolean } }
PUT Body: { emailNotifications: boolean }   // .strict()
    200: { preferences: { emailNotifications: boolean } }
```

- Add `emailNotifications Boolean @default(true)` to the `User` model.
- `enqueueNotification` must **skip** organiser-addressed emails when the recipient
  user has `emailNotifications = false`. Guest emails are unaffected.

---

## 3. Audit log — `src/modules/events` (read-only view of `AuditLog`)

### 3.1 `GET /events/:eventId/audit` — Bearer, owner

```
Query: page (default 1), pageSize (default 20, max 100)
200: {
  entries: Array<{
    id, action, actorId, eventId, details, createdAt
  }>,
  pagination: { page, pageSize, total, totalPages }
}
```

- Owner-scoped: 404 if the event is not owned by the caller.
- Order by `createdAt desc`.
- `details` is the existing free-text/JSON column; return it as-is.

---

## 4. Bulk RSVP actions — `src/modules/events/rsvp.service.ts`

### 4.1 `POST /events/:eventId/rsvps/bulk-approve` — Bearer, owner

```
Body: { registrationIds: string[] }   // 1..100 ids, .strict()
200: {
  results: Array<{
    registrationId: string,
    ok: boolean,
    status?: RegistrationStatus,       // present when ok
    tickets?: Array<{ attendeeId, ticketId, qrToken }>,  // present when ok
    error?: string                     // present when !ok
  }>
}
```

### 4.2 `POST /events/:eventId/rsvps/bulk-decline` — Bearer, owner

```
Body: { registrationIds: string[] }
200: { results: Array<{ registrationId: string, ok: boolean, status?: RegistrationStatus, error?: string }> }
```

Behaviour:
- Reuse the existing single-registration approve/reject service functions **inside one
  transaction per registration** (not one giant transaction) so one failure does not
  roll back the others.
- Approve requires `status = PENDING` and `attendanceIntent = ATTENDING`; otherwise
  that id returns `ok: false` with a short `error` string.
- Respect `lockEventCapacity` and the max-capacity check per registration, exactly as
  the single approve path does. If capacity is exceeded mid-batch, the remaining
  registrations fail with an explicit `error` rather than silently overbooking.
- Emit the same emails (`GUEST_RSVP_APPROVED` / `GUEST_RSVP_DECLINED`) and
  `AuditLog` rows as the single endpoints.

---

## 5. Ticket delivery — make issued tickets actually reach guests

Today the approval email (`GUEST_RSVP_APPROVED`) contains a link to the invitation but
**no ticket**. Add the ticket to the email.

### 5.1 Extend `NotificationEmail` (`modules/notifications/email-templates.ts`)

Add an optional ticket block to the `GUEST_RSVP_APPROVED` variant:

```ts
ticket?: {
  qrToken: string;        // raw token, available at issue time only
  code: string;           // short human-readable code, e.g. GTH-XXXX-XXXX
  attendeeName: string;
}
```

Render it as a QR code (generate a data URI at send time with the `qrcode` package, or
embed the token in a link to the public ticket page) plus the plain-text code.

### 5.2 Add a delivery-status field

Add to `Ticket` (or a parallel `TicketDelivery` model) a nullable
`deliveryStatus TicketDeliveryStatus` enum (`QUEUED | SENT | FAILED`) and
`deliveryError String?`.

- Set `QUEUED` when the ticket is issued.
- The email worker flips it to `SENT` after a successful Resend call, `FAILED` with
  `deliveryError` on failure, and retries with backoff using the existing
  `nextRetryAt` pattern.
- Expose `deliveryStatus` (and `deliveryError` only when `FAILED`) on
  `GET /events/:eventId/tickets` and `GET /events/:eventId/attendees`.

### 5.3 `POST /events/:eventId/tickets/:ticketId/resend-email` — Bearer, owner

```
Body: {}
200: { ticketId: string, deliveryStatus: TicketDeliveryStatus }
404: { message }   // ticket not found / not owned
409: { message }   // ticket already used or void
```

- Re-enqueues the ticket email. Does **not** return the raw QR token.
- Rate limit per event (reuse the ticket-mutation limiter).

---

## 6. Real-time updates — ETag polling (do not add SSE)

`API.md` already promises content-derived `ETag` + `Cache-Control: private, max-age=0,
must-revalidate` on `GET /events/:eventId/attendees`, `/rsvps`, and `/tickets`, with
`304 Not Modified` for unchanged lists. **Implement it if it is not already live.**

- ETag = `sha256` of the serialised public response body (never the tokens).
- Honour `If-None-Match` and return `304` with an empty body on a match.
- Add the same ETag support to `GET /events/:eventId/audit`.

The frontend polls these lists on a 20-second interval while a page is open and
refreshes only when the ETag changes.

---

## 7. Device guard migration (production blocker)

The frontend device guard reads `event.hasReserved`, which is `false` for everyone until
a production migration exists.

- Confirm `prisma migrate deploy` has been run against the production database and that
  `RSVPRegistration.deviceCookieHash` / `deviceClientHash` are populated for rows
  created after the migration.
- Document the exact migration command and the rollback plan in `README.md`.
- Verify with a real request that `GET /events/public/:slug` returns
  `hasReserved: true` for a device that already RSVP'd and `false` for a fresh one.

---

## 8. i18n (optional, lowest priority)

- Accept `Accept-Language` on `GET /events/public/:slug` and return
  `locale: string` (the resolved language tag) so the frontend can format dates.
- Do not translate stored content (titles, descriptions). Only the envelope.

---

## 9. Deliverables checklist

- [ ] All routes above implemented and registered in `src/app.ts`
- [ ] `prisma migrate` + `prisma generate` for every schema change
- [ ] `npm run build` and `npm test` green
- [ ] `API.md` updated with a row per new route
- [ ] `README.md` updated: new env vars (`QR_*` if needed), migration command, rollback
- [ ] Every mutation writes `AuditLog`; every email goes through `enqueueNotification`
- [ ] No existing route, response shape, or status code changed
- [ ] Post-deploy smoke test results (curl for each new route, including the 401 cases)

## 10. Explicit non-goals

Do not build: SSE/WebSocket push, an admin panel, a separate notification-preferences
UI endpoint, analytics, file storage beyond the existing Cloudinary signature flow, or
changes to the retired `GET /tickets/validate/:qrCode` route.