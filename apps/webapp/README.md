# Well Cinebox webapp

The browser app is a responsive React/Vite frontend for the Rust MovieBox-Tui provider service. It includes live discovery/search, provider-aware title details, saved titles, episode/source selection, and a browser video player.

## Local development

Run the API from the repository root in one terminal:

```bash
PORT=3001 cargo run --bin wellcinebox-api
```

Run the frontend in another terminal:

```bash
cd apps/webapp
npm ci
npm run dev
```

Vite listens on port 3000. Its `/api` and `/health` development proxies target `http://127.0.0.1:3001`. The homepage uses the MovieBox tab-zero catalog feed; source selection lets users browse another configured provider. The app’s own SPA routes are declared in `public/manus-routes.json`.

## Build and hosting

```bash
npm ci
npm run build
```

The build output is `dist/`. In Manus hosting, the webapp is the static half of a hybrid deployment; the root Rust API container serves `/api/*` and `/health`, while static files and app routes are served from `apps/webapp/dist`. `npm run preview` can be used to inspect the production bundle locally after building.

## Playback and availability

Progressive media and browser-native HLS use the HTML video element. HLS.js and dash.js are downloaded only when the selected source is an HLS (`.m3u8`) or DASH (`.mpd`) playlist. Actual playability remains provider-, origin-, browser-, and CORS-dependent. Some browsers forbid provider request headers or cross-origin media requests; choose a different source if playback fails. Playback URLs live only in the current browser session. “My list” is stored locally and is not synced across devices.

This public-source integration exposes only the provider implementations already enabled in MovieBox-Tui. The API rejects arbitrary client-supplied proxy URLs and validates provider-specific IDs. This version does not add login, a database, a media-byte proxy, subtitle forwarding, or durable user accounts.
