# NozzleLab local setup

## Recommended: open the current three-page UI

To see the same website as `http://localhost:4173/index.html`, run the static
HTML website described below. The page to open is the root-level `index.html`.
Do not use `npm run dev` for this version: that starts a separate Next.js
implementation with a different design.

The static site pages are:

1. `index.html` — home page
2. `analyzer.html` — analyzer overview
3. `upload.html` — image upload, pressure input, analysis status, results and PDF download

The homepage contact links open the project owner's GitHub profile and a new email
to `rajivdeeru@gmail.com`. The optical-diagnostics illustration has been removed.

### Requirements

- VS Code
- Python 3.10+ (already installed on most research computers), or the VS Code Live Server extension

### Recommended: one-command launcher

From the VS Code terminal opened in this project folder, run:

```powershell
.\run-project.cmd
```

This starts the static site on port `4173`, reuses it if it is already running,
and opens the homepage in your browser. You can also open the Command Palette
(`Ctrl+Shift+P`), choose **Tasks: Run Task**, then select
**Run my project (no npm)**.

### Option B: Python local server

Open the project folder in VS Code, then run this command in the VS Code terminal:

```powershell
python -m http.server 4173
```

Open:

```text
http://localhost:4173/index.html
```

Stop the server with `Ctrl+C`.

### Option C: VS Code Live Server

1. Install the **Live Server** extension.
2. Right-click `index.html`.
3. Select **Open with Live Server**.
4. Use the displayed local URL.

The navigation is:

```text
Home -> Analyzer overview -> Upload workspace -> Results -> Download PDF
```

The upload workspace accepts a Schlieren image and one whole-bar pressure bucket:
`2`, `3`, `4`, `5`, `6`, `7`, `8`, `9`, or `10`.

## Alternate Next.js source

The Next.js implementation is included as a separate, alternate version. Running
it will not produce the same pages as the static site above.

The original Next.js implementation is also included:

```powershell
npm install
npm run dev
```

Then open `http://localhost:3000`.

Useful commands:

```powershell
npm run typecheck
npm run build
npm run train:model
```

The Next.js analyzer route is `/analyzer`. The static pages are the current visual workflow and require no npm installation.

## Included training assets

- `public/Bar Images/` — 88 research-paper images
- `public/training-images/` — 9 additional supplied images
- `public/training-manifest.json` — 97-image manifest
- `public/trained-model.json` — generated pixel-feature model artifact
- `scripts/train_model.py` — reproducible training script

The model artifact was generated from all 97 available image files. The pressure input is normalized to the agreed whole-bar buckets; for example, source pressures from approximately `1.6` to `2.4` bar map to the `2 bar` bucket.

## Notes

- Image processing in the static UI is browser-local.
- The PDF download is generated in the browser.
- No image upload backend is required for the static workflow.
- The scientific model remains a prototype and should not be presented as publication-grade validation.
