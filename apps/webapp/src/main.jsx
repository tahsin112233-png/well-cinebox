import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import PlayerPage from './PlayerPage.jsx';
import {
  ArrowLeft,
  ArrowRight,
  Bookmark,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CircleAlert,
  Film,
  Home as HomeIcon,
  Info,
  LoaderCircle,
  Menu,
  Play,
  Plus,
  Search,
  SlidersHorizontal,
  Sparkles,
  Tv,
  X,
} from 'lucide-react';
import './styles.css';

const PROVIDERS = [
  { value: 'all', label: 'All sources' },
  { value: 'moviebox', label: 'MovieBox' },
  { value: 'fourkhdhub', label: '4KHDHub' },
  { value: 'dramachi', label: 'DramaChi' },
  { value: 'bdix_circleftp', label: 'CircleFTP (BDIX)' },
  { value: 'bdix_dhakaflix', label: 'DhakaFlix (BDIX)' },
];
const SOURCE_LABELS = Object.fromEntries(PROVIDERS.map(({ value, label }) => [value, label]));
const HOME_SOURCES = PROVIDERS.filter(({ value }) => value !== 'all').map(({ value }) => value);

function providerLabel(value) {
  return SOURCE_LABELS[value] || value || 'Catalog';
}

function firstValue(...values) {
  return values.find((value) => value !== undefined && value !== null && value !== '') ?? '';
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function formatId(item) {
  const raw = item?.id ?? item?.title_id ?? item?.slug ?? item?.url;
  if (raw && typeof raw === 'object') return String(firstValue(raw.value, raw.id, raw.slug));
  return raw === undefined || raw === null ? '' : String(raw);
}

function isSeries(item) {
  const value = String(firstValue(item?.type, item?.kind, item?.media_type, item?.content_type)).toLowerCase();
  return value.includes('series') || value.includes('tv') || value.includes('show') || asArray(item?.seasons).length > 0;
}

function releaseYear(item) {
  const match = String(item?.year || '').match(/\b(?:19|20)\d{2}\b/);
  return match ? Number(match[0]) : 0;
}

function newestFirst(items) {
  return [...items].sort((left, right) => releaseYear(right) - releaseYear(left));
}

function providerNumber(value, fallback) {
  const number = Number(value);
  return Number.isInteger(number) && number >= 0 ? number : fallback;
}

function asGenres(value) {
  if (Array.isArray(value)) return value.filter(Boolean).map(String);
  if (typeof value === 'string' && value.trim()) return value.split(/[,·]/).map((genre) => genre.trim()).filter(Boolean);
  return [];
}

function normalizeItem(raw, index = 0, providerHint = '') {
  if (!raw || typeof raw !== 'object') return null;

  // CatalogItem.title is a string. Only unwrap `title` when it is itself an object;
  // otherwise use the item object or every valid API result is silently discarded.
  const source = raw.item && typeof raw.item === 'object'
    ? raw.item
    : raw.title && typeof raw.title === 'object'
      ? raw.title
      : raw;
  const nestedId = source.id && typeof source.id === 'object' ? source.id : null;
  const provider = String(firstValue(
    source.provider,
    source.source,
    source.provider_id,
    nestedId?.provider,
    providerHint,
    'moviebox',
  ));
  const id = formatId(source) || `${provider}-${index}`;
  const title = String(firstValue(source.title, source.name, source.original_title, source.label));
  if (!title) return null;

  const mediaType = firstValue(source.media_type, source.type, source.kind, source.content_type);
  return {
    ...source,
    id,
    provider,
    title,
    description: String(firstValue(source.description, source.overview, source.synopsis)),
    year: String(firstValue(source.year, source.release_year, source.releaseDate, source.release_date)),
    genres: asGenres(firstValue(source.genres, source.genre)),
    type: String(firstValue(mediaType, isSeries(source) ? 'series' : 'movie')),
    poster: String(firstValue(source.poster_url, source.poster, source.cover, source.cover_url, source.image, source.image_url, source.thumbnail, source.thumbnail_url)),
    backdrop: String(firstValue(source.backdrop_url, source.backdrop, source.banner, source.banner_url, source.hero, source.hero_url)),
    seasons: asArray(source.seasons),
    episodes: asArray(source.episodes),
  };
}

function normalizeItems(payload, providerHint = '') {
  return asArray(payload?.items ?? payload?.results ?? payload)
    .map((item, index) => normalizeItem(item, index, providerHint))
    .filter(Boolean);
}

function displayTitle(title = '') {
  const cleaned = String(title)
    .replace(/\s*\[(?:CAM|HDCAM|HDTS|HDTC|TS|TELESYNC|PRE-DVDRIP|WEB-DL|WEBRIP|BLURAY|1080P|720P|Hindi|English|Tamil|Telugu|Kannada|Malayalam|Korean|Japanese|Chinese|Dual Audio|Multi Audio)\]/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
  return cleaned || title;
}

function imageUrl(item) {
  const url = String(firstValue(item?.poster, item?.backdrop));
  return /^https?:\/\//i.test(url) ? url : '';
}

function savedKey(item) {
  return `${item.provider}:${item.id}`;
}

function readSaved() {
  try {
    return JSON.parse(localStorage.getItem('wellcinebox:saved') || '[]');
  } catch {
    return [];
  }
}

function interleave(lists) {
  const result = [];
  const longest = Math.max(0, ...lists.map((list) => list.length));
  for (let index = 0; index < longest; index += 1) {
    for (const list of lists) {
      if (list[index]) result.push(list[index]);
    }
  }
  const seen = new Set();
  return result.filter((item) => {
    const key = savedKey(item);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

async function fetchHomeSource(provider, parentSignal) {
  const controller = new AbortController();
  const abortFromParent = () => controller.abort();
  parentSignal.addEventListener('abort', abortFromParent, { once: true });
  const timeout = window.setTimeout(() => controller.abort(), 12000);

  try {
    const params = new URLSearchParams({ provider, tab: '0', page: '1' });
    const response = await fetch(`/api/home?${params}`, {
      headers: { Accept: 'application/json' },
      signal: controller.signal,
    });
    const body = await response.json().catch(() => null);
    if (!response.ok) throw new Error(body?.error || `Request failed (${response.status})`);
    return {
      provider,
      items: normalizeItems(body?.items, body?.provider || provider),
      error: '',
    };
  } catch (error) {
    const message = error?.name === 'AbortError' ? 'Request timed out.' : error?.message || 'Source unavailable.';
    return { provider, items: [], error: message };
  } finally {
    window.clearTimeout(timeout);
    parentSignal.removeEventListener('abort', abortFromParent);
  }
}

function useHomeFeeds(selectedProvider) {
  const [state, setState] = useState({ loading: true, feeds: [], items: [], error: '', pending: 0 });
  useEffect(() => {
    const controller = new AbortController();
    const sources = selectedProvider === 'all' ? HOME_SOURCES : [selectedProvider];
    setState({ loading: true, feeds: [], items: [], error: '', pending: sources.length });

    sources.forEach((provider) => {
      fetchHomeSource(provider, controller.signal).then((feed) => {
        if (controller.signal.aborted) return;
        setState((current) => {
          const feeds = [...current.feeds.filter((entry) => entry.provider !== provider), feed]
            .sort((left, right) => sources.indexOf(left.provider) - sources.indexOf(right.provider));
          const items = interleave(sources.map((source) => feeds.find((entry) => entry.provider === source)?.items || []));
          const pending = Math.max(0, current.pending - 1);
          const everySourceFailed = pending === 0 && feeds.every((entry) => entry.error);
          return {
            loading: pending > 0,
            pending,
            feeds,
            items,
            error: everySourceFailed ? 'All selected sources are unavailable right now.' : '',
          };
        });
      });
    });

    return () => controller.abort();
  }, [selectedProvider]);
  return state;
}

function useFetchJson(url, enabled = true) {
  const [state, setState] = useState({ loading: enabled, error: '', data: null });
  useEffect(() => {
    if (!enabled) {
      setState({ loading: false, error: '', data: null });
      return undefined;
    }
    const controller = new AbortController();
    setState({ loading: true, error: '', data: null });
    fetch(url, { headers: { Accept: 'application/json' }, signal: controller.signal })
      .then(async (response) => {
        const body = await response.json().catch(() => null);
        if (!response.ok) throw new Error(body?.error || body?.message || `Request failed (${response.status})`);
        return body;
      })
      .then((data) => setState({ loading: false, error: '', data }))
      .catch((error) => {
        if (!controller.signal.aborted) setState({ loading: false, error: error.message || 'Could not reach the catalog.', data: null });
      });
    return () => controller.abort();
  }, [url, enabled]);
  return state;
}

function useRoute() {
  const parse = useCallback(() => {
    const path = window.location.pathname.replace(/\/+$/, '') || '/';
    const params = new URLSearchParams(window.location.search);
    if (path === '/movies') return { kind: 'home', filter: 'movie' };
    if (path === '/series') return { kind: 'home', filter: 'series' };
    if (path === '/search') return { kind: 'search', query: params.get('q') || '', provider: params.get('provider') || 'all' };
    if (path === '/saved') return { kind: 'saved' };
    const match = path.match(/^\/title\/([^/]+)\/([^/]+)$/);
    if (match) return { kind: 'title', provider: decodeURIComponent(match[1]), id: decodeURIComponent(match[2]) };
    const playMatch = path.match(/^\/play\/([^/]+)\/([^/]+)$/);
    if (playMatch) return {
      kind: 'play',
      provider: decodeURIComponent(playMatch[1]),
      id: decodeURIComponent(playMatch[2]),
      season: Number(params.get('season') || 0),
      episode: Number(params.get('episode') || 0),
    };
    return { kind: 'home', filter: 'all' };
  }, []);
  const [route, setRoute] = useState(parse);
  useEffect(() => {
    const onPop = () => setRoute(parse());
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, [parse]);
  const navigate = useCallback((path) => {
    window.history.pushState({}, '', path);
    setRoute(parse());
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [parse]);
  return [route, navigate];
}

function Brand({ navigate }) {
  return (
    <button className="brand" onClick={() => navigate('/')} aria-label="Well Cinebox home">
      <span className="brand-mark"><span /></span>
      <span className="brand-word">well<span>cinebox</span></span>
    </button>
  );
}

function Header({ route, navigate, onSearch }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(route.kind === 'search');
  const [value, setValue] = useState(route.kind === 'search' ? route.query : '');
  useEffect(() => {
    if (route.kind === 'search') {
      setSearchOpen(true);
      setValue(route.query);
    }
  }, [route]);
  const go = (path) => {
    setMenuOpen(false);
    navigate(path);
  };
  const submit = (event) => {
    event.preventDefault();
    if (value.trim()) onSearch(value.trim());
  };
  const activeFilter = route.filter || 'all';

  return (
    <header className="topbar">
      <Brand navigate={navigate} />
      <nav className={menuOpen ? 'main-nav nav-open' : 'main-nav'} aria-label="Primary navigation">
        <button className={route.kind === 'home' && activeFilter === 'all' ? 'nav-link active' : 'nav-link'} onClick={() => go('/')}>Home</button>
        <button className={route.kind === 'home' && activeFilter === 'movie' ? 'nav-link active' : 'nav-link'} onClick={() => go('/movies')}>Movies</button>
        <button className={route.kind === 'home' && activeFilter === 'series' ? 'nav-link active' : 'nav-link'} onClick={() => go('/series')}>Series</button>
        <button className={route.kind === 'saved' ? 'nav-link active' : 'nav-link'} onClick={() => go('/saved')}><Bookmark size={15} /> My List</button>
      </nav>
      <div className="top-actions">
        <form className={searchOpen ? 'search-box search-open' : 'search-box'} onSubmit={submit} role="search">
          <button
            type="button"
            className="icon-button"
            aria-label={searchOpen ? 'Close search' : 'Open search'}
            onClick={() => {
              setSearchOpen((open) => !open);
              if (!searchOpen) window.setTimeout(() => document.querySelector('.search-box input')?.focus(), 0);
            }}
          ><Search size={18} /></button>
          {searchOpen && <input value={value} onChange={(event) => setValue(event.target.value)} placeholder="Titles, movies, series" aria-label="Search titles" />}
          {searchOpen && value && <button type="button" className="search-clear" aria-label="Clear search" onClick={() => setValue('')}><X size={14} /></button>}
        </form>
        <button className="menu-button icon-button" aria-label="Toggle navigation" aria-expanded={menuOpen} onClick={() => setMenuOpen((open) => !open)}><Menu size={20} /></button>
      </div>
    </header>
  );
}

function Status({ loading, error, emptyTitle = 'Nothing here yet.', emptyBody = 'The catalog did not return any titles.' }) {
  if (loading) return <div className="state-card"><LoaderCircle className="spin" size={22} /><span>Connecting to the catalog…</span></div>;
  if (error) return <div className="state-card error-state"><CircleAlert size={22} /><div><strong>Catalog unavailable</strong><span>{error}</span><small>Try again in a moment, or choose another source.</small></div></div>;
  return <div className="state-card empty-state"><Film size={22} /><div><strong>{emptyTitle}</strong><span>{emptyBody}</span></div></div>;
}

function PosterArtwork({ item, className = 'poster-art', eager = false }) {
  const [failed, setFailed] = useState(false);
  const poster = imageUrl(item);
  useEffect(() => setFailed(false), [poster]);
  const hue = Array.from(displayTitle(item.title)).reduce((sum, character) => sum + character.charCodeAt(0), 0) % 360;
  if (poster && !failed) {
    return <img
      className={className}
      src={poster}
      alt={`${displayTitle(item.title)} poster`}
      loading={eager ? 'eager' : 'lazy'}
      fetchPriority={eager ? 'high' : 'auto'}
      onError={() => setFailed(true)}
    />;
  }
  return (
    <div className={`${className} poster-fallback`} style={{ '--poster-hue': `${hue}deg` }} aria-label={`${displayTitle(item.title)} artwork unavailable`}>
      <span className="fallback-kicker">WELL CINEBOX</span>
      <strong>{displayTitle(item.title)}</strong>
      {item.year && <small>{item.year}</small>}
    </div>
  );
}

function ItemCard({ item, index, saved, onOpen, onSave }) {
  const isSaved = saved.some((savedItem) => savedKey(savedItem) === savedKey(item));
  return (
    <article className="title-card" style={{ '--card-index': index % 8 }}>
      <button className="poster-button" onClick={() => onOpen(item)} aria-label={`View ${displayTitle(item.title)}`}>
        <PosterArtwork item={item} />
        <span className="poster-shade" />
        <span className="poster-badge">{isSeries(item) ? 'SERIES' : 'MOVIE'}</span>
        <span className="poster-play"><Play size={17} fill="currentColor" /></span>
        <span className="poster-source">{providerLabel(item.provider)}</span>
      </button>
      <div className="card-meta">
        <button className="card-title" onClick={() => onOpen(item)} title={displayTitle(item.title)}>{displayTitle(item.title)}</button>
        <button className={isSaved ? 'save-button saved' : 'save-button'} onClick={() => onSave(item)} aria-label={isSaved ? `Remove ${item.title} from My List` : `Save ${item.title} to My List`}>
          {isSaved ? <Check size={14} /> : <Plus size={14} />}
        </button>
        <p><span>{item.year || (isSeries(item) ? 'Series' : 'Film')}</span><i /><span>{providerLabel(item.provider)}</span></p>
      </div>
    </article>
  );
}

function Rail({ title, eyebrow, items, saved, onOpen, onSave }) {
  const rowRef = useRef(null);
  if (!items.length) return null;
  const scroll = (direction) => rowRef.current?.scrollBy({ left: direction * Math.max(rowRef.current.clientWidth * 0.82, 260), behavior: 'smooth' });
  return (
    <section className="rail">
      <div className="rail-head">
        <div>
          {eyebrow && <p className="eyebrow">{eyebrow}</p>}
          <h2>{title}</h2>
        </div>
        <div className="rail-tools"><span>{items.length} titles</span><button className="rail-arrow" onClick={() => scroll(-1)} aria-label={`Scroll ${title} left`}><ChevronLeft size={19} /></button><button className="rail-arrow" onClick={() => scroll(1)} aria-label={`Scroll ${title} right`}><ChevronRight size={19} /></button></div>
      </div>
      <div className="poster-row" ref={rowRef}>
        {items.map((item, index) => <ItemCard key={savedKey(item)} item={item} index={index} saved={saved} onOpen={onOpen} onSave={onSave} />)}
      </div>
    </section>
  );
}

function SkeletonRail({ title = 'Loading titles' }) {
  return (
    <section className="rail skeleton-rail" aria-label={title}>
      <div className="rail-head"><h2>{title}</h2></div>
      <div className="poster-row">{Array.from({ length: 7 }, (_, index) => <div className="skeleton-card" key={index}><div /><span /><i /></div>)}</div>
    </section>
  );
}

function Home({ route, navigate, saved, onSave }) {
  const [provider, setProvider] = useState('all');
  const home = useHomeFeeds(provider);
  const filter = route.filter || 'all';
  const items = home.items;
  const filtered = useMemo(() => {
    if (filter === 'series') return items.filter(isSeries);
    if (filter === 'movie') return items.filter((item) => !isSeries(item));
    return items;
  }, [items, filter]);
  const latest = useMemo(() => newestFirst(filtered), [filtered]);
  const hero = useMemo(() => {
    const preferredProvider = provider === 'all' ? 'moviebox' : provider;
    const preferredFeed = home.feeds.find((feed) => feed.provider === preferredProvider);
    const preferredItems = newestFirst(preferredFeed?.items.filter((item) => {
      if (filter === 'series') return isSeries(item);
      if (filter === 'movie') return !isSeries(item);
      return true;
    }) || []);
    const candidates = preferredItems.length
      ? preferredItems
      : preferredFeed || !home.loading
        ? filtered
        : [];
    const cleanPoster = candidates.find((item) => item.poster && !/\[(?:CAM|HDCAM|HDTS|HDTC|TS)\]/i.test(item.title));
    return cleanPoster || candidates.find((item) => item.poster) || candidates[0] || null;
  }, [filtered, filter, home.feeds, home.loading, provider]);
  const detailsUrl = hero
    ? `/api/titles/${encodeURIComponent(hero.provider)}/${encodeURIComponent(hero.id)}`
    : '';
  const heroDetails = useFetchJson(detailsUrl, Boolean(hero));
  const detailedHero = heroDetails.data ? normalizeItem(heroDetails.data, 0, hero?.provider) : null;
  const spotlight = hero ? { ...hero, ...(detailedHero || {}), poster: detailedHero?.poster || hero.poster, title: hero.title } : null;
  const films = newestFirst(filtered.filter((item) => !isSeries(item)));
  const series = newestFirst(filtered.filter(isSeries));
  const open = (item) => navigate(`/title/${encodeURIComponent(item.provider)}/${encodeURIComponent(item.id)}`);
  const failedFeeds = home.feeds.filter((feed) => feed.error);
  const selectedLabel = provider === 'all' ? 'all connected sources' : providerLabel(provider);

  return (
    <main className="home-page">
      {spotlight ? (
        <section className="spotlight" aria-label="Featured title">
          {imageUrl(spotlight) && <img className="spotlight-backdrop" src={imageUrl(spotlight)} alt="" aria-hidden="true" />}
          <div className="spotlight-shade" />
          <div className="spotlight-copy">
            <p className="feature-kicker"><span className="live-dot" /> FRESH FROM {providerLabel(spotlight.provider).toUpperCase()}</p>
            <p className="spotlight-overline"><Sparkles size={14} /> YOUR NEXT WATCH STARTS HERE</p>
            <h1>{displayTitle(spotlight.title)}</h1>
            <div className="spotlight-meta">
              {spotlight.year && <span>{spotlight.year}</span>}
              {spotlight.year && <i />}
              <span>{isSeries(spotlight) ? 'Series' : 'Movie'}</span>
              {spotlight.genres?.[0] && <><i /><span>{spotlight.genres.slice(0, 2).join(' · ')}</span></>}
              {spotlight.imdb_rating && <><i /><span>IMDb {spotlight.imdb_rating}</span></>}
            </div>
            {spotlight.description && <p className="spotlight-description">{spotlight.description}</p>}
            {!spotlight.description && <p className="spotlight-description">A new title from {providerLabel(spotlight.provider)}. Open the details to check availability and choose a source.</p>}
            <div className="spotlight-actions">
              <button className="button-primary" onClick={() => open(spotlight)}><Play size={17} fill="currentColor" /> View title</button>
              <button className="button-secondary" onClick={() => onSave(spotlight)}>
                {saved.some((item) => savedKey(item) === savedKey(spotlight)) ? <Check size={17} /> : <Plus size={17} />}
                My List
              </button>
            </div>
            <p className="spotlight-source-note">Live catalog · Source: {providerLabel(spotlight.provider)}</p>
          </div>
          <div className="spotlight-poster"><PosterArtwork item={spotlight} className="featured-poster-art" eager /></div>
          <div className="spotlight-bottom-fade" />
        </section>
      ) : (
        <section className="spotlight spotlight-empty">
          <div className="spotlight-shade" />
          <div className="spotlight-copy">
            <p className="feature-kicker"><span className="live-dot" /> WELL CINEBOX</p>
            <h1>{home.loading ? 'Loading the latest from your sources…' : 'Your next watch is waiting.'}</h1>
            <p className="spotlight-description">{home.error || 'Browse live titles from MovieBox, 4KHDHub, DramaChi and other connected sources.'}</p>
          </div>
        </section>
      )}

      <section className="home-shell" aria-label="Browse movies and series">
        <div className="catalog-bar">
          <div className="catalog-heading">
            <p className="eyebrow">THE LIVE CATALOG</p>
            <h2>{filter === 'movie' ? 'Movies' : filter === 'series' ? 'Series' : 'Find your next watch'}</h2>
            <p className="catalog-count">
              <span className="live-dot" />
              {home.loading && !items.length ? 'Connecting to sources' : `${items.length} ${items.length === 1 ? 'title' : 'titles'} from ${home.feeds.filter((feed) => feed.items.length).length} live feeds`}
            </p>
          </div>
          <div className="catalog-filter">
            <label htmlFor="home-provider"><SlidersHorizontal size={15} /> SOURCE</label>
            <div className="select-wrap">
              <select id="home-provider" value={provider} onChange={(event) => setProvider(event.target.value)}>
                {PROVIDERS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select>
              <ChevronDown size={16} />
            </div>
          </div>
        </div>

        <div className="category-strip" aria-label="Browse categories">
          <button className={filter === 'all' ? 'category-chip active' : 'category-chip'} onClick={() => navigate('/')}><HomeIcon size={15} /> All titles <span>{items.length}</span></button>
          <button className={filter === 'movie' ? 'category-chip active' : 'category-chip'} onClick={() => navigate('/movies')}><Film size={15} /> Movies <span>{items.filter((item) => !isSeries(item)).length}</span></button>
          <button className={filter === 'series' ? 'category-chip active' : 'category-chip'} onClick={() => navigate('/series')}><Tv size={15} /> Series <span>{items.filter(isSeries).length}</span></button>
        </div>

        {failedFeeds.length > 0 && (
          <div className="partial-feed-note"><Info size={15} /><span>{filtered.length ? 'Showing titles from available sources.' : 'No titles are available in this view yet.'} Temporarily unavailable: {failedFeeds.map((feed) => providerLabel(feed.provider)).join(', ')}.</span></div>
        )}

        {home.loading && !filtered.length && <><SkeletonRail title="Connecting to live sources" /><SkeletonRail title={`Loading ${filter === 'series' ? 'series' : 'movies and series'}`} /></>}
        {home.error && !filtered.length && <Status loading={false} error={home.error} />}
        {!home.loading && !home.error && !filtered.length && <Status emptyTitle="No titles in this view." emptyBody={`No results came back from ${selectedLabel}. Choose another source or category.`} />}

        {filtered.length > 0 && (
          <>
            <Rail title="Fresh from your sources" eyebrow="NEWEST RELEASES" items={latest.slice(0, 36)} saved={saved} onOpen={open} onSave={onSave} />
            {films.length > 0 && <Rail title="Latest movies" eyebrow="FEATURE FILMS" items={films.slice(0, 60)} saved={saved} onOpen={open} onSave={onSave} />}
            {series.length > 0 && <Rail title="Series to settle into" eyebrow="SERIES" items={series.slice(0, 60)} saved={saved} onOpen={open} onSave={onSave} />}
            {provider === 'all' && home.feeds.map((feed) => (
              feed.items.length > 0 && <Rail
                key={feed.provider}
                title={`Latest from ${providerLabel(feed.provider)}`}
                eyebrow={`${feed.items.length} TITLES IN THIS FEED`}
                items={feed.items.slice(0, 60)}
                saved={saved}
                onOpen={open}
                onSave={onSave}
              />
            ))}
            {home.loading && <div className="feed-loading-note"><LoaderCircle className="spin" size={15} /> Loading remaining source feeds…</div>}
          </>
        )}
      </section>
    </main>
  );
}

function SearchPage({ route, navigate, saved, onSave }) {
  const [provider, setProvider] = useState(route.provider || 'all');
  const search = useFetchJson(`/api/search?q=${encodeURIComponent(route.query)}&provider=${encodeURIComponent(provider)}&page=1`, Boolean(route.query));
  const items = useMemo(() => normalizeItems(search.data?.items, search.data?.provider || provider), [search.data, provider]);
  const open = (item) => navigate(`/title/${encodeURIComponent(item.provider)}/${encodeURIComponent(item.id)}`);
  return (
    <main className="page-shell">
      <div className="page-heading">
        <div><p className="eyebrow">SEARCH THE CATALOG</p><h1>Results for <em>“{route.query}”</em></h1><p className="muted">{search.loading ? 'Searching connected sources…' : `${items.length} ${items.length === 1 ? 'title' : 'titles'} found`}</p></div>
        <div className="catalog-filter"><label htmlFor="search-provider"><SlidersHorizontal size={15} /> SOURCE</label><div className="select-wrap"><select id="search-provider" value={provider} onChange={(event) => setProvider(event.target.value)}>{PROVIDERS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select><ChevronDown size={16} /></div></div>
      </div>
      {search.loading || search.error ? <Status loading={search.loading} error={search.error} /> : !items.length ? <Status emptyTitle="No matching titles." emptyBody="Try another title or choose a different source." /> : <div className="search-grid">{items.map((item, index) => <ItemCard key={savedKey(item)} item={item} index={index} saved={saved} onOpen={open} onSave={onSave} />)}</div>}
    </main>
  );
}

function SavedPage({ navigate, saved, onSave }) {
  const open = (item) => navigate(`/title/${encodeURIComponent(item.provider)}/${encodeURIComponent(item.id)}`);
  return (
    <main className="page-shell">
      <div className="page-heading"><div><p className="eyebrow">YOUR COLLECTION</p><h1>My <em>List</em></h1><p className="muted">Saved on this device, ready when you are.</p></div><Bookmark className="heading-icon" size={42} /></div>
      {saved.length ? <div className="search-grid">{saved.map((item, index) => <ItemCard key={savedKey(item)} item={item} index={index} saved={saved} onOpen={open} onSave={onSave} />)}</div> : <Status emptyTitle="Your list is waiting." emptyBody="Use the plus button on any title to keep it here." />}
    </main>
  );
}

function DetailPage({ route, navigate, saved, onSave }) {
  const details = useFetchJson(`/api/titles/${encodeURIComponent(route.provider)}/${encodeURIComponent(route.id)}`);
  const item = normalizeItem(details.data, 0, route.provider);
  const [seasonIndex, setSeasonIndex] = useState(0);
  const [episodeNumber, setEpisodeNumber] = useState(0);
  const [streamOpen, setStreamOpen] = useState(false);
  const seasons = asArray(item?.seasons);
  const seasonData = seasons[seasonIndex] || {};
  const seasonNumber = isSeries(item) && seasons.length
    ? providerNumber(seasonData.number, seasonIndex + 1)
    : isSeries(item) ? 1 : 0;
  const episodes = asArray(seasonData.episodes ?? (seasonIndex === 0 ? item?.episodes : []));
  const streams = useFetchJson(`/api/streams/${encodeURIComponent(route.provider)}/${encodeURIComponent(route.id)}?season=${seasonNumber}&episode=${episodeNumber}`, streamOpen && Boolean(item));
  useEffect(() => {
    setSeasonIndex(0);
    setEpisodeNumber(0);
    setStreamOpen(false);
  }, [route.provider, route.id]);
  const releases = asArray(streams.data?.releases);
  const isSaved = item && saved.some((savedItem) => savedKey(savedItem) === savedKey(item));

  return (
    <main className="detail-page">
      {details.loading || details.error ? <Status loading={details.loading} error={details.error} /> : item && <>
        <section className="detail-hero">
          {imageUrl(item) && <img src={imageUrl(item)} alt="" onError={(event) => { event.currentTarget.style.display = 'none'; }} />}
          <div className="detail-overlay" />
          <button className="back-button" onClick={() => navigate('/')}><ArrowLeft size={17} /> Back to Home</button>
          <div className="detail-heading"><p className="eyebrow">{providerLabel(item.provider)} <i /> {isSeries(item) ? 'SERIES' : 'MOVIE'}</p><h1>{displayTitle(item.title)}</h1><div className="spotlight-meta"><span>{item.year || 'Year not listed'}</span><i /><span>{item.genres.join(' · ') || 'Genre not listed'}</span></div></div>
        </section>
        <section className="detail-body">
          <div className="detail-copy"><p className="eyebrow">ABOUT THIS TITLE</p><p className="description">{item.description || 'The provider has not supplied a synopsis for this title yet.'}</p><div className="spotlight-actions"><button className="button-primary" onClick={() => { setEpisodeNumber(episodes.length ? providerNumber(episodes[0].number, 1) : 0); setStreamOpen(true); }}><Play size={17} fill="currentColor" /> {isSeries(item) ? 'Choose episode' : 'Find a source'}</button><button className="button-secondary" onClick={() => onSave(item)}>{isSaved ? <Check size={16} /> : <Plus size={16} />}{isSaved ? 'In My List' : 'My List'}</button></div></div>
          <aside className="detail-facts"><span><b>Source</b>{providerLabel(item.provider)}</span><span><b>Format</b>{isSeries(item) ? 'Series' : 'Movie'}</span><span><b>Genres</b>{item.genres.join(', ') || 'Not listed'}</span>{item.duration && <span><b>Runtime</b>{item.duration}</span>}</aside>
        </section>
        {isSeries(item) && <section className="episode-panel"><div className="episode-head"><div><p className="eyebrow">SERIES GUIDE</p><h2>Choose an episode</h2></div><div className="season-picker"><label htmlFor="season">Season</label><select id="season" value={seasonIndex} onChange={(event) => { setSeasonIndex(Number(event.target.value)); setEpisodeNumber(0); setStreamOpen(false); }}>{seasons.map((entry, index) => <option value={index} key={index}>{entry.name || entry.title || `Season ${index + 1}`}</option>)}</select><ChevronDown size={15} /></div></div>{episodes.length ? <div className="episode-grid">{episodes.map((entry, index) => { const number = providerNumber(entry.number, index + 1); return <button className={episodeNumber === number && streamOpen ? 'episode active' : 'episode'} key={entry.id || `${seasonNumber}-${number}`} onClick={() => { setEpisodeNumber(number); setStreamOpen(true); }}><span>{String(number).padStart(2, '0')}</span><b>{entry.title || entry.name || `Episode ${number}`}</b><small>{entry.description || 'Open episode sources'}</small><ArrowRight size={15} /></button>; })}</div> : <Status emptyTitle="Episodes are not listed." emptyBody="The provider did not return episode data for this season." />}</section>}
        {streamOpen && <SourceChooser key={`${seasonNumber}-${episodeNumber}`} streams={streams} releases={releases} item={item} season={seasonNumber} episode={episodeNumber} navigate={navigate} />}
      </>}
    </main>
  );
}

function SourceChooser({ streams, releases, item, season, episode, navigate }) {
  const [selected, setSelected] = useState(0);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState('');
  const start = async () => {
    setStarting(true);
    setError('');
    try {
      const response = await fetch('/api/playback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ provider: item.provider, id: item.id, season, episode, releaseIndex: selected }),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok) throw new Error(body?.error || body?.message || `Playback failed (${response.status})`);
      if (!body?.url) throw new Error('The provider did not return a playable URL.');
      sessionStorage.setItem('wellcinebox:playback', JSON.stringify({ ...body, title: item.title, season, episode, releaseIndex: selected }));
      navigate(`/play/${encodeURIComponent(item.provider)}/${encodeURIComponent(item.id)}?season=${season}&episode=${episode}&release=${selected}`);
    } catch (playbackError) {
      setError(playbackError.message || 'Could not start playback.');
    } finally {
      setStarting(false);
    }
  };
  return (
    <section className="source-panel">
      <div className="source-head"><div><p className="eyebrow">AVAILABLE SOURCES</p><h2>Choose a stream</h2><p className="muted">Select a release; provider availability can change.</p></div><span className="source-count">{releases.length} {releases.length === 1 ? 'source' : 'sources'}</span></div>
      {streams.loading ? <Status loading /> : streams.error ? <Status loading={false} error={streams.error} /> : releases.length ? <>
        <div className="release-list">{releases.map((release, index) => <button className={selected === index ? 'release selected' : 'release'} key={index} onClick={() => setSelected(index)}><span className="radio-dot" /><span><b>{firstValue(release.filename, release.label, release.sourceLabel, release.source, `Source ${index + 1}`)}</b><small>{firstValue(release.quality, release.resolution, release.format, 'Quality not listed')}</small></span><ChevronRight size={16} /></button>)}</div>
        <button className="button-primary start-button" onClick={start} disabled={starting}>{starting ? <><LoaderCircle className="spin" size={16} /> Preparing stream…</> : <><Play size={16} fill="currentColor" /> Play selected source</>}</button>
        {error && <p className="inline-error"><CircleAlert size={15} /> {error}</p>}
      </> : <Status emptyTitle="No sources returned." emptyBody="This title has no playable releases right now." />}
    </section>
  );
}

function App() {
  const [route, navigate] = useRoute();
  const [saved, setSaved] = useState(readSaved);
  useEffect(() => localStorage.setItem('wellcinebox:saved', JSON.stringify(saved)), [saved]);
  const onSave = (item) => setSaved((current) => current.some((savedItem) => savedKey(savedItem) === savedKey(item))
    ? current.filter((savedItem) => savedKey(savedItem) !== savedKey(item))
    : [...current, item]);
  const onSearch = (query) => navigate(`/search?q=${encodeURIComponent(query)}&provider=all`);

  return (
    <div className="app">
      <Header route={route} navigate={navigate} onSearch={onSearch} />
      {route.kind === 'home' && <Home route={route} navigate={navigate} saved={saved} onSave={onSave} />}
      {route.kind === 'search' && <SearchPage route={route} navigate={navigate} saved={saved} onSave={onSave} />}
      {route.kind === 'saved' && <SavedPage navigate={navigate} saved={saved} onSave={onSave} />}
      {route.kind === 'title' && <DetailPage route={route} navigate={navigate} saved={saved} onSave={onSave} />}
      {route.kind === 'play' && <PlayerPage route={route} navigate={navigate} />}
      <footer className="site-footer"><Brand navigate={navigate} /><p>Fresh titles, straight from the source.</p><span>Source-aware discovery · My List saved locally</span></footer>
    </div>
  );
}

createRoot(document.getElementById('root')).render(<App />);
