/**
 * Mini-Games data and utilities for Ephemeral Chat
 * Game types: "Would You Rather", "Trivia"
 */

export const GAME_TYPES = {
    WYR: 'would-you-rather',
    TRIVIA: 'trivia',
    TIC_TAC_TOE: 'tic-tac-toe'
};

export const WOULD_YOU_RATHER_TOPICS = {
    "Superpowers & Fantasy": [
        { optionA: "Be able to fly", optionB: "Be able to read minds" },
        { optionA: "Be invisible", optionB: "Be able to teleport" },
        { optionA: "Have super strength", optionB: "Have super speed" },
        { optionA: "Be able to talk to animals", optionB: "Be able to speak all human languages" },
        { optionA: "Control the weather", optionB: "Control time for 10 seconds a day" },
        { optionA: "Be able to breathe fire", optionB: "Be able to control ice" },
        { optionA: "Be able to shapeshift", optionB: "Be able to become invisible at will" },
        { optionA: "Have a magical pet", optionB: "Have a magical vehicle" },
        { optionA: "Turn invisible when you sneeze", optionB: "Glow when you lie" },
        { optionA: "Be immortal and watch everyone die", optionB: "Die young but with everyone you love" },
        { optionA: "Have a personal dragon", optionB: "Have a personal phoenix" },
        { optionA: "Control plants", optionB: "Control rocks" },
        { optionA: "Be a werewolf", optionB: "Be a vampire" },
        { optionA: "Always have a perfect shield", optionB: "Always have a perfect sword" },
        { optionA: "Move objects with your mind", optionB: "Read people's feelings" },
        { optionA: "Control the weather", optionB: "Control the tide" },
        { optionA: "Travel through dreams", optionB: "Travel through mirrors" },
        { optionA: "Have a 3rd eye", optionB: "Have 4 arms" },
        { optionA: "Be 10 feet tall", optionB: "Be 1 inch tall" },
        { optionA: "Breathe underwater", optionB: "Breathe in space" }
    ],
    "Lifestyles & Preferences": [
        { optionA: "Live in a treehouse", optionB: "Live in a submarine" },
        { optionA: "Live in a city", optionB: "Live in the country" },
        { optionA: "Always dress formally", optionB: "Always dress in pajamas" },
        { optionA: "Live without a phone", optionB: "Live without a car" },
        { optionA: "Have a private island", optionB: "Have a private jet" },
        { optionA: "Live underwater", optionB: "Live in the sky on floating islands" },
        { optionA: "Have your dream house", optionB: "Have your dream job" },
        { optionA: "Live in virtual reality full-time", optionB: "Live in a remote mountain cabin" },
        { optionA: "Live in a smart futuristic city", optionB: "Live in a medieval kingdom" },
        { optionA: "Only wear thrifted clothes", optionB: "Only wear designer clothes" },
        { optionA: "No social media", optionB: "No television" },
        { optionA: "Live in a van", optionB: "Live in a tiny house" },
        { optionA: "Eat only local food", optionB: "Eat only imported food" },
        { optionA: "Be a famous writer", optionB: "Be a famous painter" },
        { optionA: "Work from home forever", optionB: "Work in a beautiful office" },
        { optionA: "Only use a flip phone", optionB: "Only use a smartwatch" },
        { optionA: "Have a personal butler", optionB: "Have a personal driver" },
        { optionA: "Live in a houseboat", optionB: "Live in a lighthouse" },
        { optionA: "Never use a map", optionB: "Never use a clock" }
    ],
    "Future, Past & Time": [
        { optionA: "Live in the past", optionB: "Live in the future" },
        { optionA: "Know how you die", optionB: "Know when you die" },
        { optionA: "Have a pause button for your life", optionB: "Have a rewind button for your life" },
        { optionA: "Be able to see 10 minutes into the future", optionB: "Be able to see 10 years into the future" },
        { optionA: "Relive your childhood", optionB: "Skip straight to retirement age with wealth" },
        { optionA: "Be able to redo one day per year", optionB: "Be able to erase one mistake" },
        { optionA: "Have a rewind button for conversations", optionB: "Have subtitles for real life" },
        { optionA: "Own a spaceship", optionB: "Own a time machine" },
        { optionA: "Be able to restart your life once", optionB: "Be able to skip one painful year" },
        { optionA: "Relive your life exactly the same", optionB: "Live a completely unknown new life" },
        { optionA: "Visit the dinosaurs", optionB: "Visit a space colony" },
        { optionA: "Meet your grandparents as kids", optionB: "Meet your grandkids as adults" },
        { optionA: "Know your future", optionB: "Change your past" },
        { optionA: "Live through the 1920s", optionB: "Live through the 2080s" },
        { optionA: "Have a time-stopping watch", optionB: "Have a time-loop ring" },
        { optionA: "See the birth of the earth", optionB: "See the end of the world" },
        { optionA: "10 hours in the future", optionB: "1 hour in the past every day" },
        { optionA: "Fast-forward boring moments", optionB: "Slow-down happy moments" },
        { optionA: "Be a historian", optionB: "Be a futurist" },
        { optionA: "Know the date of every major world event", optionB: "Know date of every major milestone" }
    ],
    "Skills & Talents": [
        { optionA: "Speak every language", optionB: "Play every instrument" },
        { optionA: "Have unlimited knowledge", optionB: "Have unlimited money" },
        { optionA: "Be a famous actor", optionB: "Be a famous musician" },
        { optionA: "Have a photographic memory", optionB: "Be able to forget anything you want" },
        { optionA: "Have perfect luck", optionB: "Have perfect skill at one thing" },
        { optionA: "Have unlimited creativity", optionB: "Have unlimited discipline" },
        { optionA: "Be able to instantly learn any skill", optionB: "Be able to instantly unlearn bad habits" },
        { optionA: "Have unlimited energy", optionB: "Need only 2 hours of sleep daily" },
        { optionA: "Have perfect memory recall", optionB: "Have perfect emotional control" },
        { optionA: "Be a genius and lonely", optionB: "Be average and popular" },
        { optionA: "Master of piano", optionB: "Master of violin" },
        { optionA: "Perfect cooking skills", optionB: "Perfect dancing skills" },
        { optionA: "Code any app in an hour", optionB: "Build any furniture in an hour" },
        { optionA: "Beat anyone at Chess", optionB: "Beat anyone at Poker" },
        { optionA: "Never forget a face", optionB: "Never forget a name" },
        { optionA: "Speak fluently to ghosts", optionB: "Speak fluently to aliens" },
        { optionA: "Be a world-class gymnast", optionB: "Be a world-class swimmer" },
        { optionA: "Paint masterpieces", optionB: "Compose symphonies" },
        { optionA: "Perfect public speaking", optionB: "Perfect writing" },
        { optionA: "Learn a language in a day", optionB: "Learn a sport in a week" }
    ],
    "Food & Senses": [
        { optionA: "Only eat pizza forever", optionB: "Never eat pizza again" },
        { optionA: "Always be cold", optionB: "Always be hot" },
        { optionA: "Only eat sweet food", optionB: "Only eat salty food" },
        { optionA: "Only drink water", optionB: "Only drink juice/soda" },
        { optionA: "Only eat food shaped like cubes", optionB: "Only drink from baby bottles" },
        { optionA: "Have spaghetti for hair", optionB: "Sweat maple syrup" },
        { optionA: "Never have to sleep", optionB: "Never have to eat" },
        { optionA: "Live without music", optionB: "Live without movies" },
        { optionA: "Tacos every day", optionB: "Sushi every day" },
        { optionA: "Smell like flowers", optionB: "Smell like rain" },
        { optionA: "Always eat spicy", optionB: "Always eat sweet" },
        { optionA: "Cold drinks only", optionB: "Hot drinks only" },
        { optionA: "Chocolate forever", optionB: "Vanilla forever" },
        { optionA: "Breakfast for every meal", optionB: "Dinner for every meal" },
        { optionA: "Eat only what you grow", optionB: "Eat only what you hunt" },
        { optionA: "Silverware only", optionB: "Hands only" },
        { optionA: "Coffee only", optionB: "Tea only" },
        { optionA: "No salt ever", optionB: "No sugar ever" }
    ],
    "Silly & Bizarre": [
        { optionA: "Randomly shout every hour", optionB: "Randomly whisper dramatically every hour" },
        { optionA: "Have a duck follow you everywhere", optionB: "Have dramatic theme music play when you walk" },
        { optionA: "Speak only in rhymes", optionB: "Sing everything you say" },
        { optionA: "Have permanent clown makeup", optionB: "Wear a superhero cape forever" },
        { optionA: "Have hiccups during serious moments", optionB: "Laugh during serious moments" },
        { optionA: "Have a tail you can’t hide", optionB: "Have horns you can’t remove" },
        { optionA: "Have cartoon sound effects follow you", optionB: "Have a laugh track play after you speak" },
        { optionA: "Walk backward everywhere", optionB: "Hop everywhere on one foot" },
        { optionA: "Have your thoughts appear as subtitles", optionB: "Have your search history printed on your shirt" },
        { optionA: "Be chased by one slow zombie forever", optionB: "Be hunted by 100 tiny angry chickens once" },
        { optionA: "Sneakers that squeak every step", optionB: "Gloves that beep every time you touch something" },
        { optionA: "Have a permanent unibrow", optionB: "Have permanent blue hair" },
        { optionA: "Your skin changes color with your mood", optionB: "Your voice changes pitch with your mood" },
        { optionA: "Walk like a crab", optionB: "Run like a narwhal" },
        { optionA: "Only wear bright neon", optionB: "Only wear camouflage" },
        { optionA: "Sneeze confetti", optionB: "Cough bubbles" },
        { optionA: "Have a nose that honks", optionB: "Have ears that wiggle" },
        { optionA: "Sleep standing up", optionB: "Sleep with your eyes open" },
        { optionA: "Only speak in questions", optionB: "Only speak in whispers" },
        { optionA: "Have a robot hand", optionB: "Have a bionic leg" }
    ],
    "Relationships & Social": [
        { optionA: "Date someone who loves you more", optionB: "Date someone you love more" },
        { optionA: "Have a passionate short relationship", optionB: "Have a stable lifelong one" },
        { optionA: "Always know your partner’s thoughts", optionB: "Never know but fully trust them" },
        { optionA: "Fall in love once deeply", optionB: "Fall in love many times lightly" },
        { optionA: "Be with someone adventurous", optionB: "Be with someone predictable" },
        { optionA: "Have constant butterflies", optionB: "Have constant comfort" },
        { optionA: "Marry your first love", optionB: "Marry your best friend" },
        { optionA: "Have intense chemistry", optionB: "Have deep emotional compatibility" },
        { optionA: "Choose love over career", optionB: "Choose career over love" },
        { optionA: "Be proposed to publicly", optionB: "Be proposed to privately" },
        { optionA: "Friends who are all geniuses", optionB: "Friends who are all funny" },
        { optionA: "Be a great listener", optionB: "Be a great storyteller" },
        { optionA: "Have a massive wedding", optionB: "Have a private elopement" },
        { optionA: "See your friends every day", optionB: "See your friends once a month" },
        { optionA: "Know everyone's first impression of you", optionB: "Know everyone's last thought of you" },
        { optionA: "Always be the one who pays", optionB: "Always be the one who is treated" },
        { optionA: "A quiet house in the woods", optionB: "A penthouse in the city for hosting" },
        { optionA: "Only have one best friend", optionB: "Have 50 good acquaintances" },
        { optionA: "Work with your partner", optionB: "Never talk about work with your partner" },
        { optionA: "Trust everyone immediately", optionB: "Trust no one until they prove it" }
    ],
    "Philosophy & Morality": [
        { optionA: "Always know the truth", optionB: "Always be believed when you lie" },
        { optionA: "Be famous but hated", optionB: "Be unknown but loved" },
        { optionA: "Always say what's on your mind", optionB: "Never be able to speak again" },
        { optionA: "Lose your ego completely", optionB: "Strengthen your identity permanently" },
        { optionA: "End world hunger but cause overpopulation", optionB: "Maintain balance but keep inequality" },
        { optionA: "Save one loved one", optionB: "Save five strangers" },
        { optionA: "Be morally perfect", optionB: "Be authentically flawed" },
        { optionA: "Explore space", optionB: "Explore the deep ocean" },
        { optionA: "Know the ultimate truth of the universe", optionB: "Live happily without ever knowing it" },
        { optionA: "Always choose logic", optionB: "Always choose emotion" },
        { optionA: "Eliminate all physical pain", optionB: "Eliminate all emotional suffering" },
        { optionA: "Be the person who starts a change", optionB: "Be the person who finishes it" },
        { optionA: "Save the ocean", optionB: "Save the rainforest" },
        { optionA: "World peace for 10 years", optionB: "Personal happiness for lifetime" },
        { optionA: "Be incredibly wise", optionB: "Be incredibly lucky" },
        { optionA: "Never lie again", optionB: "Never hear a lie again" },
        { optionA: "Control your own destiny", optionB: "Let the universe decide" },
        { optionA: "Be remembered as a hero", optionB: "Be remembered as a genius" },
        { optionA: "Have the power to forgive anyone", optionB: "Have the power to forget anything" }
    ]
};

