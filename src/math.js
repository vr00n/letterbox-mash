/* ==========================================================================
   MATHEMATICAL CORE & PHYSICS ENGINE
   Project: Letterboxd KNN Taste Mashup
   ========================================================================== */

/**
 * Computes the mean rating for a user, ignoring unrated (0) movies.
 * @param {Array<number>} vector - Rating vector.
 * @returns {number} Mean rating.
 */
export function getMeanRating(vector) {
  const rated = vector.filter(r => r > 0);
  if (rated.length === 0) return 2.5; // Default neutral rating
  return rated.reduce((sum, r) => sum + r, 0) / rated.length;
}

/**
 * Computes the Adjusted Cosine Similarity between two rating vectors.
 * Adjusted Cosine subtracts the user's mean rating to normalize for scaling bias.
 * @param {Array<number>} v1 - User 1 rating vector.
 * @param {Array<number>} v2 - User 2 rating vector.
 * @returns {number} Adjusted Cosine Similarity score from -1.0 to 1.0.
 */
export function getAdjustedCosineSimilarity(v1, v2) {
  const mean1 = getMeanRating(v1);
  const mean2 = getMeanRating(v2);

  let num = 0;
  let den1 = 0;
  let den2 = 0;
  let sharedCount = 0;

  for (let i = 0; i < v1.length; i++) {
    // Only calculate similarity on co-rated items (both rated > 0)
    if (v1[i] > 0 && v2[i] > 0) {
      const diff1 = v1[i] - mean1;
      const diff2 = v2[i] - mean2;
      num += diff1 * diff2;
      den1 += diff1 * diff1;
      den2 += diff2 * diff2;
      sharedCount++;
    }
  }

  if (sharedCount < 2 || den1 === 0 || den2 === 0) {
    // Fallback: standard cosine on raw vector if no overlaps or zero variance
    return getStandardCosine(v1, v2);
  }

  return num / (Math.sqrt(den1) * Math.sqrt(den2));
}

/**
 * Standard Cosine Similarity fallback.
 */
function getStandardCosine(v1, v2) {
  let dot = 0, n1 = 0, n2 = 0;
  for (let i = 0; i < v1.length; i++) {
    dot += v1[i] * v2[i];
    n1 += v1[i] * v1[i];
    n2 += v2[i] * v2[i];
  }
  if (n1 === 0 || n2 === 0) return 0;
  return dot / (Math.sqrt(n1) * Math.sqrt(n2));
}

/**
 * Computes the Pearson Correlation Coefficient between two vectors.
 */
export function getPearsonCorrelation(v1, v2) {
  const n = v1.length;
  let sum1 = 0, sum2 = 0, sum1Sq = 0, sum2Sq = 0, pSum = 0;
  let sharedCount = 0;

  for (let i = 0; i < n; i++) {
    if (v1[i] > 0 && v2[i] > 0) {
      const r1 = v1[i];
      const r2 = v2[i];
      sum1 += r1;
      sum2 += r2;
      sum1Sq += r1 * r1;
      sum2Sq += r2 * r2;
      pSum += r1 * r2;
      sharedCount++;
    }
  }

  if (sharedCount < 2) return 0;

  const num = pSum - (sum1 * sum2 / sharedCount);
  const den = Math.sqrt((sum1Sq - (sum1 * sum1) / sharedCount) * (sum2Sq - (sum2 * sum2) / sharedCount));

  if (den === 0) return 0;
  return num / den;
}

/**
 * Computes the Jaccard Overlap Index (Intersection over Union).
 * Measures watchlist overlap regardless of ratings.
 */
export function getJaccardSimilarity(v1, v2) {
  let intersection = 0;
  let union = 0;

  for (let i = 0; i < v1.length; i++) {
    const watched1 = v1[i] > 0;
    const watched2 = v2[i] > 0;
    if (watched1 && watched2) {
      intersection++;
      union++;
    } else if (watched1 || watched2) {
      union++;
    }
  }

  if (union === 0) return 0;
  return intersection / union;
}

/**
 * Computes Euclidean Distance between two vectors.
 * Fills in unrated elements with the user's mean rating to avoid sparsity skew.
 */
export function getEuclideanDistance(v1, v2) {
  const m1 = getMeanRating(v1);
  const m2 = getMeanRating(v2);
  let sqSum = 0;

  for (let i = 0; i < v1.length; i++) {
    const r1 = v1[i] > 0 ? v1[i] : m1;
    const r2 = v2[i] > 0 ? v2[i] : m2;
    const diff = r1 - r2;
    sqSum += diff * diff;
  }

  return Math.sqrt(sqSum);
}

/**
 * Performs client-side Principal Component Analysis (PCA) to project vectors to 2D.
 * Uses Power Iteration and Deflation to extract the top two eigenvectors dynamically.
 * @param {Array<Array<number>>} dataMatrix - NxM ratings matrix (N users, M movies).
 * @returns {Array<{pc1: number, pc2: number}>} List of projected 2D coordinates.
 */
