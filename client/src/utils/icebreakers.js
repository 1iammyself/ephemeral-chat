export const ICEBREAKERS = [
    "What's the most interesting thing you've read or seen this week?",
    "If you could have any superpower, what would it be?",
    "What is your favorite travel destination?",
    "Coffee or tea? And how do you take it?",
    "What's a hobby you've always wanted to pick up?",
    "If you could have dinner with any historical figure, who would it be?",
    "What's the best piece of advice you've ever received?",
    "Beach vacation or mountain retreat?",
    "What's your favorite movie of all time?",
    "If you were a vegetable, what would you be?",
    "What's the last song you listened to?",
    "Do you have any pets?",
    "What's your go-to comfort food?",
    "If you could live anywhere in the world, where would it be?",
    "What is your biggest fear?",
    "What was your first job?",
    "Are you a morning person or a night owl?",
    "What's your favorite season?",
    "Do you speak any other languages?",
    "What is something you are proud of?"
];

export const getRandomIcebreaker = () => {
    return ICEBREAKERS[Math.floor(Math.random() * ICEBREAKERS.length)];
};
