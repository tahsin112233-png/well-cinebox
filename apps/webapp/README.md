# Well Cinebox webapp

A responsive Vite + React discovery homepage living alongside the original Rust MovieBox-Tui project in `apps/webapp`.

## Local development

```bash
npm ci
npm run dev
```

## Vercel

Import `tahsin112233-png/well-cinebox` in Vercel and set **Root Directory** to `apps/webapp`. The included `vercel.json` defines `npm ci`, `npm run build`, and `dist` output. Vercel's Git integration can deploy commits pushed to the selected production branch.

## Demo scope

The sample collection and all artwork in this preview are for discovery UI demonstration; the app does not host, scrape, stream, or download movies/series. Playback and real availability require integration with a licensed catalog/provider and its authorized viewing links. My List is stored locally in the browser.

## Upstream relationship

The repository fork tracks `mesamirh/MovieBox-Tui` as its upstream. The root-level `.github/workflows/sync-upstream.yml` checks for upstream commits and merges them into the fork when conflict-free. A successful merge advances the branch and can trigger a Vercel deployment **if Vercel's Git integration is connected**. Upstream TUI changes do not automatically become new web features: the Rust application and this separate browser UI have different runtimes and product behavior; conflicts stop the sync for human review.