export function performPCA(dataMatrix) {
  const N = dataMatrix.length;      // Number of users
  const M = dataMatrix[0].length;   // Number of movies (features)

  // 1. Fill missing values (0) with user's mean, and center columns (movies)
  const X = [];
  const columnMeans = new Array(M).fill(0);

  // Normalize/impute rows
  for (let i = 0; i < N; i++) {
    const row = [...dataMatrix[i]];
    const mean = getMeanRating(row);
    for (let j = 0; j < M; j++) {
      if (row[j] === 0) {
        row[j] = mean; // Impute with mean
      }
    }
    X.push(row);
  }

  // Compute column means of imputed matrix
  for (let j = 0; j < M; j++) {
    let sum = 0;
    for (let i = 0; i < N; i++) {
      sum += X[i][j];
    }
    columnMeans[j] = sum / N;
  }

  // Center column data
  for (let i = 0; i < N; i++) {
    for (let j = 0; j < M; j++) {
      X[i][j] -= columnMeans[j];
    }
  }

  // 2. Compute Covariance Matrix of movies (M x M)
  const Cov = Array.from({ length: M }, () => new Array(M).fill(0));
  for (let j1 = 0; j1 < M; j1++) {
    for (let j2 = 0; j2 < M; j2++) {
      let sum = 0;
      for (let i = 0; i < N; i++) {
        sum += X[i][j1] * X[i][j2];
      }
      Cov[j1][j2] = sum / (N - 1 || 1);
    }
  }

  /**
   * Helper: Power Iteration to find largest eigenvector
   */
  function powerIteration(matrix, maxIterations = 50) {
    let v = new Array(M).fill(0).map(() => Math.random() - 0.5);
    
    // Normalize v
    let norm = Math.sqrt(v.reduce((s, val) => s + val * val, 0));
    v = v.map(val => val / (norm || 1));

    for (let iter = 0; iter < maxIterations; iter++) {
      const nextV = new Array(M).fill(0);
      for (let r = 0; r < M; r++) {
        for (let c = 0; c < M; c++) {
          nextV[r] += matrix[r][c] * v[c];
        }
      }

      const nextNorm = Math.sqrt(nextV.reduce((s, val) => s + val * val, 0));
      v = nextV.map(val => val / (nextNorm || 1));
    }
    return v;
  }

  // 3. Find First Principal Component (PC1 Eigenvector)
  const pc1 = powerIteration(Cov);

  // 4. Deflate Covariance Matrix to find PC2
  // PC1 eigenvalue = pc1^T * Cov * pc1
  let eigenvalue1 = 0;
  const temp = new Array(M).fill(0);
  for (let r = 0; r < M; r++) {
    for (let c = 0; c < M; c++) {
      temp[r] += Cov[r][c] * pc1[c];
    }
  }
  eigenvalue1 = pc1.reduce((s, val, idx) => s + val * temp[idx], 0);

  // Deflated Matrix = Cov - eigenvalue1 * pc1 * pc1^T
  const DeflatedCov = Array.from({ length: M }, () => new Array(M).fill(0));
  for (let r = 0; r < M; r++) {
    for (let c = 0; c < M; c++) {
      DeflatedCov[r][c] = Cov[r][c] - eigenvalue1 * pc1[r] * pc1[c];
    }
  }

  // 5. Find Second Principal Component (PC2 Eigenvector)
  const pc2 = powerIteration(DeflatedCov);

  // 6. Project Centered Data to PC1 & PC2 axes
  const projectedCoordinates = [];
  for (let i = 0; i < N; i++) {
    let coordX = 0;
    let coordY = 0;
    for (let j = 0; j < M; j++) {
      coordX += X[i][j] * pc1[j];
      coordY += X[i][j] * pc2[j];
    }
    projectedCoordinates.push({ pc1: coordX, pc2: coordY });
  }

  return projectedCoordinates;
}

/**
 * Finds K-Nearest Neighbors for a target user profile.
 * @param {Array<number>} targetVector - Target user's rating vector.
 * @param {Array<Object>} otherProfiles - List of other profiles containing rating vectors.
 * @param {number} K - Number of neighbors.
 * @returns {Array<Object>} Sorted list of top K neighbors with metrics.
 */
export function getKNNNeighbors(targetVector, otherProfiles, K = 10) {
  const neighbors = otherProfiles.map(profile => {
    const cosine = getAdjustedCosineSimilarity(targetVector, profile.ratings);
    const pearson = getPearsonCorrelation(targetVector, profile.ratings);
    const jaccard = getJaccardSimilarity(targetVector, profile.ratings);
    const distance = getEuclideanDistance(targetVector, profile.ratings);

    return {
      profile,
      cosine,
      pearson,
      jaccard,
      distance,
      // Comprehensive match score (weighted combination of metrics, mapped 0-100%)
      matchPercent: Math.round(((cosine + 1) / 2 * 0.5 + (pearson + 1) / 2 * 0.3 + jaccard * 0.2) * 100)
    };
  });

  // Sort by match score descending
  neighbors.sort((a, b) => b.matchPercent - a.matchPercent);

  // Return top K
  return neighbors.slice(0, K);
}

