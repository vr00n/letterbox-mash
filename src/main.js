/* ==========================================================================
   MAIN STATE ORCHESTRATOR & EVENT BINDER
   Project: Letterboxd KNN Taste Mashup
   ========================================================================== */

import { ARCHETYPES, MASTER_MOVIES, TASTE_ATTRIBUTES, generateDeterministicRatings } from './archetypes.js';
import { performPCA, getKNNNeighbors, getAdjustedCosineSimilarity, getPearsonCorrelation, getJaccardSimilarity, computeAttributeAffinities } from './math.js';
import { 
  renderTerminalLogs, 
  renderCalibrationCards,
  renderActiveProfileCard, 
  renderMashupDNA,
  renderCompatibilityTable,
  renderRadarChart,
  renderDeepProfile
} from './components.js';

// Global App State
const STATE = {
  activeScreen: 'screen-scan',
  username: '',
  displayName: '',
  avatar: 'U',
  ratings: new Array(60).fill(0),
  rssFilms: [],           // full film list from RSS (not limited to 60-catalog)
  archetypes: [...ARCHETYPES],
  scannedProfiles: [],
  knnMatches: [],
  selectedMatch: null,
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

  // Compatibility table
  compatTableContainer: document.getElementById('compat-table-container'),

  // Radar chart
  radarSection: document.getElementById('radar-section'),
  radarCanvas: document.getElementById('radar-canvas'),
  radarLabelUser: document.getElementById('radar-label-user'),
  radarLabelFriend: document.getElementById('radar-label-friend'),
  radarDotFriend: document.getElementById('radar-dot-friend'),

  // Deep Profile
  deepProfileBtn: document.getElementById('deep-profile-btn'),
  deepProfileModal: document.getElementById('deep-profile-modal'),
  closeDeepProfileBtn: document.getElementById('close-deep-profile-btn'),
  deepProfileBody: document.getElementById('deep-profile-body'),

  // Mashup Modal
  openMashupBtn: document.getElementById('open-mashup-btn'),
  closeModalBtn: document.getElementById('close-modal-btn'),
  mashupModal: document.getElementById('mashup-modal'),

  // PCA labels (kept for reference, may be null if section removed)
  statPC1: document.getElementById('stat-pc1'),
  statPC2: document.getElementById('stat-pc2')
};

/**
 * Transition to a specific screen state.
 */
