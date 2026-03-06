/**
 * trivia-bank.js — Server-side trivia question bank for tournament trivia.
 * 
 * Auto-generates questions from a curated pool so the host doesn't have
 * to manually type them.  Used by `tournament-start` to pre-populate all
 * trivia rounds.
 */

const TRIVIA_TOPICS = {
  "Science & Space": [
    { question: "What planet is known as the Red Planet?", options: ["Venus", "Mars", "Jupiter", "Saturn"], answer: 1 },
    { question: "Which planet has the most moons?", options: ["Jupiter", "Saturn", "Uranus", "Neptune"], answer: 1 },
    { question: "Which planet is closest to the sun?", options: ["Venus", "Mercury", "Earth", "Mars"], answer: 1 },
    { question: "Which star is at the center of our solar system?", options: ["Mars", "Jupiter", "Sun", "Venus"], answer: 2 },
    { question: "Which planet is known for its rings?", options: ["Mars", "Venus", "Saturn", "Mercury"], answer: 2 },
    { question: "What is the primary gas found in the Sun?", options: ["Oxygen", "Hydrogen", "Nitrogen", "Carbon"], answer: 1 },
    { question: "Which planet has the shortest day?", options: ["Earth", "Mars", "Jupiter", "Venus"], answer: 2 },
    { question: "Which scientist proposed the theory of relativity?", options: ["Isaac Newton", "Albert Einstein", "Nikola Tesla", "Galileo Galilei"], answer: 1 },
    { question: "What is the speed of light in km/s (approx)?", options: ["100,000", "200,000", "300,000", "400,000"], answer: 2 },
    { question: "What is the closest star to Earth (besides the Sun)?", options: ["Alpha Centauri", "Proxima Centauri", "Sirius", "Betelgeuse"], answer: 1 },
    { question: "What is the largest planet in the solar system?", options: ["Saturn", "Jupiter", "Neptune", "Uranus"], answer: 1 },
    { question: "What is the chemical symbol for Helium?", options: ["H", "He", "Li", "Be"], answer: 1 },
    { question: "What is the most abundant element in the universe?", options: ["Oxygen", "Carbon", "Hydrogen", "Nitrogen"], answer: 2 },
    { question: "Who proposed the Laws of Motion?", options: ["Galileo", "Einstein", "Isaac Newton", "Tesla"], answer: 2 },
    { question: "What unit is used to measure electrical current?", options: ["Volt", "Watt", "Ampere", "Ohm"], answer: 2 },
    { question: "Which planet has the 'Great Red Spot'?", options: ["Mars", "Jupiter", "Saturn", "Neptune"], answer: 1 },
    { question: "What is the name of our galaxy?", options: ["Andromeda", "Milky Way", "Sombrero", "Cartwheel"], answer: 1 },
  ],
  "Nature & Animals": [
    { question: "How many hearts does an octopus have?", options: ["1", "2", "3", "4"], answer: 2 },
    { question: "Which animal can sleep for 3 years?", options: ["Sloth", "Snail", "Koala", "Cat"], answer: 1 },
    { question: "What color is a giraffe's tongue?", options: ["Pink", "Purple", "Blue", "Black"], answer: 1 },
    { question: "What is the largest mammal in the world?", options: ["Elephant", "Blue Whale", "Giraffe", "Hippo"], answer: 1 },
    { question: "How many legs does a spider have?", options: ["6", "8", "10", "12"], answer: 1 },
    { question: "Which animal is the fastest land animal?", options: ["Cheetah", "Lion", "Horse", "Greyhound"], answer: 0 },
    { question: "What gas do plants absorb from the atmosphere?", options: ["Oxygen", "Nitrogen", "Carbon Dioxide", "Hydrogen"], answer: 2 },
    { question: "What is a group of lions called?", options: ["Pack", "Herd", "Pride", "Flock"], answer: 2 },
    { question: "Which bird is the only one that can fly backwards?", options: ["Hummingbird", "Parrot", "Eagle", "Sparrow"], answer: 0 },
    { question: "What is the tallest animal in the world?", options: ["Elephant", "Ostrich", "Giraffe", "Moose"], answer: 2 },
    { question: "What is the fastest bird?", options: ["Peregrine Falcon", "Eagle", "Vulture", "Hawk"], answer: 0 },
    { question: "Do male or female seahorses give birth?", options: ["Female", "Male", "Both", "Neither"], answer: 1 },
    { question: "What is the largest fish in the ocean?", options: ["Great White Shark", "Blue Whale", "Whale Shark", "Manta Ray"], answer: 2 },
    { question: "Which mammal is capable of true flight?", options: ["Flying Squirrel", "Bat", "Eagle", "Pigeon"], answer: 1 },
  ],
  "Geography & World": [
    { question: "What is the smallest country in the world?", options: ["Monaco", "Vatican City", "San Marino", "Liechtenstein"], answer: 1 },
    { question: "What is the largest ocean on Earth?", options: ["Atlantic", "Indian", "Pacific", "Arctic"], answer: 2 },
    { question: "What is the capital of Australia?", options: ["Sydney", "Melbourne", "Canberra", "Perth"], answer: 2 },
    { question: "What is the longest river in the world?", options: ["Amazon", "Nile", "Mississippi", "Yangtze"], answer: 1 },
    { question: "What country has the most pyramids?", options: ["Egypt", "Mexico", "Sudan", "Peru"], answer: 2 },
    { question: "How many continents are there?", options: ["5", "6", "7", "8"], answer: 2 },
    { question: "What is the largest desert in the world?", options: ["Sahara", "Gobi", "Antarctic", "Kalahari"], answer: 2 },
    { question: "Which country is also a continent?", options: ["Greenland", "Australia", "Antarctica", "Iceland"], answer: 1 },
    { question: "What is the largest country by land area?", options: ["China", "Canada", "Russia", "USA"], answer: 2 },
    { question: "Which mountain is the second highest in the world?", options: ["Everest", "K2", "Kangchenjunga", "Lhotse"], answer: 1 },
    { question: "What is the smallest ocean?", options: ["Indian", "Arctic", "Southern", "Atlantic"], answer: 1 },
    { question: "What is the capital of Brazil?", options: ["Rio de Janeiro", "Sao Paulo", "Brasilia", "Salvador"], answer: 2 },
    { question: "What is the capital of France?", options: ["Lyon", "Marseille", "Paris", "Nice"], answer: 2 },
  ],
  "History & Arts": [
    { question: "In what year did the Titanic sink?", options: ["1910", "1912", "1914", "1916"], answer: 1 },
    { question: "Who painted the Mona Lisa?", options: ["Michelangelo", "Raphael", "Da Vinci", "Donatello"], answer: 2 },
    { question: "Who wrote Romeo and Juliet?", options: ["Dickens", "Shakespeare", "Austen", "Hemingway"], answer: 1 },
    { question: "What year did World War II end?", options: ["1943", "1944", "1945", "1946"], answer: 2 },
    { question: "Who painted The Starry Night?", options: ["Claude Monet", "Pablo Picasso", "Vincent van Gogh", "Henri Matisse"], answer: 2 },
    { question: "What year did the Berlin Wall fall?", options: ["1987", "1989", "1991", "1993"], answer: 1 },
    { question: "Who discovered penicillin?", options: ["Alexander Fleming", "Louis Pasteur", "Marie Curie", "Gregor Mendel"], answer: 0 },
    { question: "What year did the first man land on the moon?", options: ["1965", "1967", "1969", "1971"], answer: 2 },
    { question: "Who was the first President of the United States?", options: ["John Adams", "Thomas Jefferson", "George Washington", "James Madison"], answer: 2 },
    { question: "Which artist painted the Sistine Chapel ceiling?", options: ["Leonardo", "Raphael", "Michelangelo", "Donatello"], answer: 2 },
    { question: "Who discovered electricity?", options: ["Thomas Edison", "Nikola Tesla", "Benjamin Franklin", "Michael Faraday"], answer: 2 },
    { question: "Which ancient civilization built the Colosseum?", options: ["Greeks", "Egyptians", "Romans", "Mayans"], answer: 2 },
  ],
  "Technology & Innovation": [
    { question: "What year was the iPhone first released?", options: ["2005", "2006", "2007", "2008"], answer: 2 },
    { question: "In computing, what does 'HTTP' stand for?", options: ["HyperText Transfer Protocol", "HighText Transfer Protocol", "Hyperlink Transfer Protocol", "HyperText Transmission Protocol"], answer: 0 },
    { question: "Who is known as the father of computers?", options: ["Alan Turing", "Charles Babbage", "Steve Jobs", "Bill Gates"], answer: 1 },
    { question: "What does CPU stand for?", options: ["Central Process Unit", "Central Processing Unit", "Computer Personal Unit", "Central Peripheral Unit"], answer: 1 },
    { question: "What does RAM stand for?", options: ["Random Access Memory", "Rapid Access Module", "Read Access Memory", "Run Active Memory"], answer: 0 },
    { question: "Which company created the Windows operating system?", options: ["Apple", "IBM", "Microsoft", "Intel"], answer: 2 },
    { question: "What does GPU stand for?", options: ["Graphics Processing Unit", "General Processing Unit", "Graphical Power Unit", "Global Processing Unit"], answer: 0 },
    { question: "How many bytes are in a kilobyte (traditional binary)?", options: ["1000", "512", "1024", "2048"], answer: 2 },
    { question: "What does WWW stand for?", options: ["World Wide Web", "World Wired Web", "Web World Wide", "Wide World Web"], answer: 0 },
    { question: "What year was Google founded?", options: ["1995", "1996", "1998", "2000"], answer: 2 },
    { question: "What does AI stand for?", options: ["Automated Intelligence", "Artificial Intelligence", "Advanced Integration", "Automatic Insight"], answer: 1 },
    { question: "What is the basic unit of information in computing?", options: ["Byte", "Bit", "Kilobyte", "Mega"], answer: 1 },
  ],
  "Human Body & Health": [
    { question: "How many bones are in the adult human body?", options: ["186", "206", "226", "246"], answer: 1 },
    { question: "Which organ is responsible for pumping blood?", options: ["Lungs", "Brain", "Heart", "Liver"], answer: 2 },
    { question: "Which vitamin is produced by the skin in sunlight?", options: ["Vitamin A", "Vitamin B", "Vitamin C", "Vitamin D"], answer: 3 },
    { question: "What is the largest internal organ in the human body?", options: ["Liver", "Heart", "Lungs", "Kidney"], answer: 0 },
    { question: "Which organ produces insulin?", options: ["Liver", "Pancreas", "Kidney", "Stomach"], answer: 1 },
    { question: "What is the hardest part of the human body?", options: ["Bone", "Enamel", "Cartilage", "Tendon"], answer: 1 },
    { question: "Which blood type is known as the universal donor?", options: ["O+", "O-", "AB-", "A-"], answer: 1 },
    { question: "How many chromosomes do humans typically have?", options: ["44", "45", "46", "48"], answer: 2 },
    { question: "What is the largest organ of the human body?", options: ["Skin", "Liver", "Lungs", "Brain"], answer: 0 },
    { question: "How many teeth does an adult human have?", options: ["28", "30", "32", "34"], answer: 2 },
    { question: "Which organ filters waste from the blood?", options: ["Liver", "Pancreas", "Kidneys", "Spleen"], answer: 2 },
    { question: "How many chambers does the human heart have?", options: ["2", "3", "4", "5"], answer: 2 },
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
    { question: "How many sides does a hexagon have?", options: ["5", "6", "7", "8"], answer: 1 },
    { question: "Which game features 'checkmate'?", options: ["Bridge", "Chess", "Backgammon", "Checkers"], answer: 1 },
    { question: "What is the most popular sport in the world?", options: ["Basketball", "Cricket", "Soccer", "Tennis"], answer: 2 },
    { question: "What is the primary language of Mexico?", options: ["Portuguese", "French", "Spanish", "English"], answer: 2 },
  ],
};

const ALL_QUESTIONS = Object.values(TRIVIA_TOPICS).flat();

function shuffleArray(array) {
  const arr = [...array];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/**
 * Generate `count` unique random trivia questions.
 * Returns an array of { question, options, answer } objects.
 */
function generateTriviaQuestions(count) {
  const shuffled = shuffleArray(ALL_QUESTIONS);
  return shuffled.slice(0, Math.min(count, shuffled.length));
}

module.exports = { generateTriviaQuestions, TRIVIA_TOPICS };
