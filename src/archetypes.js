/* ==========================================================================
   DATA LAYER: FILMS CATALOG & CINEPHILE ARCHETYPES
   Project: Letterboxd KNN Taste Mashup
   ========================================================================== */

/**
 * Master Movie Catalog
 * 60 highly recognizable films representing different eras, styles, and genres.
 * Categories: classics (Classic Cinema), indie (Arthouse / Indie), popcorn (Blockbuster / Action), horror (Horror / Thriller).
 */
export const MASTER_MOVIES = [
  // --- CLASSIC CINEMA (15) ---
  { id: 0, title: "The Godfather", year: 1972, category: "classics" },
  { id: 1, title: "Citizen Kane", year: 1941, category: "classics" },
  { id: 2, title: "Casablanca", year: 1942, category: "classics" },
  { id: 3, title: "Seven Samurai", year: 1954, category: "classics" },
  { id: 4, title: "2001: A Space Odyssey", year: 1968, category: "classics" },
  { id: 5, title: "Pulp Fiction", year: 1994, category: "classics" },
  { id: 6, title: "Schindler's List", year: 1993, category: "classics" },
  { id: 7, title: "12 Angry Men", year: 1957, category: "classics" },
  { id: 8, title: "Psycho", year: 1960, category: "classics" },
  { id: 9, title: "Vertigo", year: 1958, category: "classics" },
  { id: 10, title: "Rear Window", year: 1954, category: "classics" },
  { id: 11, title: "Stalker", year: 1979, category: "classics" },
  { id: 12, title: "Persona", year: 1966, category: "classics" },
  { id: 13, title: "Apocalypse Now", year: 1979, category: "classics" },
  { id: 14, title: "GoodFellas", year: 1990, category: "classics" },

  // --- INDIE & ARTHOUSE (15) ---
  { id: 15, title: "Parasite", year: 2019, category: "indie" },
  { id: 16, title: "Lady Bird", year: 2017, category: "indie" },
  { id: 17, title: "Portrait of a Lady on Fire", year: 2019, category: "indie" },
  { id: 18, title: "Everything Everywhere All at Once", year: 2022, category: "indie" },
  { id: 19, title: "Whiplash", year: 2014, category: "indie" },
  { id: 20, title: "Moonlight", year: 2016, category: "indie" },
  { id: 21, title: "Eternal Sunshine of the Spotless Mind", year: 2004, category: "indie" },
  { id: 22, title: "Spirited Away", year: 2001, category: "indie" },
  { id: 23, title: "Drive My Car", year: 2021, category: "indie" },
  { id: 24, title: "La La Land", year: 2016, category: "indie" },
  { id: 25, title: "Roma", year: 2018, category: "indie" },
  { id: 26, title: "The Grand Budapest Hotel", year: 2014, category: "indie" },
  { id: 27, title: "Amélie", year: 2001, category: "indie" },
  { id: 28, title: "Aftersun", year: 2022, category: "indie" },
  { id: 29, title: "Lost in Translation", year: 2003, category: "indie" },

  // --- HORROR & THRILLER (15) ---
  { id: 30, title: "The Shining", year: 1980, category: "horror" },
  { id: 31, title: "Hereditary", year: 2018, category: "horror" },
  { id: 32, title: "Get Out", year: 2017, category: "horror" },
  { id: 33, title: "Midsommar", year: 2019, category: "horror" },
  { id: 34, title: "The Silence of the Lambs", year: 1991, category: "horror" },
  { id: 35, title: "The Thing", year: 1982, category: "horror" },
  { id: 36, title: "Alien", year: 1979, category: "horror" },
  { id: 37, title: "The Texas Chain Saw Massacre", year: 1974, category: "horror" },
  { id: 38, title: "Se7en", year: 1995, category: "horror" },
  { id: 39, title: "Parasite", year: 2019, category: "horror" }, // Handled as indie/thriller double-duty
  { id: 40, title: "Scream", year: 1996, category: "horror" },
  { id: 41, title: "The Conjuring", year: 2013, category: "horror" },
  { id: 42, title: "It Follows", year: 2014, category: "horror" },
  { id: 43, title: "The Witch", year: 2015, category: "horror" },
  { id: 44, title: "Halloween", year: 1978, category: "horror" },

  // --- POPCORN, SCI-FI & ACTION (15) ---
  { id: 45, title: "Interstellar", year: 2014, category: "popcorn" },
  { id: 46, title: "The Dark Knight", year: 2008, category: "popcorn" },
  { id: 47, title: "Inception", year: 2010, category: "popcorn" },
  { id: 48, title: "Mad Max: Fury Road", year: 2015, category: "popcorn" },
  { id: 49, title: "Star Wars: A New Hope", year: 1977, category: "popcorn" },
  { id: 50, title: "The Matrix", year: 1999, category: "popcorn" },
  { id: 51, title: "Dune", year: 2021, category: "popcorn" },
  { id: 52, title: "Avengers: Endgame", year: 2019, category: "popcorn" },
  { id: 53, title: "Spider-Man: Into the Spider-Verse", year: 2018, category: "popcorn" },
  { id: 54, title: "Jurassic Park", year: 1993, category: "popcorn" },
  { id: 55, title: "Top Gun: Maverick", year: 2022, category: "popcorn" },
  { id: 56, title: "Terminator 2: Judgment Day", year: 1991, category: "popcorn" },
  { id: 57, title: "Blade Runner 2048", year: 2017, category: "popcorn" },
  { id: 58, title: "The Lord of the Rings: The Fellowship of the Ring", year: 2001, category: "popcorn" },
  { id: 59, title: "Avatar: The Way of Water", year: 2022, category: "popcorn" }
];