function transitionTo(screenId) {
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
 * Returns a color hex for a neighbor profile based on its category.
 */
function getCategoryColor(category) {
  const colors = { indie: '#00e054', classics: '#ff8000', horror: '#ef233c', popcorn: '#a06cd5', real: '#40bcf4' };
  return colors[category] || '#40bcf4';
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

  // 5. Compute ALL similarity matches
  const allMatches = getKNNNeighbors(STATE.ratings, comparisonPool, comparisonPool.length);
  STATE.knnMatches = allMatches;

  userProfile.pc1 = userProjection.pc1;
  userProfile.pc2 = userProjection.pc2;

  // 6. Transition to dashboard
  transitionTo('screen-dashboard');

  // 7. Render the compatibility table and auto-select first row
  renderCompatibilityTable(STATE.ratings, allMatches, DOM.compatTableContainer, handleRowSelected);

  // 9. Auto-select top match so radar + mashup button are ready immediately
  if (allMatches.length > 0) {
    const userAff = computeAttributeAffinities(STATE.ratings, TASTE_ATTRIBUTES);
    const friendAff = computeAttributeAffinities(allMatches[0].profile.ratings, TASTE_ATTRIBUTES);
    handleRowSelected(allMatches[0], userAff, friendAff);
    // Mark the first row active visually
    requestAnimationFrame(() => {
      const firstRow = DOM.compatTableContainer.querySelector('.compat-row');
      if (firstRow) firstRow.classList.add('compat-row-active');
    });
  } else {
    renderActiveProfileCard({ profile: userProfile, stats: null }, DOM.selectedProfileCard);
  }

  // Show real vs. simulated data badge
  const badge = document.getElementById('data-source-badge');
  if (badge) {
    const realFriendCount = STATE.scannedProfiles.filter(p =>
      p.category === 'real' && p.username.toLowerCase() !== STATE.username.toLowerCase()
    ).length;

    if (STATE.hasRealData || realFriendCount > 0) {
      const parts = [];
      if (STATE.hasRealData) parts.push(`<strong>${STATE.realDataMatchCount}</strong> real rating${STATE.realDataMatchCount > 1 ? 's' : ''}`);
      if (realFriendCount > 0) parts.push(`<strong>${realFriendCount}</strong> real friend${realFriendCount > 1 ? 's' : ''} in graph`);
      badge.innerHTML = `<i data-lucide="wifi"></i> <span>Live Letterboxd data — ${parts.join(', ')}</span>`;
      badge.className = 'data-source-badge data-source-live';
    } else {
      badge.innerHTML = `<i data-lucide="cpu"></i> <span>Simulated — Letterboxd data unavailable</span>`;
      badge.className = 'data-source-badge data-source-sim';
    }
    badge.style.display = 'flex';
    lucide.createIcons();
  }
}

/**
 * Fired when a row in the compatibility table is clicked.
 */
function handleRowSelected(match, userAffinities, friendAffinities) {
  STATE.selectedMatch = match;

  renderActiveProfileCard(match, DOM.selectedProfileCard);

  // Radar chart
  const friendColor = getCategoryColor(match.profile.category);
  DOM.radarSection.style.display = '';
  DOM.radarLabelUser.innerText = STATE.username || 'You';
  DOM.radarLabelFriend.innerText = match.profile.username;
  DOM.radarDotFriend.style.background = friendColor;
  requestAnimationFrame(() => renderRadarChart(DOM.radarCanvas, userAffinities, friendAffinities, friendColor));

  DOM.openMashupBtn.classList.remove('disabled');
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
 * Parses a Letterboxd RSS XML string.
 * Returns:
 *  - ratings: sparse 60-vector for KNN (catalog matches only)
 *  - matchCount: how many catalog films were matched
 *  - films: full array of ALL rated films from RSS {title, year, rating, watched}
 */
function parseRSSXML(xmlText) {
  const ratings = new Array(60).fill(0);
  let matchCount = 0;
  const films = [];

  const itemRegex = /<item>([\s\S]*?)<\/item>/g;
  let itemMatch;

  while ((itemMatch = itemRegex.exec(xmlText)) !== null) {
    const itemXml = itemMatch[1];

    const titleMatch  = itemXml.match(/<letterboxd:filmTitle>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/letterboxd:filmTitle>/);
    const yearMatch   = itemXml.match(/<letterboxd:filmYear>(\d+)<\/letterboxd:filmYear>/);
    const ratingMatch = itemXml.match(/<letterboxd:memberRating>([\d.]+)<\/letterboxd:memberRating>/);
    const watchedMatch = itemXml.match(/<letterboxd:watchedDate>(\d{4}-\d{2}-\d{2})<\/letterboxd:watchedDate>/);

    if (!titleMatch || !ratingMatch) continue;

    const title  = titleMatch[1].trim();
    const year   = yearMatch ? parseInt(yearMatch[1]) : null;
    const rating = parseFloat(ratingMatch[1]);
    const watched = watchedMatch ? watchedMatch[1] : null;

    if (!title || isNaN(rating)) continue;

    films.push({ title, year, rating, watched });

    const film = MASTER_MOVIES.find(m =>
      m.title.toLowerCase() === title.toLowerCase() && (!year || m.year === year)
    );
    if (film && ratings[film.id] === 0) {
      ratings[film.id] = rating;
      matchCount++;
    }
  }

  return { ratings, matchCount, films };
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
      if (result.films.length > 0) return result; // return if any films found, not just catalog matches
    } catch (_) {
      // try next proxy
    }
  }

  return null;
}

