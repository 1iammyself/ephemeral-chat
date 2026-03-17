const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const { logger } = require('./utils');

let relayProcess = null;
let activeTransfers = new Set();
let stopTimeout = null;
let pendingStartPromise = null;

// Rate limiting: max concurrent transfers per socket
const MAX_TRANSFERS_PER_SOCKET = 5;
const transferCountBySocket = new Map(); // socketId → count

function startRelayServer() {
    if (process.env.VITE_FILE_SERVER_URL) {
        logger.info(`[relay] External file server configured at ${process.env.VITE_FILE_SERVER_URL}. Skipping local spawn.`);
        return Promise.resolve();
    }

    if (relayProcess) {
        // If there's a pending stop, cancel it because we are needed again
        if (stopTimeout) {
            clearTimeout(stopTimeout);
            stopTimeout = null;
            logger.info('[relay] Idle shutdown cancelled, server remains active.');
        }
        return Promise.resolve();
    }

    if (pendingStartPromise) {
        return pendingStartPromise;
    }

    const relayPort = parseInt(process.env.E2ECP_RELAY_PORT || '8080', 10);
    const rootDir = path.resolve(__dirname, '..');
    const e2ecpDir = path.join(rootDir, 'e2ecp');

    const cmd = 'go';
    const args = ['run', 'main.go', 'serve', '--port', relayPort.toString()];

    logger.info(`🚀 Starting e2ecp relay service (FORCED GO RUN) on port ${relayPort}...`);

    pendingStartPromise = new Promise((resolve, reject) => {
        try {
            const cwd = e2ecpDir;

            relayProcess = spawn(cmd, args, {
                cwd: cwd,
                env: { ...process.env, PORT: relayPort.toString() },
                stdio: 'pipe',
                shell: true
            });

            relayProcess.stdout.on('data', (data) => {
                const msg = data.toString().trim();
                if (msg) {
                    logger.info(`[e2ecp] ${msg}`);
                    if (msg.includes('Relay server is ready')) {
                        if (pendingStartPromise) {
                            resolve();
                            pendingStartPromise = null;
                        }
                    }
                }
            });

            relayProcess.stderr.on('data', (data) => {
                const msg = data.toString().trim();
                if (msg) logger.error(`[e2ecp] ${msg}`);
            });

            relayProcess.on('close', (code) => {
                logger.warn(`[e2ecp] process exited with code ${code}`);
                relayProcess = null;
                if (pendingStartPromise) {
                    // If we were waiting for start and it closed, reject
                    // However, usually close happens much later. 
                    // If code != 0 and we are still pending, reject.
                    pendingStartPromise = null;
                    // reject(new Error(`Process exited with code ${code}`)); 
                    // Use resolve to avoid crashing the caller, but log error
                }
            });

            relayProcess.on('error', (err) => {
                logger.error(`[e2ecp] failed to start: ${err.message}`);
                relayProcess = null;
                if (pendingStartPromise) {
                    reject(err);
                    pendingStartPromise = null;
                }
            });

        } catch (error) {
            logger.error('Failed to spawn e2ecp process:', error);
            reject(error);
            pendingStartPromise = null;
        }
    });

    return pendingStartPromise;
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

async function registerTransfer(socketId) {
    const count = transferCountBySocket.get(socketId) || 0;
    if (count >= MAX_TRANSFERS_PER_SOCKET) {
        throw new Error(`Transfer rate limit exceeded: max ${MAX_TRANSFERS_PER_SOCKET} concurrent transfers per connection`);
    }
    transferCountBySocket.set(socketId, count + 1);
    activeTransfers.add(socketId + ':' + Date.now());
    await startRelayServer();
}

function unregisterTransfer(socketId) {
    // Remove one entry for this socket
    const transferKey = [...activeTransfers].find(k => k.startsWith(socketId + ':'));
    if (transferKey) activeTransfers.delete(transferKey);

    const count = transferCountBySocket.get(socketId) || 0;
    if (count <= 1) {
        transferCountBySocket.delete(socketId);
    } else {
        transferCountBySocket.set(socketId, count - 1);
    }
    checkIdle();
}

function clearSocketTransfers(socketId) {
    for (const key of [...activeTransfers]) {
        if (key.startsWith(socketId + ':')) activeTransfers.delete(key);
    }
    transferCountBySocket.delete(socketId);
    checkIdle();
}

function checkIdle() {
    if (activeTransfers.size === 0 && relayProcess && !stopTimeout) {
        // logger.info('[relay] No active transfers. Scheduling shutdown in 30s...');
        stopTimeout = setTimeout(() => {
            if (activeTransfers.size === 0 && relayProcess) {
                logger.info('[relay] Server idle for 30s, shutting down.');
                stopRelayServer();
            }
            stopTimeout = null;
        }, 30000);
    }
}

// Graceful shutdown — ensure child process is killed on server exit
function setupGracefulShutdown() {
    const shutdown = () => {
        if (relayProcess) {
            logger.info('[relay] Graceful shutdown: stopping e2ecp relay');
            stopRelayServer();
        }
    };
    process.once('SIGTERM', shutdown);
    process.once('SIGINT', shutdown);
    process.once('exit', shutdown);
}

setupGracefulShutdown();

module.exports = { startRelayServer, stopRelayServer, registerTransfer, unregisterTransfer, clearSocketTransfers };