/**
 * Six genre/taste dimensions used for the compatibility table and radar chart.
 * Film IDs reference MASTER_MOVIES indexes above.
 */
export const TASTE_ATTRIBUTES = [
  { key: 'indie',    label: 'Indie',    color: '#00e054', filmIds: [15,16,17,18,19,20,21,22,23,24,25,26,27,28,29], desc: 'Indie & arthouse cinema' },
  { key: 'classics', label: 'Classic',  color: '#ff8000', filmIds: [0,1,2,3,4,5,6,7,8,9,10,11,12,13,14],          desc: 'Classic & canonical cinema' },
  { key: 'horror',   label: 'Horror',   color: '#ef233c', filmIds: [30,31,32,33,34,35,36,37,38,39,40,41,42,43,44], desc: 'Horror & thriller' },
  { key: 'popcorn',  label: 'Popcorn',  color: '#a06cd5', filmIds: [45,46,47,48,49,50,51,52,53,54,55,56,57,58,59], desc: 'Blockbuster & action' },
  { key: 'cerebral', label: 'Cerebral', color: '#40bcf4', filmIds: [4,7,11,12,23,25,28,19,21,22,29,51],            desc: 'Slow, demanding, thought-provoking cinema' },
  { key: 'docu',     label: 'Docu',     color: '#ffd700', filmIds: [16,17,20,23,25,28,29,1,3,7],                   desc: 'Observational & real-world storytelling' }
];

/**
 * Pre-configured Cinephile Archetypes (Letterboxd User Simulations)
 * Each vector has exactly 60 elements mapping to the master list indexes.
 * Ratings range from 0.0 (unrated) to 5.0.
 */
