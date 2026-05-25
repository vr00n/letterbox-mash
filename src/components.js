/* ==========================================================================
   UI COMPONENTS & INTERACTIVE CANVAS
   Project: Letterboxd KNN Taste Mashup
   ========================================================================== */

import { 
  getMeanRating, 
  getAdjustedCosineSimilarity, 
  getPearsonCorrelation, 
  getJaccardSimilarity, 
  getEuclideanDistance,
  computeAttributeAffinities
} from './math.js';
import { MASTER_MOVIES, TASTE_ATTRIBUTES } from './archetypes.js';

/**
 * 1. Simulates the terminal log crawling experience for User ID scanning.
 */
export function renderTerminalLogs(username, terminalElement, onComplete) {
  terminalElement.style.display = 'block';
  terminalElement.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  const body = terminalElement.querySelector('#terminal-output');
  body.innerHTML = '';

  const logs = [
    { text: `[SYSTEM] Initializing letterboxd-taste-crawler.sh...`, time: 300, class: 'terminal-accent-blue' },
    { text: `[NET] Fetching RSS feed → letterboxd.com/${username}/rss/`, time: 500 },
    { text: `[NET] Fetching following list → letterboxd.com/${username}/following/`, time: 400 },
    { text: `[CRAWL] Parsing diary entries and film ratings from RSS...`, time: 600 },
    { text: `[CRAWL] Resolving following list → queuing friend RSS fetches in parallel...`, time: 500, class: 'terminal-accent-blue' },
    { text: `[ENGINE] Matching rated films against Cinephile Master Catalog (M=60)...`, time: 600 },
    { text: `[ENGINE] Imputing sparse rating vector for unmatched catalog entries...`, time: 400 },
    { text: `[MATH] Initializing principal component decomposition of dimensions [N=25, M=60]...`, time: 600 },
    { text: `[MATH] Computing ratings covariance matrix...`, time: 400 },
    { text: `[MATH] PC1 Eigenvector extracted (Variance explained: 29.4%). Axis maps: [Art House vs. Blockbuster]`, time: 600, class: 'terminal-accent-orange' },
    { text: `[MATH] PC2 Eigenvector extracted (Variance explained: 18.8%). Axis maps: [Horror vs. Classic]`, time: 500, class: 'terminal-accent-orange' },
    { text: `[KNN] Building neighbor pool from real friends + archetype fallbacks...`, time: 500 },
    { text: `[KNN] Computing cosine, Pearson, Jaccard similarity for each neighbor...`, time: 500 },
    { text: `[KNN] Top 10 taste neighbors ranked. Social graph ready.`, time: 400, class: 'terminal-accent' },
    { text: `[SYSTEM] Taste space compiled. Launching dashboard...`, time: 400, class: 'terminal-accent-blue' }
  ];

  let currentLine = 0;

  function writeLine() {
    if (currentLine >= logs.length) {
      setTimeout(() => {
        onComplete();
      }, 500);
      return;
    }

    const log = logs[currentLine];
    const p = document.createElement('p');
    p.className = `terminal-line terminal-text ${log.class || ''}`;
    p.innerHTML = `> ${log.text}`;
    body.appendChild(p);

    // Scroll to bottom of terminal
    body.scrollTop = body.scrollHeight;
    
    currentLine++;
    setTimeout(writeLine, log.time);
  }

  // Blinking cursor setup
  const cursor = document.createElement('span');
  cursor.className = 'terminal-cursor';
  body.appendChild(cursor);

  setTimeout(writeLine, 200);
}

/**
 * 2. Renders movie cards for calibration stage.
 * Focuses on 8 major representative movies.
 */
export function renderCalibrationCards(ratingsVector, containerElement) {
  // Choose 8 cornerstone films
  const cornerstoneIds = [16, 31, 45, 0, 22, 30, 46, 3]; // Lady Bird, Hereditary, Interstellar, Godfather, Spirited Away, Shining, Dark Knight, Seven Samurai
  containerElement.innerHTML = '';

  cornerstoneIds.forEach(id => {
    const movie = MASTER_MOVIES.find(m => m.id === id);
    if (!movie) return;

    const currentRating = ratingsVector[id];

    const card = document.createElement('div');
    card.className = 'movie-card';
    card.dataset.movieId = id;

    // Determine category friendly badge
    let categoryText = 'Classic';
    if (movie.category === 'indie') categoryText = 'Indie / Arthouse';
    else if (movie.category === 'horror') categoryText = 'Horror';
    else if (movie.category === 'popcorn') categoryText = 'Sci-Fi / Action';

    card.innerHTML = `
      <span class="movie-genre-badge">${categoryText}</span>
      <div class="movie-details">
        <h4 class="movie-title">${movie.title}</h4>
        <span class="movie-year">${movie.year}</span>
      </div>
      <div class="stars-container">
        <span class="unrated-badge" id="rating-label-${id}">${currentRating > 0 ? currentRating + ' ★' : 'Unrated'}</span>
        <div class="stars-interactive" data-movie-id="${id}">
          ${[5, 4.5, 4, 3.5, 3, 2.5, 2, 1.5, 1, 0.5].map(val => `
            <input 
              type="radio" 
              name="movie-rating-${id}" 
              id="star-${id}-${val.toString().replace('.', '_')}" 
              class="star-input" 
              value="${val}"
              ${currentRating === val ? 'checked' : ''}
            >
            <label 
              for="star-${id}-${val.toString().replace('.', '_')}" 
              class="star-label" 
              title="${val} Stars"
              data-value="${val}"
            >
              ${val % 1 === 0 ? '★' : '½'}
            </label>
          `).join('')}
        </div>
      </div>
    `;

    containerElement.appendChild(card);
  });
}

/**
 * 3. Clustered Radial Graph — all neighbours arranged in concentric match-% rings,
 *    colour-coded by taste category, with hover/click/pan/zoom and filter support.
 *    No physics engine — positions are computed statically and animated via lerp.
 */
export class InteractiveGraphCanvas {
  constructor(canvasElement, onNodeSelected) {
    this.canvas = canvasElement;
    this.ctx = canvasElement.getContext('2d');
    this.onNodeSelected = onNodeSelected;

    this.allNodes   = [];   // all nodes regardless of filter
    this.activeNodeId  = null;
    this.hoverNodeId   = null;
    this.activeFilter  = 'all';

    // View
    this.zoom = 1;
    this.panX = 0;
    this.panY = 0;
    this.isPanning  = false;
    this.startPanX  = 0;
    this.startPanY  = 0;
    this.draggedNode = null;

    // No-op: kept so existing callers (physicsEnabled toggle) don't throw
    this.physicsEnabled = false;

    this.initEvents();
  }

  /** Nodes currently shown based on active filter */
  get visibleNodes() {
    if (this.activeFilter === 'all') return this.allNodes;
    return this.allNodes.filter(n => n.isCentral || n.category === this.activeFilter);
  }

