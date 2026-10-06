import React, { useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
  ArrowDown, ArrowLeft, ArrowRight, Bookmark, Check, ChevronDown, CircleHelp,
  Clapperboard, Compass, Info, Menu, Play, Plus, Search, Sparkles, X,
} from 'lucide-react';
import './styles.css';

const titles = [
  { id: 'quiet', name: 'The Quiet Between', year: 2025, kind: 'Film', runtime: '1h 48m', rating: '8.4', genres: ['Drama', 'Mystery'], image: '/images/city-rain.jpg', tone: 'teal', description: 'A late-night radio host receives a call from a voice that knows what happens next. One city. One impossible night.' },
  { id: 'orbit', name: 'Orbit of Ashes', year: 2025, kind: 'Series', runtime: '8 episodes', rating: '9.1', genres: ['Sci-Fi', 'Adventure'], image: '/images/nebula.jpg', tone: 'violet', description: 'On the edge of a distant system, a rescue crew discovers that the stars are keeping a secret.' },
  { id: 'blue', name: 'Blue Meridian', year: 2024, kind: 'Film', runtime: '2h 06m', rating: '8.7', genres: ['Adventure', 'Drama'], image: '/images/hero-city.jpg', tone: 'blue', description: 'A cartographer returns to the coast where her family vanished, following a map no one else can read.' },
  { id: 'lastlight', name: 'Last Light Club', year: 2025, kind: 'Series', runtime: '6 episodes', rating: '8.2', genres: ['Thriller', 'Mystery'], image: '/images/night-road.jpg', tone: 'amber', description: 'Four strangers inherit a closed cinema and the stories hidden in its last reel.' },
  { id: 'wild', name: 'A Wilder Sky', year: 2024, kind: 'Film', runtime: '1h 54m', rating: '8.5', genres: ['Adventure', 'Family'], image: '/images/hero-city.jpg', tone: 'green', description: 'A young astronomer and her grandfather set out to find the darkest sky in the country.' },
  { id: 'echo', name: 'Echoes of Tomorrow', year: 2025, kind: 'Series', runtime: '10 episodes', rating: '9.0', genres: ['Sci-Fi', 'Drama'], image: '/images/nebula.jpg', tone: 'pink', description: 'A small research team listens to signals arriving from a future that may never happen.' },
  { id: 'paper', name: 'Paper Moons', year: 2023, kind: 'Film', runtime: '1h 42m', rating: '7.9', genres: ['Romance', 'Drama'], image: '/images/city-rain.jpg', tone: 'rose', description: 'Two artists leave anonymous notes in the same bookshop and slowly redraw each other’s world.' },
  { id: 'north', name: 'North of Nowhere', year: 2024, kind: 'Series', runtime: '7 episodes', rating: '8.6', genres: ['Mystery', 'Thriller'], image: '/images/night-road.jpg', tone: 'cyan', description: 'A winter storm closes a mountain town, and an old disappearance starts happening all over again.' },
  { id: 'after', name: 'After the Blue Hour', year: 2023, kind: 'Film', runtime: '1h 37m', rating: '8.1', genres: ['Drama', 'Romance'], image: '/images/hero-city.jpg', tone: 'blue', description: 'One evening changes the route home for two people who thought they already knew where they were going.' },
  { id: 'signal', name: 'The Far Signal', year: 2025, kind: 'Series', runtime: '5 episodes', rating: '8.8', genres: ['Sci-Fi', 'Mystery'], image: '/images/nebula.jpg', tone: 'purple', description: 'A remote listening station picks up a message that seems to answer questions before they are asked.' },
];
const categories = ['For you', 'Films', 'Series', 'Drama', 'Sci-Fi', 'Mystery', 'Adventure'];

