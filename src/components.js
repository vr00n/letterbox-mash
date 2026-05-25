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
  ForceDirectedLayout
} from './math.js';
import { MASTER_MOVIES } from './archetypes.js';

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
    { text: `[NET] Connecting to Letterboxd public feeds for user: "${username}"...`, time: 600 },
    { text: `[NET] Connected! Status code: 200 OK`, time: 300, class: 'terminal-accent' },
    { text: `[CRAWL] Fetching RSS feed (https://letterboxd.com/${username}/rss/)...`, time: 700 },
    { text: `[CRAWL] Parsed user profile. Found 47 ratings and 89 watched history items.`, time: 500, class: 'terminal-accent' },
    { text: `[ENGINE] Matching movie records with our Cinephile Master Catalog (M=60)...`, time: 600 },
    { text: `[ENGINE] Aligned 14 co-rated catalog entries. Imputing sparse vector.`, time: 400 },
    { text: `[MATH] Initializing principal component decomposition of dimensions [N=25, M=60]...`, time: 600 },
    { text: `[MATH] Computing ratings covariance matrix...`, time: 400 },
    { text: `[MATH] PC1 Eigenvector extracted (Variance explained: 29.4%). Axis maps: [Art House vs. Blockbuster]`, time: 600, class: 'terminal-accent-orange' },
    { text: `[MATH] PC2 Eigenvector extracted (Variance explained: 18.8%). Axis maps: [Horror vs. Classic]`, time: 500, class: 'terminal-accent-orange' },
    { text: `[MATH] Centered user taste coordinates: PC1 = -0.42, PC2 = 1.34`, time: 300 },
    { text: `[KNN] Locating K-Nearest Neighbors in Letterboxd Taste Space...`, time: 500 },
    { text: `[KNN] 10 Nearest Neighbors clustered successfully!`, time: 400, class: 'terminal-accent' },
    { text: `[SYSTEM] Taste mashup compiled. Launching dashboard...`, time: 500, class: 'terminal-accent-blue' }
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
 * 3. Interactive Force-Directed Canvas Visualization for the 10 Nearest Neighbors
 */
export class InteractiveGraphCanvas {
  constructor(canvasElement, onNodeSelected) {
    this.canvas = canvasElement;
    this.ctx = canvasElement.getContext('2d');
    this.onNodeSelected = onNodeSelected;

    this.nodes = [];
    this.links = [];
    this.physics = null;
    this.activeNodeId = null;
    this.hoverNodeId = null;

    // View translation and scaling (Zoom / Pan)
    this.zoom = 1;
    this.panX = 0;
    this.panY = 0;
    this.isPanning = false;
    this.startPanX = 0;
    this.startPanY = 0;

    // Physics enable flag
    this.physicsEnabled = true;

    // Mouse states for node dragging
    this.draggedNode = null;

    this.initEvents();
  }

