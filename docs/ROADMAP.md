# HySlides Roadmap

## Current Foundation

- Canvas slide editor and slide navigator with Undo and Redo history
- Element Properties and Elements tree
- Sections, slide duplication, multi-selection, grouping, locking, layering, alignment, and dynamic zoom
- PowerPoint import and PDF export
- Named linked deck color styles
- Appear and Fade In element animations
- Presentation View in a separate tab
- QR and six-digit participant joining
- Live slide following, engagement responses, aggregated results, word clouds, and basic language filtering
- Session instances, history, presence, response ratios, presenter authorization, and 14-day retention

## Completed: Presenter View v1

- Standardized view naming and routing.
- Built responsive Desktop and Mobile Presenter View layouts.
- Synchronized Presenter View controls with Presentation View and Participant View.
- Added end-state previews, session-only slide skipping, timer, black-screen control, notes, counts, results, and session lifecycle controls.
- Added customizable on-slide countdown timers controlled from Presenter View and synchronized to Presentation and Participant Views.
- Added a secure cross-device Mobile Presenter Controller with a private QR/link, focused tabs, slide navigation and skipping, notes, live controls, and Q&A moderation.

## Next Presenter Enhancements

- Pace coaching against a target end time
- Touch gestures and larger mobile control targets
- Presenter annotations and a temporary spotlight/pointer
- Live Q&A moderation queue

## Next Structural Milestone: Real-Time Session Delivery

- Replace frequent full-state polling with a persistent real-time session channel using Cloudflare Durable Objects and WebSockets, while retaining D1 for durable session history and responses.
- Send small, typed events for slide changes, responses, timers, Q&A, reactions, black/hold-screen state, participant presence, and Presenter Remote commands.
- Keep the current slide and its WebGL canvas mounted between updates; update only the state or elements that changed instead of rebuilding the complete slide.
- Add reconnect, missed-event recovery, session versioning, heartbeat, and graceful polling fallback behavior for unreliable networks.
- Automatically reduce animated-background complexity or frame rate on constrained mobile devices, and pause animation when the page is hidden or reduced motion is requested.
- Add real-world connection, reconnection, multi-device, load, and long-running-session tests before enabling the architecture in production.

## Following Milestones

- Editor property correctness:
  - Make the Properties-panel opacity value reliably update the selected element across the Editor, Presenter, Presentation, and Participant Views.
  - Rotate elements around their visual center while preserving their canvas position, selection bounds, resizing behavior, and export rendering.
  - Add regression tests for opacity and center-origin rotation before these fixes are released.
- Global Deck Settings:
  - Current live-session status and audience join card
  - Audience join URL with Copy Link and Open Participant View actions
  - Six-digit access code and QR code
  - Global colors, named linked swatches, and slide-assignment colors
  - Global typography for headings, body text, labels, and placeholders, with Google Fonts and per-element overrides
  - Persistent brand/logo treatment and default slide appearance
  - Custom Hold Screen used by the Presenter View's screen-hiding control:
    - Branded background, logo, message, and optional countdown
    - Uses the deck's colors, typography, imagery, gradients, or animated background effects
    - Synchronizes to Presentation and Participant Views, with plain black as the fallback
- Q&A enhancements: pinning, presenter spotlight layouts, and CSV export
- Per-session audience response exports:
  - Export all engagement-slide responses and session-wide Q&A from Session History
  - Include the deck, session name, date/time, slide, engagement type, prompt, response, participant identifier, and submission time
  - Include Q&A moderation state, display state, answer state, and upvote count
  - Provide a combined session export plus optional exports for an individual engagement slide
  - Start with CSV and preserve a structured format suitable for future analytics integrations
- Participant Selection & Assignment:
  - Select a requested number of connected participants at random and privately notify only their devices
  - Presenter-selectable outcomes such as **Volunteer**, **Winner**, **You’re up next**, or a custom message
  - Allow participants to opt into volunteer selection while keeping prize drawings available to all eligible participants
  - Include or exclude previously selected participants, redraw an individual selection, clear the selection, and maintain a session audit trail
  - Divide active participants into a requested number of balanced groups and privately display each participant’s group name, number, color, and instructions
  - Support named roles within groups, such as facilitator, recorder, speaker, timekeeper, or role-play character
  - Give Presenter View a confirmation step, selection preview, delivery status, and controls to resend or dismiss the device message
  - Keep selection results private unless the presenter explicitly chooses to reveal them on the Presentation View
  - Respect reconnecting devices, participant departures, duplicate devices, anonymous participation, and session-level eligibility rules
