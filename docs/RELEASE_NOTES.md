# HySlides Release Notes

## Current Development Build

### Editor

- Added advanced slide backgrounds with solid colors, adjustable two-color gradients, proportionally fitted images (fill or fit), color overlays, and optional animated WebGL effects with static fallbacks.
- Consolidated Quiz into Multiple Choice with an optional “This question has correct answers” setting, and automatically migrates existing Quiz slides without losing their answer keys.
- Renamed the selected element's inner inspector heading to “Engagement type” to distinguish it from the element name.
- Holding Shift while dragging any resize handle now preserves the selection's aspect ratio.
- YouTube elements now expand to the full slide when playback begins by default, with an element-level checkbox to disable the behavior.
- Moved engagement type, prompt, options, and response settings exclusively to the selected Engagement element; the slide-level inspector now focuses on audience-access visibility.
- Added a safe YouTube Embed element with URL, volume, playback speed, start time, autoplay, loop, native-controls, positioning, resizing, and animation settings.
- Added an Ungroup toolbar control directly beside Group.
- Added toolbar Undo and Redo controls with standard keyboard shortcuts and a 100-state editing history.
- Added slide duplication to the left-panel slide menu and moved Delete to the bottom.
- Added an Elements tree with type-specific icons and double-click access to element Properties.
- Added automatic text-box height for wrapped text.
- Added dynamic fit-to-width editor zoom.
- Standardized toolbar icons and eased blue hover states.
- Removed PowerPoint export.
- Kept organizational slide titles out of the rendered slide footer; optional footers now show only the slide number.
- Reorganized the left rail into dedicated Slides and Templates tabs, with explicit “Add to deck” actions for every template.
- Added ready-to-edit templates for Poll, Multiple Choice, Word Cloud, Q&A, and Reactions engagement slides.
- Streamlined Poll and Multiple Choice setup into one inline option list with editing, removal, adding, and optional correct-answer selection in the same rows.
- Capped choice-based engagement slides at 10 options and made their on-slide question elements expand and compact their rows so every option remains visible.

### Design System

- Added a dedicated HySlides favicon based on the dark-square “H” brand mark, with a teal live-status accent.
- Upgraded saved swatches to named, linked deck color styles.
- Style edits update linked elements throughout a deck.
- Deleting or unlinking a style preserves element appearance.

### Animation

- Added Appear and Fade In element effects.
- Added slide-start, click, and after-previous triggers.
- Added delay, duration, easing, ordering, editor preview, and presenter playback.

### Live Sessions

- Replaced the one-click End Session confirmation with a default-checked action checklist for ending, clearing the live display, starting a new session instance, and returning to slide 1; presenters can resume without making changes.
- Added QR and six-digit access-code joining.
- Added session instances with default deck/date/time names.
- Added session history, participant presence, response ratios, and 14-day retention.
- Added word-cloud aggregation and basic offensive-language filtering.
- Bound engagement result elements to canonical live-session totals so polls update in real time and clear immediately in Presenter and Presentation Views.
- Removed template sample responses; engagement visuals now open at zero and reset automatically for each new session.
- Added creator-configurable poll selection limits, defaulting to one response per participant, with selected choices locked on participant devices.
- Changed the Participant View header to the presentation deck name.

### Presenter View v1

- Word Cloud engagement elements now use a true weighted cloud layout: repeated words and phrases grow larger and results are arranged around the center instead of appearing as a line of tags.
- Separated the private Presenter View from the clean projected Presentation View.
- Added responsive desktop/mobile layouts, speaker notes, current and next end-state previews, elapsed timer, live participant/response counts, and session controls.
- Added a session-only presentation-flow filmstrip. Slides can be unchecked to skip them, visibly gray out, and be restored without changing the saved deck.
- Added direct slide jumping, animation-aware next navigation, and a black-screen safety control.
- Added real YouTube playback in Presentation View while keeping Editor and private Presenter previews silent and non-playing.

### Countdown Timers

- Added a customizable Countdown slide element with duration, typography, color, background, alignment, completion message, auto-start, and optional auto-advance settings.
- Added Presenter View controls for Start, Pause, Reset, and adding one minute.
- Synchronized active countdowns with Presentation View and Participant View without overwriting the deck’s configured starting duration.

### Live Q&A Moderation

- Added persistent, hidden-by-default Q&A submissions with stable question IDs.
- Added Presenter View moderation actions: Display, Hide, Mark answered/unanswered, and Delete.
- Added participant upvoting with one vote per device and private filtering of unapproved questions.
- Included questions, votes, and moderation status in session history and 14-day cleanup.
- Made Q&A session-wide so participants can ask at any point, with Unanswered and Answered Presenter View tabs.

### Presenter View Layout

- Removed the redundant next-slide preview and enlarged the current slide.
- Moved speaker notes above a compact Live Session panel and removed duplicate QR/link controls.
- Added a one-click timer insertion action for unplanned breaks.
- Stabilized the countdown control card so timer actions no longer shift or jump the right panel.
- Grouped Previous and Next together on the bottom-right.
- Added projected live response and connected-participant counts.
- Synchronized live Editor View changes into Presenter and Presentation Views while preserving active-session responses.

### Participant View Layout

- Stabilized word-cloud and Q&A text entry by avoiding unchanged polling rerenders, preserving drafts, and deferring visible refreshes while a participant is actively typing.
- Kept word-cloud phrases intact, allowed distinct submissions from the same participant, and limited the empty-state helper text to Editor View previews.
- Removed automatic right/wrong feedback cards; correct answers now appear only after the presenter explicitly selects Display correct answers.
- Converted QR/access-code entry into a standalone full-page Participant View with no Editor View behind it and no Close action.
- Removed presentation-only and generic connected-status messages.
- Replaced the always-open Q&A form with a floating bottom-right question launcher.

### Terminology

- Established Editor View, Presentation View, Participant View, and Presenter View as the canonical product names.
- Added view-specific browser-tab titles that include the presentation deck name.
