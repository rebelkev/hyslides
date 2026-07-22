# HySlides Product Guide

## What HySlides Is

HySlides is a browser-based presentation editor with optional live audience participation. A deck can be presented like a traditional slide show or run as a live session where participants follow along, answer engagement slides, and view aggregated results.

## The Four Views

### Editor View

The authoring workspace for creating and editing decks. It contains the slide navigator on the left, the slide canvas in the center, and Properties, Elements, and Animations panels on the right. The Animations panel groups effects by trigger, supports drag-and-drop sequencing, links each row to its canvas element, and previews or restarts the complete slide sequence.

### Presentation View

The clean, full-screen slide show displayed to the room or shared during a video call. It contains no private presenter notes or controls.

### Participant View

The standalone phone, tablet, or computer webpage opened using a deck’s QR code or six-digit access code. It fills the browser without exposing Editor View or an overlay Close button. Participants follow the active slide, submit responses on engagement slides, and see aggregated results after responding. Presentation-only slides display without unnecessary status copy. YouTube elements remain static placeholders on participant devices; video playback and audio occur only in the room’s Presentation View.

### Presenter View

- If live sync is unavailable, **Reconnect / Go live** republishes the current session without clearing responses or creating a new session instance.
- Live publishing automatically creates compact presentation copies of oversized embedded images and backgrounds so original editor assets remain untouched while the session stays within Cloudflare D1 limits.

The private presentation control interface, available in responsive Desktop and Mobile layouts. It contains end-state current/next slide previews, speaker notes, navigation, an elapsed timer, live participant and response counts, engagement controls, and session controls.

Click **Present** in Editor View to open Presenter View in a new tab. Then select **Open Presentation View** to open the clean projected slide show in another tab.

### Controlling Presentation Flow

- Every slide appears in the Presenter View filmstrip with an include checkbox.
- Uncheck a slide to gray it out and skip it during Previous/Next navigation.
- Recheck it at any time to restore it to the flow.
- Skip choices apply only to the current presentation session and do not modify the saved deck.
- Filmstrip, current-slide, and next-slide previews always show every element in its completed end state, even when the projected slide contains animations.
- Clicking an included filmstrip slide jumps directly to it.
- **Black screen** temporarily hides the projected Presentation View without ending the session.
- **Reset timer** restarts the private elapsed-time clock.
- Participant and response totals update in the Presenter View header; engagement slides use a response ratio such as `13/25`.

## Creating and Managing Slides

- Add slides or sections from the top of the left slide panel.
- Select one slide normally; use Shift for a range or Command/Ctrl for multiple slides.
- Drag selected slides to reorder them.
- Open a slide’s three-dot menu to duplicate, move, rename, or delete it.
- Duplicated slides appear immediately after the originals and receive independent slide and element identities.
- Slide deletion is available only from the left slide panel.

## Undo and Redo

Use the Undo and Redo buttons in the Editor View toolbar to move backward or forward through deck changes. HySlides retains up to 100 recent edit states and groups rapid changes in the same field into a single useful undo step.

Keyboard shortcuts:

- Undo: `Command+Z` on macOS or `Ctrl+Z` on Windows
- Redo: `Command+Shift+Z` on macOS or `Ctrl+Shift+Z` on Windows
- `Ctrl+Y` is also supported for Redo

Opening another deck or importing a PowerPoint starts a new history for that deck. Undo history is maintained for the current editing session and is not restored after closing the browser.

## Editing Elements

HySlides supports text, shapes, images, icons, charts, tables, dividers, and engagement elements.

- Drag and resize elements on the canvas.
- Use the adjacent Group and Ungroup controls in the element toolbar, along with locking, alignment, centering, and layer-order controls.
- Open the Elements panel to see the slide’s element tree. Items at the top appear in front.
- Single-click a tree item to select it. Double-click it to open its Properties.
- Text boxes automatically fit their height to wrapped text unless automatic height is disabled.

## Color Styles

Color styles are saved per deck.

- Create, rename, recolor, or delete styles under **Global Deck Settings → Color styles**.
- Color controls use six-digit hex values and include every named global color style in their picker.
- Global Settings color controls open a shared modal picker, keeping typography and background cards compact while showing the hex value, visual picker, and named swatches together.
- Applying a style links the element to that style.
- Recoloring the style updates all linked elements throughout the deck.
- Use **Unlink color style** when an element needs a one-off color.
- Deleting a style preserves the current appearance of linked elements and converts them to fixed colors.
- Older saved swatches are automatically migrated to named styles.

## Typography Styles

Open **Global Deck Settings** from the Editor toolbar to manage Display, Slide title, Subtitle, Heading, Body, and Caption/label styles. Each style controls font family, size, weight, line height, and color across the deck. The Audience access, Color styles, Default background, and Typography sections can be expanded independently.

