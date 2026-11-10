# Gather Frontend/Backend Integration Status

## Verified locally

- Frontend production build (`npm run build`) passed.
- Backend TypeScript build (`npm run build`) passed.
- Registration, login, duplicate-email handling, invalid credentials, profile retrieval after reload, and unauthenticated dashboard redirection were exercised in the browser.
- Event draft creation, event listing, editing, publishing, public invitation lookup, unpublishing, and soft deletion were exercised against the backend.
- Public lookup of an unpublished event showed the expected not-found behavior.
- API errors were displayed in the existing UI.
- Event time conversion was checked for `America/New_York`; 6:30 PM on January 15, 2027 was sent as `2027-01-15T23:30:00.000Z`.
- CORS preflight allowed the configured local frontend origin and withheld permission for an unlisted origin.
- Temporary test accounts and events were removed and their absence verified.

These are local integration checks, not a full automated regression suite or a production deployment test.

## Not connected in this integration

- Guest RSVP submission and organiser RSVP management.
- QR ticket issuance, ticket validation, and attendee check-in.
- Persistent photo gallery management and image uploads.
- Email verification, password recovery, and profile editing.
- Event end-time persistence; the backend event model/API does not provide an end-time field.

The existing screens for these workflows remain outside the connected API flow. Their presence in the frontend does not mean the backend persists or processes those actions.

## Production deployment requirements

- Configure `VITE_API_BASE_URL` in the Vercel project to the public base URL of the deployed backend API. The frontend only falls back to `http://localhost:4000` during local development.
- Deploy the backend separately with its required `DATABASE_URL` and `JWT_SECRET` settings.
- Set backend `CORS_ORIGINS` to the exact production frontend origin (and any intentionally supported preview origins).
- Validate login, profile retrieval, event management, and public invitation lookup against the deployed services after deployment.

No production endpoint or production browser flow was verified as part of these integration checks.
