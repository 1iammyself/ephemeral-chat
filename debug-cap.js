const Cap = require('@cap.js/server');

const cap = new Cap({
    tokens_per_challenge: 1,
    secret: 'test-secret'
});

async function test() {
    console.log('Calling createChallenge...');
    const challenge = await cap.createChallenge();
    console.log('Resolved challenge:', challenge);
    console.log('Type:', typeof challenge);
}

test().catch(console.error);
