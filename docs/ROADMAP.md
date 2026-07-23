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

## Following Milestones

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