/**
 * A highly responsive, simple 2D force-directed spring physics engine.
 * Computes new positions for nodes linked to a central node.
 */
export class ForceDirectedLayout {
  /**
   * @param {Array<Object>} nodes - Node objects {id, x, y, vx, vy, isCentral, color, label}
   * @param {Array<Object>} links - Link objects {sourceId, targetId, length, strength}
   * @param {number} width - Graph space width
   * @param {number} height - Graph space height
   */
  constructor(nodes, links, width, height) {
    this.nodes = nodes;
    this.links = links;
    this.width = width;
    this.height = height;
    this.kRepulsion = 900;    // Repulsion coefficient
    this.kSpring = 0.025;     // Spring stiffness
    this.friction = 0.88;     // Damping (higher = settles faster)
    this.gravity = 0.018;     // Attraction to center
  }

  /**
   * Runs a single step (tick) of the physics simulation.
   */
  tick() {
    const N = this.nodes.length;
    const centerX = this.width / 2;
    const centerY = this.height / 2;

    // 1. Repulsion forces between ALL nodes
    for (let i = 0; i < N; i++) {
      const nodeA = this.nodes[i];
      for (let j = i + 1; j < N; j++) {
        const nodeB = this.nodes[j];

        const dx = nodeB.x - nodeA.x;
        const dy = nodeB.y - nodeA.y;
        const distSq = dx * dx + dy * dy || 1;
        const dist = Math.sqrt(distSq);

        if (dist < 220) { // Limit repulsion radius
          // Force = k / dist^2
          const force = this.kRepulsion / distSq;
          const fx = (dx / dist) * force;
          const fy = (dy / dist) * force;

          if (!nodeA.isCentral && !nodeA.isDragged) {
            nodeA.vx -= fx;
            nodeA.vy -= fy;
          }
          if (!nodeB.isCentral && !nodeB.isDragged) {
            nodeB.vx += fx;
            nodeB.vy += fy;
          }
        }
      }
    }

    // 2. Spring forces along links
    this.links.forEach(link => {
      const nodeA = this.nodes.find(n => n.id === link.sourceId);
      const nodeB = this.nodes.find(n => n.id === link.targetId);
      if (!nodeA || !nodeB) return;

      const dx = nodeB.x - nodeA.x;
      const dy = nodeB.y - nodeA.y;
      const dist = Math.sqrt(dx * dx + dy * dy) || 1;

      // Hooke's Law: Force = k * (dist - restLength)
      const displacement = dist - link.length;
      const force = displacement * this.kSpring * link.strength;

      const fx = (dx / dist) * force;
      const fy = (dy / dist) * force;

      if (!nodeA.isCentral && !nodeA.isDragged) {
        nodeA.vx += fx;
        nodeA.vy += fy;
      }
      if (!nodeB.isCentral && !nodeB.isDragged) {
        nodeB.vx -= fx;
        nodeB.vy -= fy;
      }
    });

    // 3. Gravity/Center pulling & Boundary bounds updates
    this.nodes.forEach(node => {
      if (node.isCentral) {
        // Central node stays centered
        node.x += (centerX - node.x) * 0.1;
        node.y += (centerY - node.y) * 0.1;
        node.vx = 0;
        node.vy = 0;
        return;
      }

      if (node.isDragged) {
        node.vx = 0;
        node.vy = 0;
        return;
      }

      // Gravitational pull to center
      node.vx += (centerX - node.x) * this.gravity;
      node.vy += (centerY - node.y) * this.gravity;

      // Apply friction and update position
      node.vx *= this.friction;
      node.vy *= this.friction;

      // Caps maximum velocity to avoid explosions
      const speed = Math.sqrt(node.vx * node.vx + node.vy * node.vy);
      const maxSpeed = 7;
      if (speed > maxSpeed) {
        node.vx = (node.vx / speed) * maxSpeed;
        node.vy = (node.vy / speed) * maxSpeed;
      }

      node.x += node.vx;
      node.y += node.vy;

      // Contain inside bounds
      const padding = 30;
      if (node.x < padding) { node.x = padding; node.vx *= -0.5; }
      if (node.x > this.width - padding) { node.x = this.width - padding; node.vx *= -0.5; }
      if (node.y < padding) { node.y = padding; node.vy *= -0.5; }
      if (node.y > this.height - padding) { node.y = this.height - padding; node.vy *= -0.5; }
    });
  }
}
