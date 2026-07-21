# HySlides Product Guide

## What HySlides Is

HySlides is a browser-based presentation editor with optional live audience participation. A deck can be presented like a traditional slide show or run as a live session where participants follow along, answer engagement slides, and view aggregated results.

## The Four Views

### Editor View

The authoring workspace for creating and editing decks. It contains the slide navigator on the left, the slide canvas in the center, and Properties and Elements panels on the right.

### Presentation View

The clean, full-screen slide show displayed to the room or shared during a video call. It contains no private presenter notes or controls.

### Participant View

The phone, tablet, or computer experience opened using a deck’s QR code or six-digit access code. Participants follow the active slide, submit responses on engagement slides, and see aggregated results after responding.

### Presenter View

The private presentation control interface. The planned Desktop and Mobile variants will contain the current slide, next-slide preview, notes, navigation, live participant and response counts, engagement results, Q&A moderation, and session controls.

## Creating and Managing Slides

- Add slides or sections from the top of the left slide panel.
- Select one slide normally; use Shift for a range or Command/Ctrl for multiple slides.
- Drag selected slides to reorder them.
- Open a slide’s three-dot menu to duplicate, move, rename, or delete it.
- Duplicated slides appear immediately after the originals and receive independent slide and element identities.
- Slide deletion is available only from the left slide panel.

## Editing Elements

HySlides supports text, shapes, images, icons, charts, tables, dividers, and engagement elements.

- Drag and resize elements on the canvas.
- Use the element toolbar for grouping, locking, alignment, centering, and layer order.
- Open the Elements panel to see the slide’s element tree. Items at the top appear in front.
- Single-click a tree item to select it. Double-click it to open its Properties.
- Text boxes automatically fit their height to wrapped text unless automatic height is disabled.

## Color Styles

Color styles are saved per deck.

- Create, rename, recolor, or delete styles under **Properties → Theme**.
- Applying a style links the element to that style.
- Recoloring the style updates all linked elements throughout the deck.
- Use **Unlink color style** when an element needs a one-off color.
- Deleting a style preserves the current appearance of linked elements and converts them to fixed colors.
- Older saved swatches are automatically migrated to named styles.

## Element Animations

Each element can use **None**, **Appear**, or **Fade in**.

Available triggers:

- On slide start
- On click
- After previous

Properties include animation order, delay, duration, and Linear, Ease, Ease In, Ease Out, or Ease In/Out timing. Use **Preview animation** in element Properties or **Preview animations** above the canvas. Presenter navigation plays queued click animations before advancing to the next slide. Participant View and exported PDFs show the completed, fully visible slide.

## Live Participation

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

## Import and Export

- Import editable content from `.pptx` files where supported.
- Export the finished deck as PDF.
- PowerPoint export is intentionally not included.

## Current Limitations

- Presenter View is the next major milestone; the current Presentation View is available, but the dedicated Desktop and Mobile control experiences are not complete.
- User accounts, server-backed deck libraries, admin template management, and collaboration are planned rather than complete.
- Live Q&A moderation is planned. The final workflow will support review, display/hide, mark answered, and delete actions.
- PowerPoint import does not reproduce every master, SmartArt, media, typography, transition, or animation feature.
