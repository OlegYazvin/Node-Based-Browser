# Installer Boundaries

This repo has two separate packaging layers. Keep them separate.

## Browser-build layer

This layer produces real packaged Nodely browser artifacts.

- Gecko overlay code and Gecko packaging scripts live under `gecko/`.
- `gecko/scripts/stage-release-artifacts.mjs` stages packaged browser outputs into `gecko/release-artifacts/`.
- `gecko/release-artifacts/manifest.json` records only the browser packages that were actually built.

Change this layer when you are changing browser branding, Gecko packaging, or the packaged browser artifact itself.

Do not add end-user installer sync logic here.

## Installer layer

This layer turns real packaged browser artifacts into the downloadables in `Installer/`.

- `scripts/build-installers.mjs` builds Linux installer formats from a staged Gecko package and copies native Windows/macOS installers from staged Gecko outputs.
- `scripts/installers-lib.mjs` syncs finished installers into `Installer/`, writes `Installer/manifest.json`, and regenerates `Installer/README.MD`.
- `.github/workflows/installers.yml` is the native CI path for Windows/macOS packaging and for assembling a truthful `Installer/` artifact.

Change this layer when you are changing installer formats, installer sync behavior, support-matrix docs, or the `Installer/` assembly flow.

Do not add browser-build logic here.

## Promotion flow

1. Build and package the browser artifact first.
2. Stage that browser artifact into `gecko/release-artifacts/`.
3. Build or copy the installer from that staged artifact.
4. Sync the resulting installer into `Installer/`.
5. Commit only the installer files and manifests that were actually produced.

## Ground rules

- Do not hand-edit `Installer/README.MD`; regenerate it through the installer sync path.
- Do not claim Windows, macOS, or Linux architecture support unless the corresponding installer file exists in `Installer/`.
- Keep `gecko/release-artifacts/manifest.json` and `Installer/manifest.json` truthful and independent.
- If a task changes both layers, make the boundary explicit in the commit and keep the responsibilities separate in code.