/**
 * Fetches the list of usernames that `username` follows on Letterboxd.
 * Parses avatar href links from the public following page HTML.
 * Returns an array of username strings (lowercase), or [] on failure.
 */
async function fetchFollowing(username) {
  const url = `https://letterboxd.com/${username}/following/`;
  const proxies = [
    { url: `https://corsproxy.io/?${encodeURIComponent(url)}`, mode: 'text' },
    { url: `https://api.allorigins.win/get?url=${encodeURIComponent(url)}`, mode: 'json' }
  ];

  for (const proxy of proxies) {
    try {
      const res = await fetch(proxy.url, { signal: AbortSignal.timeout(8000) });
      if (!res.ok) continue;

      const text = proxy.mode === 'json' ? (await res.json()).contents : await res.text();
      if (!text) continue;

      // Avatar links on following page: class="avatar -a40" href="/username/"
      const regex = /class="avatar[^"]*" href="\/([a-zA-Z0-9_-]+)\/"/g;
      const usernames = [];
      let match;
      while ((match = regex.exec(text)) !== null) {
        const u = match[1].toLowerCase();
        if (u !== username.toLowerCase() && !usernames.includes(u)) {
          usernames.push(u);
        }
      }

      if (usernames.length > 0) return usernames;
    } catch (_) {
      // try next proxy
    }
  }

  return [];
}

/**
 * Batch-fetches RSS ratings for a list of friend usernames in parallel.
 * Uses best-effort single-proxy fetch with short timeout per friend.
 * Returns profile objects for friends with at least 1 catalog film match.
 */
