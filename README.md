# HySlides

HySlides is a web-based presentation editor focused on slide design fidelity first, with optional audience engagement modules layered around the deck workflow.

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
- PPTX export pipeline that writes edited decks back to a PowerPoint package.
- PDF export pipeline that renders each slide through the canvas renderer into a multipage PDF.
- Presenter mode with speaker notes, next slide preview, and live interaction controls.
- Audience mode with QR join links for polls, multiple choice, word cloud, Q&A, quiz, and reactions.
- Hosted live sessions backed by Supabase or D1 so phone responses can update presenter results.
- IndexedDB persistence for saved decks.
- Seed deck and reusable slide templates.

## Architecture

The app keeps document data separate from rendering and runtime behavior:

- `src/schema.js` defines decks, slides, elements, themes, interactions, seed decks, templates, and normalization.
- `src/renderer.js` renders the same slide model to the editor canvas, thumbnails, presenter mode, and exports.
- `src/pptx.js` handles PowerPoint ZIP/XML import and PowerPoint package export.
- `src/pdf.js` renders slides into a PDF.
- `src/storage.js` persists decks in IndexedDB.
- `src/engagement.js` manages optional live interaction state and UI.
- `src/live.js` builds audience links, QR codes, and client calls for hosted live sessions.
- `src/app.js` coordinates editor state, keyboard shortcuts, panels, and modes.
- `worker/index.ts` exposes `/api/live/:code` routes for presenter publishing and audience responses.

The schema includes placeholders for slide transitions and animations so richer timeline support can be added later without reshaping the deck model. Element IDs, group IDs, normalized document structures, and isolated rendering also leave room for multi-user collaboration later.

## PowerPoint Support

Implemented first:

- Basic text boxes
- Basic shapes
- Images
- Slide backgrounds where available
- Simple chart references as editable chart previews
- Export of text, shapes, dividers, images, chart previews, and table previews

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
- PPTX export followed by PPTX import into editable slides

## Live Engagement

Presenter mode starts a live session for the current audience code and displays a QR code in the right presenter panel. Participants scan the code, open the audience route on their phone, and submit responses to the current interactive slide. Results are polled back into presenter mode automatically.

For local static use, the QR code still appears, but phones cannot reach a `127.0.0.1` link on the presenter's computer. Use a hosted HySlides URL or a LAN-accessible URL for real phone participation.

### Supabase live backend

HySlides can store live presentation state and audience responses in Supabase. Run `supabase-live.sql` once in the Supabase SQL editor, then use a hosted HySlides URL so participants can open the audience link from their phones.

The browser app uses the Supabase project URL and publishable key in `src/live.js`. The publishable key is safe for browser use, but the setup script intentionally allows anonymous presenter/audience access for a prototype. Before using this with sensitive or large events, tighten access through authenticated presenter sessions, an Edge Function, or a server-owned key.

## Production Notes

The current scaffold uses IndexedDB for deck authoring so it works immediately as a static web app. Hosted live engagement can use Supabase from the browser or D1 through the Sites Worker. A production version should replace `src/storage.js` with a server-backed persistence adapter and store uploaded deck/media blobs in object storage. The document schema is intentionally independent from the storage implementation.