export const TRIVIA_TOPICS = {
    "Science & Space": [
        { question: "What planet is known as the Red Planet?", options: ["Venus", "Mars", "Jupiter", "Saturn"], answer: 1 },
        { question: "Which planet has the most moons?", options: ["Jupiter", "Saturn", "Uranus", "Neptune"], answer: 1 },
        { question: "Which planet is closest to the sun?", options: ["Venus", "Mercury", "Earth", "Mars"], answer: 1 },
        { question: "Which star is at the center of our solar system?", options: ["Mars", "Jupiter", "Sun", "Venus"], answer: 2 },
        { question: "Which planet is known for its rings?", options: ["Mars", "Venus", "Saturn", "Mercury"], answer: 2 },
        { question: "Which planet is tilted on its side, giving it extreme seasons?", options: ["Uranus", "Neptune", "Saturn", "Jupiter"], answer: 0 },
        { question: "What is the primary gas found in the Sun?", options: ["Oxygen", "Hydrogen", "Nitrogen", "Carbon"], answer: 1 },
        { question: "Which planet has the shortest day?", options: ["Earth", "Mars", "Jupiter", "Venus"], answer: 2 },
        { question: "Which scientist proposed the theory of relativity?", options: ["Isaac Newton", "Albert Einstein", "Nikola Tesla", "Galileo Galilei"], answer: 1 },
        { question: "What is the speed of light in km/s (approx)?", options: ["100,000", "200,000", "300,000", "400,000"], answer: 2 },
        { question: "What is the closest star to Earth (besides the Sun)?", options: ["Alpha Centauri", "Proxima Centauri", "Sirius", "Betelgeuse"], answer: 1 },
        { question: "What is the largest planet in the solar system?", options: ["Saturn", "Jupiter", "Neptune", "Uranus"], answer: 1 },
        { question: "How many colors are in the spectrum of white light?", options: ["5", "6", "7", "8"], answer: 2 },
        { question: "What is the chemical symbol for Helium?", options: ["H", "He", "Li", "Be"], answer: 1 },
        { question: "What is the most abundant element in the universe?", options: ["Oxygen", "Carbon", "Hydrogen", "Nitrogen"], answer: 2 },
        { question: "Who proposed the Laws of Motion?", options: ["Galileo", "Einstein", "Isaac Newton", "Tesla"], answer: 2 },
        { question: "What is the term for a star that has collapsed?", options: ["Red Giant", "White Dwarf", "Black Hole", "Nebula"], answer: 2 },
        { question: "What unit is used to measure electrical current?", options: ["Volt", "Watt", "Ampere", "Ohm"], answer: 2 },
        { question: "Which planet has the 'Great Red Spot'?", options: ["Mars", "Jupiter", "Saturn", "Neptune"], answer: 1 },
        { question: "What is the name of our galaxy?", options: ["Andromeda", "Milky Way", "Sombrero", "Cartwheel"], answer: 1 }
    ],
    "Nature & Animals": [
        { question: "How many hearts does an octopus have?", options: ["1", "2", "3", "4"], answer: 2 },
        { question: "Which animal can sleep for 3 years?", options: ["Sloth", "Snail", "Koala", "Cat"], answer: 1 },
        { question: "What color is a giraffe's tongue?", options: ["Pink", "Purple", "Blue", "Black"], answer: 1 },
        { question: "What is the largest mammal in the world?", options: ["Elephant", "Blue Whale", "Giraffe", "Hippo"], answer: 1 },
        { question: "How many legs does a spider have?", options: ["6", "8", "10", "12"], answer: 1 },
        { question: "Which bird is a universal symbol of peace?", options: ["Eagle", "Sparrow", "Dove", "Owl"], answer: 2 },
        { question: "Which animal is the fastest land animal?", options: ["Cheetah", "Lion", "Horse", "Greyhound"], answer: 0 },
        { question: "Which is the fastest aquatic animal?", options: ["Shark", "Sailfish", "Dolphin", "Tuna"], answer: 1 },
        { question: "How many colors are in a rainbow?", options: ["5", "6", "7", "8"], answer: 2 },
        { question: "What gas do plants absorb from the atmosphere?", options: ["Oxygen", "Nitrogen", "Carbon Dioxide", "Hydrogen"], answer: 2 },
        { question: "What is a group of lions called?", options: ["Pack", "Herd", "Pride", "Flock"], answer: 2 },
        { question: "Which bird is the only one that can fly backwards?", options: ["Hummingbird", "Parrot", "Eagle", "Sparrow"], answer: 0 },
        { question: "How many legs does a lobster have?", options: ["6", "8", "10", "12"], answer: 2 },
        { question: "What is the tallest animal in the world?", options: ["Elephant", "Ostrich", "Giraffe", "Moose"], answer: 2 },
        { question: "Which animal has the longest lifespan?", options: ["Elephant", "Greenland Shark", "Blue Whale", "Tortoise"], answer: 1 },
        { question: "What is the fastest bird?", options: ["Peregrine Falcon", "Eagle", "Vulture", "Hawk"], answer: 0 },
        { question: "Do male or female seahorses give birth?", options: ["Female", "Male", "Both", "Neither"], answer: 1 },
        { question: "How many tentacles does a squid have?", options: ["8", "10", "12", "16"], answer: 1 },
        { question: "What is the largest fish in the ocean?", options: ["Great White Shark", "Blue Whale", "Whale Shark", "Manta Ray"], answer: 2 },
        { question: "Which mammal is capable of true flight?", options: ["Flying Squirrel", "Bat", "Eagle", "Pigeon"], answer: 1 }
    ],
    "Geography & World": [
        { question: "What is the smallest country in the world?", options: ["Monaco", "Vatican City", "San Marino", "Liechtenstein"], answer: 1 },
        { question: "What is the largest ocean on Earth?", options: ["Atlantic", "Indian", "Pacific", "Arctic"], answer: 2 },
        { question: "What is the capital of Australia?", options: ["Sydney", "Melbourne", "Canberra", "Perth"], answer: 2 },
        { question: "What is the longest river in the world?", options: ["Amazon", "Nile", "Mississippi", "Yangtze"], answer: 1 },
        { question: "Which country has the most time zones?", options: ["Russia", "USA", "France", "China"], answer: 2 },
        { question: "What country has the most pyramids?", options: ["Egypt", "Mexico", "Sudan", "Peru"], answer: 2 },
        { question: "In which city is the Eiffel Tower located?", options: ["London", "Berlin", "Rome", "Paris"], answer: 3 },
        { question: "How many continents are there?", options: ["5", "6", "7", "8"], answer: 2 },
        { question: "What is the largest desert in the world?", options: ["Sahara", "Gobi", "Antarctic", "Kalahari"], answer: 2 },
        { question: "Which continent is the South Pole located on?", options: ["Africa", "Asia", "South America", "Antarctica"], answer: 3 },
        { question: "Which country is also a continent?", options: ["Greenland", "Australia", "Antarctica", "Iceland"], answer: 1 },
        { question: "What is the largest country by land area?", options: ["China", "Canada", "Russia", "USA"], answer: 2 },
        { question: "Which mountain is the second highest in the world?", options: ["Everest", "K2", "Kangchenjunga", "Lhotse"], answer: 1 },
        { question: "What is the capital of China?", options: ["Shanghai", "Beijing", "Guangzhou", "Shenzhen"], answer: 1 },
        { question: "Which river is the longest in Europe?", options: ["Danube", "Volga", "Rhine", "Thames"], answer: 1 },
        { question: "Which country has the most natural lakes?", options: ["USA", "Russia", "Canada", "Brazil"], answer: 2 },
        { question: "What is the smallest ocean?", options: ["Indian", "Arctic", "Southern", "Atlantic"], answer: 1 },
        { question: "Which desert is the driest place on Earth?", options: ["Sahara", "Gobi", "Atacama", "Kalahari"], answer: 2 },
        { question: "What is the capital of Brazil?", options: ["Rio de Janeiro", "Sao Paulo", "Brasilia", "Salvador"], answer: 2 },
        { question: "What is the capital of France?", options: ["Lyon", "Marseille", "Paris", "Nice"], answer: 2 }
    ],
    "History & Arts": [
        { question: "In what year did the Titanic sink?", options: ["1910", "1912", "1914", "1916"], answer: 1 },
        { question: "Who painted the Mona Lisa?", options: ["Michelangelo", "Raphael", "Da Vinci", "Donatello"], answer: 2 },
        { question: "Who wrote Romeo and Juliet?", options: ["Dickens", "Shakespeare", "Austen", "Hemingway"], answer: 1 },
        { question: "What year did World War II end?", options: ["1943", "1944", "1945", "1946"], answer: 2 },
        { question: "Who wrote '1984'?", options: ["Aldous Huxley", "George Orwell", "Ray Bradbury", "J.D. Salinger"], answer: 1 },
        { question: "Who painted The Starry Night?", options: ["Claude Monet", "Pablo Picasso", "Vincent van Gogh", "Henri Matisse"], answer: 2 },
        { question: "What year did the Berlin Wall fall?", options: ["1987", "1989", "1991", "1993"], answer: 1 },
        { question: "Who discovered penicillin?", options: ["Alexander Fleming", "Louis Pasteur", "Marie Curie", "Gregor Mendel"], answer: 0 },
        { question: "What year did the first man land on the moon?", options: ["1965", "1967", "1969", "1971"], answer: 2 },
        { question: "Which film won Best Picture at the 1994 Academy Awards?", options: ["The Shawshank Redemption", "Pulp Fiction", "Forrest Gump", "Four Weddings and a Funeral"], answer: 2 },
        { question: "Who wrote the play 'Hamlet'?", options: ["Shakespeare", "Marlowe", "Jonson", "Webster"], answer: 0 },
        { question: "In which year did the French Revolution begin?", options: ["1776", "1789", "1804", "1815"], answer: 1 },
        { question: "Who was the first President of the United States?", options: ["John Adams", "Thomas Jefferson", "George Washington", "James Madison"], answer: 2 },
        { question: "Which artist painted the Sistine Chapel ceiling?", options: ["Leonardo", "Raphael", "Michelangelo", "Donatello"], answer: 2 },
        { question: "What was the name of the first man-made satellite?", options: ["Explorer 1", "Sputnik 1", "Vanguard 1", "Telstar"], answer: 1 },
        { question: "Who discovered electricity?", options: ["Thomas Edison", "Nikola Tesla", "Benjamin Franklin", "Michael Faraday"], answer: 2 },
        { question: "Which ancient civilization built the Colosseum?", options: ["Greeks", "Egyptians", "Romans", "Mayans"], answer: 2 },
        { question: "Who wrote 'The Odyssey'?", options: ["Virgil", "Homer", "Sophocles", "Euripides"], answer: 1 },
        { question: "In what century did the Black Death occur?", options: ["12th", "13th", "14th", "15th"], answer: 2 },
        { question: "Who was the leader of the Civil Rights Movement in the US?", options: ["Malcolm X", "Martin Luther King Jr.", "Rosa Parks", "John Lewis"], answer: 1 }
    ],
    "Technology & Innovation": [
        { question: "What year was the iPhone first released?", options: ["2005", "2006", "2007", "2008"], answer: 2 },
        { question: "In computing, what does 'HTTP' stand for?", options: ["HyperText Transfer Protocol", "HighText Transfer Protocol", "Hyperlink Transfer Protocol", "HyperText Transmission Protocol"], answer: 0 },
        { question: "Who is known as the father of computers?", options: ["Alan Turing", "Charles Babbage", "Steve Jobs", "Bill Gates"], answer: 1 },
        { question: "What does CPU stand for?", options: ["Central Process Unit", "Central Processing Unit", "Computer Personal Unit", "Central Peripheral Unit"], answer: 1 },
        { question: "What does RAM stand for?", options: ["Random Access Memory", "Rapid Access Module", "Read Access Memory", "Run Active Memory"], answer: 0 },
        { question: "Which company created the Windows operating system?", options: ["Apple", "IBM", "Microsoft", "Intel"], answer: 2 },
        { question: "Which company developed the PlayStation?", options: ["Nintendo", "Sony", "Microsoft", "Sega"], answer: 1 },
        { question: "What is the primary programming language used for Android app development?", options: ["Swift", "Kotlin", "Ruby", "C#"], answer: 1 },
        { question: "What does GPU stand for?", options: ["Graphics Processing Unit", "General Processing Unit", "Graphical Power Unit", "Global Processing Unit"], answer: 0 },
        { question: "How many bytes are in a kilobyte (traditional binary)?", options: ["1000", "512", "1024", "2048"], answer: 2 },
        { question: "What does WWW stand for?", options: ["World Wide Web", "World Wired Web", "Web World Wide", "Wide World Web"], answer: 0 },
        { question: "Who co-founded Microsoft with Bill Gates?", options: ["Steve Jobs", "Paul Allen", "Steve Wozniak", "Elon Musk"], answer: 1 },
        { question: "What is the main component of a glass screen?", options: ["Plastic", "Silica", "Aluminum", "Copper"], answer: 1 },
        { question: "What year was Google founded?", options: ["1995", "1996", "1998", "2000"], answer: 2 },
        { question: "What does PDF stand for?", options: ["Portable Document File", "Portable Document Format", "Personal Document File", "Public Document Format"], answer: 1 },
        { question: "Who invented the lightbulb?", options: ["Nikola Tesla", "Thomas Edison", "Benjamin Franklin", "Alexander Bell"], answer: 1 },
        { question: "What is the most popular social media platform by total users?", options: ["Twitter", "Instagram", "Facebook", "TikTok"], answer: 2 },
        { question: "What does AI stand for?", options: ["Automated Intelligence", "Artificial Intelligence", "Advanced Integration", "Automatic Insight"], answer: 1 },
        { question: "Who developed the first practical steam engine?", options: ["James Watt", "Eli Whitney", "Robert Fulton", "George Stephenson"], answer: 0 },
        { question: "What is the basic unit of information in computing?", options: ["Byte", "Bit", "Kilobyte", "Mega"], answer: 1 }
    ],
    "Human Body & Health": [
        { question: "How many bones are in the adult human body?", options: ["186", "206", "226", "246"], answer: 1 },
        { question: "Which organ is responsible for pumping blood?", options: ["Lungs", "Brain", "Heart", "Liver"], answer: 2 },
        { question: "Which vitamin is produced by the skin in sunlight?", options: ["Vitamin A", "Vitamin B", "Vitamin C", "Vitamin D"], answer: 3 },
        { question: "What is the largest internal organ in the human body?", options: ["Liver", "Heart", "Lungs", "Kidney"], answer: 0 },
        { question: "Which organ produces insulin?", options: ["Liver", "Pancreas", "Kidney", "Stomach"], answer: 1 },
        { question: "What is the hardest part of the human body?", options: ["Bone", "Enamel", "Cartilage", "Tendon"], answer: 1 },
        { question: "Which organ is primarily responsible for detoxifying chemicals?", options: ["Spleen", "Liver", "Pancreas", "Lungs"], answer: 1 },
        { question: "Which blood type is known as the universal donor?", options: ["O+", "O-", "AB-", "A-"], answer: 1 },
        { question: "How many chromosomes do humans typically have?", options: ["44", "45", "46", "48"], answer: 2 },
        { question: "What is the largest organ of the human body?", options: ["Skin", "Liver", "Lungs", "Brain"], answer: 0 },
        { question: "What is the largest muscle in the human body?", options: ["Biceps", "Quadriceps", "Gluteus Maximus", "Latissimus Dorsi"], answer: 2 },
        { question: "How many teeth does an adult human have?", options: ["28", "30", "32", "34"], answer: 2 },
        { question: "What is the name of the pigment that gives skin color?", options: ["Hemoglobin", "Melanin", "Chlorophyll", "Keratin"], answer: 1 },
        { question: "Which organ filters waste from the blood?", options: ["Liver", "Pancreas", "Kidneys", "Spleen"], answer: 2 },
        { question: "What is the smallest bone in the human body?", options: ["Stapes", "Cochlea", "Hammer", "Anvil"], answer: 0 },
        { question: "What is the normal body temperature in Celsius?", options: ["35", "36", "37", "38"], answer: 2 },
        { question: "Which part of the brain controls balance?", options: ["Cerebrum", "Cerebellum", "Brainstem", "Thalamus"], answer: 1 },
        { question: "What is the main function of red blood cells?", options: ["Fight Infection", "Clot Blood", "Carry Oxygen", "Produce Energy"], answer: 2 },
        { question: "How many chambers does the human heart have?", options: ["2", "3", "4", "5"], answer: 2 },
        { question: "What is the largest part of the human brain?", options: ["Cerebrum", "Cerebellum", "Medulla", "Hypothalamus"], answer: 0 }
    ],
    "General Knowledge": [
        { question: "What is the currency of Japan?", options: ["Won", "Yen", "Yuan", "Ringgit"], answer: 1 },
        { question: "What is the most spoken language in the world?", options: ["English", "Spanish", "Mandarin", "Hindi"], answer: 2 },
        { question: "What temperature (°C) does water boil at sea level?", options: ["90", "100", "110", "120"], answer: 1 },
        { question: "How many strings does a standard guitar have?", options: ["4", "5", "6", "7"], answer: 2 },
        { question: "How many players are on a soccer team?", options: ["9", "10", "11", "12"], answer: 2 },
        { question: "What is the chemical symbol for gold?", options: ["Ag", "Au", "Pb", "Fe"], answer: 1 },
        { question: "Which element has the atomic number 1?", options: ["Hydrogen", "Helium", "Lithium", "Oxygen"], answer: 0 },
        { question: "What is the square root of 144?", options: ["10", "11", "12", "13"], answer: 2 },
        { question: "Which instrument measures atmospheric pressure?", options: ["Thermometer", "Barometer", "Hygrometer", "Anemometer"], answer: 1 },
        { question: "How many sides does a hexagon have?", options: ["5", "6", "7", "8"], answer: 1 },
        { question: "How many inches are in a foot?", options: ["10", "12", "14", "16"], answer: 1 },
        { question: "What is the primary ingredient in hummus?", options: ["Lentils", "Chickpeas", "Soybeans", "Peas"], answer: 1 },
        { question: "Which game features 'checkmate'?", options: ["Bridge", "Chess", "Backgammon", "Checkers"], answer: 1 },
        { question: "What is the national bird of the United States?", options: ["Eagle", "Hawk", "Bald Eagle", "Vulture"], answer: 2 },
        { question: "How many hours are in a week?", options: ["160", "168", "172", "180"], answer: 1 },
        { question: "What is the name of the toy with a spinning wheel on a string?", options: ["Fidget Spinner", "Yo-yo", "Top", "Diabolo"], answer: 1 },
        { question: "What is the most popular sport in the world?", options: ["Basketball", "Cricket", "Soccer", "Tennis"], answer: 2 },
        { question: "What is the term for a group of crows?", options: ["Pack", "Murder", "Flock", "School"], answer: 1 },
        { question: "Which fruit is the most popular in the world?", options: ["Apple", "Orange", "Banana", "Grapes"], answer: 2 },
        { question: "What is the primary language of Mexico?", options: ["Portuguese", "French", "Spanish", "English"], answer: 2 }
    ]
};

