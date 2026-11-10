# Graduation Invitation & Guest Management Platform

## Technical Specification

**Source:** Product Requirements Document v1.1  
**Status:** MVP technical baseline  
**Scope:** Technical specification only; no application code is included  
**Recommended stack:** React + TypeScript, Node.js + TypeScript, PostgreSQL

## 1. Purpose and scope

This document turns the PRD into an implementation-ready technical baseline for a responsive web application. It describes the architecture, data ownership, APIs, core workflows, security controls, integrations, and verification criteria.

The MVP supports graduate accounts and multiple events, public invitations, guest group RSVPs, graduate approval, individual QR tickets, event check-in, transactional email, and a published graduation photo gallery with individual and ZIP downloads.

The product is a modular monolith, not a set of microservices. The public guest experience does not require an account. Graduate-only operations are authorized server-side against the event owner on every request.

## 2. Scope boundaries and product assumptions

### 2.1 MVP

- Graduate registration, email verification, login, password recovery, and profile management.
- Multiple events per graduate; draft, published, unpublished, RSVP-closed, and archived states.
- Unique event links, public invitation page, event details, countdown, and mobile-first layout.
- Guest RSVP with attendance choice, primary contact details, configured additional-guest limit, and attendee names.
- Group-level approval or rejection by the graduate.
- One ticket per approved attendee, delivered to the primary guest by email.
- Authenticated QR validation, single check-in, manual guest lookup, and attendance counts.
- Transactional email for account verification, password reset, RSVP, approval, rejection, ticket delivery, and relevant event changes.

### 2.2 Later or explicitly excluded

- Event photo upload, ordering, per-image publication, a public gallery, and guest downloads.
- Paid tickets, SMS, WhatsApp notifications, public event discovery, social features, native apps, seating, and delegated operators are excluded.
- No guest account is introduced. Guests use the invitation and emailed ticket access links.

### 2.3 Deferred product decisions

The following are not assumed as MVP features. Unless product owners decide otherwise, use the conservative defaults below:

| Decision | MVP default |
|---|---|
| Direct ticket email to accompanying guests | No; the primary guest receives the group's tickets and can share them. |
| Password-protected invitations | No; published links are unlisted but publicly accessible to anyone with the URL. |
| Overall event capacity | Not supported. |
| Guest self-service RSVP editing | Not supported as a general feature. Duplicate detection prevents a second submission; the graduate can update a registration or contact the guest. |
| Public event directory | None. Event pages are reachable only by their unique invitation URLs. |

These are product decisions, not security controls. Unlisted URLs must not be treated as confidential data protection.

### 2.4 Interpretation of approval settings

The PRD both lists an "approval requirement" event setting and states that attending requests require graduate approval. For MVP, approval is always required; automatic approval is out of scope. The setting should not appear as a configurable option until its behavior is decided.

## 3. Architecture

### 3.1 Components

1. **Web client:** React and TypeScript single-page application. Provides the public invitation and RSVP flows, graduate workspace, ticket presentation, and check-in interface.
2. **API:** Node.js and TypeScript REST API, organized into modules for identity, events, RSVPs, tickets/check-in, email, and gallery. Express is the recommended HTTP framework.
3. **Database:** PostgreSQL as the system of record. Use migrations and database constraints for invariants that must survive concurrent requests.
4. **Worker:** A process in the same deployable application or a separately scaled worker that consumes a durable email outbox. It retries transient delivery failures and records outcomes.
5. **Object storage:** S3-compatible private storage for graduate portraits, event covers, and gallery images. Serve approved public assets through short-lived or cacheable delivery URLs according to visibility.
6. **External services:** Transactional email provider, object storage, and (optionally) an error/metrics service. Provider interfaces should be replaceable; credentials are configuration, never stored in source control.

### 3.2 Deployment shape

Deploy the SPA and API behind HTTPS. The API and worker may initially share one codebase and deployment artifact. Use a managed PostgreSQL service, managed object storage, and a transactional email service. Run schema migrations as a controlled release step. Keep development, staging, and production data and credentials separate.

The API is the only writer of business data. The browser never connects directly to PostgreSQL or stores authoritative approval, ticket, or check-in state.

