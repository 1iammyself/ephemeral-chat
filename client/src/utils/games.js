/**
 * Mini-Games data and utilities for Ephemeral Chat
 * Two game types: "Would You Rather" and "Trivia"
 */

export const GAME_TYPES = {
    WYR: 'would-you-rather',
    TRIVIA: 'trivia'
};

export const WOULD_YOU_RATHER = [
    { optionA: "Be able to fly", optionB: "Be able to read minds" },
    { optionA: "Live without music", optionB: "Live without movies" },
    { optionA: "Always be 10 minutes late", optionB: "Always be 20 minutes early" },
    { optionA: "Have unlimited money", optionB: "Have unlimited knowledge" },
    { optionA: "Be famous but hated", optionB: "Be unknown but loved" },
    { optionA: "Live in the past", optionB: "Live in the future" },
    { optionA: "Only eat pizza forever", optionB: "Never eat pizza again" },
    { optionA: "Speak every language", optionB: "Play every instrument" },
    { optionA: "Have no phone for a year", optionB: "Have no friends for a year" },
    { optionA: "Be invisible", optionB: "Be able to teleport" },
    { optionA: "Always know the truth", optionB: "Always be believed when you lie" },
    { optionA: "Live in a treehouse", optionB: "Live in a submarine" },
    { optionA: "Have super strength", optionB: "Have super speed" },
    { optionA: "Give up social media forever", optionB: "Never watch TV/streaming again" },
    { optionA: "Always be cold", optionB: "Always be hot" },
    { optionA: "Explore space", optionB: "Explore the deep ocean" },
    { optionA: "Have free Wi-Fi everywhere", optionB: "Have free food everywhere" },
    { optionA: "Live without AC/heating", optionB: "Live without the internet" },
    { optionA: "Know how you die", optionB: "Know when you die" },
    { optionA: "Lose all your money", optionB: "Lose all your memories" },
    { optionA: "Be the funniest person in the room", optionB: "Be the smartest person in the room" },
    { optionA: "Have a pause button for your life", optionB: "Have a rewind button for your life" },
    { optionA: "Win the lottery", optionB: "Live twice as long" },
    { optionA: "Always have to say what's on your mind", optionB: "Never be able to speak again" },
    { optionA: "Be a famous actor", optionB: "Be a famous musician" },
    { optionA: "Have a personal chef", optionB: "Have a personal trainer" },
    { optionA: "Travel by plane", optionB: "Travel by train" },
    { optionA: "Be stuck on an island alone", optionB: "Be stuck on an island with someone you hate" },
    { optionA: "Always dress formally", optionB: "Always dress in pajamas" },
    { optionA: "Have unlimited battery on your devices", optionB: "Have unlimited storage on your devices" },
];

export const TRIVIA_QUESTIONS = [
    { question: "What planet is known as the Red Planet?", options: ["Venus", "Mars", "Jupiter", "Saturn"], answer: 1 },
    { question: "How many hearts does an octopus have?", options: ["1", "2", "3", "4"], answer: 2 },
    { question: "What is the smallest country in the world?", options: ["Monaco", "Vatican City", "San Marino", "Liechtenstein"], answer: 1 },
    { question: "Which element has the chemical symbol 'Au'?", options: ["Silver", "Aluminum", "Gold", "Argon"], answer: 2 },
    { question: "In what year did the Titanic sink?", options: ["1910", "1912", "1914", "1916"], answer: 1 },
    { question: "What is the hardest natural substance?", options: ["Titanium", "Quartz", "Diamond", "Graphene"], answer: 2 },
    { question: "Which country invented pizza?", options: ["Greece", "France", "Italy", "Spain"], answer: 2 },
    { question: "How many bones are in the adult human body?", options: ["186", "206", "226", "246"], answer: 1 },
    { question: "What is the largest ocean on Earth?", options: ["Atlantic", "Indian", "Pacific", "Arctic"], answer: 2 },
    { question: "Who painted the Mona Lisa?", options: ["Michelangelo", "Raphael", "Da Vinci", "Donatello"], answer: 2 },
    { question: "What gas do plants absorb from the atmosphere?", options: ["Oxygen", "Nitrogen", "Carbon Dioxide", "Hydrogen"], answer: 2 },
    { question: "Which planet has the most moons?", options: ["Jupiter", "Saturn", "Uranus", "Neptune"], answer: 1 },
    { question: "What is the capital of Australia?", options: ["Sydney", "Melbourne", "Canberra", "Perth"], answer: 2 },
    { question: "What year was the iPhone first released?", options: ["2005", "2006", "2007", "2008"], answer: 2 },
    { question: "How many players are on a soccer team?", options: ["9", "10", "11", "12"], answer: 2 },
    { question: "What is the speed of light in km/s (approx)?", options: ["100,000", "200,000", "300,000", "400,000"], answer: 2 },
    { question: "Which animal can sleep for 3 years?", options: ["Sloth", "Snail", "Koala", "Cat"], answer: 1 },
    { question: "What is the longest river in the world?", options: ["Amazon", "Nile", "Mississippi", "Yangtze"], answer: 1 },
    { question: "Which country has the most time zones?", options: ["Russia", "USA", "France", "China"], answer: 2 },
    { question: "What color is a giraffe's tongue?", options: ["Pink", "Purple", "Blue", "Black"], answer: 1 },
    { question: "How many strings does a standard guitar have?", options: ["4", "5", "6", "7"], answer: 2 },
    { question: "What is the most spoken language in the world?", options: ["English", "Spanish", "Mandarin", "Hindi"], answer: 2 },
    { question: "What temperature (°C) does water boil at sea level?", options: ["90", "100", "110", "120"], answer: 1 },
    { question: "Which planet is closest to the sun?", options: ["Venus", "Mercury", "Earth", "Mars"], answer: 1 },
    { question: "What is the main ingredient in guacamole?", options: ["Tomato", "Avocado", "Cucumber", "Pepper"], answer: 1 },
    { question: "What country has the most pyramids?", options: ["Egypt", "Mexico", "Sudan", "Peru"], answer: 2 },
    { question: "How many colors are in a rainbow?", options: ["5", "6", "7", "8"], answer: 2 },
    { question: "Who wrote Romeo and Juliet?", options: ["Dickens", "Shakespeare", "Austen", "Hemingway"], answer: 1 },
    { question: "What is the largest mammal in the world?", options: ["Elephant", "Blue Whale", "Giraffe", "Hippo"], answer: 1 },
    { question: "What year did World War II end?", options: ["1943", "1944", "1945", "1946"], answer: 2 },
];

let remainingWYR = [];
let remainingTrivia = [];

const shuffleArray = (array) => {
    const arr = [...array];
    for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
};

export const getRandomWYR = () => {
    if (remainingWYR.length === 0) {
        remainingWYR = shuffleArray(WOULD_YOU_RATHER);
    }
    return remainingWYR.pop();
};

export const getRandomTrivia = () => {
    if (remainingTrivia.length === 0) {
        remainingTrivia = shuffleArray(TRIVIA_QUESTIONS);
    }
    return remainingTrivia.pop();
};
