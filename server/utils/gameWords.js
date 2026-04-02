// Word banks and text passages for chat-integrated games.
// Originally sourced from legacy standalone HTML games; now maintained natively in-repo.

const HANGMAN_WORDS = {
  easy: [
    { word: 'CAT',    category: 'Animals',     hint: 'Meows' },
    { word: 'DOG',    category: 'Animals',     hint: 'Barks' },
    { word: 'BIRD',   category: 'Animals',     hint: 'Has feathers' },
    { word: 'FISH',   category: 'Animals',     hint: 'Lives in water' },
    { word: 'FROG',   category: 'Animals',     hint: 'Jumps on lily pads' },
    { word: 'SUN',    category: 'Nature',      hint: 'Star at center of solar system' },
    { word: 'RAIN',   category: 'Nature',      hint: 'Falls from clouds' },
    { word: 'TREE',   category: 'Nature',      hint: 'Has bark and leaves' },
    { word: 'MOON',   category: 'Space',       hint: 'Orbits Earth' },
    { word: 'STAR',   category: 'Space',       hint: 'Twinkles at night' },
    { word: 'KING',   category: 'Royalty',     hint: 'Rules a kingdom' },
    { word: 'CAKE',   category: 'Food',        hint: 'Birthday dessert' },
    { word: 'FIRE',   category: 'Elements',    hint: 'Hot and bright' },
    { word: 'SNOW',   category: 'Weather',     hint: 'White and cold' },
    { word: 'BOOK',   category: 'Objects',     hint: 'Has pages and chapters' },
    { word: 'JAZZ',   category: 'Music',       hint: 'Improvised music style' },
    { word: 'QUIZ',   category: 'Games',       hint: 'Test your knowledge' },
    { word: 'ATOM',   category: 'Science',     hint: 'Smallest unit of matter' },
    { word: 'WAVE',   category: 'Nature',      hint: 'Ocean motion' },
    { word: 'PLAN',   category: 'Words',       hint: 'A strategy or scheme' },
  ],
  medium: [
    { word: 'PYTHON',  category: 'Programming', hint: 'Named after a comedy group' },
    { word: 'GUITAR',  category: 'Music',       hint: 'Six-stringed instrument' },
    { word: 'SPHINX',  category: 'Mythology',   hint: 'Asks riddles in Egypt' },
    { word: 'BRAZIL',  category: 'Countries',   hint: 'Largest in South America' },
    { word: 'MEXICO',  category: 'Countries',   hint: 'South of Texas' },
    { word: 'WIZARD',  category: 'Fantasy',     hint: 'Casts magic spells' },
    { word: 'DRAGON',  category: 'Fantasy',     hint: 'Breathes fire' },
    { word: 'QUARTZ',  category: 'Minerals',    hint: 'Common crystal mineral' },
    { word: 'JIGSAW',  category: 'Games',       hint: 'Puzzle with interlocking pieces' },
    { word: 'PUZZLE',  category: 'Games',       hint: 'A mental challenge' },
    { word: 'OXYGEN',  category: 'Science',     hint: 'Element we breathe' },
    { word: 'GIRAFFE', category: 'Animals',     hint: 'Tallest land animal' },
    { word: 'LANTERN', category: 'Objects',     hint: 'Portable light source' },
    { word: 'COMPASS', category: 'Objects',     hint: 'Points north always' },
    { word: 'BLAZING', category: 'Words',       hint: 'Burning intensely' },
    { word: 'PHANTOM', category: 'Mystery',     hint: 'A ghost or apparition' },
    { word: 'CRYPTIC', category: 'Words',       hint: 'Having a hidden meaning' },
    { word: 'VOLCANO', category: 'Nature',      hint: 'Erupts lava' },
    { word: 'NUCLEUS', category: 'Science',     hint: 'Center of a cell or atom' },
    { word: 'FJORD',   category: 'Geography',   hint: 'Norwegian coastal inlet' },
  ],
  hard: [
    { word: 'JAVASCRIPT',   category: 'Programming', hint: 'Language of the browser' },
    { word: 'SYMPHONY',     category: 'Music',       hint: 'Long orchestral composition' },
    { word: 'AVALANCHE',    category: 'Nature',      hint: 'Sudden snow collapse' },
    { word: 'ELEPHANT',     category: 'Animals',     hint: 'Never forgets' },
    { word: 'ALGORITHM',    category: 'Programming', hint: 'Step-by-step problem solver' },
    { word: 'LABYRINTH',    category: 'Mystery',     hint: 'A complex maze' },
    { word: 'MYTHOLOGY',    category: 'History',     hint: 'Ancient gods and legends' },
    { word: 'XYLOPHONE',    category: 'Music',       hint: 'Struck with mallets' },
    { word: 'PERISCOPE',    category: 'Objects',     hint: 'Submarine viewing device' },
    { word: 'CRYPTOGRAPHY', category: 'Technology',  hint: 'Art of secret writing' },
    { word: 'STALAGMITE',   category: 'Nature',      hint: 'Grows up from cave floor' },
    { word: 'RHINOCEROS',   category: 'Animals',     hint: 'Has a horn on its nose' },
    { word: 'OBSERVATORY',  category: 'Science',     hint: 'Where astronomers work' },
    { word: 'QUICKSAND',    category: 'Nature',      hint: 'Dangerous loose sand' },
    { word: 'EQUINOX',      category: 'Astronomy',   hint: 'Equal day and night' },
    { word: 'PORCUPINE',    category: 'Animals',     hint: 'Covered in sharp quills' },
    { word: 'THUNDERSTORM', category: 'Weather',     hint: 'Lightning and thunder' },
    { word: 'PHOSPHORUS',   category: 'Science',     hint: 'Glows in the dark' },
    { word: 'KALEIDOSCOPE', category: 'Objects',     hint: 'Colorful optical toy' },
    { word: 'FJORDLAND',    category: 'Geography',   hint: 'New Zealand national park' },
  ]
};

