# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.1.1] — 2026-04-27

### Documentation
- Comprehensive README rewrite with hero section, badges (npm version,
  downloads, CI, license, TypeScript strict, PRs welcome), feature
  table, configuration examples, FAQ, compatibility matrix, and a
  Mermaid sequence diagram of the discovery flow.
- Added `CONTRIBUTING.md` covering project philosophy, dev setup,
  local plugin testing via `npm link`, PR checklist, and release process.
- Added `CHANGELOG.md` following the Keep a Changelog 1.1.0 format.
- Added GitHub issue templates (bug report + feature request as YAML
  forms) and a structured pull-request template.
- Added `.github/dependabot.yml` for weekly npm + GitHub Actions updates.

### Fixed
- Removed an accidental self-dependency (`opencode-plugin-litellm`) that
  was added to `package.json` by an earlier `npm link` invocation.

## [0.1.0] — 2026-04-27

### Added
- Initial release of `opencode-litellm`.
- Auto-detection of a running LiteLLM proxy on common ports (`4000`, `8000`, `8080`).
- Dynamic model discovery via the OpenAI-compatible `/v1/models` endpoint.
- Smart name formatting (e.g. `anthropic/claude-3-5-sonnet` → `Claude 3 5 Sonnet`,
  `qwen/qwen3-30b-a3b` → `Qwen3 30B A3B`, with brand-aware handling for `gpt-4o`).
- Modality categorization — chat / embedding / image / audio inferred from
  the LiteLLM `mode` field or the model id.
- Provider extraction — uses `litellm_provider` (or the `provider/model` prefix)
  to populate `organizationOwner`.
- API key support via `LITELLM_API_KEY` / `LITELLM_MASTER_KEY` env vars or
  `provider.litellm.options.apiKey`.
- Non-destructive merge — hand-curated entries under `provider.litellm.models`
  are preserved.
- 5-second discovery timeout so a slow / offline proxy never blocks OpenCode startup.
- GitHub Actions CI workflow (typecheck on Node 20 & 22).
- Auto-publish workflow on GitHub release (requires `NPM_TOKEN` secret).

[Unreleased]: https://github.com/yuseferi/opencode-litellm/compare/v0.1.1...HEAD
[0.1.1]: https://github.com/yuseferi/opencode-litellm/compare/v0.1.0...v0.1.1
[0.1.0]: https://github.com/yuseferi/opencode-litellm/releases/tag/v0.1.0
