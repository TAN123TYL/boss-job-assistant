# Contributing

## Development setup

```bash
npm install
npm run dev
```

Load the generated development extension from WXT's output directory in
`chrome://extensions`.

## Before opening a pull request

```bash
npm run check
```

Keep changes scoped. Add tests for scoring, filtering, approval-gate, and
browser-adapter behavior. Never weaken the manual approval or verification-stop
requirements described in `SECURITY.md`.

## Commit messages

Use Conventional Commits, for example:

- `feat: add city filter`
- `fix: stop queue on verification page`
- `docs: explain local data storage`