### 3.3 Suggested repository layout

```text
apps/
  web/                 React application
  api/                 REST API and background worker entry points
packages/
  contracts/           Shared request/response and validation schemas
  domain/              Shared enums and pure domain rules, where useful
```

Keep deployment configuration, database migrations, and integration tests alongside the API. Shared packages must not contain secrets, database access, or browser/server-specific side effects.

## 4. Domain model

Use UUID primary keys for internal entities. Store timestamps in UTC (`timestamptz`) and retain an IANA time-zone identifier on each event for display and countdown calculations. Normalize email addresses and phone numbers for comparison while retaining a display form where needed.

### 4.1 Entities

| Entity | Important fields and relationships |
|---|---|
| `Graduate` | `id`, `full_name`, `email_normalized` (unique), `email_display`, `password_hash`, `email_verified_at`, profile image key, timestamps. Owns events. |
| `Event` | `id`, `owner_id`, unique `slug`, title/category/description, graduate display name and portrait, institution/faculty/department/qualification, `starts_at`, optional `ends_at`, `time_zone`, venue fields, RSVP deadline, `max_additional_guests` (0–3), `allow_additional_guests`, `publication_status`, `rsvp_status`, personal message, theme/accent data, timestamps. |
| `RsvpGroup` | `id`, `event_id`, primary guest name, normalized/display phone, normalized/display email, relationship, attendance choice, group status, submission/update timestamps. Represents the primary guest's registration and its approval lifecycle. |
| `Attendee` | `id`, `event_id`, `rsvp_group_id`, attendee name, attendee type (`PRIMARY` or `ADDITIONAL`), timestamps. One primary attendee per attending group; zero to configured maximum additional attendees. |
| `Ticket` | `id`, `event_id`, `attendee_id` (unique), hash of a cryptographically random opaque token, status (`VALID`, `CHECKED_IN`, `REVOKED`), issue/revoke timestamps. One ticket per approved attendee. |
| `CheckIn` | `id`, `event_id`, `attendee_id`, `ticket_id`, method (`QR` or `MANUAL`), `checked_in_by`, timestamp. Immutable audit record; one successful check-in per ticket. |
| `EmailOutbox` | `id`, recipient, template/type, related event/group/ticket IDs, safe template data, delivery state, attempts, provider message ID, last error, timestamps. |
| `GalleryImage` | `id`, `event_id`, object key, display order, publication state, alt text, timestamps. |
| `AuthToken` | Hashed, purpose-bound, single-use verification/reset token with owner, expiry, and consumption timestamp. |

### 4.2 Relationships and constraints

- Every event has exactly one graduate owner. Every guest, attendee, ticket, check-in, and image is scoped to an event.
- Enforce event slug uniqueness and graduate email uniqueness in PostgreSQL.
- Restrict `max_additional_guests` to 0–3. When additional guests are disabled, the effective limit is zero.
- Enforce one primary attendee per RSVP group and at most one ticket per attendee. Add a unique constraint preventing more than one successful check-in per ticket.
- An RSVP group with `attendance = NO` has no attendee records or tickets. An attending group may be pending, approved, declined, or cancelled.
- Approval is group-wide. The group and all its attendee records are approved in one transaction; each attendee receives exactly one ticket. Decline/cancel removes ticket validity.
- Avoid cross-event references: use composite constraints or transaction-level validation to ensure an attendee, group, ticket, and check-in all belong to the same event.
- Detect likely duplicates within an event using normalized primary email and phone. Make matching race-safe with database constraints or a transactionally enforced deduplication strategy. Do not expose another guest's data in duplicate responses.

### 4.3 State models

**Event publication:** `DRAFT → PUBLISHED ↔ UNPUBLISHED`; any retained event may transition to `ARCHIVED`. Only `PUBLISHED` events render publicly and accept RSVPs, subject to RSVP state and deadline. Archiving preserves historical guest and check-in records.

**RSVP submissions:** `PENDING → APPROVED | DECLINED`; approved registrations may become `CANCELLED`. Closed RSVP or expired deadline rejects new submissions but does not erase existing records.

