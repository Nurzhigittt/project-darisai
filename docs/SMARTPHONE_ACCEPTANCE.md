# Smartphone acceptance checklist

A physical-device pass is **not claimed** in this environment. The app has been
verified with Playwright mobile viewports (320/390 px), but emulation is not a
substitute for Safari on an iPhone or Chrome on an Android phone.

## Before testing

1. Deploy with a public HTTPS origin and set `APP_BASE_URL` to it.
2. Restart the API so new lectures generate QR URLs for that origin.
3. Create a lecture, start it, and open its QR from the phone.
4. Use a synthetic test course/lecture and synthetic student data.

## Manual pass

- [ ] Open the HTTPS landing page on the phone.
- [ ] Scan the professor QR; confirm the join screen opens.
- [ ] Join anonymously; verify no account prompt.
- [ ] Tap the Signal button once; verify a clear tap/ack state.
- [ ] Verify the professor sees the aggregate Ripple update.
- [ ] Pause/resume, then interrupt Wi-Fi/mobile data and reconnect.
- [ ] End the lecture; verify the student sees the ended state.
- [ ] Open Socratic Replay and complete a question/answer sequence.
- [ ] Generate GapCards; review and flip a card.
- [ ] Refresh; verify IndexedDB history survives.
- [ ] Go offline; verify existing cards remain reviewable.
- [ ] Clear local history; verify it does not return.
- [ ] Check 320 px width, long Russian/Kazakh text, safe areas, keyboard and landscape.
- [ ] Check light/dark and tap-target sizes.

## Evidence to capture

- Short screen recording or screenshots of the real device flow.
- Phone model, OS and browser version.
- The public URL and timestamp.
- Any failures with the exact step and console/network error.

## Safari-specific notes

- PWA install and service-worker behaviour can differ from Chromium.
- Test both portrait and landscape after the keyboard closes.
- Verify the Signal button remains reachable with browser chrome visible.
- Do not use `localhost` for a QR intended for a phone.
