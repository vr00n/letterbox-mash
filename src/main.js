/* ==========================================================================
   MAIN STATE ORCHESTRATOR & EVENT BINDER
   Project: Letterboxd KNN Taste Mashup
   ========================================================================== */

import { ARCHETYPES, MASTER_MOVIES, generateDeterministicRatings } from './archetypes.js';
import { performPCA, getKNNNeighbors } from './math.js';
import { 
  renderTerminalLogs, 
  renderCalibrationCards, 
  InteractiveGraphCanvas, 
  renderActiveProfileCard, 
  renderMashupDNA 
} from './components.js';

// Global App State
const STATE = {
  activeScreen: 'screen-scan', // screen-scan, screen-calibrate, screen-dashboard
  username: '',
  displayName: '',
  avatar: 'U',
  ratings: new Array(60).fill(0), // 60 elements for M=60
  archetypes: [...ARCHETYPES],
  knnMatches: [],
  selectedNode: null,
  graphCanvas: null,
  animationFrameId: null
};

// DOM Cache
const DOM = {
  screens: {
    scan: document.getElementById('screen-scan'),
    calibrate: document.getElementById('screen-calibrate'),
    dashboard: document.getElementById('screen-dashboard')
  },
  usernameInput: document.getElementById('username-input'),
  scanForm: document.getElementById('scan-form'),
  activeUserBadge: document.getElementById('active-user-badge'),
  activeUsername: document.getElementById('active-username'),
  resetAppBtn: document.getElementById('reset-app-btn'),
  terminal: document.getElementById('scanner-terminal'),
  calibrationContainer: document.getElementById('calibration-movies-container'),
  skipCalibrateBtn: document.getElementById('skip-calibrate-btn'),
  confirmCalibrateBtn: document.getElementById('confirm-calibrate-btn'),
  selectedProfileCard: document.getElementById('selected-profile-card'),
  
  // Graph controls
  btnZoomIn: document.getElementById('btn-zoom-in'),
  btnZoomOut: document.getElementById('btn-zoom-out'),
  btnZoomReset: document.getElementById('btn-zoom-reset'),
  btnPhysicsToggle: document.getElementById('btn-physics-toggle'),
  canvas: document.getElementById('taste-graph-canvas'),
  
  // Mashup Modal
  openMashupBtn: document.getElementById('open-mashup-btn'),
  closeModalBtn: document.getElementById('close-modal-btn'),
  mashupModal: document.getElementById('mashup-modal'),
  
  // Stats Nerd labels
  statPearson: document.getElementById('stat-pearson'),
  statCosine: document.getElementById('stat-cosine'),
  statJaccard: document.getElementById('stat-jaccard'),
  statDistance: document.getElementById('stat-distance'),
  statPC1: document.getElementById('stat-pc1'),
  statPC2: document.getElementById('stat-pc2'),
  barPearson: document.getElementById('bar-pearson'),
  barCosine: document.getElementById('bar-cosine'),
  barJaccard: document.getElementById('bar-jaccard'),
  barDistance: document.getElementById('bar-distance')
};

/**
 * Transition to a specific screen state.
 */
function transitionTo(screenId) {
  // Stop current canvas rendering if active
  if (STATE.animationFrameId) {
    cancelAnimationFrame(STATE.animationFrameId);
    STATE.animationFrameId = null;
  }

  // Handle active states
  Object.keys(DOM.screens).forEach(key => {
    const el = DOM.screens[key];
    if (el.id === screenId) {
      el.classList.add('active');
    } else {
      el.classList.remove('active');
    }
  });

  STATE.activeScreen = screenId;
}

/**
 * Parses custom Letterboxd CSV data content.
 * Standard format: "Date,Name,Year,Letterboxd URI,Rating"
 */
