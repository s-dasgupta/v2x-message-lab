# Publishing under your GitHub account

The site is a static build deployed by GitHub Actions to GitHub Pages. Nothing has been published
yet — these steps do that.

## 1. Create the repository

1. On GitHub, create an **empty** repository, e.g. `v2x-message-lab` (no README/licence — the project
   already has them).
2. In this folder:

   ```bash
   git add -A
   git commit -m "V2X Message Lab release 1: BSM Part I"
   git remote add origin https://github.com/USERNAME/v2x-message-lab.git
   git push -u origin main
   ```

## 2. Enable GitHub Pages via Actions

Repository → **Settings → Pages → Build and deployment → Source: GitHub Actions**.

The workflow `.github/workflows/deploy.yml` runs on every push to `main`:

1. `test` — `npm ci`, typecheck, 264 Vitest tests, production build with
   `BASE_PATH=/<repository-name>/`.
2. `validate` — exports encoder vectors and runs the independent cross-validation (asn1tools,
   pycrate, JPO ODE reference vectors). A failure blocks deployment.
3. `deploy` — publishes `dist/` to Pages.

When the run finishes, the site is at `https://USERNAME.github.io/v2x-message-lab/` (the URL is also
shown on the workflow’s *deploy* job). Pull requests run `test` and `validate` but do not deploy.

## 3. Base path and routing

- Routing is hash-based (`…/v2x-message-lab/#/decoder`), so no 404 fallback page is needed.
- `vite.config.ts` uses `BASE_PATH` if set, otherwise relative asset paths (`./`). The site therefore
  also works from a renamed repository, a user site (`USERNAME.github.io`) or a local `dist/` folder
  served by any static server.

## 4. Before making the repository public

- Review `docs/STANDARDS_AND_COPYRIGHT.md` — in particular the note about the minimal BSM Part I
  schema transcription and SAE’s licence terms.
- Confirm that no copy of the SAE PDF or SAE ASN.1 files has been added (`.gitignore` excludes
  `*.pdf` and `*.asn`).
