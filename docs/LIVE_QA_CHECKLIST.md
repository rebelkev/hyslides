# Live Presentation QA Checklist

Use this checklist to decide whether the live-presentation foundation is ready for the next milestone. Run it against the deployed Cloudflare version, not only a local preview.

## Release Gate

Step 1 is complete when:

- The automated test suite and production build pass.
- Two consecutive full manual test runs pass without resetting or repairing data between steps.
- There are no unresolved critical or high-priority defects.
- Cloudflare logs show no unexpected `500` responses during either test run.
- The test passes on desktop and at least one real mobile device connected through a different network when possible.

## Test Setup

- Open the Editor, Presenter, and Presentation Views in separate tabs.
- Join the Participant View from a real phone using both the QR code and six-digit access code.
- Keep a second Participant View open on a desktop or tablet.
- Start a newly named session and confirm all devices show the same active slide.

## Core Presentation Flow

- Present opens a new Presenter tab.
- Presentation View opens independently and fills its viewport.
- Next and Previous reliably update Presentation and Participant Views.
- Skipped slides are omitted and can be restored during the session.
- Speaker notes remain private to Presenter View.
- Editor changes made during a session reach Presenter and Presentation Views without losing session state.
- Black Screen reaches both Presentation and Participant Views and restores the current slide afterward.
- A timer can be added, started, paused, reset, and synchronized on every public display.
- Ending a session preserves its history and correctly applies the selected end-session options.

## Connection and Recovery

- The live indicator remains stable instead of alternating between Connecting and Not Live.
- Connected participant counts rise and fall within the expected presence timeout.
- The response count shows `responses/connected participants` on engagement slides.
- Refreshing Presenter, Presentation, or Participant View reconnects to the same active session.
- Reconnect / Go live restores publishing after an interrupted connection.
- A participant joining an ended session sees the ended state; starting a new session lets that participant rejoin successfully.

## Engagement Types

For every engagement type, verify that clearing responses resets Presenter, Presentation, and Participant Views.

### Poll

- Options and the allowed-selection limit match the Editor configuration.
- A submitted choice remains selected and cannot exceed the configured limit.
- Counts and bars update live on the slide.

### Multiple Choice

- Correct answers remain hidden until the presenter displays them.
- Participant View never reveals correctness immediately after submission.
- The presenter-controlled reveal updates public views.

### Word Cloud

- Text entry remains focused and usable on a real phone.
- Submissions appear live, preserve the first submitted capitalization, and group case-insensitively.
- Repeated words or phrases are visibly larger than single submissions.
- Blocked language is rejected without adding it to results.

### Emoji Reactions

- Only the configured emojis appear, with a maximum of five.
- Each reaction updates the correct emoji count live.

## Session-wide Q&A

- A participant can submit a question from any slide.
- Pending questions are visible only in Presenter View.
- Display shows only the approved question over the current Presentation and Participant Views.
- Hide removes the question everywhere without deleting it.
- Mark answered moves it to the answered list and removes it from public display.
- Delete removes it from the moderation queue and public display.

## Media and Visual Fidelity

- Background colors, images, gradients, overlays, animated effects, and logos match across all views.
- YouTube video plays only in Presentation View and remains a silent placeholder in Participant View.
- Presenter View receives useful video playback visibility or state.
- Slide frames have no unintended rounded corners, clipping, or overflow.
- Participant controls have comfortable margins and remain usable across phone orientations.

## Session Records

- The session name defaults to deck name plus date and time.
- Responses, questions, participant counts, and slide identifiers appear in session history.
- Starting another session does not overwrite the previous session's records.
- Exported or raw session data matches the visible results.
