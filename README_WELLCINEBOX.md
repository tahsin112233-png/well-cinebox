# Well Cinebox

This repository is the Well Cinebox fork of [mesamirh/MovieBox-Tui](https://github.com/mesamirh/MovieBox-Tui). It keeps the original Rust terminal application and provider library, adds a hosted Rust HTTP API, and includes a responsive React/Vite browser app under [`apps/webapp/`](apps/webapp/).

## Local development

Requirements: Rust 1.90+ and Node.js/npm. Start the Rust API from the repository root:

```bash
PORT=3001 cargo run --bin wellcinebox-api
```

In a second terminal:

```bash
cd apps/webapp
npm ci
npm run dev
```

Vite serves the webapp at port 3000 and proxies `/api/*` and `/health` to the API on port 3001. The homepage reads the live MovieBox tab-zero feed; search can query one source or all enabled sources. Detail pages request provider metadata and episode lists, then resolve a selected release for browser playback.

## Manus hosting

The Manus project serves the Vite build as static files and runs the Rust API in a container. Static output is `apps/webapp/dist`; the container health endpoint is `/health`. The browser is hosted at the project URL. The app does not require a database or private client-side credentials.

The webapp can present movie and series sources returned by the existing provider layer. It uses the HTML video element for progressive streams and native HLS, loading `hls.js`/`dashjs` only when HLS/DASH playlists are selected. Direct provider playback depends on the host, browser, CORS policy, and any provider-required headers; the app reports failures and lets viewers try a different source.

## API routes

- `GET /api/health`, `GET /api/providers`
- `GET /api/home?provider=moviebox&tab=0&page=1`
- `GET /api/search?q=…&provider=all&page=1`
- `GET /api/titles/{provider}/{id}`
- `GET /api/streams/{provider}/{id}?season=0&episode=0`
- `POST /api/playback` with `{ "provider", "id", "season", "episode", "releaseIndex" }`

Only the providers already implemented and enabled in this fork are exposed. Provider ID checks restrict outbound source resolution; browser input cannot choose an arbitrary proxy URL. The API is public and does not implement user accounts or per-user access control.

## Upstream updates

`.github/workflows/sync-upstream.yml` checks upstream hourly at minute 17 and can be run manually. It merges conflict-free upstream changes into this fork and pushes to `main`; on a conflict it aborts without pushing so maintainers can resolve the change deliberately.

An enabled Manus GitHub event trigger watches commits on this fork’s `main` branch whose commit text contains `upstream/main` and whose author is `github-actions[bot]`. For a matching commit it imports the changes since the saved fork revision into the existing Manus project, while preserving Well Cinebox-owned frontend/API/deployment files. It runs the Rust and webapp checks, updates the saved revision, creates a Manus checkpoint, and requests publication. Patch conflicts, incompatible changes, or failed checks stop the handoff without overwriting the hosted project.

The Manus project keeps `publishing.auto_publish` off unless its owner changes that preference. With it off, the event trigger submits an explicit publish request after each accepted checkpoint; the first or a later request may require owner confirmation. Enable Auto-publish in the Manus dashboard if checkpoint-triggered production deployment should proceed without an additional publish request. An upstream merge is not live until the Manus publication succeeds.