const ANAGRAM_WORDS = {
  novice: [
    { word: 'CRAB', letters: ['C','R','A','B','T','S','E','L'] },
    { word: 'FROG', letters: ['F','R','O','G','A','L','T','E'] },
    { word: 'GLOW', letters: ['G','L','O','W','A','R','T','S'] },
    { word: 'HUNT', letters: ['H','U','N','T','A','R','S','E'] },
    { word: 'JADE', letters: ['J','A','D','E','R','N','T','S'] },
    { word: 'KITE', letters: ['K','I','T','E','R','A','N','S'] },
    { word: 'MIST', letters: ['M','I','S','T','A','R','E','N'] },
    { word: 'NEST', letters: ['N','E','S','T','A','R','L','O'] },
    { word: 'PEAK', letters: ['P','E','A','K','R','T','N','S'] },
    { word: 'REEF', letters: ['R','E','E','F','T','A','N','S'] },
    { word: 'SAIL', letters: ['S','A','I','L','R','E','T','N'] },
    { word: 'TIDE', letters: ['T','I','D','E','R','A','N','S'] },
    { word: 'WOLF', letters: ['W','O','L','F','A','R','T','S'] },
    { word: 'BOLD', letters: ['B','O','L','D','R','A','T','S'] },
    { word: 'CLAM', letters: ['C','L','A','M','R','T','S','E'] },
    { word: 'ECHO', letters: ['E','C','H','O','R','A','T','S'] },
    { word: 'FOAM', letters: ['F','O','A','M','R','T','S','E'] },
    { word: 'HAZE', letters: ['H','A','Z','E','R','T','S','N'] },
    { word: 'IRIS', letters: ['I','R','I','S','A','T','E','N'] },
    { word: 'DUSK', letters: ['D','U','S','K','A','R','T','E'] },
  ],
  adept: [
    { word: 'BLAZE', letters: ['B','L','A','Z','E','R','T','S'] },
    { word: 'CHASE', letters: ['C','H','A','S','E','R','T','N'] },
    { word: 'DRIFT', letters: ['D','R','I','F','T','A','S','E'] },
    { word: 'EAGLE', letters: ['E','A','G','L','E','R','T','S'] },
    { word: 'FABLE', letters: ['F','A','B','L','E','R','T','S'] },
    { word: 'HAUNT', letters: ['H','A','U','N','T','R','S','E'] },
    { word: 'IVORY', letters: ['I','V','O','R','Y','A','T','S'] },
    { word: 'KARMA', letters: ['K','A','R','M','A','T','S','E'] },
    { word: 'LUNAR', letters: ['L','U','N','A','R','T','S','E'] },
    { word: 'NOBLE', letters: ['N','O','B','L','E','R','T','S'] },
    { word: 'PRISM', letters: ['P','R','I','S','M','A','T','E'] },
    { word: 'RAVEN', letters: ['R','A','V','E','N','T','S','O'] },
    { word: 'THORN', letters: ['T','H','O','R','N','A','S','E'] },
    { word: 'VENOM', letters: ['V','E','N','O','M','R','T','S'] },
    { word: 'WALTZ', letters: ['W','A','L','T','Z','R','S','E'] },
    { word: 'AMBER', letters: ['A','M','B','E','R','T','S','N'] },
    { word: 'CORAL', letters: ['C','O','R','A','L','T','S','E'] },
    { word: 'EMBER', letters: ['E','M','B','E','R','T','S','N'] },
    { word: 'GLOOM', letters: ['G','L','O','O','M','R','T','S'] },
    { word: 'JOUST', letters: ['J','O','U','S','T','A','R','E'] },
  ],
  expert: [
    { word: 'PLANET', letters: ['P','L','A','N','E','T','R','S'] },
    { word: 'GARDEN', letters: ['G','A','R','D','E','N','T','O'] },
    { word: 'BRIGHT', letters: ['B','R','I','G','H','T','A','L'] },
    { word: 'JUNGLE', letters: ['J','U','N','G','L','E','A','P'] },
    { word: 'CASTLE', letters: ['C','A','S','T','L','E','R','M'] },
    { word: 'FLOWER', letters: ['F','L','O','W','E','R','A','N'] },
    { word: 'BRIDGE', letters: ['B','R','I','D','G','E','T','S'] },
    { word: 'CANDLE', letters: ['C','A','N','D','L','E','O','R'] },
    { word: 'FROZEN', letters: ['F','R','O','Z','E','N','G','L'] },
    { word: 'MARBLE', letters: ['M','A','R','B','L','E','T','S'] },
    { word: 'SPRITE', letters: ['S','P','R','I','T','E','A','N'] },
    { word: 'KNIGHT', letters: ['K','N','I','G','H','T','S','R'] },
    { word: 'ORACLE', letters: ['O','R','A','C','L','E','S','T'] },
    { word: 'TIMBER', letters: ['T','I','M','B','E','R','A','D'] },
    { word: 'COBALT', letters: ['C','O','B','A','L','T','R','S'] },
    { word: 'DAGGER', letters: ['D','A','G','G','E','R','T','S'] },
    { word: 'GOBLIN', letters: ['G','O','B','L','I','N','T','S'] },
    { word: 'HERALD', letters: ['H','E','R','A','L','D','T','S'] },
    { word: 'OYSTER', letters: ['O','Y','S','T','E','R','A','N'] },
    { word: 'PARROT', letters: ['P','A','R','R','O','T','S','E'] },
  ],
  master: [
    { word: 'CAPTAIN', letters: ['C','A','P','T','A','I','N','S'] },
    { word: 'DARKEST', letters: ['D','A','R','K','E','S','T','O'] },
    { word: 'EMPRESS', letters: ['E','M','P','R','E','S','S','A'] },
    { word: 'FEATHER', letters: ['F','E','A','T','H','E','R','S'] },
    { word: 'GRANITE', letters: ['G','R','A','N','I','T','E','S'] },
    { word: 'HARVEST', letters: ['H','A','R','V','E','S','T','O'] },
    { word: 'IMAGINE', letters: ['I','M','A','G','I','N','E','S'] },
    { word: 'JOURNEY', letters: ['J','O','U','R','N','E','Y','S'] },
    { word: 'KINGDOM', letters: ['K','I','N','G','D','O','M','S'] },
    { word: 'LANTERN', letters: ['L','A','N','T','E','R','N','S'] },
    { word: 'MASTERY', letters: ['M','A','S','T','E','R','Y','O'] },
    { word: 'NETWORK', letters: ['N','E','T','W','O','R','K','S'] },
    { word: 'PHANTOM', letters: ['P','H','A','N','T','O','M','S'] },
    { word: 'RADIANT', letters: ['R','A','D','I','A','N','T','S'] },
    { word: 'SERPENT', letters: ['S','E','R','P','E','N','T','O'] },
    { word: 'TRIUMPH', letters: ['T','R','I','U','M','P','H','S'] },
    { word: 'VIBRANT', letters: ['V','I','B','R','A','N','T','S'] },
    { word: 'WARRIOR', letters: ['W','A','R','R','I','O','R','S'] },
    { word: 'ANCIENT', letters: ['A','N','C','I','E','N','T','S'] },
    { word: 'BLOSSOM', letters: ['B','L','O','S','S','O','M','T'] },
  ]
};

