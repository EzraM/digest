# Release builds via GitHub Actions

The `Release builds` workflow (`.github/workflows/release.yml`) runs on semantic version tags without a leading `v` (pattern `*.*.*`, e.g., `1.1.1`) and builds platform-specific Electron Forge distributables on Linux, macOS, and Windows.

## Platform requirements
- **macOS builds:** A macOS runner is required to produce `.dmg` installers; Electron Forge relies on macOS tooling and Apple frameworks that are not available on Linux or Windows. GitHub Actions bills macOS minutes at a higher rate than Linux/Windows, so expect releases that include mac builds to draw from your paid minutes more quickly.
- **Linux and Windows builds:** These run on the corresponding GitHub-hosted runners and do not require cross-compilation.

## Artifact publishing
Each matrix job uploads its `out/make/**/*` outputs to the tag's GitHub release via `softprops/action-gh-release`. Assets are available in the release page once the workflow completes across all runners.
