---
type: limit
area: other
status: active
verified: 2026-10-11
claude-code: 2.1.296
updated: 2026-10-11
---

# A test can't write files or read the environment

**Why:** `claude plugin test` runs each test file in the hooks' sandbox. A dynamic `import('node:fs')` is refused when the file loads, and `process` is undefined, so neither a file nor an environment variable can switch a test on. `claude plugin test` takes no filter either: it runs every `*.test.ts` under the folder.

**Workaround:** `tests/media.test.ts` prints each picture as one `@@MEDIA <file> <svg>` line through `console.log`, which reaches the output. Non-ASCII goes out as character references, line breaks as spaces. A constant, `RENDER`, switches the printing on; off, the scenes still run as a smoke test. The steps to write the lines to `media/` are in [workflow](../workflow.md#readme-pictures).

**Re-check when:** the test kit offers a file or an output channel, or `claude plugin test` takes a filter or passes options.