**Tickets:** `VALID → CHECKED_IN` on the first successful check-in; `VALID → REVOKED` if the attendee is removed or the registration is cancelled/declined. Revocation must also invalidate any cached or emailed ticket-access link at the application layer.

**Email delivery:** `QUEUED → SENT → DELIVERED`, or `QUEUED/SENT → FAILED`. Provider callbacks update delivery state when supported. Failed messages remain inspectable and retryable; retries must not repeat business mutations.

## 5. API contract

### 5.1 Conventions

- JSON REST API under `/api/v1`; HTTPS required outside local development.
- Validate all input on the server using shared schemas where practical. Return consistent errors: `{ "error": { "code": "...", "message": "...", "fieldErrors": {} } }`.
- Use `401` for missing/invalid authentication, `403` for authenticated but unauthorized actions, `404` for absent or intentionally concealed resources, `409` for state conflicts, `422` for validation errors, and `429` for throttling.
- Paginate guest lists and activity; cap page size. Support explicit filtering by status and a bounded search query.
- Never trust owner IDs, event status, approval status, ticket validity, guest counts, or check-in state supplied by the client.
- Mutating operations that may be retried (RSVP submission, approval, ticket issuance, check-in) should be idempotent or protected with an idempotency key and database constraints.

### 5.2 Graduate authentication

| Endpoint | Purpose |
|---|---|
| `POST /auth/register` | Create graduate and queue verification email. |
| `POST /auth/login` | Establish authenticated session after credential verification. |
| `POST /auth/logout` | Revoke current session. |
| `POST /auth/email-verification/confirm` | Consume a one-time verification token. |
| `POST /auth/email-verification/resend` | Resend verification with throttling and non-enumerating responses. |
| `POST /auth/password-reset/request` | Queue password reset email without revealing account existence. |
| `POST /auth/password-reset/confirm` | Consume one-time token and replace password hash. |
| `GET/PATCH /me` | Read or update the authenticated graduate's profile. |

### 5.3 Events

| Endpoint | Purpose |
|---|---|
| `GET /events` | List only the authenticated graduate's events. |
| `POST /events` | Create a draft owned by the authenticated graduate. |
| `GET/PATCH/DELETE /events/:eventId` | Read, update, or request confirmed deletion of an owned event. Prefer archive for preserving history. |
| `POST /events/:eventId/publish` | Validate required fields and publish. |
| `POST /events/:eventId/unpublish` | Hide public page and stop new RSVPs. |
| `POST /events/:eventId/rsvp/close` | Close submissions without unpublishing the invitation. |
| `POST /events/:eventId/archive` | Preserve historical records and remove event from active lists. |
| `GET /public/events/:slug` | Return the safe, public subset of a published event. |

Do not return graduate email, guest records, ticket tokens, internal notes, or private object-storage keys from the public event endpoint.

### 5.4 Public RSVP and guest management

| Endpoint | Purpose |
|---|---|
| `POST /public/events/:slug/rsvps` | Submit primary guest details, attendance choice, and additional attendee names. |
| `GET /events/:eventId/rsvps` | Owner-only paginated guest list with status/search filters. |
| `GET /events/:eventId/rsvps/:groupId` | Owner-only registration detail. |
| `POST /events/:eventId/rsvps/:groupId/approve` | Approve the group and create attendee tickets transactionally. |
| `POST /events/:eventId/rsvps/:groupId/decline` | Decline the group and queue notification. |
| `PATCH /events/:eventId/rsvps/:groupId` | Owner-only correction to registration details; revoke tickets if attendees are removed. |

The public RSVP endpoint must verify that the event is published, RSVP is open, the deadline has not passed, the attendance choice is valid, and the number of additional guests is within the current event limit. A `NO` response creates a group record but no attendee or ticket rows. Duplicate matches must produce a safe, generic response and must not disclose names or contact details for an existing registration.

### 5.5 Tickets and check-in

