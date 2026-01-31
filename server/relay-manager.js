const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const { logger } = require('./utils');

let relayProcess = null;

function startRelayServer() {
    if (relayProcess) {
        logger.info('e2ecp relay service is already running.');
        return;
    }
    const relayPort = 8080; // Hardcoded as per user requirement
    const rootDir = path.resolve(__dirname, '..');
    const e2ecpDir = path.join(rootDir, 'e2ecp');

    // FORCE usage of 'go run' because:
    // 1. User verified it works manually.
    // 2. It serves the fresh 'dist' assets we just built.
    // 3. The implementation of e2ecp.exe might be stale or logic flawed.

    const cmd = 'go';
    const args = ['run', 'main.go', 'serve', '--port', relayPort.toString()];

    logger.info(`🚀 Starting e2ecp relay service (FORCED GO RUN) on port ${relayPort}...`);
    console.log(`[relay-manager] Executing: ${cmd} ${args.join(' ')}`);

    try {
        const cwd = e2ecpDir; // Run inside e2ecp directory for go.mod context

        relayProcess = spawn(cmd, args, {
            cwd: cwd,
            env: { ...process.env, PORT: relayPort.toString() },
            stdio: 'pipe',
            shell: true // Required for Windows
        });

        relayProcess.stdout.on('data', (data) => {
            const msg = data.toString().trim();
            if (msg) logger.info(`[e2ecp] ${msg}`);
        });

        relayProcess.stderr.on('data', (data) => {
            const msg = data.toString().trim();
            if (msg) logger.error(`[e2ecp] ${msg}`);
        });

        relayProcess.on('close', (code) => {
            logger.warn(`[e2ecp] process exited with code ${code}`);
        });

        relayProcess.on('error', (err) => {
            logger.error(`[e2ecp] failed to start: ${err.message}`);
        });

    } catch (error) {
        logger.error('Failed to spawn e2ecp process:', error);
    }
}

function stopRelayServer() {
    if (relayProcess) {
        logger.info('Stopping e2ecp relay service...');
        try {
            if (process.platform === 'win32') {
                spawn('taskkill', ['/pid', relayProcess.pid, '/f', '/t']);
            } else {
                process.kill(relayProcess.pid);
            }
        } catch (e) {
            // ignore if already dead
        }
        relayProcess = null;
    }
}

module.exports = { startRelayServer, stopRelayServer };
