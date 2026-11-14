# Privacy

## Stored locally

- Resume text
- Screening settings
- Job metadata visible on the page
- Generated and edited greetings
- Approval and execution history
- AI endpoint, model name, and local API keys

The extension stores this data in `browser.storage.local`. It does not use an
analytics service or remote application database.

## Optional external requests

- With AI review enabled, resume excerpts and job text go to the configured
  OpenAI-compatible model endpoint.
- With company research enabled, the company name goes to Tavily Search.
- Public search snippets and recruitment-page company information go to the
  configured AI endpoint for risk summarization.
- No Tavily or AI key is included in exported backups.

## Not collected

- Boss passwords
- Session cookies
- Browser history
- Contacts unrelated to visible job cards

## User controls

Users can clear local extension data from the browser's extension settings.
Before sharing logs or exported data, remove personal resume content, recruiter
names, and any private notes.

## Third-party pages

Company verification links open public or third-party sites in a new tab. Those
sites have their own privacy terms. The extension does not read the resulting
page automatically.