function parseLetterboxdCSV(csvText) {
  const lines = csvText.split(/\r?\n/);
  if (lines.length < 2) return null;

  // Split lines accounting for quotes in CSV values
  function splitCSVRow(line) {
    const result = [];
    let current = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === ',' && !inQuotes) {
        result.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }
    result.push(current.trim());
    return result;
  }

  const headers = splitCSVRow(lines[0]);
  const nameIdx = headers.indexOf('Name');
  const yearIdx = headers.indexOf('Year');
  const ratingIdx = headers.indexOf('Rating');

  if (nameIdx === -1 || ratingIdx === -1) {
    return null; // Missing columns
  }

  const parsedRatings = new Array(60).fill(0);
  let matchCount = 0;

  for (let i = 1; i < lines.length; i++) {
    if (!lines[i]) continue;
    const row = splitCSVRow(lines[i]);
    const name = row[nameIdx];
    const year = parseInt(row[yearIdx]);
    const rating = parseFloat(row[ratingIdx]);

    if (!name || isNaN(rating)) continue;

    // Search matches in master film catalog (Case insensitive)
    const film = MASTER_MOVIES.find(m => {
      const titleMatch = m.title.toLowerCase() === name.toLowerCase();
      const yearMatch = isNaN(year) || m.year === year;
      return titleMatch && yearMatch;
    });

    if (film) {
      parsedRatings[film.id] = rating;
      matchCount++;
    }
  }

  return { ratings: parsedRatings, count: matchCount };
}

/**
 * Initializes and starts the visual Canvas loop.
 */
function startCanvasLoop() {
  if (!STATE.graphCanvas) return;
  
  function loop() {
    STATE.graphCanvas.draw();
    STATE.animationFrameId = requestAnimationFrame(loop);
  }
  
  loop();
}

/**
 * Triggers full vector computations: Pearson, Cosine, PCA coordinates.
 */
function computeTasteSpace() {
  // 1. Gather all vectors for PCA projection
  // Matrix dimensions: [N=25, M=60] (24 archetypes + 1 user)
  const fullMatrix = STATE.archetypes.map(a => a.ratings);
  fullMatrix.push(STATE.ratings); // Insert user vector at the end (index N-1)

  // 2. Perform Singular Value / Power Iteration PCA
  const projections = performPCA(fullMatrix);
  const userProjection = projections[projections.length - 1]; // user is last element

  // 3. Compute KNN Matches against archetypes
  const knnMatches = getKNNNeighbors(STATE.ratings, STATE.archetypes, 10);
  STATE.knnMatches = knnMatches;

  // 4. Bind PCA coordinates to archetypes & user
  STATE.archetypes.forEach((a, idx) => {
    a.pc1 = projections[idx].pc1;
    a.pc2 = projections[idx].pc2;
  });

  const userProfile = {
    username: STATE.username,
    displayName: STATE.displayName,
    avatar: STATE.avatar,
    ratings: STATE.ratings,
    category: 'user',
    pc1: userProjection.pc1,
    pc2: userProjection.pc2
  };

  // 5. Build and launch Canvas graph
  if (!STATE.graphCanvas) {
    STATE.graphCanvas = new InteractiveGraphCanvas(DOM.canvas, handleNodeSelected);
  }

  STATE.graphCanvas.setGraph(userProfile, knnMatches);
  
  // 6. Push user coordinates to labels
  DOM.statPC1.innerText = userProjection.pc1.toFixed(2);
  DOM.statPC2.innerText = userProjection.pc2.toFixed(2);

  // Transition to dashboard and start drawing!
  transitionTo('screen-dashboard');
  startCanvasLoop();
}

/**
 * Callback fired when a node is highlighted or clicked in the graph.
 */
function handleNodeSelected(node, isUser) {
  STATE.selectedNode = node;
  
  // Render profile panel
  renderActiveProfileCard(node, DOM.selectedProfileCard);

  if (isUser) {
    // Reset stats nerd panel for central user
    DOM.statPearson.innerText = '1.00';
    DOM.statCosine.innerText = '1.00';
    DOM.statJaccard.innerText = '1.00';
    DOM.statDistance.innerText = '0.00';

    DOM.barPearson.style.width = '100%';
    DOM.barCosine.style.width = '100%';
    DOM.barJaccard.style.width = '100%';
    DOM.barDistance.style.width = '0%';

    // Disable comparison button for self
    DOM.openMashupBtn.classList.add('disabled');
  } else {
    // Populate neighbors metrics
    const stats = node.stats;
    DOM.statPearson.innerText = stats.pearson.toFixed(2);
    DOM.statCosine.innerText = stats.cosine.toFixed(2);
    DOM.statJaccard.innerText = stats.jaccard.toFixed(2);
    DOM.statDistance.innerText = stats.distance.toFixed(1);

    // Update graphical progress tracks (centered from 0-1 or 0-10 scale)
    DOM.barPearson.style.width = `${Math.max(0, Math.min(100, ((stats.pearson + 1) / 2) * 100))}%`;
    DOM.barCosine.style.width = `${Math.max(0, Math.min(100, ((stats.cosine + 1) / 2) * 100))}%`;
    DOM.barJaccard.style.width = `${stats.jaccard * 100}%`;
    
    // Vector distance caps around 10
    DOM.barDistance.style.width = `${Math.max(0, Math.min(100, (stats.distance / 10) * 100))}%`;

    // Enable comparison button
    DOM.openMashupBtn.classList.remove('disabled');
  }
}