async function fetchFriendProfiles(usernames, maxFriends = 12) {
  const toFetch = usernames.slice(0, maxFriends);

  const results = await Promise.all(toFetch.map(async (uname) => {
    try {
      const rssUrl = `https://letterboxd.com/${uname}/rss/`;
      const proxyUrl = `https://corsproxy.io/?${encodeURIComponent(rssUrl)}`;
      const res = await fetch(proxyUrl, { signal: AbortSignal.timeout(5000) });
      if (!res.ok) return null;

      const text = await res.text();
      if (!text || !text.includes('<letterboxd:filmTitle>')) return null;

      const rss = parseRSSXML(text);
      if (rss.films.length === 0) return null; // skip friends with no readable ratings

      return {
        id: `real_${uname}`,
        username: uname,
        displayName: uname,
        avatar: uname.substring(0, 2).toUpperCase(),
        ratings: rss.ratings, // sparse — real catalog matches only, no faking
        rssFilms: rss.films,
        category: 'real',
        bio: `Your Letterboxd friend. ${rss.films.length} rated films fetched (${rss.matchCount} catalog match${rss.matchCount !== 1 ? 'es' : ''}).`
      };
    } catch (_) {
      return null;
    }
  }));

  return results.filter(Boolean);
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
    STATE.ratings = new Array(60).fill(0); // always start empty — real data only
    STATE.rssFilms = [];
    STATE.hasRealData = false;
    STATE.realDataMatchCount = 0;

    // Kick off all network work immediately — runs in parallel with the terminal animation.
    // 1. User's own RSS ratings
    const rssFetchPromise = fetchLetterboxdRSS(rawVal);
    // 2. Following list → then batch-fetch each friend's RSS
    const friendProfilesPromise = fetchFollowing(rawVal).then(followingUsernames =>
      followingUsernames.length > 0 ? fetchFriendProfiles(followingUsernames, 12) : []
    );

    DOM.scanForm.querySelector('button[type="submit"]').classList.add('disabled');

    renderTerminalLogs(rawVal, DOM.terminal, async () => {
      const body = DOM.terminal.querySelector('#terminal-output');

      const waitLine = document.createElement('p');
      waitLine.className = 'terminal-line terminal-text terminal-accent-blue';
      waitLine.innerHTML = '> [NET] Awaiting live profile & social graph data...';
      body.appendChild(waitLine);
      body.scrollTop = body.scrollHeight;

      // Await both fetches in parallel
      const [rssResult, friendProfiles] = await Promise.all([rssFetchPromise, friendProfilesPromise]);
      waitLine.remove();

      // --- Own ratings (real data only, no faking) ---
      const ownLine = document.createElement('p');
      ownLine.className = 'terminal-line terminal-text';
      if (rssResult && rssResult.films.length > 0) {
        STATE.ratings = rssResult.ratings; // sparse — only real catalog matches
        STATE.rssFilms = rssResult.films;
        STATE.hasRealData = rssResult.matchCount > 0;
        STATE.realDataMatchCount = rssResult.matchCount;
        ownLine.classList.add('terminal-accent');
        ownLine.innerHTML = `> [LIVE] ✓ Fetched ${rssResult.films.length} rated films from RSS (${rssResult.matchCount} catalog match${rssResult.matchCount !== 1 ? 'es' : ''}).`;
      } else {
        ownLine.style.color = 'var(--accent-orange)';
        ownLine.innerHTML = `> [ERR] Could not fetch RSS data for "${rawVal}". Check the username — or Letterboxd may be rate-limiting.`;
      }
      body.appendChild(ownLine);

      // --- Friends ---
      const friendLine = document.createElement('p');
      friendLine.className = 'terminal-line terminal-text';
      if (friendProfiles.length > 0) {
        // Merge into scannedProfiles (overwrite stale entries)
        friendProfiles.forEach(profile => {
          const idx = STATE.scannedProfiles.findIndex(p => p.id === profile.id);
          if (idx !== -1) STATE.scannedProfiles[idx] = profile;
          else STATE.scannedProfiles.push(profile);
        });
        try { localStorage.setItem('letterboxd_knn_scanned', JSON.stringify(STATE.scannedProfiles)); } catch (_) {}

        friendLine.classList.add('terminal-accent');
        friendLine.innerHTML = `> [SOCIAL] ✓ ${friendProfiles.length} real friend${friendProfiles.length > 1 ? 's' : ''} from your following list added to the taste network.`;
      } else {
        friendLine.style.color = 'var(--accent-orange)';
        friendLine.innerHTML = '> [SOCIAL] Following list unavailable — showing archetype neighbors as fallback.';
      }
      body.appendChild(friendLine);
      body.scrollTop = body.scrollHeight;

      await new Promise(r => setTimeout(r, 600));

      DOM.activeUserBadge.style.display = 'flex';
      DOM.activeUsername.innerText = STATE.username;
      computeTasteSpace();
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

  // --- DEEP PROFILE (from dashboard) ---
  DOM.deepProfileBtn.addEventListener('click', () => {
    renderDeepProfile(STATE.ratings, STATE.username, STATE.knnMatches, DOM.deepProfileBody, STATE.rssFilms);
    DOM.deepProfileModal.classList.add('active');
    DOM.deepProfileModal.style.display = 'flex';
    lucide.createIcons();
  });

  DOM.closeDeepProfileBtn.addEventListener('click', () => {
    DOM.deepProfileModal.classList.remove('active');
    DOM.deepProfileModal.style.display = 'none';
  });

  DOM.deepProfileModal.addEventListener('click', (e) => {
    if (e.target === DOM.deepProfileModal) DOM.closeDeepProfileBtn.dispatchEvent(new Event('click'));
  });

  // --- OPEN TASTE MASHUP COMPARATOR MODAL ---
  DOM.openMashupBtn.addEventListener('click', () => {
    if (DOM.openMashupBtn.classList.contains('disabled') || !STATE.selectedMatch) return;

    const partner = STATE.selectedMatch.profile;
    const matchPercent = STATE.selectedMatch.stats.matchPercent;

    document.getElementById('mashup-partner-name').innerText = partner.displayName || partner.username;
    document.getElementById('mashup-partner-avatar').innerText = (partner.avatar || partner.username.substring(0, 2)).toUpperCase();
    document.getElementById('mashup-user-avatar').innerText = STATE.avatar || STATE.username.substring(0, 2).toUpperCase();
    document.getElementById('mashup-user-name').innerText = STATE.username;
    document.getElementById('mashup-match-percent').innerText = `${matchPercent}%`;

    // Category style taglines
    let tag = 'フランス映画学者';
    if (partner.category === 'real') tag = '👥 Real Scanned Friend';
    else if (partner.category === 'indie') tag = 'Indie / Arthouse Fanatic';
    else if (partner.category === 'horror') tag = 'Spooky Elevated Horror';
    else if (partner.category === 'popcorn') tag = 'Max Sci-Fi / Action';
    document.getElementById('mashup-partner-tag').innerText = tag;

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

  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      if (DOM.mashupModal.classList.contains('active')) DOM.closeModalBtn.dispatchEvent(new Event('click'));
      if (DOM.deepProfileModal.classList.contains('active')) DOM.closeDeepProfileBtn.dispatchEvent(new Event('click'));
    }
  });

  // --- TAB SWITCHER (Find Neighbors / Compare / Deep Profile) ---
  const tabFind = document.getElementById('tab-find');
  const tabCompare = document.getElementById('tab-compare');
  const tabDeep = document.getElementById('tab-deep-profile');
  const scanCard = document.querySelector('.scan-card');
  const compareCard = document.getElementById('compare-card');
  const deepTabCard = document.getElementById('deep-profile-tab-card');

  function activateTab(activeTab) {
    [tabFind, tabCompare, tabDeep].forEach(t => t && t.classList.remove('active'));
    activeTab.classList.add('active');
    scanCard.style.display = activeTab === tabFind ? '' : 'none';
    compareCard.style.display = activeTab === tabCompare ? '' : 'none';
    if (deepTabCard) deepTabCard.style.display = activeTab === tabDeep ? '' : 'none';
    lucide.createIcons();
  }

  tabFind.addEventListener('click', () => activateTab(tabFind));
  tabCompare.addEventListener('click', () => activateTab(tabCompare));
  if (tabDeep) tabDeep.addEventListener('click', () => activateTab(tabDeep));

  // --- DEEP PROFILE FORM (from scan screen tab) ---
  const deepProfileForm = document.getElementById('deep-profile-form');
  if (deepProfileForm) {
    deepProfileForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const username = document.getElementById('deep-profile-username').value.trim();
      if (!username) return;

      const submitBtn = e.target.querySelector('button[type="submit"]');
      submitBtn.classList.add('disabled');
      submitBtn.querySelector('span').textContent = 'Fetching profile…';

      const rssResult = await fetchLetterboxdRSS(username);

      submitBtn.classList.remove('disabled');
      submitBtn.querySelector('span').textContent = 'Analyze Profile';

      if (!rssResult || rssResult.films.length === 0) {
        DOM.deepProfileBody.innerHTML = `<div class="dp-no-data"><strong>No data found for "${username}"</strong><p>Make sure the username is correct and that the Letterboxd profile is public.</p></div>`;
      } else {
        renderDeepProfile(rssResult.ratings, username, [], DOM.deepProfileBody, rssResult.films);
      }

      DOM.deepProfileModal.classList.add('active');
      DOM.deepProfileModal.style.display = 'flex';
      lucide.createIcons();
    });
  }

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

    // Fetch real RSS for both users in parallel — real data only, no faking
    const [rssA, rssB] = await Promise.all([
      fetchLetterboxdRSS(userA),
      fetchLetterboxdRSS(userB)
    ]);

    if (!rssA || !rssB) {
      submitBtn.classList.remove('disabled');
      submitBtn.querySelector('span').textContent = 'Reveal Compatibility';
      alert(`Could not fetch data for ${!rssA ? userA : userB}. Check the username and try again.`);
      return;
    }

    const ratingsA = rssA.ratings;
    const ratingsB = rssB.ratings;

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
