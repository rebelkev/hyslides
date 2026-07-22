# HySlides Release Notes

## Current Development Build

### Editor

- Fixed live word clouds so the engagement element receives current D1 totals, repeated phrases render at clearly different sizes, and case-insensitive matches preserve the capitalization of the first submitted response.
- Changed the Add Slide button to create a blank slide instead of automatically inserting the two-column template. New blank slides still inherit the deck's default background and logo settings.
- Prevented oversized embedded slide and background images from blocking live sessions by generating compact live-only image copies before storing the current slide in D1.
- Replaced manual animation order numbers with an Animations panel that groups effects by trigger, supports drag-and-drop and accessible move controls, selects the matching canvas element, and previews or restarts the complete slide sequence.
- Added a Presenter View **Reconnect / Go live** action that retries the current session without clearing responses or replacing its saved session instance.
- Stabilized Presenter View live-session status: brief polling failures no longer force an immediate disconnect, failed retries use backoff, and “Not Live” appears only after repeated confirmed failures.
- Improved PowerPoint import fidelity by extracting theme fonts and colors, creating matching global styles, linking consistent placeholder text, preserving one-off formatting as custom, and reporting possible font substitutions plus unsupported features.
- Moved Global Settings typography and default-background colors into a shared modal picker with a hex-first workflow, full visual color control, and named global swatches.
- Added protected deck-logo branding with global upload, default corner, visibility, and size controls plus per-slide corner and visibility overrides.
- Reorganized Global Deck Settings into collapsible Audience access, Color styles, Default background, and Typography sections; global color controls now use hex values and expose the deck’s named swatches.
- Added a deck-wide default solid or gradient background for newly created blank slides without changing existing or template slides.
- Improved the emoji picker’s Add control with a clear button treatment, hover/open feedback, a chevron, and automatic scrolling to the expanded picker.
- Made Global Deck Settings independently scrollable with a fixed, readable header so every typography style remains accessible at any viewport height.
- Reaction slides now render emojis instead of text labels. Editors can build a removable list of up to five choices using an expanded picker or any emoji entered from their device’s full emoji keyboard.
- Kept YouTube elements as static placeholders in Participant View so audience phones never start duplicate playback or audio; the projected Presentation View remains the sole playback surface.
- Added Global Deck Settings with reusable Display, Slide title, Subtitle, Heading, Body, and Caption typography styles plus audience access. Text elements can remain globally linked or switch to custom font formatting; legacy text preserves its existing appearance.
- Added a one-click Copy button beside the Audience Join URL in slide properties, with clipboard confirmation and a selection fallback.
- Limited the background inspector to one open color picker at a time, automatically closing the previous picker when another is opened.
- Kept right-column color-picker menus inside the inspector viewport instead of opening beyond the screen edge.
- Moved named global color swatches into expandable background color pickers so gradient, animated-effect, overlay, and solid-color controls stay compact.
- Hid the inactive slide Layout metadata field until true layout switching is available; saved layout metadata remains intact.
- Added advanced slide backgrounds with solid colors, adjustable two-color gradients, proportionally fitted images (fill or fit), and a dedicated Animated Effect style with six effects, dedicated effect colors, and static fallbacks. Color overlays now apply consistently on top of every background style.
- Corrected animated-background frame compositing so the Intensity control now ranges visibly from transparent/subtle to vivid without accumulating to full strength.
- Simplified animated-background Intensity to a compact 0–100 percentage field beside Speed.
- Made background overlays explicitly optional with an enable checkbox, and made 100% animated intensity render the chosen effect colors at full strength.
- Added the deck’s linked global color swatches beneath every background color picker, including solid, gradient, animated-effect, and overlay colors.
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
- Added ready-to-edit templates for Poll, Multiple Choice, Word Cloud, and Reactions engagement slides.
- Streamlined Poll and Multiple Choice setup into one inline option list with editing, removal, adding, and optional correct-answer selection in the same rows.
- Capped choice-based engagement slides at 10 options and made their on-slide question elements expand and compact their rows so every option remains visible.

### Design System

- Added a dedicated HySlides favicon based on the dark-square “H” brand mark, with a teal live-status accent.
- Upgraded saved swatches to named, linked deck color styles.
- Style edits update linked elements throughout a deck.
- Deleting or unlinking a style preserves element appearance.

### Animation

- Added Appear and Fade In element effects.
- Added slide-start, click, with-previous, and after-previous triggers.
- With Previous starts alongside the preceding animation while honoring its own delay, duration, and easing.
- Added delay, duration, easing, ordering, editor preview, and presenter playback.

### Live Sessions

- Fixed ended session instances so reopening Presenter View reactivates them on the server, and replaced the ambiguous connectivity label with prominent server-confirmed LIVE, CONNECTING, PAUSED, ENDED, and NOT LIVE badges.
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

- Made Black Screen reach the projected Presentation View through both the shared presenter channel and a direct tab-to-tab fallback, while the private Presenter View remains visible as a confidence monitor.
- Synchronized YouTube play, pause, restart, and playback position through the live session so remote Participant Views display the playing video instead of a static placeholder. Participant video is muted to avoid room echo and satisfy mobile autoplay rules.
- Added a muted, synchronized YouTube monitor directly on the Presenter View slide preview, plus Play/Pause and Restart controls that operate the projected Presentation View player.
- Kept Presenter View slide rendering aligned with Presentation View so solid, gradient, image, and animated slide backgrounds remain visible behind presenter-monitored media.
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

- Changed Participant View Q&A to a private, submission-only workflow with no public question list.
- Made Display place exactly one selected question in a synchronized overlay over the current Presentation View slide.
- Removed the dedicated Q&A engagement type and template. Live Q&A remains available throughout every session from Participant View and Presenter View.
- Made Hide, Mark answered, and Delete remove the on-screen question immediately.
- Improved Participant View Q&A with a mobile bottom sheet, a multi-line question field, and a clear separation between private submissions and presenter-approved displayed questions.

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

- Removed the duplicate post-response results panel because live totals already update inside the displayed slide.
- Stabilized word-cloud and Q&A text entry by avoiding unchanged polling rerenders, preserving drafts, and deferring visible refreshes while a participant is actively typing.
- Kept word-cloud phrases intact, allowed distinct submissions from the same participant, and limited the empty-state helper text to Editor View previews.
- Removed automatic right/wrong feedback cards; correct answers now appear only after the presenter explicitly selects Display correct answers.
- Converted QR/access-code entry into a standalone full-page Participant View with no Editor View behind it and no Close action.
- Removed presentation-only and generic connected-status messages.
- Replaced the always-open Q&A form with a floating bottom-right question launcher.

### Terminology

- Established Editor View, Presentation View, Participant View, and Presenter View as the canonical product names.
- Added view-specific browser-tab titles that include the presentation deck name.
