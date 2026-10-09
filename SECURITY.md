# Security

Please report a vulnerability privately, through GitHub's
[private vulnerability reporting](../../security/advisories/new) for this repository,
rather than in a public issue. I'll reply within a week.

What's in scope: the Cloudflare Worker (`apps/web/worker/`), which serves the static app and
the published data files from KV, and the ingest (`packages/ingest/`), which fetches public RSS
feeds. The site has no accounts and stores no personal data. Credentials (Cloudflare, Azure,
Claude) live only in GitHub Actions secrets and the Pi's local `.env`, never in the repository.
