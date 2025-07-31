/**
 * Simple test script to verify the Ephemeral Chat application
 */

const { spawn } = require('child_process');
const path = require('path');

console.log('🚀 Starting Ephemeral Chat Application Test...\n');

// Start the server
console.log('📡 Starting server...');
const server = spawn('node', ['server/index.js'], {
  cwd: __dirname,
  stdio: 'pipe'
});

server.stdout.on('data', (data) => {
  console.log(`[SERVER] ${data.toString().trim()}`);
});

server.stderr.on('data', (data) => {
  console.error(`[SERVER ERROR] ${data.toString().trim()}`);
});

// Wait a bit for server to start, then start client
setTimeout(() => {
  console.log('\n🎨 Starting client...');
  const client = spawn('npm', ['run', 'dev'], {
    cwd: path.join(__dirname, 'client'),
    stdio: 'pipe',
    shell: true
  });

  client.stdout.on('data', (data) => {
    console.log(`[CLIENT] ${data.toString().trim()}`);
  });

  client.stderr.on('data', (data) => {
    console.error(`[CLIENT ERROR] ${data.toString().trim()}`);
  });

  // Handle cleanup
  process.on('SIGINT', () => {
    console.log('\n🛑 Shutting down...');
    server.kill();
    client.kill();
    process.exit(0);
  });

}, 3000);

console.log('\n📋 Application Features:');
console.log('✅ Anonymous chat rooms with 6-digit codes');
console.log('✅ Real-time messaging with Socket.IO');
console.log('✅ Message TTL (auto-delete after time)');
console.log('✅ Room passwords for security');
console.log('✅ Rate limiting and input sanitization');
console.log('✅ Responsive React frontend with Tailwind CSS');
console.log('✅ Redis support for enhanced features');
console.log('\n🌐 Access the app at: http://localhost:5173');
console.log('📡 Server API at: http://localhost:3001');
console.log('\nPress Ctrl+C to stop the application.\n');
