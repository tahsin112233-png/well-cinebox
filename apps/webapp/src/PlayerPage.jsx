import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, CircleAlert, Info } from 'lucide-react';

const BROWSER_FORBIDDEN_HEADERS = new Set([
  'accept-encoding',
  'connection',
  'content-length',
  'cookie',
  'host',
  'origin',
  'referer',
  'user-agent',
]);

function headerEntries(value) {
  if (Array.isArray(value)) {
    return value.filter((entry) => Array.isArray(entry) && entry.length >= 2);
  }
  if (value && typeof value === 'object') return Object.entries(value);
  return [];
}

function addBrowserHeaders(request, headers) {
  for (const [name, value] of headers) {
    if (BROWSER_FORBIDDEN_HEADERS.has(String(name).toLowerCase())) continue;
    try {
      request.setRequestHeader(name, value);
    } catch {
      // Browsers reject some provider headers; keep playback usable when possible.
    }
  }
}

export default function PlayerPage({ route, navigate }) {
  const [playback, setPlayback] = useState(null);
  const [failed, setFailed] = useState(false);
  const videoRef = useRef(null);

  useEffect(() => {
    setFailed(false);
    try {
      setPlayback(JSON.parse(sessionStorage.getItem('wellcinebox:playback') || 'null'));
    } catch {
      setPlayback(null);
    }
  }, [route]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !playback?.url) return undefined;

    let disposed = false;
    let hlsPlayer;
    let dashPlayer;
    const headers = headerEntries(playback.headers);
    const cleanUrl = playback.url.toLowerCase().split(/[?#]/, 1)[0];

    const initialize = async () => {
      try {
        if (cleanUrl.endsWith('.m3u8')) {
          const { default: Hls } = await import('hls.js');
          if (disposed) return;
          if (Hls.isSupported()) {
            hlsPlayer = new Hls({ xhrSetup: (xhr) => addBrowserHeaders(xhr, headers) });
            hlsPlayer.on(Hls.Events.ERROR, (_event, data) => {
              if (data.fatal && !disposed) setFailed(true);
            });
            hlsPlayer.loadSource(playback.url);
            hlsPlayer.attachMedia(video);
          } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
            video.src = playback.url;
          } else {
            setFailed(true);
          }
          return;
        }

        if (cleanUrl.endsWith('.mpd')) {
          const { default: dashjs } = await import('dashjs');
          if (disposed) return;
          dashPlayer = dashjs.MediaPlayer().create();
          dashPlayer.extend('RequestModifier', () => ({
            modifyRequestHeader: (xhr) => {
              addBrowserHeaders(xhr, headers);
              return xhr;
            },
          }), true);
          dashPlayer.on(dashjs.MediaPlayer.events.ERROR, () => {
            if (!disposed) setFailed(true);
          });
          dashPlayer.initialize(video, playback.url, true);
          return;
        }

        video.src = playback.url;
        video.load();
      } catch {
        if (!disposed) setFailed(true);
      }
    };

    void initialize();

    return () => {
      disposed = true;
      hlsPlayer?.destroy();
      dashPlayer?.reset();
      video.removeAttribute('src');
      video.load();
    };
  }, [playback?.url, playback?.headers]);

  if (!playback) {
    return (
      <main className="page-shell">
        <div className="video-failure">
          <h2>Playback session not found.</h2>
          <p>Choose a source from a title detail page to start watching.</p>
        </div>
      </main>
    );
  }

  const hasHeaders = headerEntries(playback.headers).length > 0;
  const titleUrl = `/title/${encodeURIComponent(route.provider)}/${encodeURIComponent(route.id)}`;

  return (
    <main className="player-page">
      <div className="player-head">
        <button className="back-button" onClick={() => navigate(titleUrl)}>
          <ArrowLeft size={17} /> Back to title
        </button>
        <div>
          <p className="eyebrow">
            {playback.sourceLabel || 'SOURCE'} <i /> {playback.provider || route.provider}
          </p>
          <h1>{playback.title || 'Now playing'}</h1>
        </div>
      </div>
      <div className="video-wrap">
        {failed ? (
          <div className="video-failure">
            <CircleAlert size={35} />
            <h2>Playback could not start.</h2>
            <p>The source returned a URL this browser could not play. Try another release or quality.</p>
            <button className="ghost-button" onClick={() => navigate(titleUrl)}>
              Choose another source
            </button>
          </div>
        ) : (
          <video ref={videoRef} controls autoPlay playsInline onError={() => setFailed(true)}>
            <track kind="captions" />
          </video>
        )}
      </div>
      {hasHeaders && (
        <div className="player-note">
          <Info size={17} />
          <span>
            <b>Source note:</b> some providers require headers browsers do not permit or streams
            that block cross-origin playback. If this release fails, return to the title and choose
            another source.
          </span>
        </div>
      )}
      <p className="muted player-caption">
        {playback.sourceLabel || 'Provider source'} · {playback.quality || 'Quality selected by source'}
      </p>
    </main>
  );
}
