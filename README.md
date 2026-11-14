# Gather frontend

Responsive React + TypeScript frontend for the graduation invitation and guest management platform.

## Run locally

```powershell
npm.cmd install
Copy-Item .env.example .env.local
npm.cmd run dev
```

Set `VITE_API_BASE_URL` in `.env.local` to the backend origin (for example `http://localhost:4000`). The Vite development server also uses that local origin when the variable is omitted.

## Included journeys

- Landing page and account screens.
- API-backed sign up, sign in, profile retrieval, protected dashboard, and event list/create/edit/publish/unpublish/soft-delete flows.
- Public invitation details loaded by the event slug.
- Graduate overview and six-step event create/edit flow.
- Saved light and dark themes, with a quick dashboard toggle and appearance settings.
- Public invitation, backend-backed guest RSVP submission with configurable plus-ones, and confirmation.
- Graduation memories gallery with multi-photo upload, preview, delete, reorder, per-photo publishing, accessible lightbox, individual downloads, and a published-photos ZIP download.
- Dashboard notifications are stored locally; they are not connected to backend RSVP or check-in activity.
- Organiser RSVP registration list and detail are loaded from the authenticated backend API; approval/rejection, demo tickets, and ticket links are not backed by organiser APIs.
- Camera QR scanning (HTTPS or localhost required by browsers) and manual check-in.
- Gallery preview, profile, and settings screens.

## Connected and not-yet-connected features

Authentication and event records are read from the backend API. The frontend stores the returned access token in `localStorage`; this allows browser reloads but makes the token accessible to JavaScript, so prevent cross-site scripting and consider an HttpOnly-cookie design for a higher-security deployment.

Public guest RSVP submission and confirmation, plus authenticated organiser RSVP listing and registration detail, are connected to the backend. The organiser RSVP views are read-only and paginated. Guest approval/rejection, ticket issuance/validation, check-in, server-backed notifications, gallery uploads/persistence, profile editing, and password recovery are not connected. Local screens and demo data for these workflows are not authoritative server records. Cover images are cached by event slug in the current browser and shown in the owner dashboard, but are not uploaded to server storage and are not available to guests on other devices. End times and gallery edits are also not saved by the current API.

The backend must be running with CORS configured for the frontend origin. See the backend project README for its local setup.

## Validate

```powershell
npm.cmd run build
```