| Endpoint | Purpose |
|---|---|
| `POST /public/tickets/access` | Exchange a short-lived, single-use emailed access token for a narrowly scoped ticket-view session. |
| `GET /public/tickets/:ticketId` | Return a ticket only when accompanied by valid ticket-view authorization. |
| `POST /events/:eventId/check-ins/validate` | Owner-only QR validation and atomic check-in. |
| `GET /events/:eventId/check-ins/search` | Owner-only manual lookup by name or phone, with bounded query and pagination. |
| `POST /events/:eventId/check-ins/manual` | Check in a selected valid attendee and record method `MANUAL`. |
| `GET /events/:eventId/attendance` | Return approved, checked-in, and outstanding attendee counts. |

The QR contains only a high-entropy opaque ticket credential (or a URL containing it), never personal information. The API hashes the submitted credential and looks up the ticket; validation and check-in occur server-side. The first valid scan records the check-in atomically. A later scan returns a duplicate state and the original time without creating another check-in.

### 5.6 Gallery and uploads

| Endpoint | Purpose |
|---|---|
| `POST /events/:eventId/gallery/uploads` | Owner-only request for short-lived, per-object upload authorization. |
| `POST /events/:eventId/gallery/images` | Confirm a completed upload and create its private image record. |
| `GET /events/:eventId/gallery/images` | Owner-only image metadata and short-lived preview URLs, including unpublished photos. |
| `PATCH /events/:eventId/gallery/images/:imageId` | Owner-only update of publication state, alt text, or display order. |
| `DELETE /events/:eventId/gallery/images/:imageId` | Owner-only removal of the image record and stored object. |
| `GET /public/events/:eventId/gallery` | Return only published image IDs, alt text, order, and short-lived secure read URLs for a published event. |
| `GET /public/events/:eventId/gallery/archive` | Stream a ZIP containing only published images for a published event; no guest or graduate-private data. |

Use owner-scoped endpoints to authorize uploads, confirm, reorder, publish, and remove images. The browser uploads directly to private object storage using short-lived, object-scoped credentials. Public reads resolve by event ID and must verify the event is published; return only published image metadata and short-lived secure read URLs, never storage keys or private photos. The archive endpoint must enforce the same checks, cap the archive size and image count, use unique generated filenames, and stream the ZIP without loading the complete archive into API memory. Guests need neither an account nor an approved RSVP to view or download published images. Validate file contents and image dimensions on the server; do not trust filename extensions or client MIME type alone.

## 6. Core workflows and transaction boundaries

### 6.1 Event publication

1. Graduate creates or edits a draft.
2. API validates required invitation fields, date/time-zone consistency, RSVP configuration, and slug availability.
3. Publish transition commits only if valid. Public routes resolve only published slugs.
4. Unpublish or RSVP-close takes effect immediately on server-side checks; hiding a button in the UI is insufficient.

### 6.2 RSVP submission

1. Browser fetches public event details and renders the RSVP form.
2. API validates publication, deadline, RSVP status, required primary details, attendance, and guest limit.
3. In a transaction, normalize contact fields, detect duplicates, create the group, and create attendee rows only for attending requests.
4. Queue acknowledgement email in the outbox in the same transaction.
5. Return an accepted confirmation that does not imply approval. The group remains `PENDING`.

### 6.3 Group approval and ticket issuance

1. Owner requests approval; API verifies the authenticated graduate owns the event and the group is pending.
2. In one transaction, lock the group, transition it to approved, create attendee tickets using cryptographically secure random tokens, persist only token hashes, and enqueue email with ticket-access links.
3. Constraints and idempotent transition handling prevent duplicate tickets or email-triggered repeated approvals.
4. If any database step fails, the whole approval rolls back. Email delivery occurs after commit through the outbox.

### 6.4 Check-in

1. Authenticated owner selects an event and grants camera permission in the browser; manual search remains available if camera access is denied or unavailable.
2. Scanner submits the opaque ticket credential to the API.
3. API verifies event ownership, ticket existence, matching event, approved group, valid/unrevoked status, and unchecked-in status.
4. Within a transaction, lock the ticket and record one check-in. Return attendee name, event name, and a success result to the authorized operator.
5. Previously used, revoked, malformed, or cross-event credentials produce distinct operator-facing outcomes without exposing unrelated private information.

## 7. Security, privacy, and abuse prevention

