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
      const angle = (idx / knnMatches.length) * Math.PI * 2 - Math.PI / 2; // start at top
      const distance = 190 + (100 - match.matchPercent) * 1.8; // Similarity sets spring rest length!

      const px = width / 2 + Math.cos(angle) * distance;
      const py = height / 2 + Math.sin(angle) * distance;

      const isFriend = match.profile.category === 'real';
      let color = '#00e054'; // default green
      let glow = 'rgba(0, 224, 84, 0.3)';
      if (isFriend) {
        color = '#40bcf4'; // glowing teal/blue for friends
        glow = 'rgba(64, 188, 244, 0.5)';
      } else {
        if (match.profile.category === 'horror') { color = '#ef233c'; glow = 'rgba(239, 35, 60, 0.3)'; }
        else if (match.profile.category === 'classics') { color = '#ff8000'; glow = 'rgba(255, 128, 0, 0.3)'; }
        else if (match.profile.category === 'popcorn') { color = '#a06cd5'; glow = 'rgba(160, 108, 213, 0.3)'; } // Purple popcorn
      }

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

    // Draw one frame immediately so the canvas isn't blank before the rAF loop starts
    this.draw();
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

    // --- SCROLL WHEEL ZOOM (zoom toward cursor) ---
    this.canvas.addEventListener('wheel', (e) => {
      e.preventDefault();
      const rect = this.canvas.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;

      const delta = e.deltaY > 0 ? -0.12 : 0.12;
      const prevZoom = this.zoom;
      const newZoom = Math.max(0.35, Math.min(2.8, this.zoom + delta));

      // Zoom toward the mouse cursor position
      this.panX = mouseX - (mouseX - this.panX) * (newZoom / prevZoom);
      this.panY = mouseY - (mouseY - this.panY) * (newZoom / prevZoom);
      this.zoom = newZoom;
    }, { passive: false });

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

      // Custom dashed halo for real scanned friends in the graph
      if (node.profile.category === 'real' && !node.isCentral) {
        this.ctx.save();
        this.ctx.strokeStyle = '#40bcf4';
        this.ctx.lineWidth = 1.5;
        this.ctx.setLineDash([4, 3]);
        this.ctx.beginPath();
        this.ctx.arc(node.x, node.y, node.radius + 5, 0, Math.PI * 2);
        this.ctx.stroke();
        this.ctx.restore();
      }

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

      const tagText = node.profile.category === 'real' && !node.isCentral ? `👥 ${node.label}` : node.label;
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
