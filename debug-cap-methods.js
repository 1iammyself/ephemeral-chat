const Cap = require('@cap.js/server');

const cap = new Cap({
    tokens_per_challenge: 1,
    secret: 'test-secret'
});

console.log('Cap instance keys:', Object.keys(cap));
console.log('Cap prototype keys:', Object.getOwnPropertyNames(Object.getPrototypeOf(cap)));
