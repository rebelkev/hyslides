# HySlides

HySlides is a web-based presentation editor focused on slide design fidelity first, with optional audience engagement modules layered around the deck workflow.

## Documentation

- [Documentation index](docs/README.md)
- [Product guide](docs/PRODUCT_GUIDE.md)
- [Technical handoff](docs/TECHNICAL_HANDOFF.md)
- [Roadmap](docs/ROADMAP.md)
- [Release notes](docs/RELEASE_NOTES.md)

These documents are maintained alongside product changes and are the preferred handoff reference.

## Run Locally

The editor can run as a static browser app for slide design and local audience previews.

```powershell
powershell -ExecutionPolicy Bypass -File .\tools\serve.ps1 -Port 4173
```

Then open `http://127.0.0.1:4173/`.

Browser tests live at `http://127.0.0.1:4173/tests/browser-tests.html`.

Phone-based live participation needs the app to be hosted or opened from a network-reachable URL. `127.0.0.1` only works on the presenter's computer.

## What Is Included

- Canvas-based slide editor with drag, resize, snap-to-grid, alignment guides, duplicate, grouping, lock/unlock, layer ordering, zoom, and keyboard shortcuts.
- Slide elements for text, images, shapes, icons, charts, tables, and dividers.
- Left slide navigator, center canvas, top toolbar, and right properties inspector.
- Theme controls for colors, fonts, background, spacing-oriented master defaults, and presenter notes.
- PPTX import pipeline that reads basic PowerPoint slide XML into an editable internal model.
- PDF export pipeline that renders each slide through the canvas renderer into a multipage PDF.
- Presentation View with full-screen slide playback and element animations.
- Participant View with QR and six-digit-code joining for polls, multiple choice, word cloud, Q&A, quiz, and reactions.
- Hosted live sessions backed by Cloudflare D1 so participant responses update presentation controls.
- IndexedDB persistence for saved decks.
- Seed deck and reusable slide templates.

## Architecture

The app keeps document data separate from rendering and runtime behavior:

- `src/schema.js` defines decks, slides, elements, themes, interactions, seed decks, templates, and normalization.
- `src/renderer.js` renders the same slide model to the editor canvas, thumbnails, presenter mode, and exports.
- `src/pptx.js` handles PowerPoint ZIP/XML import.
- `src/pdf.js` renders slides into a PDF.
- `src/storage.js` persists decks in IndexedDB.
- `src/engagement.js` manages optional live interaction state and UI.
- `src/live.js` builds audience links, QR codes, and client calls for hosted live sessions.
- `src/app.js` coordinates editor state, keyboard shortcuts, panels, and modes.
- `worker/index.ts` exposes `/api/live/:code` routes for presenter publishing and audience responses.

The schema includes element animation settings and a placeholder for slide transitions. Element IDs, group IDs, normalized document structures, and isolated rendering leave room for richer timelines and multi-user collaboration later.

## PowerPoint Support

Implemented first:

- Basic text boxes
- Basic shapes
- Images
- Slide backgrounds where available
- Simple chart references as editable chart previews

Clearly marked as later-phase support:

- Complex master slides and layouts
- SmartArt
- Embedded audio/video
- Advanced native charts and workbook data
- Comments
- Native PowerPoint animation timing
- Transition import/export
- Precise typography parity for every PowerPoint feature

When unsupported features are detected on import or export, HySlides adds them to the inspector so the limitation is visible.

## Tests

Open `tests/browser-tests.html` through the local server. The tests cover:

- Slide rendering producing visible canvas output
- PDF export producing a substantive PDF blob
- PPTX import into editable slides

## Live Engagement

Starting a presentation creates a named session instance for the deck’s access code. Participants scan the QR code or enter the six-digit code and submit responses to the current interactive slide. Results and participant presence are synchronized through Cloudflare D1.

For local static use, the QR code still appears, but phones cannot reach a `127.0.0.1` link on the presenter's computer. Use a hosted HySlides URL or a LAN-accessible URL for real phone participation.

Ended sessions and their participant/response records are retained for 14 days. See the technical handoff for storage and API details.

## Production Notes

The current app uses IndexedDB for deck authoring and Cloudflare D1 for hosted live sessions. A future account-enabled version should replace `src/storage.js` with a server-backed persistence adapter and store uploaded deck/media blobs in object storage. The document schema is intentionally independent from the storage implementation.