  /**
   * Initializes the nodes and spring links between active user and their KNN matches.
   */
  setGraph(userProfile, knnMatches) {
    const width = this.canvas.clientWidth;
    const height = this.canvas.clientHeight;

    this.canvas.width = width;
    this.canvas.height = height;

    this.nodes = [];
    this.links = [];

    // Add Central User node
    this.nodes.push({
      id: 'user_node',
      x: width / 2,
      y: height / 2,
      vx: 0,
      vy: 0,
      radius: 22,
      isCentral: true,
      label: userProfile.username,
      displayName: userProfile.displayName,
      color: '#ffffff',
      profile: userProfile,
      glowColor: 'rgba(255, 255, 255, 0.4)'
    });

    this.activeNodeId = 'user_node';

    // Add Neighbors nodes
    knnMatches.forEach((match, idx) => {
      const angle = (idx / knnMatches.length) * Math.PI * 2;
      const distance = 160 + (100 - match.matchPercent) * 2.5; // Similarity sets spring rest length!

      const px = width / 2 + Math.cos(angle) * distance;
      const py = height / 2 + Math.sin(angle) * distance;

      let color = '#00e054'; // default green
      let glow = 'rgba(0, 224, 84, 0.3)';
      if (match.profile.category === 'horror') { color = '#ef233c'; glow = 'rgba(239, 35, 60, 0.3)'; }
      else if (match.profile.category === 'classics') { color = '#ff8000'; glow = 'rgba(255, 128, 0, 0.3)'; }
      else if (match.profile.category === 'popcorn') { color = '#40bcf4'; glow = 'rgba(64, 188, 244, 0.3)'; }

      const node = {
        id: match.profile.id,
        x: px,
        y: py,
        vx: 0,
        vy: 0,
        radius: 14 + (match.matchPercent - 60) * 0.25, // Higher similarity -> larger node
        isCentral: false,
        label: match.profile.username,
        displayName: match.profile.displayName,
        color: color,
        glowColor: glow,
        profile: match.profile,
        matchPercent: match.matchPercent,
        stats: match
      };

      this.nodes.push(node);

      // Connect central user to neighbors
      this.links.push({
        sourceId: 'user_node',
        targetId: node.id,
        length: distance,
        strength: match.matchPercent / 100
      });
    });

    this.physics = new ForceDirectedLayout(this.nodes, this.links, width, height);
    this.zoom = 1;
    this.panX = 0;
    this.panY = 0;

    // Fire default selection on active user
    this.onNodeSelected(this.nodes[0], true);
  }

  /**
   * Bind DOM Canvas mouse, touch, and resize handlers.
   */
  initEvents() {
    const getMouseCoords = (e) => {
      const rect = this.canvas.getBoundingClientRect();
      // Translate raw mouse coords based on pan and zoom
      const rawX = e.clientX - rect.left;
      const rawY = e.clientY - rect.top;
      return {
        x: (rawX - this.panX) / this.zoom,
        y: (rawY - this.panY) / this.zoom,
        rawX,
        rawY
      };
    };

    // --- MOUSE DOWN (Drag start or Pan start) ---
    this.canvas.addEventListener('mousedown', (e) => {
      const coords = getMouseCoords(e);
      
      // Check if clicked on a node
      let clickedNode = null;
      for (let i = this.nodes.length - 1; i >= 0; i--) {
        const node = this.nodes[i];
        const dx = coords.x - node.x;
        const dy = coords.y - node.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        
        if (dist <= node.radius + 6) {
          clickedNode = node;
          break;
        }
      }

      if (clickedNode) {
        // Drag Node
        this.draggedNode = clickedNode;
        clickedNode.isDragged = true;
        
        // Select Node
        this.activeNodeId = clickedNode.id;
        this.onNodeSelected(clickedNode, clickedNode.isCentral);
      } else {
        // Pan Canvas
        this.isPanning = true;
        this.startPanX = e.clientX - this.panX;
        this.startPanY = e.clientY - this.panY;
      }
    });

    // --- MOUSE MOVE (Dragging, Panning, or Hover Checks) ---
    this.canvas.addEventListener('mousemove', (e) => {
      const coords = getMouseCoords(e);

      if (this.draggedNode) {
        this.draggedNode.x = coords.x;
        this.draggedNode.y = coords.y;
      } else if (this.isPanning) {
        this.panX = e.clientX - this.startPanX;
        this.panY = e.clientY - this.startPanY;
      } else {
        // Check hover
        let hoveredNode = null;
        for (let i = this.nodes.length - 1; i >= 0; i--) {
          const node = this.nodes[i];
          const dx = coords.x - node.x;
          const dy = coords.y - node.y;
          if (Math.sqrt(dx * dx + dy * dy) <= node.radius + 6) {
            hoveredNode = node;
            break;
          }
        }

        if (hoveredNode) {
          this.hoverNodeId = hoveredNode.id;
          this.canvas.style.cursor = 'pointer';
        } else {
          this.hoverNodeId = null;
          this.canvas.style.cursor = 'grab';
        }
      }
    });

    // --- MOUSE UP / LEAVE (Release actions) ---
    const releaseMouse = () => {
      if (this.draggedNode) {
        this.draggedNode.isDragged = false;
        this.draggedNode = null;
      }
      this.isPanning = false;
    };

    this.canvas.addEventListener('mouseup', releaseMouse);
    this.canvas.addEventListener('mouseleave', releaseMouse);

    // --- RESIZE CANVAS ---
    window.addEventListener('resize', () => {
      if (!this.canvas.offsetParent) return; // Ignore if hidden
      const w = this.canvas.clientWidth;
      const h = this.canvas.clientHeight;
      this.canvas.width = w;
      this.canvas.height = h;
      if (this.physics) {
        this.physics.width = w;
        this.physics.height = h;
      }
    });
  }

