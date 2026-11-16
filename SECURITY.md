# Security

## Reporting a vulnerability

Do not open a public issue for credential exposure, unauthorized data access,
or a flaw that could send messages without user approval. Report the issue
privately to the maintainers.

## Data handling

- The extension does not ask for a BOSS Zhipin password.
- Resume text, job records, and generated messages are stored with
  `browser.storage.local`.
- AI and company-research requests are optional and only target endpoints
  configured by the user.
- API keys are excluded from JSON backups.
- Export files can contain personal information. Review them before sharing.

## Expected safeguards

The project must preserve all of these safeguards:

1. Jobs cannot enter the send queue without explicit user approval.
2. The extension stops on a verification page or an unrecognized page state.
3. CAPTCHAs and anti-bot controls are never bypassed.
4. Credentials must never be committed to the repository or stored by the
   extension.
5. A send is marked successful only after a new matching message bubble appears.
6. Failed, blocked, or unverified sends require explicit recovery.
