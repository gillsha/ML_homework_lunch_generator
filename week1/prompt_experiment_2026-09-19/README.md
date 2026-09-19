# First-pass prompt experiment — 19 September 2026

This folder preserves the evidence for the separate-agent experiment recorded in `../dialog.json`. It is not the main application; the main application is `../index.html`. The PDF report has not been completed.

## Outcome

One new agent session received only the revised prompt as the source of application requirements. It was instructed not to read the main project or earlier implementations. The agent reported reading only the prompt and created its first complete HTML file in one write. The main AI assistant then tested that unchanged file in Chromium 153.0.8010.12 through Playwright 1.63.0.

All agreed scenarios passed in this attempt. This is evidence about one generated version and the tested scenarios, not a guarantee about all future generations or full accessibility.

The student discussed the decisions and selected the icons. The AI assistant performed the research, application changes and browser checks; the student did not perform the automated checks described here.

## Original evidence, copied without content changes

| File | Purpose |
|---|---|
| `prompt.md` | Exact prompt supplied to the new agent; matches the revised project prompt at the time of the experiment |
| `week1/index.html` | First generated application, with no corrections after its first save |
| `verify-first-pass.original.mjs` | Exact original verification script, including the historical temporary paths |
| `RESULTS.md` | Original first-run results and provenance notes, preserved in their original Russian wording |
| `desktop.png` | Original desktop screenshot: Tacos with the agreed hot-dog icon |
| `mobile.png` | Original 320 px screenshot: Steak with the agreed bacon icon |

The temporary source folder was `week1-prompt-first-pass-20260919` under the OpenCode temporary directory. The Git blob hashes of the copied files were compared with their temporary originals. The prompt and generated HTML also match the hashes recorded before the first browser check:

- Prompt: `3a0994e6858ed97d0f6f355660a3aa32e25d46a9`.
- First generated HTML: `dd1ef2d140a0ec4961cf7be89431d9f793f5d648`.
- Separate generator session: `ses_f45f1455effeIyE0XFCuy39H4C`.

The original results file mentions temporary paths. Those statements document the historical run; the files above are now stored in the repository folder.

## What the first check covered

- Automatic selection and ignored clicks during its initial 500 ms wait.
- All 12 dish names, their exact icon classes, loaded Font Awesome Free 6.4.0 glyphs and fresh animations.
- Extra mouse, keyboard and synthetic click events at 100 and 200 ms: only one result, after 501 ms in the recorded run.
- Repeated generation, two identical dishes in a row and restarting animation for the same dish.
- Starting another generation before the previous fade finishes.
- Enter and Space, disabled-button styling, and no hover effect while disabled.
- Layout at 320, 375 and 1280 px, console errors and CDN requests.
- A separate page with native `Math.random()`: automatic and two manual choices triggered by the assistant's browser automation.

## Run the preserved scenarios again

`verify-first-pass.mjs` is a portable copy of the original script. Only dependency loading, file locations and output saving were adapted. The browser scenarios and assertions were not changed. It reads this folder's generated HTML and writes new screenshots and a JSON report into `rerun/`, so the original screenshots remain intact.

Requirements: Node.js 20 or newer, npm, and internet access for the Font Awesome CDN and versioned icon metadata. In this folder, run:

```bash
npm install
npx playwright install chromium
npm run verify
```

The package pins the Playwright version used for the first check. If Playwright is already installed elsewhere, `PLAYWRIGHT_MODULE_PATH` may point to its absolute `index.mjs` path instead of installing another copy.

For example, after installation, a successful run prints a JSON report and saves `rerun/report.json`. Its timing values and random results may differ from the historical run. Replaying the tests is not another generation attempt.

The unchanged HTML still depends on the external Font Awesome CSS and font. The checks do not establish offline support, cross-browser compatibility, screen-reader usability or complete accessibility.