/**
 * Setup dragging file drop zone properties.
 */
function initDropZone() {
  const card = document.querySelector('.scan-card');

  ['dragenter', 'dragover'].forEach(eventName => {
    card.addEventListener(eventName, (e) => {
      e.preventDefault();
      card.style.borderColor = 'var(--accent-green)';
      card.style.boxShadow = '0 0 25px rgba(0, 224, 84, 0.25)';
    }, false);
  });

  ['dragleave', 'drop'].forEach(eventName => {
    card.addEventListener(eventName, (e) => {
      e.preventDefault();
      card.style.borderColor = 'var(--border-color)';
      card.style.boxShadow = '0 12px 40px 0 rgba(0, 0, 0, 0.4)';
    }, false);
  });

  card.addEventListener('drop', (e) => {
    const dt = e.dataTransfer;
    const file = dt.files[0];

    if (file && file.name.endsWith('.csv')) {
      const reader = new FileReader();
      reader.onload = (event) => {
        const text = event.target.result;
        const result = parseLetterboxdCSV(text);
        if (result && result.count > 0) {
          // Pre-populate username based on filename or guest
          const namePart = file.name.split('_')[0].split('.')[0] || 'uploaded_profile';
          DOM.usernameInput.value = namePart;
          
          STATE.username = namePart;
          STATE.displayName = `${namePart} (Letterboxd CSV)`;
          STATE.avatar = namePart.substring(0, 2).toUpperCase();
          STATE.ratings = result.ratings;

          // Animate terminal with custom CSV load logs!
          renderTerminalLogs(namePart, DOM.terminal, () => {
            // Show status badge
            DOM.activeUserBadge.style.display = 'flex';
            DOM.activeUsername.innerText = STATE.username;
            computeTasteSpace();
          });
        } else {
          alert('Could not match any films from ratings.csv. Make sure the headers are standard Letterboxd format ("Name", "Rating").');
        }
      };
      reader.readAsText(file);
    } else {
      alert('Invalid file format. Please drop a Letterboxd exported CSV file.');
    }
  });
}

/**
 * Binds active event listeners to elements.
 */
