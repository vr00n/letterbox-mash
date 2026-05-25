/* ==========================================================================
   MAIN STATE ORCHESTRATOR & EVENT BINDER
   Project: Letterboxd KNN Taste Mashup
   ========================================================================== */

import { ARCHETYPES, MASTER_MOVIES, generateDeterministicRatings } from './archetypes.js';
import { performPCA, getKNNNeighbors, getAdjustedCosineSimilarity, getPearsonCorrelation, getJaccardSimilarity } from './math.js';
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
  scannedProfiles: [], // Real friends scanned in this session or history
  knnMatches: [],
  selectedNode: null,
  graphCanvas: null,
  animationFrameId: null,
  hasRealData: false,
  realDataMatchCount: 0
};

// Load scanned profiles from localStorage
try {
  const saved = localStorage.getItem('letterboxd_knn_scanned');
  if (saved) {
    STATE.scannedProfiles = JSON.parse(saved);
  }
} catch (e) {
  STATE.scannedProfiles = [];
}

// Helper: Gets a category name from ratings vector
function getPrimaryGenreName(ratings) {
  const scores = { classics: 0, indie: 0, horror: 0, popcorn: 0 };
  MASTER_MOVIES.forEach((m, idx) => {
    if (ratings[idx] > 0) scores[m.category] += ratings[idx];
  });
  let maxCat = 'classics';
  let maxScore = -1;
  Object.keys(scores).forEach(cat => {
    if (scores[cat] > maxScore) {
      maxScore = scores[cat];
      maxCat = cat;
    }
  });
  if (maxCat === 'indie') return 'indie';
  if (maxCat === 'horror') return 'horror';
  if (maxCat === 'popcorn') return 'popcorn';
  return 'classics';
}

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
  // Save the current user to their history/scanned network
  const existingIdx = STATE.scannedProfiles.findIndex(p => p.username.toLowerCase() === STATE.username.toLowerCase());
  const primaryGenre = getPrimaryGenreName(STATE.ratings);
  const profileData = {
    id: `real_${STATE.username.toLowerCase()}`,
    username: STATE.username,
    displayName: STATE.displayName,
    avatar: STATE.avatar,
    ratings: [...STATE.ratings],
    category: 'real',
    bio: `A real moviegoer scanned on this device. Taste affinity is primarily ${primaryGenre}.`
  };

  if (existingIdx !== -1) {
    STATE.scannedProfiles[existingIdx] = profileData;
  } else {
    STATE.scannedProfiles.push(profileData);
  }

  try {
    localStorage.setItem('letterboxd_knn_scanned', JSON.stringify(STATE.scannedProfiles));
  } catch (e) {}

  // 1. Get other real scanned profiles (excluding active user)
  const otherRealProfiles = STATE.scannedProfiles.filter(p => p.username.toLowerCase() !== STATE.username.toLowerCase());

  // 2. Select preconfigured archetypes (Outsiders)
  // We prioritize real friends, and fill the rest up to 10 nodes using preloaded archetypes.
  let comparisonPool = [...otherRealProfiles];
  
  if (comparisonPool.length < 10) {
    // Pad pool with simulated archetypes so there are at least 10 matches in total
    comparisonPool = [...comparisonPool, ...STATE.archetypes];
  }

  // 3. Combine all active profiles into a single list for PCA coordinates
  const allProfilesForPCA = [
    ...STATE.scannedProfiles.filter(p => p.username.toLowerCase() !== STATE.username.toLowerCase()),
    ...STATE.archetypes
  ];
  
  const userProfile = {
    id: `real_${STATE.username.toLowerCase()}`,
    username: STATE.username,
    displayName: STATE.displayName,
    avatar: STATE.avatar,
    ratings: [...STATE.ratings],
    category: 'real',
    bio: `A real moviegoer scanned on this device.`
  };
  allProfilesForPCA.push(userProfile);

  const fullMatrix = allProfilesForPCA.map(p => p.ratings);

  // 4. Perform Singular Value / Power Iteration PCA
  const projections = performPCA(fullMatrix);
  const userProjection = projections[projections.length - 1]; // user is last

  // Map coordinates back
  allProfilesForPCA.forEach((p, idx) => {
    p.pc1 = projections[idx].pc1;
    p.pc2 = projections[idx].pc2;
  });

  // Keep state copies updated
  STATE.archetypes.forEach(arc => {
    const updated = allProfilesForPCA.find(p => p.id === arc.id);
    if (updated) {
      arc.pc1 = updated.pc1;
      arc.pc2 = updated.pc2;
    }
  });

  otherRealProfiles.forEach(friend => {
    const updated = allProfilesForPCA.find(p => p.id === friend.id);
    if (updated) {
      friend.pc1 = updated.pc1;
      friend.pc2 = updated.pc2;
    }
  });

  // 5. Compute KNN Matches against the combined comparison pool
  // The search automatically prioritizes friends because they are in the pool!
  const knnMatches = getKNNNeighbors(STATE.ratings, comparisonPool, 10);
  STATE.knnMatches = knnMatches;

  userProfile.pc1 = userProjection.pc1;
  userProfile.pc2 = userProjection.pc2;

  // 6. Build and launch Canvas graph
  if (!STATE.graphCanvas) {
    STATE.graphCanvas = new InteractiveGraphCanvas(DOM.canvas, handleNodeSelected);
  }

  STATE.graphCanvas.setGraph(userProfile, knnMatches);
  
  // 7. Push user coordinates to labels
  DOM.statPC1.innerText = userProjection.pc1.toFixed(2);
  DOM.statPC2.innerText = userProjection.pc2.toFixed(2);

  // Transition to dashboard and start drawing!
  transitionTo('screen-dashboard');
  startCanvasLoop();

  // Show real vs. simulated data badge
  const badge = document.getElementById('data-source-badge');
  if (badge) {
    if (STATE.hasRealData) {
      badge.innerHTML = `<i data-lucide="wifi"></i> <span>Live RSS — <strong>${STATE.realDataMatchCount} real rating${STATE.realDataMatchCount > 1 ? 's' : ''}</strong> from Letterboxd</span>`;
      badge.className = 'data-source-badge data-source-live';
    } else {
      badge.innerHTML = `<i data-lucide="cpu"></i> <span>Simulated — no RSS matches found</span>`;
      badge.className = 'data-source-badge data-source-sim';
    }
    badge.style.display = 'flex';
    lucide.createIcons();
  }
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
    DOM.statPearson.innerText = '1.00 (Self)';
    DOM.statCosine.innerText = '1.00 (Self)';
    DOM.statJaccard.innerText = '1.00 (Self)';
    DOM.statDistance.innerText = '0.00 (Self)';

    DOM.barPearson.style.width = '100%';
    DOM.barCosine.style.width = '100%';
    DOM.barJaccard.style.width = '100%';
    DOM.barDistance.style.width = '0%';

    // Disable comparison button for self
    DOM.openMashupBtn.classList.add('disabled');
  } else {
    // Populate neighbors metrics
    const stats = node.stats;
    
    // Astro relatable interpretations
    let pearsonLabel = 'Celestial Friction';
    if (stats.pearson > 0.8) pearsonLabel = 'Soul Alignment';
    else if (stats.pearson > 0.55) pearsonLabel = 'High Harmony';
    else if (stats.pearson > 0.25) pearsonLabel = 'Parallel Orbits';
    else if (stats.pearson > -0.2) pearsonLabel = 'Neutral Synergy';
    
    let cosineLabel = 'Wandering Stars';
    if (stats.cosine > 0.8) cosineLabel = 'Cosmic Telepathy';
    else if (stats.cosine > 0.55) cosineLabel = 'Good Synastry';
    else if (stats.cosine > 0.2) cosineLabel = 'Weak Aura Overlap';
    
    let jaccardLabel = 'Alien Ecosystems';
    if (stats.jaccard > 0.35) jaccardLabel = 'Telepathic Link';
    else if (stats.jaccard > 0.18) jaccardLabel = 'Shared Footprint';
    else if (stats.jaccard > 0.08) jaccardLabel = 'Faint Intersection';
    
    let distanceLabel = 'Lightyears Apart';
    if (stats.distance < 4.0) distanceLabel = 'Identical Dimensions';
    else if (stats.distance < 6.5) distanceLabel = 'Co-Existing Orbits';
    else if (stats.distance < 8.5) distanceLabel = 'Distant Galaxies';

    DOM.statPearson.innerText = `${stats.pearson.toFixed(2)} (${pearsonLabel})`;
    DOM.statCosine.innerText = `${stats.cosine.toFixed(2)} (${cosineLabel})`;
    DOM.statJaccard.innerText = `${stats.jaccard.toFixed(2)} (${jaccardLabel})`;
    DOM.statDistance.innerText = `${stats.distance.toFixed(1)} (${distanceLabel})`;

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
 * Parses a Letterboxd RSS XML string and maps rated films to MASTER_MOVIES catalog.
 * Handles both raw text and CDATA-wrapped title fields.
 */
function parseRSSXML(xmlText) {
  const ratings = new Array(60).fill(0);
  let matchCount = 0;

  const itemRegex = /<item>([\s\S]*?)<\/item>/g;
  let itemMatch;

  while ((itemMatch = itemRegex.exec(xmlText)) !== null) {
    const itemXml = itemMatch[1];

    const titleMatch = itemXml.match(/<letterboxd:filmTitle>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/letterboxd:filmTitle>/);
    const yearMatch  = itemXml.match(/<letterboxd:filmYear>(\d+)<\/letterboxd:filmYear>/);
    const ratingMatch = itemXml.match(/<letterboxd:memberRating>([\d.]+)<\/letterboxd:memberRating>/);

    if (!titleMatch || !ratingMatch) continue;

    const title  = titleMatch[1].trim();
    const year   = yearMatch ? parseInt(yearMatch[1]) : null;
    const rating = parseFloat(ratingMatch[1]);

    if (!title || isNaN(rating)) continue;

    const film = MASTER_MOVIES.find(m =>
      m.title.toLowerCase() === title.toLowerCase() && (!year || m.year === year)
    );

    if (film && ratings[film.id] === 0) {
      ratings[film.id] = rating;
      matchCount++;
    }
  }

  return { ratings, matchCount };
}

/**
 * Attempts to fetch a user's real Letterboxd RSS feed via two CORS proxies.
 * Returns { ratings, matchCount } on success, or null on failure.
 * Letterboxd RSS contains up to ~50 most recent diary entries with ratings.
 */
async function fetchLetterboxdRSS(username) {
  const rssUrl = `https://letterboxd.com/${username}/rss/`;

  const proxies = [
    { url: `https://corsproxy.io/?${encodeURIComponent(rssUrl)}`, mode: 'text' },
    { url: `https://api.allorigins.win/get?url=${encodeURIComponent(rssUrl)}`, mode: 'json' }
  ];

  for (const proxy of proxies) {
    try {
      const res = await fetch(proxy.url, { signal: AbortSignal.timeout(7000) });
      if (!res.ok) continue;

      const text = proxy.mode === 'json' ? (await res.json()).contents : await res.text();
      if (!text || !text.includes('<letterboxd:filmTitle>')) continue;

      const result = parseRSSXML(text);
      if (result.matchCount > 0) return result;
    } catch (_) {
      // try next proxy
    }
  }

  return null;
}

/**
 * Merges real RSS ratings on top of a deterministic fallback vector.
 * Real ratings win; deterministic fills unrated films.
 */
function blendRatings(deterministicRatings, realRatings) {
  return deterministicRatings.map((det, i) => realRatings[i] > 0 ? realRatings[i] : det);
}

/**
 * Binds active event listeners to elements.
 */
function initEvents() {
  // --- SUBMIT USERNAME FORM ---
  DOM.scanForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const rawVal = DOM.usernameInput.value.trim();
    if (!rawVal) return;

    STATE.username = rawVal;
    STATE.displayName = rawVal;
    STATE.avatar = rawVal.substring(0, 2).toUpperCase();
    STATE.ratings = generateDeterministicRatings(rawVal); // deterministic fallback
    STATE.hasRealData = false;
    STATE.realDataMatchCount = 0;

    // Kick off real RSS fetch in parallel with the terminal animation
    const rssFetchPromise = fetchLetterboxdRSS(rawVal);

    DOM.scanForm.querySelector('button[type="submit"]').classList.add('disabled');

    renderTerminalLogs(rawVal, DOM.terminal, async () => {
      const body = DOM.terminal.querySelector('#terminal-output');

      // Append a "waiting" line while the fetch finishes (usually already done)
      const waitLine = document.createElement('p');
      waitLine.className = 'terminal-line terminal-text terminal-accent-blue';
      waitLine.innerHTML = '> [NET] Verifying live profile data...';
      body.appendChild(waitLine);
      body.scrollTop = body.scrollHeight;

      const result = await rssFetchPromise;
      waitLine.remove();

      const statusLine = document.createElement('p');
      statusLine.className = 'terminal-line terminal-text';

      if (result && result.matchCount >= 1) {
        STATE.ratings = blendRatings(STATE.ratings, result.ratings);
        STATE.hasRealData = true;
        STATE.realDataMatchCount = result.matchCount;
        statusLine.classList.add('terminal-accent');
        statusLine.innerHTML = `> [LIVE] ✓ Real Letterboxd data loaded — ${result.matchCount} catalog film${result.matchCount > 1 ? 's' : ''} matched from your RSS feed.`;
      } else {
        statusLine.innerHTML = '> [SIM] RSS returned no catalog matches — using deterministic taste vector estimation.';
        statusLine.style.color = 'var(--accent-orange)';
      }

      body.appendChild(statusLine);
      body.scrollTop = body.scrollHeight;

      await new Promise(r => setTimeout(r, 900));

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
    if (partner.category === 'real') tag = '👥 Real Scanned Friend';
    else if (partner.category === 'indie') tag = 'Indie / Arthouse Fanatic';
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

  // --- TAB SWITCHER (Find Neighbors / Compare Two Profiles) ---
  const tabFind = document.getElementById('tab-find');
  const tabCompare = document.getElementById('tab-compare');
  const scanCard = document.querySelector('.scan-card');
  const compareCard = document.getElementById('compare-card');

  tabFind.addEventListener('click', () => {
    tabFind.classList.add('active');
    tabCompare.classList.remove('active');
    scanCard.style.display = '';
    compareCard.style.display = 'none';
  });

  tabCompare.addEventListener('click', () => {
    tabCompare.classList.add('active');
    tabFind.classList.remove('active');
    scanCard.style.display = 'none';
    compareCard.style.display = '';
    lucide.createIcons();
  });

  // Quick pair suggestion buttons in compare card
  document.querySelectorAll('.compare-suggestions .tag-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const [a, b] = btn.dataset.pair.split(',');
      document.getElementById('compare-user-a').value = a;
      document.getElementById('compare-user-b').value = b;
    });
  });

  // --- COMPARE FORM SUBMIT ---
  document.getElementById('compare-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const userA = document.getElementById('compare-user-a').value.trim();
    const userB = document.getElementById('compare-user-b').value.trim();
    if (!userA || !userB) return;

    const submitBtn = e.target.querySelector('button[type="submit"]');
    submitBtn.classList.add('disabled');
    submitBtn.querySelector('span').textContent = 'Fetching profiles…';

    // Fetch real RSS for both users in parallel, fall back to deterministic
    const [rssA, rssB] = await Promise.all([
      fetchLetterboxdRSS(userA),
      fetchLetterboxdRSS(userB)
    ]);

    const baseA = generateDeterministicRatings(userA);
    const baseB = generateDeterministicRatings(userB);
    const ratingsA = rssA ? blendRatings(baseA, rssA.ratings) : baseA;
    const ratingsB = rssB ? blendRatings(baseB, rssB.ratings) : baseB;

    submitBtn.classList.remove('disabled');
    submitBtn.querySelector('span').textContent = 'Reveal Compatibility';

    const cosine = getAdjustedCosineSimilarity(ratingsA, ratingsB);
    const pearson = getPearsonCorrelation(ratingsA, ratingsB);
    const jaccard = getJaccardSimilarity(ratingsA, ratingsB);
    const matchPercent = Math.round(
      ((cosine + 1) / 2 * 0.5 + (pearson + 1) / 2 * 0.3 + jaccard * 0.2) * 100
    );

    const profileB = {
      id: `compare_${userB.toLowerCase()}`,
      username: userB,
      displayName: userB,
      avatar: userB.substring(0, 2).toUpperCase(),
      ratings: ratingsB,
      category: 'real',
      bio: `Letterboxd profile compared directly against ${userA}.`
    };

    document.getElementById('mashup-partner-name').innerText = userB;
    document.getElementById('mashup-partner-avatar').innerText = userB.substring(0, 2).toUpperCase();
    document.getElementById('mashup-user-name').innerText = userA;
    document.getElementById('mashup-match-percent').innerText = `${matchPercent}%`;
    document.getElementById('mashup-partner-tag').innerText = '⚡ Direct Comparison';

    renderMashupDNA(ratingsA, profileB, DOM.mashupModal);

    DOM.mashupModal.classList.add('active');
    DOM.mashupModal.style.display = 'flex';
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