  /**
   * Builds a ring-based radial layout. Nodes fly out from the centre via lerp animation.
   * Accepts ALL neighbours (no cap) and groups them into four match-% rings.
   */
  setGraph(userProfile, allNeighbors) {
    // Size from parent — called after transitionTo() so dimensions are real
    const parent = this.canvas.parentElement;
    const W = Math.max(parent ? (parent.clientWidth  || parent.offsetWidth)  : 600, 400);
    const H = Math.max(parent ? (parent.clientHeight || parent.offsetHeight) : 400, 320);
    this.canvas.width  = W;
    this.canvas.height = H;

    const cx = W / 2;
    const cy = H / 2;
    const maxR = Math.min(W, H) / 2 * 0.86;

    this.allNodes = [];
    this.zoom = 1;
    this.panX = 0;
    this.panY = 0;
    this.activeFilter = 'all';

    // ── Category colour map ──────────────────────────────────────────────────
    const catColor = {
      real:     '#40bcf4',
      indie:    '#00e054',
      horror:   '#ef233c',
      classics: '#ff8000',
      popcorn:  '#a06cd5'
    };

    // ── Central user ─────────────────────────────────────────────────────────
    this.allNodes.push({
      id: 'user_node',
      x: cx, y: cy, targetX: cx, targetY: cy,
      radius: 26, isCentral: true,
      label: userProfile.username,
      color: '#ffffff', category: 'user',
      profile: userProfile, matchPercent: 100
    });

    // ── Sort: real friends first, then by category, then match% desc ─────────
    const catOrder = ['real', 'indie', 'classics', 'horror', 'popcorn'];
    const sorted = [...allNeighbors].sort((a, b) => {
      const d = catOrder.indexOf(a.profile.category) - catOrder.indexOf(b.profile.category);
      return d !== 0 ? d : b.matchPercent - a.matchPercent;
    });

    // ── Assign rings by match% ───────────────────────────────────────────────
    const ringDefs = [
      { minPct: 75, frac: 0.30 },
      { minPct: 60, frac: 0.52 },
      { minPct: 45, frac: 0.72 },
      { minPct:  0, frac: 0.90 }
    ];
    const buckets = [[], [], [], []];
    sorted.forEach(m => {
      if      (m.matchPercent >= 75) buckets[0].push(m);
      else if (m.matchPercent >= 60) buckets[1].push(m);
      else if (m.matchPercent >= 45) buckets[2].push(m);
      else                           buckets[3].push(m);
    });

    buckets.forEach((bucket, ri) => {
      const n = bucket.length;
      if (n === 0) return;

      // Expand ring radius if nodes would be too cramped
      const baseR    = maxR * ringDefs[ri].frac;
      const minSpacR = (n * 30) / (2 * Math.PI);   // 30 px per node
      const ringR    = Math.max(baseR, minSpacR);

      bucket.forEach((match, idx) => {
        const angle = (idx / n) * Math.PI * 2 - Math.PI / 2;
        const tx = cx + Math.cos(angle) * ringR;
        const ty = cy + Math.sin(angle) * ringR;
        const color = catColor[match.profile.category] || '#00e054';

        this.allNodes.push({
          id: match.profile.id,
          x: cx, y: cy,           // start at centre
          targetX: tx, targetY: ty,
          radius: Math.max(8, 11 + (match.matchPercent - 40) * 0.1),
          isCentral: false,
          label: match.profile.username,
          color, category: match.profile.category,
          profile: match.profile, matchPercent: match.matchPercent,
          stats: match, ringIdx: ri, ringR
        });
      });
    });

    this.activeNodeId = 'user_node';
    this.onNodeSelected(this.allNodes[0], true);
  }

  /** Toggle filter; 'all' shows everything. */
  applyFilter(filter) {
    this.activeFilter = filter;
    // If active selection is now hidden, revert to user
    const active = this.allNodes.find(n => n.id === this.activeNodeId);
    if (filter !== 'all' && active && !active.isCentral && active.category !== filter) {
      this.activeNodeId = 'user_node';
      this.onNodeSelected(this.allNodes[0], true);
    }
  }

  /** Re-trigger fly-out animation from centre. */
  resetLayout() {
    const u = this.allNodes.find(n => n.isCentral);
    const cx = u ? u.x : this.canvas.width  / 2;
    const cy = u ? u.y : this.canvas.height / 2;
    this.allNodes.forEach(n => { if (!n.isCentral) { n.x = cx; n.y = cy; } });
    this.zoom = 1; this.panX = 0; this.panY = 0;
  }

  initEvents() {
    const toWorld = (e) => {
      const rect = this.canvas.getBoundingClientRect();
      const rx = e.clientX - rect.left;
      const ry = e.clientY - rect.top;
      return { x: (rx - this.panX) / this.zoom, y: (ry - this.panY) / this.zoom, rx, ry };
    };

    const hitTest = (wx, wy) => {
      const vis = this.visibleNodes;
      for (let i = vis.length - 1; i >= 0; i--) {
        const n = vis[i];
        const dx = wx - n.x, dy = wy - n.y;
        if (Math.sqrt(dx*dx + dy*dy) <= n.radius + 7) return n;
      }
      return null;
    };

    this.canvas.addEventListener('mousedown', e => {
      const { x, y } = toWorld(e);
      const hit = hitTest(x, y);
      if (hit) {
        this.draggedNode = hit;
        hit.isDragged = true;
        this.activeNodeId = hit.id;
        this.onNodeSelected(hit, hit.isCentral);
      } else {
        this.isPanning = true;
        this.startPanX = e.clientX - this.panX;
        this.startPanY = e.clientY - this.panY;
      }
    });

    this.canvas.addEventListener('mousemove', e => {
      const { x, y } = toWorld(e);
      if (this.draggedNode) {
        this.draggedNode.x = x; this.draggedNode.y = y;
        this.draggedNode.targetX = x; this.draggedNode.targetY = y;
      } else if (this.isPanning) {
        this.panX = e.clientX - this.startPanX;
        this.panY = e.clientY - this.startPanY;
      } else {
        const hit = hitTest(x, y);
        this.hoverNodeId = hit ? hit.id : null;
        this.canvas.style.cursor = hit ? 'pointer' : 'grab';
      }
    });

    const release = () => {
      if (this.draggedNode) { this.draggedNode.isDragged = false; this.draggedNode = null; }
      this.isPanning = false;
    };
    this.canvas.addEventListener('mouseup',    release);
    this.canvas.addEventListener('mouseleave', release);

    this.canvas.addEventListener('wheel', e => {
      e.preventDefault();
      const rect = this.canvas.getBoundingClientRect();
      const mx = e.clientX - rect.left, my = e.clientY - rect.top;
      const delta  = e.deltaY > 0 ? -0.12 : 0.12;
      const prev   = this.zoom;
      this.zoom    = Math.max(0.25, Math.min(3.5, this.zoom + delta));
      this.panX    = mx - (mx - this.panX) * (this.zoom / prev);
      this.panY    = my - (my - this.panY) * (this.zoom / prev);
    }, { passive: false });

    window.addEventListener('resize', () => {
      if (!this.canvas.offsetParent) return;
      const p = this.canvas.parentElement;
      if (!p || !p.clientWidth) return;
      const W = p.clientWidth, H = p.clientHeight;
      // Rescale existing node positions proportionally
      if (this.canvas.width > 0) {
        const sx = W / this.canvas.width, sy = H / this.canvas.height;
        this.allNodes.forEach(n => { n.x *= sx; n.y *= sy; n.targetX *= sx; n.targetY *= sy; });
      }
      this.canvas.width = W; this.canvas.height = H;
    });
  }