- **Authentication:** Hash passwords with Argon2id (or a maintained equivalent). Use secure, HTTP-only, `SameSite` cookies for graduate sessions, CSRF protections for state-changing requests, session rotation on login/password change, and revocation on logout. Require email verification before event publication.
- **Authorization:** Every graduate resource query is scoped by authenticated `owner_id`; verify ownership in the API/service layer and, where practical, enforce additional row-level controls in the database. Test cross-account access explicitly.
- **Token handling:** Generate verification, reset, ticket, and ticket-access tokens with a cryptographically secure random generator. Store hashes, set purpose and expiration, make tokens single-use where appropriate, and compare safely. Keep ticket QR credentials separate from ticket-view credentials.
- **Guest privacy:** Public endpoints return event invitation data only. Keep guest contact data and attendance private. Avoid PII in logs, analytics, URLs, QR payloads, and error messages. Restrict manual search to event owners and rate-limit it.
- **Enumeration and abuse:** Use non-enumerating responses for login recovery, verification resend, and duplicate RSVP cases. Rate-limit authentication and public RSVP routes; apply request-size limits and bot controls if abuse is observed.
- **Uploads:** Restrict file sizes and formats, inspect actual content, use generated object keys, prevent executable content from being served, and avoid public access to unpublished assets.
- **Transport and secrets:** Enforce TLS, secure headers, least-privilege service credentials, secret-manager/environment injection, rotation, and separate environments. Never commit secrets.
- **Auditability:** Record actor and timestamp for approval, decline, attendee removal, ticket revocation, event state changes, and check-in. Keep audit records separate from mutable presentation data.
- **Deletion and retention:** Deletion requires explicit confirmation. Prefer archive for event history. Define retention and erasure policy for graduate and guest personal data before production; legal requirements depend on launch jurisdictions.

## 8. Email, storage, and background processing

### 8.1 Email

Use a provider adapter and versioned templates. The API inserts an outbox message in the same database transaction as the action that requires notification. The worker claims queued messages safely, sends them, records provider IDs/status, retries transient errors with bounded backoff, and marks permanent failures for review. Provider delivery webhooks must be authenticated and idempotent.

Include event context and appropriate links, but never include password-reset tokens in logs or analytics. Ticket links must be scoped, revocable, expiring access links; the QR credential remains independently validated by the check-in API. Provide an owner-visible way to retry failed important ticket emails.

### 8.2 Images

Store image bytes outside PostgreSQL and metadata/object keys in PostgreSQL. Use private buckets by default and explicitly publish only intended invitation/gallery assets. Apply image resizing/optimization and cache public derivatives. Remove or invalidate object access when an event or image is unpublished or deleted.

### 8.3 Operational resilience

Database commits must not depend on live email-provider availability. A provider outage leaves messages queued or failed and retryable. Monitor outbox age/failure rate, API error rates, database health, and ticket/check-in conflicts. Back up PostgreSQL and test restoration.

## 9. Frontend behavior and accessibility

- Separate public routes (`/events/:slug`, RSVP, ticket access) from authenticated graduate routes (dashboard, event setup, guest management, check-in, profile).
- Build event creation as a guided form with persisted draft state. Server validation remains authoritative; show field-level errors and preserve entered values after recoverable failures.
- Use explicit loading, empty, success, and error states for all required screens. Use confirmations for destructive or state-changing actions such as delete, archive, decline, and attendee removal.
- Make invitation, RSVP, ticket, and scanner screens responsive, prioritizing mobile guests and event-day operators. Do not require camera access to use manual check-in.
- Provide semantic headings, labels, keyboard-operable controls, visible focus, sufficient contrast, and accessible status/error announcements. Do not communicate status through color alone.
- Countdown uses the event's time zone and has a stable completed-event state after the event time; avoid client clock values as authority for RSVP deadline enforcement.
- Visual direction may use editorial typography and restrained celebratory styling, but design references are inspiration, not a mandate to reproduce third-party interfaces.

## 10. Non-functional requirements