  /**
   * Triggers zoom modifications
   */
  zoomIn() { this.zoom = Math.min(this.zoom + 0.15, 2.5); }
  zoomOut() { this.zoom = Math.max(this.zoom - 0.15, 0.4); }
  resetZoom() {
    this.zoom = 1;
    this.panX = 0;
    this.panY = 0;
    // Centralize central user node manually
    const user = this.nodes.find(n => n.isCentral);
    if (user) {
      user.x = this.canvas.width / 2;
      user.y = this.canvas.height / 2;
    }
  }

  /**
   * Main render canvas frame loop.
   */
  draw() {
    // 1. Tick Physics
    if (this.physicsEnabled && this.physics) {
      this.physics.tick();
    }

    // 2. Clear Screen
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

    // 3. Save Matrix, Apply Zoom & Pan
    this.ctx.save();
    this.ctx.translate(this.panX, this.panY);
    this.ctx.scale(this.zoom, this.zoom);

    // 4. DRAW CONNECTIVE LINKS (SPRINGS)
    this.links.forEach(link => {
      const source = this.nodes.find(n => n.id === link.sourceId);
      const target = this.nodes.find(n => n.id === link.targetId);
      if (!source || !target) return;

      const isActive = this.activeNodeId === target.id || this.activeNodeId === 'user_node';
      const isHovered = this.hoverNodeId === target.id || this.hoverNodeId === 'user_node';

      // Design line style based on similarity strength
      this.ctx.beginPath();
      this.ctx.moveTo(source.x, source.y);
      this.ctx.lineTo(target.x, target.y);

      // Line thickness based on similarity match
      this.ctx.lineWidth = 1 + (target.matchPercent - 50) * 0.1;
      
      // Line transparency based on similarity and focus states
      let alpha = 0.15 + (target.matchPercent - 50) * 0.01;
      if (this.activeNodeId === target.id) {
        alpha = 0.8;
      } else if (this.activeNodeId !== 'user_node' && this.activeNodeId !== target.id) {
        alpha = 0.05; // Fade out non-active lines
      }

      this.ctx.strokeStyle = `rgba(0, 224, 84, ${alpha})`;
      this.ctx.stroke();

      // Draw match text overlay mid-way on active/hover links
      if (isActive || isHovered) {
        const midX = (source.x + target.x) / 2;
        const midY = (source.y + target.y) / 2;
        
        this.ctx.save();
        this.ctx.fillStyle = '#14181c';
        this.ctx.strokeStyle = `rgba(255, 255, 255, 0.08)`;
        this.ctx.lineWidth = 1;
        
        const labelText = `${target.matchPercent}%`;
        this.ctx.font = 'bold 9px "Space Grotesk"';
        const labelWidth = this.ctx.measureText(labelText).width;
        
        this.ctx.beginPath();
        this.ctx.roundRect(midX - labelWidth/2 - 6, midY - 7, labelWidth + 12, 14, 4);
        this.ctx.fill();
        this.ctx.stroke();
        
        this.ctx.fillStyle = '#00e054';
        this.ctx.textAlign = 'center';
        this.ctx.textBaseline = 'middle';
        this.ctx.fillText(labelText, midX, midY);
        this.ctx.restore();
      }
    });

    // 5. DRAW GRAPH NODES
    this.nodes.forEach(node => {
      const isHovered = this.hoverNodeId === node.id;
      const isActive = this.activeNodeId === node.id;

      // Outer Glow shadow on active/hover nodes
      if (isHovered || isActive) {
        this.ctx.save();
        this.ctx.shadowColor = node.color;
        this.ctx.shadowBlur = isActive ? 22 : 12;
      }

      // Draw outer circle accent border
      this.ctx.beginPath();
      this.ctx.arc(node.x, node.y, node.radius + (isActive ? 3 : 0), 0, Math.PI * 2);
      this.ctx.fillStyle = node.color;
      this.ctx.fill();

      if (isHovered || isActive) {
        this.ctx.restore();
      }

      // Inner Core Circle (gives deep 3D orb appearance)
      this.ctx.beginPath();
      this.ctx.arc(node.x, node.y, node.radius - 2, 0, Math.PI * 2);
      const gradient = this.ctx.createRadialGradient(
        node.x - node.radius/3, node.y - node.radius/3, 1,
        node.x, node.y, node.radius
      );
      
      if (node.isCentral) {
        gradient.addColorStop(0, '#ffffff');
        gradient.addColorStop(1, '#667788');
      } else {
        gradient.addColorStop(0, '#ffffff');
        gradient.addColorStop(0.2, node.color);
        gradient.addColorStop(1, '#060a0f');
      }
      
      this.ctx.fillStyle = gradient;
      this.ctx.fill();

      // Node Label Text Tag
      this.ctx.save();
      this.ctx.font = node.isCentral ? 'bold 11px "Space Grotesk"' : '500 10px "Space Grotesk"';
      this.ctx.textAlign = 'center';
      this.ctx.textBaseline = 'top';

      const tagText = node.label;
      const textWidth = this.ctx.measureText(tagText).width;

      // Draw glass label container below node
      const labelY = node.y + node.radius + 6;
      this.ctx.fillStyle = 'rgba(20, 24, 28, 0.85)';
      this.ctx.strokeStyle = isActive ? node.color : 'rgba(255, 255, 255, 0.08)';
      this.ctx.lineWidth = 1;
      
      this.ctx.beginPath();
      this.ctx.roundRect(node.x - textWidth/2 - 8, labelY - 3, textWidth + 16, 15, 4);
      this.ctx.fill();
      this.ctx.stroke();

      // Draw text
      this.ctx.fillStyle = isActive ? '#ffffff' : '#9aabbb';
      this.ctx.fillText(tagText, node.x, labelY - 1);
      this.ctx.restore();

      // Central avatar initials inside node sphere
      if (node.radius > 16) {
        this.ctx.save();
        this.ctx.fillStyle = node.isCentral ? '#000000' : '#ffffff';
        this.ctx.font = `bold ${node.isCentral ? '10px' : '9px'} "Space Grotesk"`;
        this.ctx.textAlign = 'center';
        this.ctx.textBaseline = 'middle';
        const initials = node.profile.avatar || node.label.substring(0,2).toUpperCase();
        this.ctx.fillText(initials, node.x, node.y);
        this.ctx.restore();
      }
    });

    this.ctx.restore(); // Restore transform matrix
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
  let badgeColorClass = 'popcorn';
  if (p.category === 'indie') { typeLabel = 'Arthouse & Indie Devotee'; badgeColorClass = 'accent-green'; }
  else if (p.category === 'horror') { typeLabel = 'Horror Gorehound'; badgeColorClass = 'accent-orange'; }
  else if (p.category === 'popcorn') { typeLabel = 'Sci-Fi / Popcorn Maximalist'; badgeColorClass = 'accent-blue'; }

  containerElement.innerHTML = `
    <div class="profile-header-meta">
      <div class="profile-avatar" style="background: ${isUser ? '#ffffff' : 'var(--accent-green)'}; color: #000;">
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
  const genreMax = 15 * 5.0; // 15 movies * 5 stars
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
