# Roadmap

## 0.2

- Extract text from PDF and DOCX resumes.
- Store and switch between multiple candidate profiles.
- Persist scan history with diffing between searches.
- Add import and export for user-controlled backups.
- Add an optional OpenAI-compatible text provider behind a settings interface.

## 0.3

- Add controlled pagination with a hard per-run item limit.
- Add richer company verification adapters with explicit API configuration.
- Add end-to-end browser tests for the approval gate and stop behavior.
- Add localized UI strings.

## Non-goals

- Bypassing CAPTCHAs, verification pages, or platform rate limits.
- Sending messages to jobs that were not explicitly approved.
- Storing platform passwords or session cookies.
- Treating page signals as a legal or financial certification of a company.
