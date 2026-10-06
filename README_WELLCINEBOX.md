# Well Cinebox fork notes

This fork adds an independently built, Vercel-ready discovery frontend under [`apps/webapp/`](apps/webapp/). It is kept separate from the upstream Rust terminal app.

- **Webapp setup and Vercel deployment:** [`apps/webapp/README.md`](apps/webapp/README.md)
- **Upstream source:** [`mesamirh/MovieBox-Tui`](https://github.com/mesamirh/MovieBox-Tui)
- **Automated sync:** `.github/workflows/sync-upstream.yml` checks upstream hourly and on manual dispatch. A clean merge is pushed to this fork; a conflict stops without pushing and must be resolved manually.
- **Vercel:** Import this repository and set the project root directory to `apps/webapp`. Automatic production deploys begin after Vercel Git integration is connected and the GitHub Actions workflow is enabled for this fork.

The webapp is a discovery UI demo. It does not provide streaming, scraping, or downloading. To add real titles and play links, configure a licensed catalog/streaming provider and implement an authorized integration.