function initEvents() {
  // --- SUBMIT USERNAME FORM ---
  DOM.scanForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const rawVal = DOM.usernameInput.value.trim();
    if (!rawVal) return;

    STATE.username = rawVal;
    STATE.displayName = rawVal;
    STATE.avatar = rawVal.substring(0, 2).toUpperCase();
    STATE.ratings = generateDeterministicRatings(rawVal); // seed rating vector

    // Play logs crawler
    DOM.scanForm.querySelector('button[type="submit"]').classList.add('disabled');
    renderTerminalLogs(rawVal, DOM.terminal, () => {
      // Complete logs -> open Calibration
      renderCalibrationCards(STATE.ratings, DOM.calibrationContainer);
      transitionTo('screen-calibrate');
    });
  });

  // --- CALIBRATION INTERACTIVE STARS CLICK ---
  DOM.calibrationContainer.addEventListener('change', (e) => {
    if (e.target.classList.contains('star-input')) {
      const id = parseInt(e.target.closest('.stars-interactive').dataset.movieId);
      const val = parseFloat(e.target.value);
      STATE.ratings[id] = val;

      // Update label
      const label = document.getElementById(`rating-label-${id}`);
      if (label) label.innerText = `${val} ★`;
    }
  });

  // --- SUGGESTION TAG CLICKS ---
  document.querySelectorAll('.tag-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      DOM.usernameInput.value = btn.dataset.username;
      DOM.scanForm.dispatchEvent(new Event('submit'));
    });
  });

  // --- CONFIRM CALIBRATION ACTION ---
  DOM.confirmCalibrateBtn.addEventListener('click', () => {
    // Show Header status badge
    DOM.activeUserBadge.style.display = 'flex';
    DOM.activeUsername.innerText = STATE.username;
    computeTasteSpace();
  });

  // --- SKIP CALIBRATION ACTION ---
  DOM.skipCalibrateBtn.addEventListener('click', () => {
    DOM.activeUserBadge.style.display = 'flex';
    DOM.activeUsername.innerText = STATE.username;
    computeTasteSpace();
  });

  // --- RESET/LOGOUT BADGE CLICK ---
  DOM.resetAppBtn.addEventListener('click', () => {
    DOM.activeUserBadge.style.display = 'none';
    DOM.usernameInput.value = '';
    DOM.terminal.style.display = 'none';
    DOM.scanForm.querySelector('button[type="submit"]').classList.remove('disabled');
    transitionTo('screen-scan');
  });

  // --- INTERACTIVE CANVAS GRAPH CONTROLS ---
  DOM.btnZoomIn.addEventListener('click', () => STATE.graphCanvas && STATE.graphCanvas.zoomIn());
  DOM.btnZoomOut.addEventListener('click', () => STATE.graphCanvas && STATE.graphCanvas.zoomOut());
  DOM.btnZoomReset.addEventListener('click', () => STATE.graphCanvas && STATE.graphCanvas.resetZoom());
  
  DOM.btnPhysicsToggle.addEventListener('click', () => {
    if (!STATE.graphCanvas) return;
    STATE.graphCanvas.physicsEnabled = !STATE.graphCanvas.physicsEnabled;
    DOM.btnPhysicsToggle.classList.toggle('active', STATE.graphCanvas.physicsEnabled);
  });

  // --- OPEN TASTE MASHUP COMPARATOR MODAL ---
  DOM.openMashupBtn.addEventListener('click', () => {
    if (DOM.openMashupBtn.classList.contains('disabled') || !STATE.selectedNode) return;

    const partner = STATE.selectedNode.profile;
    const matchPercent = STATE.selectedNode.stats.matchPercent;

    // Set modal top header details
    document.getElementById('mashup-partner-name').innerText = partner.displayName;
    document.getElementById('mashup-partner-avatar').innerText = partner.avatar || partner.username.substring(0,2).toUpperCase();
    document.getElementById('mashup-user-name').innerText = STATE.username;
    document.getElementById('mashup-match-percent').innerText = `${matchPercent}%`;

    // Category style taglines
    let tag = 'フランス映画学者';
    if (partner.category === 'indie') tag = 'Indie / Arthouse Fanatic';
    else if (partner.category === 'horror') tag = 'Spooky Elevated Horror';
    else if (partner.category === 'popcorn') tag = 'Max Sci-Fi / Action';
    document.getElementById('mashup-partner-tag').innerText = tag;

    // Render detailed modal cards (lists, gaps, grids)
    renderMashupDNA(STATE.ratings, partner, DOM.mashupModal);

    // Show modal overlay
    DOM.mashupModal.classList.add('active');
    DOM.mashupModal.style.display = 'flex';
  });

  // --- CLOSE MODAL OVERLAY ---
  DOM.closeModalBtn.addEventListener('click', () => {
    DOM.mashupModal.classList.remove('active');
    DOM.mashupModal.style.display = 'none';
  });

  // Close modal when clicking on background overlay itself
  DOM.mashupModal.addEventListener('click', (e) => {
    if (e.target === DOM.mashupModal) {
      DOM.closeModalBtn.dispatchEvent(new Event('click'));
    }
  });

  // Esc key closure
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && DOM.mashupModal.classList.contains('active')) {
      DOM.closeModalBtn.dispatchEvent(new Event('click'));
    }
  });
}

/**
 * Boots the application environment.
 */
function init() {
  initEvents();
  initDropZone();

  // Glass card mouse movement border-glow styling
  document.querySelectorAll('.glass-card').forEach(card => {
    card.addEventListener('mousemove', (e) => {
      const rect = card.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      card.style.setProperty('--x', `${x}px`);
      card.style.setProperty('--y', `${y}px`);
    });
  });
  
  // Render initial icons
  lucide.createIcons();
}

// Launch
init();
