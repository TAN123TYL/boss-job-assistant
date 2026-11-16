# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project follows [Semantic Versioning](https://semver.org/).

## [Unreleased]

## [0.3.5] - 2026-11-16

### Changed

- Replaced per-queue confirmation and per-job tabs with one-click automatic
  sending in a single hidden job tab.
- Jobs are navigated sequentially inside the same background tab.
- New tabs opened by Boss during sending are closed automatically.
- Removed the second-confirmation modal while retaining explicit per-job
  approval, verification stops, and bubble verification.

## [0.3.4] - 2026-11-16

### Added

- Added a manual “confirmed sent” action for jobs whose browser message channel
  closed after a possible send.
- Confirmed manual sends are recorded in execution history and never re-enter the
  automatic send queue.

## [0.3.3] - 2026-11-16

### Fixed

- Prevented job-card and communication-link default navigation while preserving
  Boss click handlers, avoiding content-script teardown during an active request.
- Changed approved-message delivery to use a reusable background job-detail tab
  instead of depending on the current search-result DOM.
- Switched the content-script message listener to the explicit `sendResponse`
  channel pattern so asynchronous replies close cleanly.

## [0.3.2] - 2026-11-15

### Added

- Added automatic fallback to the saved job URL when an approved job is no
  longer present in the current Boss list.
- Reuses an already-open matching job tab or opens a background tab, then retries
  sending through the job detail page.
- Added queue actions to open the original job page and mark an offline job as
  invalid so it no longer blocks the queue.

## [0.3.1] - 2026-11-15

### Changed

- Reworked the primary greeting into a complete professional self-introduction
  covering education, graduation year, role interest, JD-relevant skills, real
  experience, AI-tool exposure, growth direction, availability, and interview
  intent.
- Added configurable weekly availability, internship duration, growth direction,
  and AI-tool mention settings.
- Removed Markdown emphasis markers from chat text and increased the primary
  greeting limit to 420 characters.

## [0.3.0] - 2026-11-15

### Changed

- Made AI-generated, JD-specific greetings the primary communication flow.
- Added a dedicated greeting request when the job-review response omits greeting
  drafts.
- Included full job description and company profile context in greeting prompts.
- Kept local templates only as a fallback when AI is unavailable or fails.

## [0.2.9] - 2026-11-15

### Changed

- Rewrote local greeting templates into shorter, conversational chat messages.
- Strengthened AI greeting prompts and normalized formal phrases such as
  "关注到", "贵司", and "进一步沟通" into natural spoken wording.
- Limited generated greetings to 120 characters.

## [0.2.8] - 2026-11-15

### Fixed

- Always captured company profile text from the job detail panel when available,
  even if the card already contained a partial JD.
- Kept jobs for manual review when Tavily returned no results, public research
  failed, or AI requested human verification.
- Reserved automatic company rejection for explicit high-risk decisions.

## [0.2.7] - 2026-11-15

### Added

- Added live scan progress with phase, item counts, elapsed time, and a stop
  action.
- Added cancellation checks throughout scrolling, JD hydration, AI review, and
  company research.
- Added per-JD, scroll-wait, and whole-scan timeouts so the side panel cannot
  remain on an unexplained processing state indefinitely.

## [0.2.6] - 2026-11-15

### Added

- Added optional full job-description hydration by opening each visible job
  detail panel before matching.
- Added configurable maximum JD details per scan, defaulting to 30.
- Merged detail-panel title, company, location, description, and company page
  information back into the job record for resume and AI matching.

## [0.2.5] - 2026-11-15

### Added

- Added a safe reset action that re-evaluates previously auto-rejected jobs with
  the current resume, city, company, AI, and trust rules.
- Reset keeps approved, skipped, sent, and execution-history records untouched.

## [0.2.4] - 2026-11-15

### Fixed

- Prevented sparse Boss recommendation cards from being rejected solely because
  company size, financing, and full job descriptions are absent.
- Added software-testing skills and testing-tool keywords to resume matching.
- Allowed slash-separated target titles such as
  `自动化测试 / 测试开发 / 功能测试`.
- Added visible rejection reasons to the screening page for diagnosing zero-match
  scans.

## [0.2.3] - 2026-11-14

### Changed

- Increased resume evidence to 65% of resume-match scoring and reduced job-title
  matching to 20%.
- Changed final ranking to 75% resume match, 15% company trust, and 10% city.
- Raised the default minimum resume score from 65 to 70 and migrated the previous
  default automatically.

## [0.2.2] - 2026-11-14

### Changed

- Replaced next-page navigation with automatic infinite scrolling for the Boss
  recommendation job list.
- Accumulates job cards across virtualized scroll updates and deduplicates by
  stable `job_detail` identity.
- Stops after repeated scroll passes produce no new jobs or a verification page.

## [0.2.1] - 2026-11-14

### Changed

- Replaced free-text target cities with a searchable, province-grouped
  prefecture-level city selector.
- City values are normalized to city units; districts, counties, autonomous
  prefectures, and arbitrary input are not selectable.

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