export const ARCHETYPES = [
  {
    id: "a24_purist",
    username: "a24_purist",
    displayName: "Chloe (A24 Devotee)",
    avatar: "C",
    category: "indie",
    bio: "Currently looking at pastel color palettes. I rate films based on how much they make me cry in public. Lady Bird is my baseline.",
    // Loves indie, dislikes blockbuster, respects classics, hates trashy horror
    ratings: [
      3.5, 4.0, 4.0, 3.5, 4.5, 4.0, 3.5, 4.0, 3.5, 3.0, 3.0, 4.5, 4.5, 3.0, 3.5, // Classics
      5.0, 5.0, 5.0, 4.5, 4.5, 5.0, 4.5, 4.5, 4.5, 4.0, 4.5, 4.0, 5.0, 4.5, 4.0, // Indie
      3.0, 4.5, 4.0, 4.5, 3.5, 3.0, 3.5, 1.5, 3.5, 5.0, 2.5, 2.0, 4.0, 4.5, 2.5, // Horror
      3.5, 3.0, 3.5, 4.0, 2.5, 3.0, 4.0, 1.0, 4.5, 2.5, 2.0, 3.5, 4.0, 2.5, 1.5  // Popcorn
    ]
  },
  {
    id: "criterion_snob",
    username: "godard_disciple",
    displayName: "Jean-Luc (Criterion Snob)",
    avatar: "JL",
    category: "classics",
    bio: "35mm only. Digital is a lie. If a film has a plot, it has failed. I write 2,000-word essays on Letterboxd and get 4 likes.",
    // Loves classics & foreign art house, absolute disdain for blockbusters/popcorn, ignores casual slasher horror
    ratings: [
      5.0, 5.0, 4.5, 5.0, 5.0, 4.0, 4.5, 4.5, 4.5, 5.0, 4.5, 5.0, 5.0, 4.5, 4.0, // Classics
      4.5, 3.5, 4.5, 2.5, 3.0, 4.0, 3.5, 4.5, 5.0, 2.0, 4.5, 3.5, 4.5, 3.5, 4.0, // Indie
      3.5, 2.5, 3.0, 3.0, 4.0, 3.5, 4.0, 3.5, 3.5, 4.5, 1.0, 1.0, 2.0, 3.5, 3.0, // Horror
      2.5, 2.0, 1.5, 3.0, 2.5, 2.0, 2.5, 0.5, 3.0, 2.0, 1.0, 2.5, 3.5, 2.0, 0.5  // Popcorn
    ]
  },
  {
    id: "horror_gorehound",
    username: "horror_hound",
    displayName: "Marcus (Slasher & Gore)",
    avatar: "M",
    category: "horror",
    bio: "Blood, guts, and practical effects. Hereditary is a family drama. I watch horror movies to fall asleep. Live, laugh, lobotomy.",
    // Loves horror/thrillers, respects gory action, dislikes boring slow cinema, hates romcoms/musicals
    ratings: [
      3.5, 2.0, 2.0, 3.0, 4.0, 4.5, 3.0, 2.5, 5.0, 4.5, 4.0, 3.0, 3.5, 3.5, 3.5, // Classics
      4.0, 2.5, 3.0, 3.5, 3.5, 3.0, 3.0, 3.5, 2.5, 1.5, 2.5, 2.0, 3.0, 2.5, 2.0, // Indie
      5.0, 5.0, 4.5, 5.0, 4.5, 5.0, 5.0, 5.0, 4.5, 4.0, 4.5, 4.5, 4.5, 4.5, 5.0, // Horror
      3.5, 3.5, 3.5, 4.5, 3.0, 4.0, 3.0, 1.5, 3.5, 4.0, 3.0, 4.0, 3.5, 3.0, 2.0  // Popcorn
    ]
  },
  {
    id: "marvel_max",
    username: "popcorn_nerd",
    displayName: "Tyler (Blockbuster Fan)",
    avatar: "T",
    category: "popcorn",
    bio: "I just want to be entertained, okay? If there's no CGI explosions or laser sword fights, I'm falling asleep in 10 minutes. Marvel is peak.",
    // Loves Sci-Fi, Superheroes, and Action. Hates slow french cinema and depressing indie projects.
    ratings: [
      3.0, 1.5, 2.0, 2.5, 3.5, 4.0, 3.5, 2.5, 2.0, 2.0, 2.5, 1.0, 0.5, 2.5, 4.0, // Classics
      3.5, 2.0, 1.5, 4.5, 4.0, 2.5, 3.5, 4.0, 1.5, 4.0, 2.0, 3.0, 2.0, 2.5, 2.5, // Indie
      3.0, 1.5, 4.0, 2.0, 3.5, 3.0, 3.5, 1.0, 3.5, 3.5, 3.5, 4.0, 2.5, 1.5, 3.0, // Horror
      4.5, 5.0, 4.5, 5.0, 4.5, 4.5, 4.5, 5.0, 5.0, 4.5, 4.5, 4.5, 4.0, 4.5, 4.5  // Popcorn
    ]
  },
  {
    id: "french_wave",
    username: "new_wave_chic",
    displayName: "Amélie (Arthouse Academic)",
    avatar: "A",
    category: "indie",
    bio: "Studies cinema theory. Subtitles required. A film should be a philosophical query, not an amusement park ride.",
    ratings: [
      4.5, 5.0, 4.0, 4.5, 4.5, 3.5, 4.0, 4.5, 4.0, 4.5, 4.0, 5.0, 5.0, 4.0, 3.5, // Classics
      4.5, 4.0, 5.0, 3.5, 3.5, 4.5, 4.0, 4.5, 5.0, 3.0, 4.5, 4.0, 4.5, 4.5, 4.0, // Indie
      3.0, 3.5, 3.5, 4.0, 3.5, 3.0, 3.5, 2.0, 3.0, 4.5, 1.5, 1.5, 2.5, 4.0, 2.5, // Horror
      3.0, 2.5, 2.0, 3.0, 2.5, 2.5, 3.5, 0.5, 3.5, 2.0, 1.5, 2.0, 3.0, 2.0, 1.0  // Popcorn
    ]
  },
  {
    id: "scifi_devotee",
    username: "cyber_punk_87",
    displayName: "Leo (Sci-Fi Devotee)",
    avatar: "L",
    category: "popcorn",
    bio: "Blaster guns and neon skyscrapers. 2001: A Space Odyssey is the holy text. Denis Villeneuve can do no wrong.",
    ratings: [
      3.5, 3.0, 2.5, 4.0, 5.0, 4.0, 3.5, 3.0, 3.5, 3.5, 3.0, 4.5, 3.5, 3.5, 3.5, // Classics
      4.0, 3.0, 3.0, 4.5, 4.0, 3.5, 4.5, 4.5, 3.0, 3.0, 3.5, 3.0, 3.5, 3.5, 3.5, // Indie
      3.5, 3.5, 3.5, 3.5, 3.5, 4.5, 5.0, 2.0, 3.5, 4.0, 2.5, 3.0, 3.5, 3.0, 3.5, // Horror
      5.0, 4.5, 5.0, 4.5, 4.5, 5.0, 5.0, 3.0, 4.5, 4.0, 3.5, 4.5, 5.0, 4.5, 3.5  // Popcorn
    ]
  },
  {
    id: "classic_hollywood",
    username: "golden_era_guy",
    displayName: "Charles (Golden Hollywood)",
    avatar: "CH",
    category: "classics",
    bio: "Give me black and white, crisp dialogue, and Humphrey Bogart. Everything after 1975 lacks soul. Yes, I own a record player.",
    ratings: [
      5.0, 5.0, 5.0, 4.5, 4.0, 3.5, 4.5, 5.0, 4.5, 4.5, 5.0, 3.0, 3.5, 3.5, 4.0, // Classics
      3.5, 3.0, 3.5, 1.5, 3.0, 3.0, 3.0, 4.0, 3.5, 3.5, 3.0, 4.0, 3.0, 3.0, 3.5, // Indie
      3.5, 1.5, 2.0, 1.5, 4.0, 3.0, 3.5, 1.5, 3.5, 3.5, 1.5, 1.5, 1.5, 3.0, 4.0, // Horror
      3.0, 3.0, 2.0, 3.0, 4.5, 2.5, 2.5, 1.0, 3.0, 4.0, 2.0, 3.0, 2.5, 3.5, 1.5  // Popcorn
    ]
  },
  {
    id: "indie_romcom",
    username: "la_la_lover",
    displayName: "Mia (Melancholy Romance)",
    avatar: "M",
    category: "indie",
    bio: "I like colorful filters and crying myself to sleep listening to film soundtracks. Hopeless romantic, eternal optimist.",
    ratings: [
      3.5, 3.0, 4.0, 3.0, 3.5, 4.0, 4.0, 3.5, 3.0, 3.0, 3.5, 3.0, 3.0, 3.0, 3.0, // Classics
      4.5, 4.5, 4.5, 4.5, 4.0, 4.5, 5.0, 4.5, 4.0, 5.0, 4.0, 4.5, 4.5, 4.5, 4.5, // Indie
      2.5, 3.5, 3.5, 3.5, 3.0, 2.0, 2.5, 1.0, 3.0, 4.0, 3.0, 3.0, 3.0, 2.5, 2.0, // Horror
      3.5, 3.5, 3.5, 3.5, 3.5, 3.0, 3.5, 2.0, 4.5, 3.0, 3.5, 2.5, 3.5, 4.0, 2.0  // Popcorn
    ]
  },
  {
    id: "cinephile_generalist",
    username: "karsten_clone",
    displayName: "Karsten (The Generalist)",
    avatar: "K",
    category: "indie",
    bio: "Letterboxd superstar. I watch 365 movies a year. I like indie, blockbusters, classics, and horror equally. I am the algorithm.",
    ratings: [
      4.5, 4.0, 4.0, 4.5, 4.5, 4.5, 4.5, 4.5, 4.5, 4.0, 4.0, 4.0, 4.0, 4.5, 4.5, // Classics
      4.5, 4.5, 4.0, 4.5, 4.5, 4.5, 4.5, 4.5, 4.0, 4.0, 4.0, 4.0, 4.5, 4.5, 4.0, // Indie
      4.0, 4.0, 4.5, 4.0, 4.5, 4.0, 4.5, 3.5, 4.5, 4.0, 3.5, 3.5, 4.0, 4.0, 4.0, // Horror
      4.0, 4.5, 4.0, 4.5, 4.0, 4.5, 4.0, 3.0, 4.5, 4.0, 3.5, 4.0, 4.0, 4.5, 3.0  // Popcorn
    ]
  },
  {
    id: "elevated_horror",
    username: "eggert_fanatic",
    displayName: "Sven (Elevated Horror)",
    avatar: "S",
    category: "horror",
    bio: "Horror is better when it is about grief and trauma in an empty forest. Robert Eggers and Ari Aster are geniuses. Spooky chic.",
    ratings: [
      4.0, 3.5, 3.0, 3.5, 4.5, 4.0, 3.5, 3.5, 4.5, 4.0, 3.5, 4.5, 4.5, 3.5, 3.5, // Classics
      4.5, 4.0, 4.5, 4.0, 4.0, 4.0, 4.0, 4.0, 4.0, 3.0, 4.0, 3.5, 4.5, 4.0, 3.5, // Indie
      4.5, 5.0, 4.5, 5.0, 4.0, 4.5, 4.5, 4.0, 4.0, 4.5, 3.0, 3.5, 4.5, 5.0, 4.0, // Horror
      4.0, 4.0, 4.0, 4.0, 3.0, 4.0, 4.5, 1.5, 4.0, 3.0, 2.5, 3.5, 4.5, 4.0, 2.0  // Popcorn
    ]
  },
  {
    id: "action_junkie",
    username: "fury_road_rider",
    displayName: "Jax (Adrenaline Action)",
    avatar: "J",
    category: "popcorn",
    bio: "WITNESS ME! Practical stunts, high-speed car chases, and non-stop momentum. Mad Max is my religion. Turn off your brain.",
    ratings: [
      4.0, 2.0, 2.5, 3.5, 4.0, 4.5, 3.5, 3.0, 3.5, 3.0, 3.0, 2.0, 1.5, 4.0, 4.5, // Classics
      3.5, 2.5, 2.0, 4.5, 4.5, 3.0, 3.5, 4.0, 2.0, 3.0, 2.0, 2.5, 2.5, 2.5, 3.0, // Indie
      3.5, 3.0, 4.0, 3.5, 4.0, 4.5, 4.5, 3.5, 4.0, 4.0, 4.0, 3.5, 3.5, 3.5, 4.0, // Horror
      4.5, 4.5, 4.5, 5.0, 4.5, 4.5, 4.5, 3.5, 4.5, 4.5, 4.5, 4.5, 4.0, 4.5, 3.5  // Popcorn
    ]
  },
  {
    id: "casual_netflix",
    username: "casual_watcher",
    displayName: "Emma (Casual Moviegoer)",
    avatar: "E",
    category: "popcorn",
    bio: "I watch movies on my laptop while scrolling on my phone. I like fun movies, romance, and popular stuff. Keep it light!",
    ratings: [
      3.0, 1.0, 2.5, 2.0, 1.5, 3.5, 3.5, 2.0, 2.0, 1.5, 2.0, 0.5, 0.5, 2.0, 3.0, // Classics
      3.5, 4.0, 2.0, 4.5, 3.5, 3.0, 4.0, 4.0, 1.5, 4.5, 2.0, 4.0, 3.5, 3.5, 3.5, // Indie
      2.0, 1.0, 3.5, 2.5, 3.0, 1.5, 2.0, 1.0, 3.0, 3.5, 3.5, 4.0, 2.0, 1.0, 2.0, // Horror
      4.0, 4.0, 4.0, 3.5, 3.5, 3.0, 4.0, 4.5, 4.5, 4.5, 4.5, 3.5, 3.0, 4.5, 4.5  // Popcorn
    ]
  },
  // Extra detailed profiles to flesh out the 2D PCA representation
  {
    id: "kurosawa_disciple",
    username: "samurai_spirit",
    displayName: "Kenji (Eastern Cinema)",
    avatar: "K",
    category: "classics",
    bio: "Seven Samurai is the blueprint. Passionate about Asian cinema, classics, and slow structural pacing.",
    ratings: [
      4.5, 4.5, 4.0, 5.0, 4.5, 4.0, 4.5, 4.5, 4.0, 4.0, 4.0, 4.5, 4.5, 3.5, 4.0, // Classics
      4.5, 3.0, 4.0, 4.0, 4.0, 3.5, 3.5, 5.0, 5.0, 2.5, 4.0, 3.5, 3.5, 3.5, 3.5, // Indie
      3.0, 2.5, 3.5, 3.5, 3.5, 4.0, 4.0, 2.0, 3.5, 4.5, 1.5, 1.5, 2.5, 3.5, 2.5, // Horror
      3.5, 3.5, 3.0, 4.0, 3.5, 3.5, 3.5, 1.5, 4.0, 3.5, 2.5, 3.0, 3.5, 4.0, 1.5  // Popcorn
    ]
  },
  {
    id: "romero_zombie",
    username: "retro_ghoul",
    displayName: "Gage (Retro & B-Horror)",
    avatar: "G",
    category: "horror",
    bio: "1970s and 80s horror was the peak of civilization. VHS grain over 4K digital. Halloween is a masterclass.",
    ratings: [
      4.0, 3.0, 2.5, 3.0, 4.0, 4.5, 3.0, 3.0, 5.0, 4.5, 4.0, 3.0, 3.5, 3.5, 3.5, // Classics
      3.5, 2.5, 2.5, 3.5, 3.5, 2.5, 3.5, 3.5, 2.0, 2.0, 2.0, 2.5, 2.5, 2.0, 2.0, // Indie
      4.5, 4.0, 4.0, 4.5, 4.5, 5.0, 5.0, 5.0, 4.0, 3.5, 4.5, 4.0, 4.0, 4.5, 5.0, // Horror
      3.0, 3.5, 3.0, 4.0, 3.5, 4.0, 3.0, 1.0, 3.0, 4.0, 3.0, 4.0, 3.5, 3.5, 1.5  // Popcorn
    ]
  },
  {
    id: "nolan_fan",
    username: "time_inversion",
    displayName: "Christian (Nolan Fan)",
    avatar: "CB",
    category: "popcorn",
    bio: "Non-linear timelines and massive sound design. I explain Inception at parties. The Dark Knight is a crime drama masterpiece.",
    ratings: [
      4.0, 3.5, 3.0, 3.5, 4.5, 4.5, 4.0, 4.0, 3.5, 3.5, 3.5, 3.0, 2.5, 4.0, 4.5, // Classics
      4.0, 3.0, 3.0, 4.5, 4.5, 3.0, 4.5, 4.0, 3.0, 3.5, 3.0, 3.5, 3.0, 3.5, 3.5, // Indie
      3.5, 3.0, 4.0, 3.5, 4.5, 3.5, 4.0, 2.0, 4.5, 4.0, 3.0, 3.0, 3.0, 3.0, 3.0, // Horror
      5.0, 5.0, 5.0, 4.5, 4.0, 4.5, 4.5, 3.0, 4.5, 4.5, 4.0, 4.5, 4.5, 4.5, 3.5  // Popcorn
    ]
  },
  {
    id: "french_classic",
    username: "cahiers_du_cinema",
    displayName: "Vivienne (French New Wave)",
    avatar: "V",
    category: "classics",
    bio: "Cahiers du Cinéma subscription holder. Godard, Truffaut, Varda. Cinema is truth 24 frames-per-second.",
    ratings: [
      4.5, 5.0, 4.5, 4.5, 4.5, 3.0, 4.0, 4.5, 4.0, 4.5, 4.0, 5.0, 5.0, 3.5, 3.5, // Classics
      4.0, 3.5, 5.0, 2.5, 3.0, 4.5, 3.5, 4.0, 4.5, 2.0, 4.5, 3.5, 4.5, 4.0, 4.0, // Indie
      2.5, 2.0, 3.0, 3.5, 3.5, 2.5, 3.0, 1.5, 3.0, 4.5, 1.0, 1.0, 2.0, 4.0, 2.0, // Horror
      2.5, 2.0, 1.5, 2.5, 2.5, 2.0, 3.0, 0.5, 3.0, 2.0, 1.0, 2.0, 2.5, 2.0, 0.5  // Popcorn
    ]
  }
];