  zoomIn()  { this.zoom = Math.min(this.zoom + 0.15, 3.5); }
  zoomOut() { this.zoom = Math.max(this.zoom - 0.15, 0.25); }
  resetZoom() { this.zoom = 1; this.panX = 0; this.panY = 0; }

  draw() {
    const ctx = this.ctx;
    const W = this.canvas.width, H = this.canvas.height;
    if (!W || !H || !this.allNodes.length) return;

    // ── Lerp nodes toward targets ────────────────────────────────────────────
    this.allNodes.forEach(n => {
      if (!n.isCentral && !n.isDragged) {
        n.x += (n.targetX - n.x) * 0.07;
        n.y += (n.targetY - n.y) * 0.07;
      }
    });

    ctx.clearRect(0, 0, W, H);
    ctx.save();
    ctx.translate(this.panX, this.panY);
    ctx.scale(this.zoom, this.zoom);

    const vis     = this.visibleNodes;
    const userNode = this.allNodes.find(n => n.isCentral);
    const ucx = userNode ? userNode.x : W / 2;
    const ucy = userNode ? userNode.y : H / 2;
    const maxR = Math.min(W, H) / 2 * 0.86;

    // ── 1. Ring backgrounds (concentric dashed circles) ──────────────────────
    const ringMeta = [
      { frac: 0.30, stroke: 'rgba(0,224,84,0.14)',    fill: 'rgba(0,224,84,0.025)',    label: '≥75% match' },
      { frac: 0.52, stroke: 'rgba(64,188,244,0.11)',  fill: 'rgba(64,188,244,0.018)',  label: '60–75%' },
      { frac: 0.72, stroke: 'rgba(255,128,0,0.09)',   fill: 'rgba(255,128,0,0.015)',   label: '45–60%' },
      { frac: 0.90, stroke: 'rgba(160,108,213,0.07)', fill: 'rgba(160,108,213,0.01)',  label: '<45%' }
    ];
    ringMeta.forEach(rm => {
      const r = maxR * rm.frac;
      ctx.beginPath();
      ctx.arc(ucx, ucy, r, 0, Math.PI * 2);
      ctx.fillStyle = rm.fill;
      ctx.fill();
      ctx.setLineDash([5, 7]);
      ctx.strokeStyle = rm.stroke;
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.setLineDash([]);

      ctx.save();
      ctx.font = '9px "Space Grotesk"';
      ctx.fillStyle = 'rgba(255,255,255,0.18)';
      ctx.textAlign = 'center';
      ctx.fillText(rm.label, ucx, ucy - r + 13);
      ctx.restore();
    });

    // ── 2. Edges ─────────────────────────────────────────────────────────────
    vis.forEach(n => {
      if (n.isCentral) return;
      const isActive = this.activeNodeId === n.id;
      const isHover  = this.hoverNodeId  === n.id;

      let alpha = 0.06 + (n.matchPercent - 40) * 0.003;
      if (isActive) alpha = 0.75;
      else if (this.activeNodeId !== 'user_node' && !isActive) alpha = 0.025;

      const hex = Math.round(alpha * 255).toString(16).padStart(2, '0');
      ctx.beginPath();
      ctx.moveTo(ucx, ucy);
      ctx.lineTo(n.x, n.y);
      ctx.strokeStyle = n.color + hex;
      ctx.lineWidth   = isActive ? 1.8 : 0.7 + (n.matchPercent - 40) * 0.018;
      ctx.stroke();

      if (isActive || isHover) {
        const mx = (ucx + n.x) / 2, my = (ucy + n.y) / 2;
        const lbl = `${n.matchPercent}%`;
        ctx.font = 'bold 9px "Space Grotesk"';
        const tw = ctx.measureText(lbl).width;
        ctx.fillStyle = 'rgba(12,16,20,0.92)';
        ctx.beginPath();
        ctx.roundRect(mx - tw/2 - 5, my - 7, tw + 10, 14, 4);
        ctx.fill();
        ctx.fillStyle = n.color;
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(lbl, mx, my);
      }
    });

    // ── 3. Nodes ─────────────────────────────────────────────────────────────
    vis.forEach(n => {
      const isActive = this.activeNodeId === n.id;
      const isHover  = this.hoverNodeId  === n.id;

      // Glow
      if (isActive || isHover) {
        ctx.save();
        ctx.shadowColor = n.color;
        ctx.shadowBlur  = isActive ? 22 : 12;
      }

      // Outer ring
      ctx.beginPath();
      ctx.arc(n.x, n.y, n.radius + (isActive ? 3 : 0), 0, Math.PI * 2);
      ctx.fillStyle = n.color;
      ctx.fill();

      // Dashed halo for real friends
      if (n.category === 'real' && !n.isCentral) {
        ctx.save();
        ctx.strokeStyle = n.color;
        ctx.lineWidth = 1.5;
        ctx.setLineDash([4, 3]);
        ctx.beginPath();
        ctx.arc(n.x, n.y, n.radius + 5, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.restore();
      }

      if (isActive || isHover) ctx.restore();

      // Inner orb gradient
      const grad = ctx.createRadialGradient(n.x - n.radius/3, n.y - n.radius/3, 1, n.x, n.y, n.radius);
      grad.addColorStop(0, '#ffffff');
      grad.addColorStop(n.isCentral ? 0.6 : 0.25, n.isCentral ? '#aabbcc' : n.color);
      grad.addColorStop(1, '#060a0f');
      ctx.beginPath();
      ctx.arc(n.x, n.y, n.radius - 1.5, 0, Math.PI * 2);
      ctx.fillStyle = grad;
      ctx.fill();

      // Initials
      if (n.radius > 11) {
        ctx.save();
        ctx.fillStyle = n.isCentral ? '#000' : '#fff';
        ctx.font = `bold ${n.isCentral ? 10 : 8}px "Space Grotesk"`;
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(n.profile.avatar || n.label.substring(0, 2).toUpperCase(), n.x, n.y);
        ctx.restore();
      }

      // Label chip below node
      ctx.save();
      const isFriend = n.category === 'real' && !n.isCentral;
      const tag = isFriend ? `👥 ${n.label}` : n.label;
      ctx.font = `${n.isCentral ? 'bold ' : ''}${n.isCentral ? 11 : 9}px "Space Grotesk"`;
      const tw  = ctx.measureText(tag).width;
      const ly  = n.y + n.radius + 6;
      ctx.fillStyle   = 'rgba(12,16,20,0.88)';
      ctx.strokeStyle = isActive ? n.color : 'rgba(255,255,255,0.06)';
      ctx.lineWidth   = 1;
      ctx.beginPath();
      ctx.roundRect(n.x - tw/2 - 7, ly - 3, tw + 14, 15, 4);
      ctx.fill(); ctx.stroke();
      ctx.fillStyle    = isActive ? '#fff' : '#8fa0b0';
      ctx.textAlign    = 'center'; ctx.textBaseline = 'top';
      ctx.fillText(tag, n.x, ly - 1);
      ctx.restore();

      // Hover tooltip
      if (isHover && !n.isCentral) {
        const tip = `${n.label}  ${n.matchPercent}% match`;
        ctx.font = '10px "Space Grotesk"';
        const tipW = ctx.measureText(tip).width + 22;
        const tipX = n.x - tipW / 2;
        const tipY = n.y - n.radius - 26;
        ctx.fillStyle   = 'rgba(8,12,16,0.96)';
        ctx.strokeStyle = n.color;
        ctx.lineWidth   = 1;
        ctx.beginPath();
        ctx.roundRect(tipX, tipY, tipW, 20, 6);
        ctx.fill(); ctx.stroke();
        ctx.fillStyle    = '#fff';
        ctx.textAlign    = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(tip, n.x, tipY + 10);
      }
    });

    ctx.restore();
  }
}

/**
 * 4. Renders the detailed active profile info card in the right stats column.
 */
export function renderActiveProfileCard(node, containerElement) {
  const isUser = node.isCentral;
  const p = node.profile;

  // Compile top film list (rated >= 4.0)
  const topFilms = [];
  p.ratings.forEach((rating, idx) => {
    if (rating >= 4.0) {
      const film = MASTER_MOVIES.find(m => m.id === idx);
      if (film) topFilms.push({ ...film, rating });
    }
  });

  // Sort top films by rating descending, slice to top 4
  topFilms.sort((a,b) => b.rating - a.rating);
  const displayedFilms = topFilms.slice(0, 4);

  // Determine accent classes
  let typeLabel = 'Classic Cinephile';
  if (p.category === 'real') {
    typeLabel = '👥 Real Connection (Friend)';
  } else {
    if (p.category === 'indie') typeLabel = 'Arthouse & Indie Devotee';
    else if (p.category === 'horror') typeLabel = 'Horror Gorehound';
    else if (p.category === 'popcorn') typeLabel = 'Sci-Fi / Popcorn Maximalist';
  }

  containerElement.innerHTML = `
    <div class="profile-header-meta">
      <div class="profile-avatar" style="background: ${isUser ? '#ffffff' : node.color}; color: #000;">
        ${p.avatar || p.username.substring(0,2).toUpperCase()}
      </div>
      <div class="profile-name-group">
        <h4 class="profile-username">
          ${p.displayName}
          ${isUser ? '<span style="color: var(--text-muted); font-size: 0.8rem;">(YOU)</span>' : ''}
        </h4>
        <span class="profile-type-badge" style="border-color: ${node.color}; color: ${node.color}; background: rgba(0,0,0,0.1)">
          ${typeLabel}
        </span>
      </div>
    </div>
    <p class="profile-bio">
      "${p.bio}"
    </p>
    <div class="profile-top-movies">
      <span class="movies-section-title">TOP TASTE PILLARS (${topFilms.length})</span>
      <div class="top-movies-strip">
        ${displayedFilms.length > 0 ? displayedFilms.map(film => `
          <div class="mini-movie-pill" title="${film.title} (${film.year}) — Rated ${film.rating}">
            <i data-lucide="star"></i>
            <span>${film.title}</span>
            <strong class="code-font" style="color: var(--accent-orange); font-size: 0.72rem;">${film.rating}</strong>
          </div>
        `).join('') : '<span style="color: var(--text-muted); font-size: 0.8rem;">No high rated films cataloged.</span>'}
      </div>
    </div>
  `;

  // Re-bind Lucide icons
  lucide.createIcons();
}

/**
 * Helper: Computes cinephile astrology signs (Sun, Moon, Ascendant) based on ratings vector.
 * Analyzes which genre the user rates highest to assign their cosmic film alignment.
 */
function getAstrologySigns(ratings, category) {
  const scores = { classics: 0, indie: 0, horror: 0, popcorn: 0 };
  ratings.forEach((r, idx) => {
    if (r > 0 && MASTER_MOVIES[idx]) scores[MASTER_MOVIES[idx].category] += r;
  });
  const sorted = Object.keys(scores).sort((a, b) => scores[b] - scores[a]);

  const map = {
    classics: { sun: 'Criterion Sun', moon: 'Restoration Moon', asc: '35mm Ascendant' },
    indie:    { sun: 'Arthouse Sun',  moon: 'Subtitled Moon',   asc: 'A24 Ascendant' },
    horror:   { sun: 'Gorehound Sun', moon: 'Spooky Moon',      asc: 'Practical-FX Ascendant' },
    popcorn:  { sun: 'Blockbuster Sun', moon: 'CGI Moon',       asc: 'IMAX Ascendant' }
  };

  const primary   = sorted[0] || 'classics';
  const secondary = sorted[1] || 'indie';
  const ascCat    = (category === 'real' || !map[category]) ? primary : category;

  return {
    primary:   map[primary].sun,
    secondary: map[secondary].moon,
    ascendant: map[ascCat].asc
  };
}

/**
 * Helper: Returns 3 relatable "Most Likely To..." predictions based on genre pairings.
 */
function getRelatablePredictions(userCat, partnerCat) {
  const key = `${userCat}_${partnerCat}`;
  const table = {
    indie_indie: [
      'Most likely to argue about a Greta Gerwig color palette at 2:00 AM.',
      'Most likely to buy matching overpriced A24 logo hoodies.',
      'Most likely to pretend they understood a 3-hour French movie for social clout.'
    ],
    indie_horror: [
      "Most likely to watch a slow-burn horror film and argue if it was 'art' or 'just cheap jump scares'.",
      'Most likely to hold hands while covering their eyes during the gory parts.',
      'Most likely to analyze the trauma metaphors in Hereditary instead of sleeping.'
    ],
    indie_classics: [
      'Most likely to spend three hours browsing Criterion Channel releases without actually picking one.',
      "Most likely to debate if Wes Anderson is a 'commercial sellout' or 'cinematic genius'.",
      'Most likely to go on a date at a dusty independent film festival.'
    ],
    indie_popcorn: [
      "Most likely to negotiate a compromise: 'I'll watch Avengers if you watch a Korean drama about grief.'",
      "Most likely to fall asleep during the other's favorite film.",
      'Most likely to argue over whether everything in Dune is a CGI masterpiece.'
    ],
    horror_horror: [
      'Most likely to plan a romantic date in an active graveyard.',
      'Most likely to have a practical effects gore bucket in their living room.',
      'Most likely to debate which Scream sequel is the most intellectually rigorous.'
    ],
    horror_classics: [
      "Most likely to debate if Hitchcock's Psycho is the ultimate classic or the ultimate slasher.",
      'Most likely to force the other to watch VHS-grain horror releases.',
      'Most likely to write a 1,000-word essay on camera angles in Italian horror.'
    ],
    horror_popcorn: [
      'Most likely to throw their popcorn bucket into the air during a jump scare.',
      'Most likely to debate who would win: Alien Xenomorph vs. John Wick.',
      'Most likely to fall asleep during a slow documentary and wake up during a gory slasher.'
    ],
    classics_classics: [
      'Most likely to start a fistfight over whether Citizen Kane is actually the greatest film ever made.',
      'Most likely to lecture cinema staff about the beauty of 35mm projection.',
      'Most likely to watch a silent black-and-white masterpiece on a Friday night without subtitles.'
    ],
    classics_popcorn: [
      "Most likely to argue over whether Scorsese's 'Marvel is not cinema' is a sacred text.",
      "Most likely to debate if The Dark Knight is a 'gritty crime thriller' or 'just a superhero flick'.",
      'Most likely to spend an entire movie explaining why the lenses in Casablanca were superior.'
    ],
    popcorn_popcorn: [
      'Most likely to buy tickets for IMAX opening night at 12:01 AM.',
      'Most likely to recite the entire script of Interstellar from memory during dinner.',
      'Most likely to get into a heated debate about the logistics of time travel in Inception.'
    ]
  };

  return table[key]
    || table[`${partnerCat}_${userCat}`]
    || [
      'Most likely to rent out an entire theater and argue about the volume levels.',
      'Most likely to buy overpriced concession snacks and complain about the popcorn seasoning.',
      'Most likely to spend 45 minutes reading Letterboxd reviews instead of watching the actual movie.'
    ];
}

/**
 * 5. Compiles comparison metrics and renders the dual Taste Mashup Modal layout.
 */
export function renderMashupDNA(userVector, partnerProfile, containerElement) {
  const partnerVector = partnerProfile.ratings;
  const username = partnerProfile.username;

  // --- CALC OVERLAPS & GAPS ---
  const sharedFavorites = [];
  const gaps = [];
  const watchlistRecs = [];

  // Genre totals for profile comparison
  const genres = {
    classics: { user: 0, partner: 0, count: 0 },
    indie: { user: 0, partner: 0, count: 0 },
    horror: { user: 0, partner: 0, count: 0 },
    popcorn: { user: 0, partner: 0, count: 0 }
  };

  for (let i = 0; i < 60; i++) {
    const movie = MASTER_MOVIES[i];
    const userRating = userVector[i];
    const partnerRating = partnerVector[i];

    // Compute genre preferences
    if (userRating > 0) genres[movie.category].user += userRating;
    if (partnerRating > 0) genres[movie.category].partner += partnerRating;
    genres[movie.category].count++;

    // 1. Shared Favorites: Both rated >= 4.0
    if (userRating >= 4.0 && partnerRating >= 4.0) {
      sharedFavorites.push({
        movie,
        userRating,
        partnerRating,
        avg: (userRating + partnerRating) / 2
      });
    }

    // 2. Taste Gaps: Both rated, but with large differences
    if (userRating > 0 && partnerRating > 0) {
      const diff = Math.abs(userRating - partnerRating);
      if (diff >= 1.5) {
        gaps.push({
          movie,
          userRating,
          partnerRating,
          diff
        });
      }
    }

    // 3. Collaborative Recommendations: Neighbor rated >= 4.0, User has NOT watched/rated (0)
    if (partnerRating >= 4.0 && userRating === 0) {
      watchlistRecs.push({
        movie,
        rating: partnerRating
      });
    }
  }

  // Sort calculations
  sharedFavorites.sort((a, b) => b.avg - a.avg);
  gaps.sort((a, b) => b.diff - a.diff);
  watchlistRecs.sort((a, b) => b.rating - a.rating);

  // Normalize genre vectors to a 0-100% scale for easy visualization
  const genreBars = Object.keys(genres).map(key => {
    const data = genres[key];
    const uPercent = Math.round((data.user / (data.count * 5 || 1)) * 100);
    const pPercent = Math.round((data.partner / (data.count * 5 || 1)) * 100);
    
    let label = 'Classic Cinema';
    if (key === 'indie') label = 'Indie / Arthouse';
    else if (key === 'horror') label = 'Horror / Thriller';
    else if (key === 'popcorn') label = 'Blockbuster / Sci-Fi';

    return {
      key,
      label,
      userPercent: uPercent,
      partnerPercent: pPercent
    };
  });

  // Calculate astrology profiles
  const userAstro = getAstrologySigns(userVector, 'real');
  const partnerAstro = getAstrologySigns(partnerVector, partnerProfile.category);
  
  // Extract primary categories for relatable predictions
  const userPrimaryCategory = userVector.reduce((acc, r, i) => r > acc.val ? { val: r, cat: MASTER_MOVIES[i].category } : acc, { val: -1, cat: 'classics' }).cat;
  const partnerPrimaryCategory = partnerProfile.category === 'real'
    ? partnerVector.reduce((acc, r, i) => r > acc.val ? { val: r, cat: MASTER_MOVIES[i].category } : acc, { val: -1, cat: 'classics' }).cat
    : partnerProfile.category;

  const astroPredictions = getRelatablePredictions(userPrimaryCategory, partnerPrimaryCategory);

  // Inject Astrology Synastry Card dynamically in DOM before the grids
  const modalBody = containerElement.querySelector('.modal-body');
  let astroCard = modalBody.querySelector('.astrology-compatibility-card');
  if (!astroCard) {
    astroCard = document.createElement('div');
    astroCard.className = 'glass-card astrology-compatibility-card';
    astroCard.style.cssText = 'padding: 24px; background: rgba(155, 93, 229, 0.05); border-color: rgba(155, 93, 229, 0.25); display: flex; flex-direction: column; gap: 16px; margin-bottom: 20px;';
    
    // Insert after profiles header
    const profilesHeader = modalBody.querySelector('.mashup-profiles-header');
    profilesHeader.after(astroCard);
  }

  // Render Astrology Card contents
  astroCard.innerHTML = `
    <div style="display: flex; align-items: center; gap: 10px; border-bottom: 1px solid rgba(155, 93, 229, 0.15); padding-bottom: 10px;">
      <i data-lucide="sparkles" style="color: var(--accent-purple); width: 20px; height: 20px;"></i>
      <h3 style="font-family: 'Space Grotesk', sans-serif; font-size: 1.1rem; color: #fff; font-weight: 700; letter-spacing: 0.5px;">CINEPHILE SYNASTRY & HOROSCOPE</h3>
    </div>
    
    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px;">
      <div>
        <h4 style="font-size: 0.72rem; text-transform: uppercase; color: var(--text-muted); font-weight: 700; margin-bottom: 6px; letter-spacing: 0.5px;">Your Cosmic Signs</h4>
        <p style="font-size: 0.85rem; color: #fff; font-weight: 600; display: flex; gap: 12px; align-items: center; flex-wrap: wrap;">
          <span>☀️ <strong style="color: #ffffff;">${userAstro.primary}</strong></span>
          <span>🌙 <strong style="color: var(--accent-blue);">${userAstro.secondary}</strong></span>
          <span>✨ <strong style="color: var(--accent-green);">${userAstro.ascendant}</strong></span>
        </p>
      </div>
      <div>
        <h4 style="font-size: 0.72rem; text-transform: uppercase; color: var(--text-muted); font-weight: 700; margin-bottom: 6px; letter-spacing: 0.5px;">Their Cosmic Signs</h4>
        <p style="font-size: 0.85rem; color: #fff; font-weight: 600; display: flex; gap: 12px; align-items: center; flex-wrap: wrap;">
          <span>☀️ <strong style="color: #ffffff;">${partnerAstro.primary}</strong></span>
          <span>🌙 <strong style="color: var(--accent-blue);">${partnerAstro.secondary}</strong></span>
          <span>✨ <strong style="color: var(--accent-green);">${partnerAstro.ascendant}</strong></span>
        </p>
      </div>
    </div>

    <div style="background: rgba(0,0,0,0.15); border-radius: 8px; padding: 14px; border: 1px solid rgba(255,255,255,0.02);">
      <h4 style="font-size: 0.72rem; text-transform: uppercase; color: var(--text-muted); font-weight: 700; margin-bottom: 8px; letter-spacing: 0.5px;">COSMIC TASTE PREDICTIONS ("MOST LIKELY TO...")</h4>
      <ul style="list-style: none; display: flex; flex-direction: column; gap: 8px; font-size: 0.82rem; color: var(--text-secondary); padding: 0; margin: 0;">
        ${astroPredictions.map(p => `<li style="display: flex; gap: 8px; align-items: flex-start; text-align: left;"><span style="color: var(--accent-purple);">✦</span><span>${p}</span></li>`).join('')}
      </ul>
    </div>

    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px; align-items: center; border-top: 1px solid rgba(255,255,255,0.03); padding-top: 14px;">
      <p style="font-size: 0.8rem; color: var(--text-secondary); margin: 0; line-height: 1.4; text-align: left;">
        ⚠️ <strong style="color: #ff5f56; text-transform: uppercase; letter-spacing: 0.5px;">Danger Zone:</strong> You will start a fistfight over 
        <strong style="color: #ffffff;">"${gaps.length > 0 ? gaps[0].movie.title : 'movie ratings'}"</strong>.
      </p>
      <p style="font-size: 0.8rem; color: var(--text-secondary); margin: 0; text-align: right; line-height: 1.4;">
        🎬 <strong style="color: var(--accent-green); text-transform: uppercase; letter-spacing: 0.5px;">Cosmic Date:</strong> Rent a vintage projector and watch 
        <strong style="color: #ffffff;">"${sharedFavorites.length > 0 ? sharedFavorites[0].movie.title : 'a classic masterpiece'}"</strong>.
      </p>
    </div>
  `;

  // Populate Shared Favorites
  const sharedContainer = containerElement.querySelector('#mashup-shared-favorites');
  sharedContainer.innerHTML = sharedFavorites.length > 0 
    ? sharedFavorites.slice(0, 5).map((item, idx) => `
        <div class="movie-strip-item">
          <div class="item-info">
            <span class="item-index code-font">${idx + 1}</span>
            <div>
              <span class="item-title">${item.movie.title}</span>
              <span class="item-year">(${item.movie.year})</span>
            </div>
          </div>
          <div class="item-ratings-overlay">
            <div class="item-rating-block text-secondary" title="Your Rating">
              <span>YOU</span>
              <i data-lucide="star"></i>
              <strong class="code-font">${item.userRating}</strong>
            </div>
            <div class="item-rating-block text-green" title="Their Rating">
              <span>THEM</span>
              <i data-lucide="star"></i>
              <strong class="code-font">${item.partnerRating}</strong>
            </div>
          </div>
        </div>
      `).join('')
    : '<div style="color: var(--text-muted); font-size: 0.85rem; padding: 10px 0;">No overlapping 4+ star movies cataloged. Tastes diverged here.</div>';

  // Populate Taste Gaps
  const gapsContainer = containerElement.querySelector('#mashup-gaps-body');
  gapsContainer.innerHTML = gaps.length > 0
    ? gaps.slice(0, 5).map(item => `
        <tr>
          <td style="font-weight: 600;">${item.movie.title} <span style="color: var(--text-muted); font-size: 0.72rem;">(${item.movie.year})</span></td>
          <td class="text-right code-font" style="color: #ffffff;">${item.userRating} ★</td>
          <td class="text-right code-font" style="color: var(--accent-green);">${item.partnerRating} ★</td>
          <td class="text-right"><span class="diff-badge">${item.diff.toFixed(1)}</span></td>
        </tr>
      `).join('')
    : '<tr><td colspan="4" style="color: var(--text-muted); font-size: 0.85rem; text-align: center; padding: 10px 0;">Zero divergence gaps! Absolute mental synchronization.</td></tr>';

  // Populate Genre Chart Row Progress Bars
  const genreBarsContainer = containerElement.querySelector('#mashup-genre-bars');
  genreBarsContainer.innerHTML = genreBars.map(bar => `
    <div class="genre-row">
      <div class="genre-row-header">
        <span class="genre-row-title">${bar.label}</span>
        <span class="genre-split-values code-font">
          You: <span style="color: #fff">${bar.userPercent}%</span> | Them: <span style="color: var(--accent-green)">${bar.partnerPercent}%</span>
        </span>
      </div>
      <div class="genre-bar-track">
        <div class="genre-bar-user" style="width: ${bar.userPercent}%"></div>
        <div class="genre-bar-partner" style="width: ${bar.partnerPercent}%"></div>
      </div>
    </div>
  `).join('');

  // Populate Joint Watchlist
  const recContainer = containerElement.querySelector('#mashup-joint-watchlist');
  recContainer.innerHTML = watchlistRecs.length > 0
    ? watchlistRecs.slice(0, 4).map(item => {
        let catText = 'Classic';
        if (item.movie.category === 'indie') catText = 'Indie';
        else if (item.movie.category === 'horror') catText = 'Horror';
        else if (item.movie.category === 'popcorn') catText = 'Sci-Fi';

        return `
          <div class="rec-movie-pill">
            <span class="rec-genre">${catText}</span>
            <span class="rec-title" title="${item.movie.title}">${item.movie.title}</span>
            <div class="rec-rating" title="Their rating">
              <span>Match Rating:</span>
              <i data-lucide="star"></i>
              <strong class="code-font">${item.rating}</strong>
            </div>
          </div>
        `;
      }).join('')
    : '<div style="color: var(--text-muted); font-size: 0.85rem; padding: 10px 0; grid-column: span 2;">Your watchlist completely covers their high-rated library! Time to export more ratings.</div>';

  // Re-bind Lucide icons
  lucide.createIcons();
}

/* ─────────────────────────────────────────────────────────────────────────────
   COMPATIBILITY TABLE
   Renders a sortable table ranking all neighbors by genre-level affinity.
   Calls onRowClick(match, userAffinities, friendAffinities) on row selection.
───────────────────────────────────────────────────────────────────────────── */
export function renderCompatibilityTable(userRatings, allMatches, containerEl, onRowClick) {
  const attrs = TASTE_ATTRIBUTES;
  const userAffinities = computeAttributeAffinities(userRatings, attrs);

  const enriched = allMatches.map((match) => ({
    match,
    friendAffinities: computeAttributeAffinities(match.profile.ratings, attrs)
  }));

  let sortCol = 'overall';
  let sortDir = 'desc';
  let activeId = null;

  function getVal(row, col) {
    return col === 'overall' ? row.match.matchPercent : (row.friendAffinities[col] || 0);
  }

  function render() {
    const sorted = [...enriched].sort((a, b) => {
      const d = getVal(b, sortCol) - getVal(a, sortCol);
      return sortDir === 'desc' ? d : -d;
    });

    const sortIndicator = (col) =>
      sortCol === col ? (sortDir === 'desc' ? ' ↓' : ' ↑') : '';

    containerEl.innerHTML = `
      <div class="compat-table-scroll">
        <table class="compat-table">
          <thead>
            <tr>
              <th class="th-rank">#</th>
              <th class="th-user">Profile</th>
              <th class="th-sortable ${sortCol === 'overall' ? 'th-active' : ''}" data-col="overall">
                Match${sortIndicator('overall')}
              </th>
              ${attrs.map(a => `
                <th class="th-sortable th-attr ${sortCol === a.key ? 'th-active' : ''}"
                    data-col="${a.key}"
                    title="${a.desc}"
                    style="--attr-col: ${a.color}">
                  ${a.label}${sortIndicator(a.key)}
                </th>
              `).join('')}
            </tr>
          </thead>
          <tbody>
            ${sorted.map((row, idx) => {
              const isReal = row.match.profile.category === 'real';
              const pct = row.match.matchPercent;
              const badgeCls = pct >= 70 ? 'badge-high' : pct >= 50 ? 'badge-mid' : 'badge-low';
              const isActive = row.match.profile.id === activeId;
              const initials = (row.match.profile.avatar || row.match.profile.username.substring(0, 2)).toUpperCase();
              const avatarColor = isReal ? '#40bcf4' : '#00e054';
              return `
                <tr class="compat-row${isActive ? ' compat-row-active' : ''}" data-id="${row.match.profile.id}">
                  <td class="td-rank">${idx + 1}</td>
                  <td class="td-user">
                    <div class="td-user-inner">
                      <span class="user-avatar-sm" style="background:${avatarColor}22;color:${avatarColor};border-color:${avatarColor}66">
                        ${initials}
                      </span>
                      <div>
                        <div class="td-username">${isReal ? '👥 ' : ''}${row.match.profile.username}</div>
                        <div class="td-category">${row.match.profile.category}</div>
                      </div>
                    </div>
                  </td>
                  <td class="td-overall">
                    <span class="match-badge ${badgeCls}">${pct}%</span>
                  </td>
                  ${attrs.map(a => {
                    const v = row.friendAffinities[a.key] || 0;
                    return `
                      <td class="td-attr">
                        <div class="attr-cell">
                          <div class="attr-mini-bar">
                            <div class="attr-mini-fill" style="width:${v}%;background:${a.color}99"></div>
                          </div>
                          <span class="attr-pct-label">${v}%</span>
                        </div>
                      </td>`;
                  }).join('')}
                </tr>`;
            }).join('')}
          </tbody>
        </table>
      </div>`;

    containerEl.querySelectorAll('.th-sortable').forEach(th => {
      th.addEventListener('click', () => {
        const col = th.dataset.col;
        if (sortCol === col) sortDir = sortDir === 'desc' ? 'asc' : 'desc';
        else { sortCol = col; sortDir = 'desc'; }
        render();
      });
    });

    containerEl.querySelectorAll('.compat-row').forEach(tr => {
      tr.addEventListener('click', () => {
        activeId = tr.dataset.id;
        const row = enriched.find(r => r.match.profile.id === activeId);
        if (row) {
          render();
          onRowClick(row.match, userAffinities, row.friendAffinities);
        }
      });
    });
  }

  render();
}

/* ─────────────────────────────────────────────────────────────────────────────
   RADAR CHART
   Draws a hexagonal radar chart comparing user vs friend across 6 attributes.
───────────────────────────────────────────────────────────────────────────── */
export function renderRadarChart(canvas, userAffinities, friendAffinities, friendColor) {
  const attrs = TASTE_ATTRIBUTES;
  const n = attrs.length;

  const dpr = window.devicePixelRatio || 1;
  const size = canvas.clientWidth || 220;
  canvas.width = size * dpr;
  canvas.height = size * dpr;
  const ctx = canvas.getContext('2d');
  ctx.scale(dpr, dpr);

  const W = size, H = size;
  const cx = W / 2, cy = H / 2;
  const maxR = Math.min(W, H) / 2 - 36;

  ctx.clearRect(0, 0, W, H);

  const pt = (i, r) => {
    const angle = (i / n) * Math.PI * 2 - Math.PI / 2;
    return { x: cx + Math.cos(angle) * r, y: cy + Math.sin(angle) * r };
  };

  // Background rings
  [0.25, 0.5, 0.75, 1.0].forEach(frac => {
    ctx.beginPath();
    for (let i = 0; i < n; i++) {
      const p = pt(i, maxR * frac);
      i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y);
    }
    ctx.closePath();
    ctx.strokeStyle = `rgba(255,255,255,${frac === 1 ? 0.12 : 0.05})`;
    ctx.lineWidth = 1;
    if (frac < 1) ctx.setLineDash([3, 3]);
    ctx.stroke();
    ctx.setLineDash([]);
  });

