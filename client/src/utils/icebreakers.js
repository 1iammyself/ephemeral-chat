export const ICEBREAKERS = [
    // Mixed from current list (filtered for engagement)
    "If you could have any superpower, what would it be?",
    "If you were a vegetable, what would you be?",
    "Would you rather travel 100 years into the past or 100 years into the future?",
    "Do you believe in aliens? Why or why not?",
    "If you could instantly become an expert in any subject, what would it be?",
    "If you were stranded on a desert island, what three items would you bring?",
    "If you could have any mythical creature as a pet, what would it be?",
    "If you could speak to animals, what's the first thing you'd ask?",
    "If you were a superhero, what would your name and outfit be?",
    "What's the most spontaneous thing you've ever done?",
    "What is your 'guilty pleasure' song or movie?",
    "What's the best thing you've got going on in your life at the moment?",
    "What incredibly common thing have you never done?",
    "What food do you love that a lot of people might find a little odd?",
    "If you could start a charity, what would it be for?",
    "What was the funniest thing you've seen recently online?",
    "What takes a lot of time but is totally worth it?",
    "What is the most amazing fact you know?",
    "What website or app doesn't exist, but you really wish it did?",
    "What's your favorite type of day? (weather, temp, etc.)",
    "When someone finds out what you do, or where you are from, what question do they always ask you?",
    "Are you more productive at night or in the morning?",
    "What scene in a movie always gives you goosebumps every time you watch it?",
    "What topic could you give a 20-minute presentation on without any preparation?",
    "What's something that a lot of people are missing out on because they don't know about it?",
    "What are some of your guilty pleasures?",
    "Who is the most interesting person you've met and talked with?",
    "How did you spend the money from your very first job?",
    "What do you wish someone taught you a long time ago?",
    "Do you think you rely too heavily on your phone? Why or why not?",
    "What subjects should be taught in school but aren't?",
    "What's the biggest vehicle you've driven?",
    "What songs would be played on a loop in hell?",
    "What kind of challenges are you facing these days?",
    "What do you highly recommend to most people you meet?",
    "Do you think you have a pretty good work-life balance?",
    "What was the last thing you were really excited about?",
    "What does your perfect breakfast look like?",
    "If you could choose your dreams, what would you prefer to dream about?",
    "What tells you the most about a person?",
    "What book had the most significant impact on you?",
    "What is the best event you've attended?",
    "What's your favorite food combination?",
    "What's the weirdest way you have met someone?",
    "What's the most amazing natural occurrence you've witnessed?",
    "How did you get that scar of yours?",
    "What do you wish was illegal?",
    "If someone came up to you and said 'Hey, do that thing you do!', what thing would pop into your head first?",
    "Who is the most intelligent or creative person you know?",
    "What wastes the most time in your day to day life?",
    "What's a problem you have, that might be entirely unique to you?",
    "Would you ever try space tourism, if you had the money for it?",
    "What are you grateful for?",
    "What hobby would you be a lot of fun to get into?",
    "What do you resent paying for most?",
    "What's the best or worst prank you've played on someone?",
    "What motivates you?",
    "Where are five places you really want to visit before you die?",
    "What skill or talent would you most like to learn?",
    "What weird thing do you have nostalgia for?",
    "What do you wish your phone could do?"
];

let remainingIcebreakers = [];

/**
 * Shuffles an array in place using Durstenfeld shuffle algorithm
 */
const shuffleArray = (array) => {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
};

export const getRandomIcebreaker = () => {
    if (remainingIcebreakers.length === 0) {
        remainingIcebreakers = shuffleArray([...ICEBREAKERS]);
    }
    return remainingIcebreakers.pop();
};
