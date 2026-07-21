# HySlides Technical Handoff

## Runtime and Hosting

HySlides is deployed as a Cloudflare Worker built with Vinext/Vite and connected to the GitHub `main` branch. Cloudflare D1 is bound as `DB` and stores live session state and responses. The current Worker URL is:

`https://hyslides.kevin-639.workers.dev`

The root redirects to `/hyslides/index.html`.

## Local Development

Requirements: Node.js 22.13 or newer.

```bash
npm install
npm run dev
npm test
npm run build
```

Do not run forced dependency upgrades merely to clear audit warnings; validate compatibility before changing the Vinext, Vite, or Cloudflare toolchain.

## Important Files

- `index.html` — application shell and overlays
- `styles.css` — editor, presentation, participant, and responsive styling
- `src/app.js` — UI orchestration and view state
- `src/schema.js` — normalized deck, slide, element, theme, color-style, and animation model
- `src/renderer.js` — shared canvas renderer
- `src/storage.js` — device-local IndexedDB deck storage
- `src/live.js` — live API client, access codes, session state, and QR links
- `src/engagement.js` — engagement configuration and participant/result UI
- `src/moderation.js` — basic offensive-language filtering
- `src/pptx.js` — PowerPoint import
- `src/pdf.js` — PDF export
- `worker/index.ts` — Worker routes, D1 schema bootstrap, authorization, retention, and live APIs
- `db/schema.ts` — Drizzle representation of D1 tables
- `drizzle/` — generated database migrations
- `.openai/hosting.json` — logical hosting bindings

## Persistence Boundaries

### Decks

Decks are currently saved in the author’s browser with IndexedDB. They are not yet tied to an account and do not automatically follow a user to another device.

### Live Sessions

D1 stores session instances, current slide state, slide snapshots, aggregate counts, individual submissions, participant presence, metadata, questions, and presenter tokens. The active tables use the `hyslides_live_instance_*` naming family.

Presenter tokens are browser-held credentials used to authorize management of a deck’s session history. They are not user accounts.

### Retention

Ended sessions older than 14 days are purged with their participant records, submissions, counts, questions, slide snapshots, metadata, and active-state records. Manual session deletion removes the same associated data immediately.

## Live API Surface

- `GET /api/live/:code` — current participant-facing session state
- `PUT /api/live/:code` — publish presenter state
- `POST /api/live/:code/responses` — submit a response
- `POST /api/live/:code/presence` — participant heartbeat
- `POST /api/live/:code/control` — session control actions
- `GET /api/sessions?deckId=...` — session history for a deck
- `GET /api/sessions/:instanceId` — session details
- `PATCH /api/sessions/:instanceId` — rename a session
- `DELETE /api/sessions/:instanceId` — delete a session and associated records

## Document Compatibility

All saved decks pass through normalization. New fields must be given safe defaults so older decks continue opening. Current examples include:

- `element.animation`
- `element.brandColorStyleId`
- `theme.brandColorStyles`
- session and engagement defaults

When cloning a slide, generate new slide, element, and group identities. Do not copy session results into the duplicate.

## Testing Expectations

Before publishing a change:

1. Run the automated tests.
2. Run the production build.
3. Add tests for schema migrations, persistence compatibility, moderation, and pure rendering calculations where practical.
4. For live-session changes, test presenter-to-participant synchronization with two devices or browser contexts.
5. For view changes, verify desktop and narrow responsive layouts.

## Security and Privacy Notes

- Never place a Cloudflare API token, D1 credential, Supabase service-role key, or password in browser code or the repository.
- Participant identifiers are anonymous device identifiers used for presence and duplicate-response prevention.
- Basic word filtering is not a complete moderation or abuse-prevention system.
- Authentication should be added before decks, admin functions, billing, or sensitive analytics become server-backed.

## Next Architectural Milestone

Separate the four canonical views cleanly, then build Presenter View Desktop and Mobile. Presenter View should control Presentation View while Participant View follows the same live active-slide state.
