# NozzleLab

NozzleLab is a supersonic jet-flow investigation project. It provides a browser-based Schlieren image workflow for calibration, image processing, shock-structure measurements, and AI-assisted/physics-based Mach estimates. The repository contains two interfaces:

- A three-page static website (`index.html`, `analyzer.html`, and `upload.html`) for the current visual workflow.
- An alternate Next.js application with overview, methodology, and analyzer routes.

The AI and physics outputs are **prototype estimates**, not publication-grade validation or experimental ground truth. Use them for exploration only and verify scientific conclusions independently.

## Run the static website locally

The static website does not require npm. With Python 3 installed, open a terminal in the project folder and run:

```powershell
.\run-project.cmd
```

The launcher starts a local server on port 4173 and opens `http://127.0.0.1:4173/index.html`. Alternatively, run:

```powershell
python -m http.server 4173
```

Then open `http://localhost:4173/index.html`. Stop the server with `Ctrl+C`.

In VS Code, the **Run my project (no npm)** task is also available. See [RUN-LOCALLY.md](RUN-LOCALLY.md) for details.

## Run the Next.js version

Install Node.js, then from the project folder run:

```bash
npm install
npm run dev
```

Open `http://localhost:3000`. The Next.js routes are `/`, `/methodology`, and `/analyzer`. This is an alternate interface; it is not the same three-page design served by the static local website.

Useful commands:

```bash
npm run typecheck
npm run build
npm start
```

## Train the model

The supplied model artifact is `public/trained-model.json`, and its input inventory is `public/training-manifest.json`. To regenerate the artifact, install Python 3 and the training script's dependencies (`numpy`, `opencv-python`, and `scikit-learn`), then run:

```bash
npm run train:model
```

The script reads image paths from the training manifest and writes the fitted feature-based k-nearest-neighbor model to `public/trained-model.json`. The included data is a small prototype dataset; its validation metrics are descriptive and do not establish scientific validity.

## Deploy with Vercel

The Next.js application can be deployed using Vercel:

1. Push this repository to GitHub and import `nozzle-lab` in the [Vercel dashboard](https://vercel.com/new).
2. Keep the detected framework as **Next.js** and the project root as the repository root.
3. Use the default build command (`npm run build`) and deploy. No environment variables are required for the current application.
4. After deployment, open the assigned Vercel URL; the Next.js analyzer is at `/analyzer`.

To deploy the separate root-level static HTML workflow instead, configure a separate Vercel project for the static output and verify that the root-level HTML, CSS, JavaScript, and required public assets are included. The default Next.js deployment serves the Next.js app, not that separate static workflow.

## Image asset permissions

The training set includes research-paper images under `public/Bar Images/`. Their filenames include author/paper references, but this repository does not currently include licensing or permission documentation for their public redistribution. Confirm the rights and any required attribution before publishing these image files. The manifest and trained model are included project assets, but their presence does not establish redistribution permission for the source images.
