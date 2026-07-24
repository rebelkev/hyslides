# Real-Time Session Delivery QA

HySlides uses a per-session Cloudflare Durable Object and WebSocket channel for
immediate updates. D1 remains the durable source of truth for session state,
responses, participant records, and session history. A slower 15-second poll is
retained only for recovery when a WebSocket is unavailable.

## Release gate

A real-time release is successful only when all of the following pass:

- `npm test` passes without failures.
- `npm run build` produces the Worker bundle with `LIVE_HUB`, the
  `LiveSessionHub` class, the Durable Object migration, and the existing `DB`
  binding.
- Presenter, Presentation, Participant, and Presenter Remote views all connect
  to the same six-digit session.
- Slide navigation, live responses, Q&A display/hide, timer changes,
  black/hold-screen state, and remote commands appear on other connected views
  without a page refresh.
- A newly connected participant updates the presenter count.
- Disconnecting a device and reconnecting it restores the latest canonical
  state. If push delivery is unavailable, recovery occurs within 15 seconds.
- Animated backgrounds remain visually continuous between state updates,
  pause while the tab is hidden, and slow down when reduced motion is enabled.
- Existing D1 session history and response retrieval continue to work.

## Multi-device acceptance test

1. Open the Presenter View on a desktop and start a new session.
2. Open the Presentation View in a second tab.
3. Join the Participant View from a phone using the QR code.
4. Pair the Presenter Remote from a second phone or private browser window.
5. Advance and reverse slides from both presenter controls.
6. Submit every enabled engagement type and confirm the displayed results
   update without refreshing.
7. Display and hide one Q&A question.
8. Start, adjust, and end a timer.
9. Toggle the black/hold screen.
10. Disable networking on the participant device for ten seconds, restore it,
    and confirm it returns to the current slide automatically.
11. Leave an animated-background slide open for five minutes and confirm it
    does not visibly restart on live updates.

Record the deployed commit and Cloudflare Worker version with the test result.
