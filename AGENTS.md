# Agent Notes

- When Gecko overlay code, packaging scripts, release metadata, or staged artifacts change, keep `gecko/release-artifacts/manifest.json` current for the artifacts that were actually produced.
- Do not claim Gecko release artifacts were built for platforms, architectures, or channels that were not actually packaged.
- Prefer the CI workflow at `.github/workflows/gecko-verify.yml` for cross-platform verification and staged release refreshes after Gecko-facing changes.
- Keep `gecko/release-artifacts/` user-facing: stage the single packaged artifact a person should download for each platform/channel, not auxiliary build outputs.
