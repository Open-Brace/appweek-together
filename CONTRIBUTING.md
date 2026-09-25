# Contributing

Use issues for bugs and feature requests. Include the affected page, browser/device, and steps to reproduce. Redact names, email addresses, private event details, and invite links from screenshots.

For a code change, fork the repository, create a branch, and follow the setup in the README with your own development database. Keep changes focused and describe the user-visible behavior in the pull request.

Run `npm run typecheck`, `npm run test:unit`, and `npm run build`. For UI or account changes, run the relevant browser tests against a disposable test database. Include the checks you ran and any limitations in your pull request.

Never commit `.env` files, API tokens, session cookies, account exports, or generated test artifacts. Keep `.env.example` limited to placeholders. Report vulnerabilities privately as described in SECURITY.md.