| Area | Baseline |
|---|---|
| Performance | Optimize public event pages and images; paginate management views; avoid unbounded queries; measure API and page-load performance in staging. |
| Reliability | Persist RSVP, approval, ticket, and check-in state transactionally. Use constraints and idempotency to handle retries and concurrent scans. |
| Security | Enforce ownership and ticket validation on the server; protect credentials and guest PII; test authorization and token flows. |
| Compatibility | Support current Chrome, Safari, Edge, and Firefox; verify camera scanner on supported mobile browsers and keep manual fallback. |
| Accessibility | Keyboard access, labeled controls, contrast, readable type, screen-reader announcements, and accessible validation messages. |
| Observability | Structured logs with correlation IDs and redacted PII; track email failures, API errors, and operational health. |
| Scalability | Start with a modular monolith and indexed relational queries; scale API/worker instances independently only when measured need justifies it. |

## 11. Verification strategy

### 11.1 Automated tests

- **Unit:** Event state transitions, plus-one limit, attendance/no-attendee rule, duplicate matching, deadline calculation, ticket validity, and countdown boundaries.
- **Database/integration:** Ownership filtering, constraints, concurrent RSVP duplicate attempts, atomic approval/ticket issuance, revocation, and concurrent QR scans producing exactly one check-in.
- **API:** Validation and error contracts, anonymous/public boundary, event ownership, email outbox behavior, duplicate registration privacy, and ticket access token expiry.
- **End-to-end:** Graduate registration/verification/login; create and publish event; guest RSVP; graduate approves; guest receives and opens tickets; check-in succeeds once and second scan is reported as duplicate; manual lookup succeeds.
- **Security regression:** Cross-account event/guest access, guessed IDs/slugs, expired/replayed tokens, invalid/cross-event QR credentials, and rate limits.
- **Accessibility/responsive:** Keyboard navigation and automated accessibility checks on public RSVP, guest management, and check-in at mobile and desktop breakpoints.

### 11.2 Acceptance mapping

| PRD outcome | Verification evidence |
|---|---|
| Registration, verification, login, password recovery | Auth integration and end-to-end flows, including expired and replayed tokens. |
| Multiple events and unique URLs | Database uniqueness tests and event management end-to-end coverage. |
| Published invitation and countdown | Public route tests for published/unpublished states and event time-zone boundaries. |
| Guest RSVP and group-size limits | API tests for 0–3 additional guests, over-limit rejection, and no-attendance submissions. |
| Approval and notification | Transaction tests prove all-or-nothing approval/ticket creation; outbox tests verify notification enqueue and retry. |
| Individual secure QR tickets | One-ticket-per-attendee constraint, opaque token checks, and invalid/revoked/cross-event validation tests. |
| Single-use check-in and attendance stats | Concurrent scan test, duplicate outcome, manual method audit, and count reconciliation. |
| Gallery | Owner-only uploads and edits, publication filtering, public reads by event ID, download authorization, ZIP generation, image validation, ordering, and responsive/accessibility tests. |
| Email failures are logged and retryable | Simulated provider failure, bounded retry, failure visibility, and resend test. |

## 12. Delivery sequence

1. Establish monorepo, CI, configuration, migration, and deployment foundations.
2. Implement graduate identity/session flows and ownership-scoped event CRUD.
3. Add publishing, public invitation, RSVP validation, and email outbox.
4. Add guest review, group approval/decline, attendee/ticket issuance, and secure ticket delivery.
5. Add QR/manual check-in, attendance reporting, audit trail, and operational dashboards.
6. Deliver the gallery with owner-scoped image management and published-only public reads; harden accessibility, security, responsive behavior, backups, and release runbooks.

Each phase should preserve automated tests for the prior phase. Do not launch QR check-in until ticket validation and single-use behavior are server-side and covered by concurrency tests.

## 13. Decisions required before production

The defaults in §2.3 are sufficient to build the MVP baseline, but stakeholders should still confirm:

- Legal/data-retention obligations and supported launch jurisdictions.
- Whether a graduate can change event time/venue after guests have been approved, and which affected guests receive email.
- Whether a change to the plus-one limit requires blocking edits, warning the graduate, or explicitly reconciling existing groups.
- RSVP deletion and graduate-account deletion/retention behavior.
- Email provider, object-storage provider, supported upload limits, and production hosting region.
- Archive size and image-count limits for public ZIP downloads.