- Direct-to-device participant communication built on the same assignment system:
  - Private activity instructions, clues, prompts, or scenario roles
  - Personalized question or discussion assignments
  - “Prepare to speak” and “You’re next” cues without interrupting the projected slide
  - Breakout-room numbers, seating areas, rotation stations, and return-to-room notices
  - Silent time warnings, task-complete acknowledgements, and presenter-requested check-ins
  - Targeted follow-up links or resources for selected groups after an activity
- User accounts and authentication
- Server-backed deck library and media storage
- Cross-presentation slide transfer:
  - Copy a slide into another presentation the user can access
  - Choose the exact destination position before copying
  - Preserve supported elements, animations, notes, engagement configuration, and linked assets
  - Respect presentation ownership, team roles, and edit permissions
  - Resolve deck-specific dependencies such as typography styles, color styles, and uploaded media without changing the source slide
- Admin access and template management
- Drag-and-drop element layering in the Elements panel:
  - Reorder elements to change their front-to-back stacking order, with items at the top appearing in front
  - Show a clear insertion indicator while dragging and keep the canvas, thumbnails, Presenter, Presentation, Participant, and export rendering in sync
  - Support moving complete groups while preserving their internal structure, plus reordering elements within expanded groups
  - Preserve locked and protected system elements, with accessible keyboard move controls as an alternative to dragging
  - Add a visibility control to every element row, using an open-eye icon for visible elements and a clearly distinguishable hidden-eye icon for hidden elements
  - Right-align the visibility icon with comfortable right padding so it remains easy to target without touching or crowding the panel edge
  - Keep hidden elements listed and selectable in the Elements panel so editors can restore them, while excluding them from the canvas, thumbnails, Presenter, Presentation, Participant, and export rendering
  - Preserve each element’s visibility state when saving, duplicating, grouping, importing, or copying slides
- Expanded engagement slide types:
  - **Rating & Ranking**
    - **Rating scale:** configurable numeric ranges such as 1–5 or 1–10, displayed as numbers, stars, or emojis
    - **Likert scale:** customizable labeled responses such as Strongly disagree through Strongly agree
    - **Ranking:** participants drag options into their preferred order
    - Display live averages, response distributions, stacked Likert results, or a weighted overall ranking as appropriate
    - Show the connected-participant response ratio and preserve individual responses in Session History and exports
  - **Wheel Spinner**
    - Editors add, rename, reorder, recolor, and remove up to ten wheel options using the same option-row pattern as Poll
    - The wheel uses each option’s assigned color and supports deck-level global color styles
    - Presenter-controlled Spin, Stop, Spin again, and Reset actions, with the selected result synchronized to Presentation and Participant Views
    - Optional removal of a selected result for drawings without replacement
    - Session history records each spin, result, timestamp, and whether that result remained eligible
  - **Open-ended Question**
    - Accept longer participant responses than Word Cloud while retaining offensive-language filtering and configurable response limits
    - Display approved or incoming responses as responsive cards that reflow across the slide canvas
    - Target four cards across on wide layouts and three across when additional reading width is needed, with automatic font sizing and pagination when the canvas fills
    - Provide Presenter View moderation, display/hide, pin, and clear controls before responses appear publicly
    - Synchronize the card layout and updates across Presenter, Presentation, and Participant Views
    - Preserve full responses in Session History and include them in per-session exports
- Closing Survey:
  - Up to five customizable questions presented together after the presentation
  - Short-text and 1–5 rating question types
  - One completed survey per participant and session
  - Completion counts, aggregated scores, response history, and export
- Expanded animation effects and sequencing
- Collaboration, analytics, and organization/team features

## Product Decisions

- Presentation View and Participant View are distinct experiences.
- PowerPoint export is not planned; PDF export remains supported.
- QR and access-code slide elements are protected and hidden rather than permanently deleted.
- Live response and participant data is retained for 14 days.
- Accounts should precede admin tools and persistent cross-device deck storage.
- Cross-presentation slide copying should follow accounts, server-backed deck ownership, and team permissions.
