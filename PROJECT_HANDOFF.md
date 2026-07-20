# HySlides Project Handoff

HySlides is a web-based PowerPoint-style slide editor with optional live audience engagement.

## Current Hosting Goal

Move this project into a ChatGPT/Codex account that has Sites hosting enabled, then publish it publicly with Sites.

After Sites deployment, update `PUBLIC_APP_BASE_URL` in `src/live.js` to the final Sites URL so presenter QR codes send participants to the hosted app.

## Current Public URL Used By QR Links

`https://hyslides.kevyn-levine.workers.dev/`

## Current Supabase Live Backend

Project URL:

`https://cgdlbwodcacxdkmznvtw.supabase.co`

Publishable browser key:

`sb_publishable_oPaIppVoeV_MFsPq4fuzxA_0Y2285U-`

This is a publishable key, not a secret service-role key.

## Live Data Tables

Run `supabase-live.sql` once in the Supabase SQL editor if the tables do not already exist.

- `hyslides_live_sessions` stores the current live presentation slide/session.
- `hyslides_live_responses` stores audience answers, word cloud entries, Q&A, and reactions.

## Important Files

- `index.html`: static app shell
- `styles.css`: app styling
- `src/app.js`: editor, presenter mode, audience mode, and UI orchestration
- `src/live.js`: Supabase live sync, QR links, and audience response calls
- `src/engagement.js`: poll, multiple choice, quiz, word cloud, Q&A, and reactions
- `src/pptx.js`: PowerPoint import/export
- `src/pdf.js`: PDF export
- `src/schema.js`: deck, slide, element, theme, and interaction model
- `src/renderer.js`: slide rendering
- `supabase-live.sql`: live backend setup
- `.openai/hosting.json`: Sites hosting metadata
- `dist/`: current packaged static/worker output from the previous deployment attempt

## Quick Test

Open the deployed app, start presenter mode, scan the QR code with a phone, answer a multiple choice or word cloud slide, and confirm the presenter view updates.