  // Spokes
  attrs.forEach((_, i) => {
    const outer = pt(i, maxR);
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(outer.x, outer.y);
    ctx.strokeStyle = 'rgba(255,255,255,0.07)';
    ctx.lineWidth = 1;
    ctx.stroke();
  });

  const drawPoly = (affinities, color, fillAlpha, lineWidth) => {
    ctx.beginPath();
    attrs.forEach((attr, i) => {
      const val = Math.min(100, affinities[attr.key] || 0) / 100;
      const p = pt(i, maxR * Math.max(0.02, val));
      i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y);
    });
    ctx.closePath();
    const hex = Math.round(fillAlpha * 255).toString(16).padStart(2, '0');
    ctx.fillStyle = color + hex;
    ctx.fill();
    ctx.strokeStyle = color;
    ctx.lineWidth = lineWidth;
    ctx.stroke();
  };

  drawPoly(friendAffinities, friendColor, 0.2, 2);
  drawPoly(userAffinities, '#ffffff', 0.07, 1.5);

  const drawDots = (affinities, color) => {
    attrs.forEach((attr, i) => {
      const val = Math.min(100, affinities[attr.key] || 0) / 100;
      const p = pt(i, maxR * Math.max(0.02, val));
      ctx.beginPath();
      ctx.arc(p.x, p.y, 3.5, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.fill();
    });
  };
  drawDots(friendAffinities, friendColor);
  drawDots(userAffinities, '#ffffff');

  // Spoke labels
  attrs.forEach((attr, i) => {
    const labelPt = pt(i, maxR + 18);
    ctx.save();
    ctx.fillStyle = attr.color;
    ctx.font = 'bold 9px "Space Grotesk", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(attr.label.toUpperCase(), labelPt.x, labelPt.y);
    ctx.restore();
  });
}

