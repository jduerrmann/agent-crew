---
type: decision
area: files
status: active
date: 2026-10-11
decided-by: user
updated: 2026-10-11
---

# File rows are drawn in a Client, as filetree does

**Context:** the file rows were SVG, with colours and a shimmer, but SVG takes no clicks. Replacing them with Buttons lost the look ("warum sind die hübschen Bilder … weg?"). A row with an extra ▸ button was a stopgap. The user pointed out that filetree manages both.

**Decision:** `hooks/filerows.tsx` draws the rows as text in a Client, after filetree's `rows.tsx`:
- The shimmer recolours letter by letter about every 90 ms, and a shimmering row still takes clicks.
- A click opens the card, a double click within 450 ms opens the file ([open-file-per-os](../limits/open-file-per-os.md)), and a click on a folder opens or shuts it.

**Alternatives:**
- SVG rows with a button beside them looked worse.
- Plain Buttons lost colour and animation.

**Consequences:** on surfaces without a Client (VS Code, mobile) the rows fall back to Buttons. Props to the Client must be plain data ([client-posts-per-frame](../limits/client-posts-per-frame.md)).
