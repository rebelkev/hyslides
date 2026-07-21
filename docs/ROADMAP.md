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
- Q&A enhancements: pinning, presenter spotlight layouts, and CSV export
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