/* ─────────────────────────────────────────────────────────────────────────────
   DEEP PROFILE
   Renders a rich analysis of the user's rating activity into containerEl.
───────────────────────────────────────────────────────────────────────────── */
export function renderDeepProfile(userRatings, username, allMatches, containerEl) {
  const attrs = TASTE_ATTRIBUTES;
  const affinities = computeAttributeAffinities(userRatings, attrs);

  const ratedIndices = userRatings.map((r, i) => ({ r, i })).filter(x => x.r > 0);
  const coverage = ratedIndices.length;
  const avgRating = coverage > 0 ? ratedIndices.reduce((s, x) => s + x.r, 0) / coverage : 0;
  const stdDev = coverage > 0
    ? Math.sqrt(ratedIndices.reduce((s, x) => s + (x.r - avgRating) ** 2, 0) / coverage)
    : 0;

  let personality, personalityDesc;
  if (avgRating < 2.8) {
    personality = '🔪 The Harsh Critic';
    personalityDesc = 'You hold films to a high standard. Lower ratings are your default — praise from you means something.';
  } else if (avgRating < 3.3) {
    personality = '⚖️ The Discerning Selector';
    personalityDesc = 'Measured and selective. You appreciate quality but aren\'t easily impressed. A 4★ from you is gold.';
  } else if (avgRating < 3.8) {
    personality = '🎬 The Balanced Cinephile';
    personalityDesc = 'You engage with films broadly and fairly. You find something to enjoy in most films you watch.';
  } else {
    personality = '❤️ The Enthusiastic Champion';
    personalityDesc = 'You bring love to the cinema. High ratings are your norm — films light you up easily.';
  }

  let covLabel;
  if (coverage < 8) covLabel = '🌱 Early Explorer';
  else if (coverage < 20) covLabel = '📽️ Growing Cinephile';
  else if (coverage < 40) covLabel = '🎭 Avid Collector';
  else covLabel = '🏆 Master Archivist';

  const topFilms = ratedIndices
    .filter(x => x.r >= 4.0)
    .sort((a, b) => b.r - a.r)
    .slice(0, 6)
    .map(x => ({ film: MASTER_MOVIES[x.i], rating: x.r }));

  const bottomFilms = ratedIndices
    .filter(x => x.r <= 2.5)
    .sort((a, b) => a.r - b.r)
    .slice(0, 4)
    .map(x => ({ film: MASTER_MOVIES[x.i], rating: x.r }));

  const eras = { '1940–1979': [], '1980–1999': [], '2000–2014': [], '2015+': [] };
  ratedIndices.forEach(({ r, i }) => {
    const yr = MASTER_MOVIES[i].year;
    if (yr < 1980) eras['1940–1979'].push(r);
    else if (yr < 2000) eras['1980–1999'].push(r);
    else if (yr < 2015) eras['2000–2014'].push(r);
    else eras['2015+'].push(r);
  });
  const eraData = Object.entries(eras)
    .map(([label, rs]) => ({ label, avg: rs.length ? rs.reduce((a, b) => a + b, 0) / rs.length : 0, count: rs.length }))
    .filter(e => e.count > 0)
    .sort((a, b) => b.avg - a.avg);

  const communityAvgs = MASTER_MOVIES.map((_, idx) => {
    const vals = allMatches.map(m => m.profile.ratings[idx]).filter(r => r > 0);
    return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0;
  });
  const contrarian = ratedIndices
    .filter(({ i }) => communityAvgs[i] > 0)
    .map(({ r, i }) => ({ film: MASTER_MOVIES[i], userRating: r, communityAvg: communityAvgs[i], diff: r - communityAvgs[i] }))
    .sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff))
    .slice(0, 5);

  const topAttr = attrs.reduce((best, a) => (affinities[a.key] || 0) > (affinities[best.key] || 0) ? a : best, attrs[0]);

  const starBar = (rating) => {
    const full = Math.floor(rating);
    const half = rating % 1 >= 0.5 ? 1 : 0;
    return '★'.repeat(full) + (half ? '½' : '') + '☆'.repeat(5 - full - half);
  };

  containerEl.innerHTML = `
    <div class="dp-grid">
      <div class="dp-card dp-card-wide">
        <div class="dp-card-label">Cinematic Identity</div>
        <div class="dp-personality">${personality}</div>
        <div class="dp-personality-desc">${personalityDesc}</div>
        <div class="dp-stats-row">
          <div class="dp-stat">
            <div class="dp-stat-val">${avgRating.toFixed(2)} ★</div>
            <div class="dp-stat-lbl">Avg Rating</div>
          </div>
          <div class="dp-stat">
            <div class="dp-stat-val">${coverage} / 60</div>
            <div class="dp-stat-lbl">Films Rated</div>
          </div>
          <div class="dp-stat">
            <div class="dp-stat-val">±${stdDev.toFixed(2)}</div>
            <div class="dp-stat-lbl">Rating Spread</div>
          </div>
          <div class="dp-stat">
            <div class="dp-stat-val" style="color:${topAttr.color}">${topAttr.label}</div>
            <div class="dp-stat-lbl">Top Genre</div>
          </div>
        </div>
        <div class="dp-coverage-tag">${covLabel}</div>
      </div>

      <div class="dp-card">
        <div class="dp-card-label">Genre Fingerprint</div>
        ${attrs.map(a => {
          const v = affinities[a.key] || 0;
          return `<div class="dp-attr-row">
            <span class="dp-attr-name" style="color:${a.color}">${a.label}</span>
            <div class="dp-attr-track">
              <div class="dp-attr-fill" style="width:${v}%;background:${a.color}"></div>
            </div>
            <span class="dp-attr-pct">${v}%</span>
          </div>`;
        }).join('')}
      </div>

      <div class="dp-card">
        <div class="dp-card-label">Most Loved (Catalog)</div>
        ${topFilms.length > 0
          ? topFilms.map(({ film, rating }) => `
              <div class="dp-film-row">
                <span class="dp-film-title">${film.title}</span>
                <span class="dp-film-stars" style="color:#ff8000">${starBar(rating)}</span>
              </div>`).join('')
          : '<p class="dp-empty">Rate more catalog films to reveal your top picks.</p>'}
      </div>

      <div class="dp-card">
        <div class="dp-card-label">Era Preference</div>
        ${eraData.length > 0
          ? eraData.map(e => `
              <div class="dp-era-row">
                <span class="dp-era-label">${e.label}</span>
                <div class="dp-attr-track">
                  <div class="dp-attr-fill" style="width:${Math.round((e.avg / 5) * 100)}%;background:var(--accent-orange)"></div>
                </div>
                <span class="dp-era-meta">${e.avg.toFixed(1)}★ · ${e.count} film${e.count !== 1 ? 's' : ''}</span>
              </div>`).join('')
          : '<p class="dp-empty">Not enough era data yet.</p>'}
      </div>

      <div class="dp-card dp-card-wide">
        <div class="dp-card-label">Your Most Contrarian Opinions vs. the Group</div>
        ${contrarian.length > 0
          ? `<div class="dp-contrarian-table">
              <div class="dp-contrarian-header"><span>Film</span><span>You</span><span>Group Avg</span><span>Δ</span></div>
              ${contrarian.map(c => {
                const diffSign = c.diff > 0 ? '+' : '';
                const diffColor = c.diff > 0.5 ? '#00e054' : c.diff < -0.5 ? '#ef233c' : 'var(--text-muted)';
                return `<div class="dp-contrarian-row">
                  <span class="dp-c-film">${c.film.title} <em>(${c.film.year})</em></span>
                  <span class="dp-c-val">${c.userRating}★</span>
                  <span class="dp-c-val" style="color:var(--text-muted)">${c.communityAvg.toFixed(1)}★</span>
                  <span class="dp-c-diff" style="color:${diffColor}">${diffSign}${c.diff.toFixed(1)}</span>
                </div>`;
              }).join('')}
            </div>`
          : '<p class="dp-empty">Not enough shared films with peers to find contrarian opinions.</p>'}
      </div>

      ${bottomFilms.length > 0 ? `
        <div class="dp-card">
          <div class="dp-card-label">Least Loved (Catalog)</div>
          ${bottomFilms.map(({ film, rating }) => `
            <div class="dp-film-row">
              <span class="dp-film-title">${film.title}</span>
              <span class="dp-film-stars" style="color:#ef233c">${starBar(rating)}</span>
            </div>`).join('')}
        </div>` : ''}
    </div>
  `;
}