The Default background section defines the solid color or gradient used when a new blank slide is created. It does not overwrite existing or template slide backgrounds.

## Deck Logo

Open **Global Deck Settings → Brand logo** to upload a PNG, JPEG, WebP, or SVG logo. Choose its default corner and display width; new and existing slides inherit the deck setting and show the logo by default. In an individual slide’s Properties, the logo can be hidden, moved to another corner, or reset to the deck defaults. The logo is protected deck branding rather than a deletable slide element.

When a text element is selected, choose its **Typography style** in Properties. Keep **Use global style** enabled so future global changes update that element automatically. Disable it to reveal custom font formatting for that one element. Existing decks retain their current custom typography, while newly added text uses the global Body style by default.

## Element Animations

Each element can use **None**, **Appear**, or **Fade in**.

Available triggers:

- On slide start
- On click
- After previous

Properties include animation order, delay, duration, and Linear, Ease, Ease In, Ease Out, or Ease In/Out timing. Use **Preview animation** in element Properties or **Preview animations** above the canvas. Presenter navigation plays queued click animations before advancing to the next slide. Participant View and exported PDFs show the completed, fully visible slide.

## Countdown Timers

Add **Countdown** from the Editor View element toolbar to place a customizable timer on any slide. The timer can be moved, resized, animated, and styled like other slide content.

- Set minutes and seconds, text size, color, background, and alignment in Properties.
- Choose whether it starts automatically when the slide appears.
- At zero, keep `00:00`, show a custom message, or optionally advance to the next included slide.
- Presenter View provides Start, Pause, Reset, and **+1 minute** controls.
- Use **Add timer to slide** in Presenter View for an unplanned break. HySlides inserts a seven-minute timer on the current slide, after which its normal live controls appear.
- Presentation View and Participant View remain synchronized with the presenter-controlled time.
- Editor, next-slide, and filmstrip previews show the configured starting duration instead of a partially elapsed live value.
- Live countdown state is session-only; saving the deck preserves the configured duration, not the remaining time.

## Live Participation

Emoji Reaction engagement elements display the emoji itself with its live response count. Editors can choose between one and five emojis for each reaction slide using the broad built-in picker or by entering any emoji from their device’s complete emoji keyboard. Selected emojis appear in a removable option list.

Each deck has a six-digit access code. Participants can join by scanning a QR code or entering the access code.

- Slide 1 and engagement slides display QR and access-code elements by default.
- Both elements can be repositioned and resized.
- Their visibility can be toggled per slide; they are protected system elements rather than permanently deletable content.
- Participant presence is tracked with an anonymous device identifier.
- Engagement slides show the question and relevant response controls.
- Participants see aggregated results after responding, including word-cloud-style open-text results.
- Presenter controls show connected participants and response progress such as `13/25`.
- Basic offensive-language filtering is applied to word submissions.

## Sessions and History

A new session instance is created for each presentation. Its default name combines the deck title with the presentation date and time. Session History allows the presenter to review, rename, or delete past session instances and their responses.

Ended sessions, participant records, and responses are retained for 14 days and then cleaned up automatically.

## Live Q&A

Participants can submit Q&A at any time during an active session; a dedicated Q&A engagement slide is not required.

- Submitted questions enter a private **Pending review** queue in Presenter View.
- Presenters can Display, Hide, Mark answered/unanswered, or Delete each question.
- Only one question is placed on screen at a time, in a focused Presentation View overlay over the current slide.
- Participant View is submission-only: audience members never see the moderation queue or other participants' questions in the Q&A panel.
- Offensive-language filtering is applied before a question is stored.
- Questions, votes, and moderation state belong to the current session instance and follow the same 14-day retention policy as responses.
- Presenter View separates Unanswered and Answered questions into tabs, while Session History and CSV export preserve the complete queue.
- Participant View keeps Q&A out of the way behind the floating question button at the lower-right corner.
- On phones, that button opens a responsive bottom sheet with a labeled multi-line question field and submit button.

## Import and Export

- Import editable content from `.pptx` files where supported.
- PowerPoint theme fonts and theme colors become HySlides global typography and named color styles.
- Recognized title, subtitle, and body placeholders stay linked to those global styles. Unusual or conflicting one-off formatting remains custom so importing does not flatten intentional exceptions.
- The slide inspector includes an import summary with theme mapping, linked/custom text counts, possible browser font substitutions, and unsupported features.
- Export the finished deck as PDF.
- PowerPoint export is intentionally not included.

## Current Limitations

- Presenter View v1 is complete. Its responsive mobile layout supports core controls and Q&A moderation, but touch-focused gestures and pace coaching are future enhancements.
- User accounts, server-backed deck libraries, admin template management, and collaboration are planned rather than complete.
- PowerPoint import does not reproduce every master, SmartArt, media, transition, or animation feature. Fonts that are unavailable in the viewer's browser use a browser fallback and are called out in the import summary.
