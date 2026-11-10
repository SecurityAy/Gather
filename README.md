# Gather frontend

Responsive React + TypeScript frontend for the graduation invitation and guest management platform.

## Run locally

```powershell
npm.cmd install
npm.cmd run dev
```

Create a demo graduate session from **Sign in** or **Get started** using any valid email and a password of at least eight characters. The demo seeds an example event and guest list so the dashboard and check-in flows are immediately explorable.

## Included journeys

- Landing page and account screens.
- Graduate overview, event list, and six-step event create/edit flow.
- Saved light and dark themes, with a quick dashboard toggle and appearance settings.
- Public invitation, RSVP with configurable plus-ones, and confirmation.
- Graduation memories gallery with multi-photo upload, preview, delete, reorder, per-photo publishing, accessible lightbox, individual downloads, and a published-photos ZIP download.
- Persisted dashboard notifications for new RSVPs and successful guest check-ins.
- Guest approval/decline, guest details, individual demo tickets, and ticket links.
- Camera QR scanning (HTTPS or localhost required by browsers) and manual check-in.
- Gallery preview, profile, and settings screens.

## Demo-mode boundary

There is no backend in this workspace yet. Authentication, events, RSVPs, tickets, approvals, check-ins, and uploaded gallery images are simulated in the browser and persisted in `localStorage`; they are not production security or authoritative records and are not shared across browsers. The public gallery reads only published photos for a published event and does not require login or RSVP approval in the demo. Production uploads, cross-device public access, and secure image URLs require the authenticated object-storage/API integration described in [TECHNICAL-SPECIFICATION.md](./TECHNICAL-SPECIFICATION.md); do not use browser storage for real guest or graduate data. Demo QR credentials are random opaque values and the UI explicitly marks tickets as previews. Camera and manual check-in update only local demo data.

Connect the frontend to the API and server-side authorization, ticket validation, transactional email, and object storage described in [TECHNICAL-SPECIFICATION.md](./TECHNICAL-SPECIFICATION.md) before using real accounts or events.

## Validate

```powershell
npm.cmd run build
```