/**
 * Deterministically generates a custom taste rating vector based on a username string.
 * This ensures that a specific username always returns the exact same profile vector!
 * @param {string} username - Letterboxd username.
 * @returns {Array<number>} An array of 60 ratings.
 */
export function generateDeterministicRatings(username) {
  const cleanUser = username.trim().toLowerCase();
  
  // Easter eggs!
  if (cleanUser === "martin_scorsese") {
    // Scorsese: loves classics and gangster movies, hates Marvel popcorn
    return [
      5.0, 5.0, 5.0, 5.0, 4.5, 4.5, 5.0, 4.5, 4.5, 4.5, 4.5, 4.0, 4.5, 5.0, 5.0, // Classics
      4.0, 3.5, 4.0, 2.5, 4.5, 4.0, 3.5, 4.5, 4.5, 3.0, 4.0, 3.5, 4.0, 3.5, 4.0, // Indie
      3.5, 2.5, 3.5, 3.0, 4.0, 3.5, 3.5, 2.0, 4.0, 4.0, 2.0, 1.5, 2.0, 3.5, 3.0, // Horror
      3.0, 3.0, 2.5, 3.5, 4.0, 3.5, 3.0, 0.5, 3.0, 3.5, 2.0, 3.0, 2.5, 4.0, 1.0  // Popcorn
    ];
  }
  
  if (cleanUser === "karsten") {
    // Karsten Runquist: loves modern indies, appreciates popular classics, high-grade sci-fi, and horror.
    return [
      4.0, 3.5, 3.5, 4.0, 4.5, 4.5, 4.0, 4.0, 4.0, 3.5, 4.0, 4.0, 3.5, 4.0, 4.5, // Classics
      4.5, 4.5, 4.5, 4.5, 4.5, 4.5, 4.5, 4.5, 4.5, 4.0, 4.0, 4.0, 4.5, 4.5, 4.5, // Indie
      4.0, 4.5, 4.5, 4.5, 4.0, 4.0, 4.5, 2.5, 4.5, 4.5, 3.5, 3.5, 4.0, 4.5, 3.5, // Horror
      4.5, 4.5, 4.0, 4.5, 4.0, 4.5, 4.5, 2.5, 4.5, 4.0, 3.5, 4.0, 4.5, 4.5, 2.5  // Popcorn
    ];
  }

  if (cleanUser === "horror_hound" || cleanUser === "horror_fan") {
    // Pure horror fanatic
    return ARCHETYPES.find(a => a.id === "horror_gorehound").ratings;
  }

  if (cleanUser === "a24_purist" || cleanUser === "indie_kid") {
    // Pure A24 fan
    return ARCHETYPES.find(a => a.id === "a24_purist").ratings;
  }

  if (cleanUser === "popcorn_nerd" || cleanUser === "marvel_max") {
    // Pure blockbuster fan
    return ARCHETYPES.find(a => a.id === "marvel_max").ratings;
  }

  // --- GENERAL DETERMINISTIC GENERATOR ---
  // We use the sum of char codes to create a simple pseudo-random generator
  let seed = 0;
  for (let i = 0; i < cleanUser.length; i++) {
    seed += cleanUser.charCodeAt(i) * (i + 1);
  }

  // LCG pseudo-random number generator
  function lcg(modulus, multiplier, increment, startSeed) {
    let current = startSeed;
    return function() {
      current = (multiplier * current + increment) % modulus;
      return current / modulus;
    };
  }

  const random = lcg(1000000, 1664525, 1013904223, seed);

  // Determine user taste affinity randomly (0: Classics, 1: Indie, 2: Horror, 3: Popcorn)
  const primaryAffinity = Math.floor(random() * 4);
  const secondaryAffinity = (primaryAffinity + 1 + Math.floor(random() * 3)) % 4;

  const ratings = new Array(60).fill(0);

  for (let i = 0; i < 60; i++) {
    const movie = MASTER_MOVIES[i];
    let catIndex = 0;
    if (movie.category === "indie") catIndex = 1;
    else if (movie.category === "horror") catIndex = 2;
    else if (movie.category === "popcorn") catIndex = 3;

    // Base probability of watching a movie
    let watchProb = 0.5;
    if (catIndex === primaryAffinity) watchProb = 0.85;
    else if (catIndex === secondaryAffinity) watchProb = 0.70;

    if (random() < watchProb) {
      // Base rating
      let baseRating = 3.0;
      if (catIndex === primaryAffinity) baseRating = 4.0;
      else if (catIndex === secondaryAffinity) baseRating = 3.5;

      // Add noise (-1.5 to +1.0)
      const noise = (random() * 2.5) - 1.5;
      let finalRating = Math.round((baseRating + noise) * 2) / 2; // Steps of 0.5

      // Clamp rating between 1.0 and 5.0
      finalRating = Math.max(1.0, Math.min(5.0, finalRating));
      ratings[i] = finalRating;
    } else {
      ratings[i] = 0; // Unwatched
    }
  }

  // Ensure at least 10 movies are rated
  let ratedCount = ratings.filter(r => r > 0).length;
  if (ratedCount < 10) {
    for (let i = 0; i < 60 && ratedCount < 12; i++) {
      if (ratings[i] === 0) {
        ratings[i] = Math.round((3.0 + random() * 2.0) * 2) / 2;
        ratedCount++;
      }
    }
  }

  return ratings;
}