function Brand() {
  return <a className="brand" href="#home" aria-label="Well Cinebox home"><span className="brand-mark"><i/><i/><i/></span><span>well<span className="brand-light">cinebox</span></span></a>;
}
function Poster({ item, onOpen, saved, onSave }) {
  return <article className="poster-card">
    <button className={`poster-art art-${item.tone}`} onClick={() => onOpen(item)} aria-label={`View ${item.name} details`}>
      <img src={item.image} alt="" loading="lazy" />
      <span className="art-shade"/><span className="poster-mark">W<span>•</span>C</span>
      <span className="poster-copy"><small>{item.kind === 'Series' ? 'WELL ORIGINAL SERIES' : 'WELL ORIGINAL FILM'}</small><b>{item.name}</b></span>
      <span className="play-float"><Play size={15} fill="currentColor"/></span>
    </button>
    <div className="card-caption"><div><h3>{item.name}</h3><p>{item.year}<span>·</span>{item.kind}<span>·</span>{item.runtime}</p></div>
      <button className={`save-mini ${saved ? 'is-saved' : ''}`} onClick={() => onSave(item.id)} aria-label={saved ? `Remove ${item.name} from My List` : `Add ${item.name} to My List`}>{saved ? <Check size={16}/> : <Plus size={17}/>}</button>
    </div>
  </article>;
}
function Shelf({ title, subtitle, items, saved, onOpen, onSave, onBrowse }) {
  const ref = useRef(null);
  return <section className="shelf">
    <div className="shelf-head"><div><h2>{title}<ArrowRight size={19}/></h2>{subtitle && <p>{subtitle}</p>}</div>
      <div className="shelf-actions"><button className="text-button" onClick={onBrowse}>Explore all <ArrowRight size={15}/></button><button aria-label="Scroll titles left" onClick={() => ref.current?.scrollBy({ left: -500, behavior: 'smooth' })}><ArrowLeft size={17}/></button><button aria-label="Scroll titles right" onClick={() => ref.current?.scrollBy({ left: 500, behavior: 'smooth' })}><ArrowRight size={17}/></button></div>
    </div>
    <div className="poster-row" ref={ref}>{items.map(item => <Poster key={item.id} item={item} onOpen={onOpen} saved={saved.includes(item.id)} onSave={onSave}/>)}</div>
  </section>;
}
function App() {
  const [category, setCategory] = useState('For you');
  const [search, setSearch] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const [saved, setSaved] = useState(() => { try { return JSON.parse(localStorage.getItem('wellcinebox-list') || '[]'); } catch { return []; } });
  const [selected, setSelected] = useState(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [notice, setNotice] = useState('');
  const matching = useMemo(() => titles.filter(item => {
    const genreMatch = category === 'For you' || category === 'My List' || category === 'Films' && item.kind === 'Film' || category === 'Series' && item.kind === 'Series' || item.genres.includes(category);
    const searchMatch = `${item.name} ${item.kind} ${item.genres.join(' ')}`.toLowerCase().includes(search.toLowerCase());
    return genreMatch && searchMatch;
  }), [category, search]);
  const saveTitle = (id) => setSaved(prev => {
    const next = prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id];
    localStorage.setItem('wellcinebox-list', JSON.stringify(next));
    return next;
  });
  const filteredList = category === 'My List' ? matching.filter(item => saved.includes(item.id)) : matching;
  const showNotice = (message) => { setNotice(message); window.setTimeout(() => setNotice(''), 3800); };
  const browse = (name) => { setCategory(name); setSearch(''); window.scrollTo({ top: 450, behavior: 'smooth' }); };
  const shelves = category === 'For you' ? [
    { title: 'Well originals', subtitle: 'Fresh stories, made for the long way home.', items: matching.slice(0, 6) },
    { title: 'Keep the lights on', subtitle: 'A little mystery looks good after dark.', items: titles.filter(x => x.genres.includes('Mystery') && matching.includes(x)) },
    { title: 'Worlds to get lost in', subtitle: 'Big skies. Bigger questions.', items: titles.filter(x => x.genres.includes('Sci-Fi') && matching.includes(x)) },
  ] : [{ title: category === 'My List' ? 'Your saved stories' : `${category} to settle into`, subtitle: `${filteredList.length} ${filteredList.length === 1 ? 'story' : 'stories'} ready to discover.`, items: filteredList }];
  return <div id="home" className="app-shell">
    <header className="topbar">
      <button className="mobile-menu icon-btn" aria-label="Open menu" onClick={() => setMenuOpen(!menuOpen)}><Menu size={21}/></button>
      <Brand/>
      <nav className={`main-nav ${menuOpen ? 'nav-open' : ''}`} aria-label="Main navigation">
        <button className={category === 'For you' ? 'nav-link active' : 'nav-link'} onClick={() => browse('For you')}><Compass size={16}/> Discover</button>
        <button className={category === 'Films' ? 'nav-link active' : 'nav-link'} onClick={() => browse('Films')}>Films</button>
        <button className={category === 'Series' ? 'nav-link active' : 'nav-link'} onClick={() => browse('Series')}>Series</button>
        <button className={category === 'My List' ? 'nav-link active' : 'nav-link'} onClick={() => browse('My List')}>My List <span className="list-count">{saved.length || ''}</span></button>
      </nav>
      <div className="top-actions">
        <form className={`search-box ${searchOpen ? 'search-open' : ''}`} onSubmit={e => { e.preventDefault(); document.querySelector('.shelf')?.scrollIntoView({ behavior: 'smooth' }); }}>
          <button type="button" className="icon-btn" aria-label="Search titles" onClick={() => { setSearchOpen(!searchOpen); setTimeout(() => document.querySelector('.search-box input')?.focus(), 50); }}><Search size={19}/></button>
          {searchOpen && <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Titles, genres…" aria-label="Search titles and genres"/>}
          {searchOpen && <button type="button" className="close-search" onClick={() => { setSearchOpen(false); setSearch(''); }} aria-label="Close search"><X size={16}/></button>}
        </form>
        <button className="profile" aria-label="Your profile" onClick={() => showNotice('Your personal space. My List is saved on this device.')}>W</button>
      </div>
    </header>

    <main>
      <section className="hero" aria-label="Featured story">
        <div className="hero-image"/><div className="hero-vignette"/>
        <div className="hero-content">
          <div className="eyebrow"><Sparkles size={14}/> WELL CINEBOX ORIGINAL <span className="eyebrow-line"/></div>
          <p className="hero-kicker">A new limited series</p>
          <h1>The Quiet<br/><em>Between</em></h1>
          <p className="hero-desc">Somewhere between the last train and the first light, a city begins to tell the truth.</p>
          <div className="hero-meta"><span>2025</span><i/> <span>Drama</span><i/> <span>Mystery</span><i/> <span className="quality">4K</span><span className="meta-score">★ 8.4</span></div>
          <div className="hero-ctas"><button className="primary-cta" onClick={() => setSelected(titles[0])}><Play size={17} fill="currentColor"/> Explore title</button><button className="secondary-cta" onClick={() => setSelected(titles[0])}><Info size={18}/> More details</button></div>
          <p className="hero-note"><span className="live-dot"/> Curated for your kind of night</p>
        </div>
        <div className="hero-bottom"><span>01 <i/> 03</span><div className="hero-progress"><b/></div><span>FEATURED</span></div>
        <button className="hero-down" aria-label="Scroll to collection" onClick={() => document.querySelector('.collections')?.scrollIntoView({ behavior: 'smooth' })}><ArrowDown size={17}/></button>
      </section>

      <section className="collections">
        <div className="welcome-row"><div><p className="section-overline">YOUR NEXT GOOD STORY</p><h2>Stay for a while.</h2><p className="welcome-sub">A handpicked corner of cinema, made for the way you watch.</p></div>
          <button className="continue-card" onClick={() => setSelected(titles[1])}><span className="continue-icon"><Clapperboard size={18}/></span><span><small>TONIGHT'S PICK</small><b>Orbit of Ashes</b><em>Start with episode one</em></span><Play size={18} fill="currentColor"/></button>
        </div>
        <div className="category-rail" role="tablist" aria-label="Browse by category">{categories.map(name => <button key={name} role="tab" aria-selected={category === name} className={category === name ? 'chip selected' : 'chip'} onClick={() => { setCategory(name); setSearch(''); }}>{name}</button>)}{saved.length > 0 && <button role="tab" aria-selected={category === 'My List'} className={category === 'My List' ? 'chip selected' : 'chip'} onClick={() => setCategory('My List')}><Bookmark size={14}/> My List</button>}</div>
        {search && <div className="search-summary"><Search size={15}/><span>Showing matches for <b>“{search}”</b></span><button onClick={() => setSearch('')}>Clear</button></div>}
        {shelves.map((shelf, i) => <Shelf key={`${category}-${shelf.title}`} title={shelf.title} subtitle={shelf.subtitle} items={shelf.items} saved={saved} onOpen={setSelected} onSave={saveTitle} onBrowse={() => browse(category === 'For you' ? categories[(i + 2) % categories.length] : category)}/>)}
        {category !== 'For you' && filteredList.length === 0 && <div className="empty-state"><span><Bookmark size={24}/></span><h3>{category === 'My List' ? 'Your list is still yours to make.' : 'Nothing in this frame — yet.'}</h3><p>{category === 'My List' ? 'Save a story with the plus button and it will be here next time.' : 'Try another category or clear your search to keep exploring.'}</p><button className="secondary-cta" onClick={() => browse('For you')}>Back to Discover <ArrowRight size={16}/></button></div>}
      </section>
      <section className="closing-banner"><div className="closing-art"/><div><span className="section-overline">GOOD STORIES FIND THEIR WAY</span><h2>Make room for<br/><em>one more episode.</em></h2><p>Your next favorite is a little closer than you think.</p></div><button className="secondary-cta" onClick={() => browse('For you')}>See what’s on <ArrowRight size={16}/></button></section>
    </main>

    <footer><Brand/><p>Stories worth staying in for.</p><div className="footer-links"><button onClick={() => showNotice('This preview is a discovery experience; licensed viewing integrations are not connected yet.')}>About</button><button onClick={() => showNotice('Demo collection. Connect a licensed content catalog to publish real availability.')}>Content sources</button><button onClick={() => showNotice('This demo uses locally stored preferences only. No account or tracking is set up.')}>Privacy</button></div><span className="copyright">© 2025 Well Cinebox <i/> An independent discovery experience</span></footer>
    {selected && <div className="modal-backdrop" onMouseDown={e => { if (e.target === e.currentTarget) setSelected(null); }} role="presentation"><section className="detail-modal" role="dialog" aria-modal="true" aria-labelledby="detail-title"><button className="modal-close" onClick={() => setSelected(null)} aria-label="Close details"><X size={20}/></button><div className="modal-art"><img src={selected.image} alt=""/><div/><span className="poster-mark">W<span>•</span>C</span></div><div className="modal-body"><span className="section-overline">WELL CINEBOX {selected.kind === 'Series' ? 'SERIES' : 'FILM'}</span><h2 id="detail-title">{selected.name}</h2><div className="hero-meta"><span>{selected.year}</span><i/><span>{selected.kind}</span><i/><span>{selected.runtime}</span><i/><span className="meta-score">★ {selected.rating}</span></div><p>{selected.description}</p><div className="tag-row">{selected.genres.map(g => <span key={g}>{g}</span>)}</div><div className="modal-buttons"><button className="primary-cta" onClick={() => showNotice('This is a discovery preview. Add your licensed streaming/catalog provider to enable playback.') }><Play size={17} fill="currentColor"/> Preview details</button><button className="secondary-cta" onClick={() => saveTitle(selected.id)}>{saved.includes(selected.id) ? <Check size={17}/> : <Plus size={17}/>} {saved.includes(selected.id) ? 'In My List' : 'My List'}</button></div><div className="legal-note"><CircleHelp size={15}/> Availability and viewing links will appear when a licensed provider is connected.</div></div></section></div>}
    {notice && <div className="toast" role="status"><Info size={16}/>{notice}<button onClick={() => setNotice('')} aria-label="Dismiss"><X size={15}/></button></div>}
  </div>;
}

createRoot(document.getElementById('root')).render(<React.StrictMode><App/></React.StrictMode>);
