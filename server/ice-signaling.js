/**
 * ICE Signaling — Server-side relay for ICE offers/answers/candidates
 * 
 * The server ONLY forwards signaling messages between peers.
 * It never sees the content of the data channel once established.
 * This is the minimal "matchmaking" needed for P2P hole punching.
 * 
 * @module ice-signaling
 */

/**
 * Attach ICE signaling handlers to a Socket.IO namespace/server.
 * 
 * @param {import('socket.io').Server|import('socket.io').Namespace} io 
 * @param {Object} options
 * @param {Function} options.getRoomMembers - fn(roomCode) → Set<socketId>
 */
function attachICESignaling(io, options = {}) {
  const { getRoomMembers } = options;
  
  io.on('connection', (socket) => {
    
    // Forward ICE offer to a specific peer
    socket.on('ice-offer', (data) => {
      const { roomCode, to, offer } = data;
      
      if (!to || !offer || !roomCode) return;
      
      // Verify both peers are in the same room
      if (getRoomMembers) {
        const members = getRoomMembers(roomCode);
        if (!members || !members.has(socket.id) || !members.has(to)) {
          console.log(`[ICE] Rejected offer: peers not in same room`);
          return;
        }
      }
      
      io.to(to).emit('ice-offer', {
        from: socket.id,
        offer,
        roomCode
      });
    });
    
    // Forward ICE answer to a specific peer
    socket.on('ice-answer', (data) => {
      const { roomCode, to, answer } = data;
      
      if (!to || !answer || !roomCode) return;
      
      if (getRoomMembers) {
        const members = getRoomMembers(roomCode);
        if (!members || !members.has(socket.id) || !members.has(to)) {
          console.log(`[ICE] Rejected answer: peers not in same room`);
          return;
        }
      }
      
      io.to(to).emit('ice-answer', {
        from: socket.id,
        answer,
        roomCode
      });
    });
    
    // Forward ICE candidates
    socket.on('ice-candidate', (data) => {
      const { roomCode, to, candidate } = data;
      
      if (!to || !candidate || !roomCode) return;
      
      if (getRoomMembers) {
        const members = getRoomMembers(roomCode);
        if (!members || !members.has(socket.id) || !members.has(to)) {
          return; // Silently drop — candidates are high-frequency
        }
      }
      
      io.to(to).emit('ice-candidate', {
        from: socket.id,
        candidate,
        roomCode
      });
    });
  });
  
  console.log('[ICE Signaling] Attached to Socket.IO');
}

module.exports = { attachICESignaling };