// Compatible with existing exports
export const WOULD_YOU_RATHER = Object.values(WOULD_YOU_RATHER_TOPICS).flat();
export const TRIVIA_QUESTIONS = Object.values(TRIVIA_TOPICS).flat();

// Topic lists for selection
export const WYR_TOPIC_LIST = Object.keys(WOULD_YOU_RATHER_TOPICS);
export const TRIVIA_TOPIC_LIST = Object.keys(TRIVIA_TOPICS);

let remainingWYR = { "ANY": [] };
let remainingTrivia = { "ANY": [] };

const shuffleArray = (array) => {
    const arr = [...array];
    for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
};

export const getRandomWYR = (topic = null) => {
    const key = topic || "ANY";
    if (!remainingWYR[key] || remainingWYR[key].length === 0) {
        const source = topic ? WOULD_YOU_RATHER_TOPICS[topic] : WOULD_YOU_RATHER;
        remainingWYR[key] = shuffleArray(source);
    }
    return remainingWYR[key].pop();
};

export const getRandomTrivia = (topic = null) => {
    const key = topic || "ANY";
    if (!remainingTrivia[key] || remainingTrivia[key].length === 0) {
        const source = topic ? TRIVIA_TOPICS[topic] : TRIVIA_QUESTIONS;
        remainingTrivia[key] = shuffleArray(source);
    }
    return remainingTrivia.pop();
};