const TYPING_TEXTS = {
  easy: [
    "The sun sets over the calm blue ocean as the waves gently roll onto the sandy shore. A few clouds drift slowly across the warm evening sky.",
    "She opened the door and stepped into the bright morning light. Birds were singing in the tall oak tree just outside the window.",
    "The small cat sat on the soft rug near the warm fireplace. Outside the rain fell quietly on the green garden.",
    "He walked down the quiet street and stopped to watch the leaves fall from the old maple tree. The air smelled like fresh rain.",
    "A dog ran across the open field chasing a bright red ball. The child laughed and ran after him through the tall green grass.",
    "They sat by the lake and watched the ducks glide across the still water. The sky was clear and full of soft white clouds.",
    "She made a cup of tea and sat by the window with a good book. The afternoon light came through the glass in long golden strips.",
    "The bakery on the corner always smelled of warm bread in the morning. People lined up outside before it even opened its doors.",
    "He found an old letter tucked inside a dusty book on the shelf. The handwriting was small and careful, the ink faded to light brown.",
    "Two friends sat on the porch and talked until the stars came out. The night was warm and the crickets sang in the dark yard.",
  ],
  medium: [
    "Efficiency in software development relies not just on writing code quickly, but on writing clean, maintainable code that others can understand and extend without confusion.",
    "The mountains stood silent and vast against the twilight horizon, their peaks dusted with snow that gleamed faintly in the last light of the fading day.",
    "Every great design begins with a clear understanding of the problem it seeks to solve. Without clarity of purpose, even elegant solutions can miss the mark entirely.",
    "Reading widely across disciplines trains the mind to draw unexpected connections, often leading to insights that specialists working in isolation would never encounter on their own.",
    "The city hummed with its usual restless energy as commuters filled the platforms, each absorbed in their own world, moving together yet entirely separate in thought.",
    "Memory is not a recording device but a reconstructive process; every time we recall an event, we subtly reshape it based on current beliefs and emotional states.",
    "Good leadership is less about making decisions and more about creating conditions where others feel empowered to make good decisions confidently and without constant oversight.",
    "The ocean is a vast and largely unexplored frontier, harboring ecosystems as complex and strange as any found on land, from hydrothermal vents to abyssal plains.",
    "Language shapes thought in subtle ways that are difficult to perceive from inside; the words available to us define the boundaries of what we can conceive.",
    "Progress in science rarely comes from sudden flashes of genius, but from patient accumulation of small observations, careful experiments, and rigorous peer review over decades.",
  ],
  hard: [
    "Compiler optimizations such as loop unrolling, inlining, and dead code elimination operate on intermediate representations, transforming high-level constructs into machine-efficient instruction sequences without altering observable behavior.",
    "The epistemological tension between rationalism and empiricism resurfaces in contemporary debates about machine learning: whether statistical pattern recognition constitutes genuine understanding or merely sophisticated correlation mapping.",
    "Distributed consensus algorithms such as Raft, Paxos, and Zab each make different trade-offs between leader election overhead, log replication latency, and fault tolerance under partial network partition scenarios.",
    "Photosynthesis involves two coupled reaction systems: the light-dependent reactions capture photonic energy to synthesize ATP and NADPH, while the Calvin cycle uses these to fix atmospheric carbon dioxide into glucose.",
    "Post-structuralist literary theory contends that meaning is never stable or author-determined, but instead perpetually deferred through chains of signification that readers actively construct within specific cultural and historical contexts.",
    "Rate limiting, circuit breaking, and exponential backoff with jitter are foundational resilience patterns that prevent cascading failures when distributed microservices experience sudden spikes in upstream or downstream load.",
    "The Doppler effect, relativistic redshift, and gravitational lensing each distort observed electromagnetic spectra in distinct ways, requiring astronomers to disentangle multiple phenomena when measuring cosmological distances.",
  ]
};

function getRandomItem(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function getHangmanWord(difficulty) {
  const pool = HANGMAN_WORDS[difficulty] || HANGMAN_WORDS.medium;
  return getRandomItem(pool);
}

function getAnagramWord(difficulty) {
  const pool = ANAGRAM_WORDS[difficulty] || ANAGRAM_WORDS.novice;
  return getRandomItem(pool);
}

function getTypingText(difficulty) {
  const pool = TYPING_TEXTS[difficulty] || TYPING_TEXTS.easy;
  return getRandomItem(pool);
}

module.exports = { getHangmanWord, getAnagramWord, getTypingText };
