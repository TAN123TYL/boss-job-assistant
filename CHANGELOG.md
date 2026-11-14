# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project follows [Semantic Versioning](https://semver.org/).

## [Unreleased]

## [0.2.0] - 2026-11-14

### Added

- PDF and DOCX resume parsing with lazy-loaded browser parsers.
- Multi-page BOSS job scanning and canonical job-ID deduplication.
- OpenAI-compatible job review and greeting generation.
- Tavily-backed company research with AI trust scoring and source evidence.
- HR reply detection and browser notifications.
- Local JSON backup and restore without API keys.
- Explicit queue state machine and visible message-bubble verification.
- Recovery controls for failed, blocked, interrupted, and manually unverified sends.

### Changed

- Approved jobs only enter the queue from a clean idle state.
- Failed or unverified sends no longer retry automatically.
- Local data schema upgraded to version 2 with automatic migration.

## [0.1.0] - 2026-11-14

### Added

- Resume-based job matching.
- City filtering with remote-job support.
- Company page-signal assessment and external verification links.
- Personalized greeting drafts with manual review.
- Approval-gated send queue with rate limiting and blocking-state detection.
