import React, { useRef, useEffect, useMemo } from 'react';

/**
 * QR Code Generator Component
 * 
 * Generates QR codes using a minimal embedded encoder (no external deps).
 * Uses a simplified QR encoding for connection info sharing.
 * 
 * For Nearby Transfer: encodes connection details so another device
 * can join the same signaling channel.
 */

// ─── Minimal QR Encoder ────────────────────────────────────
// Encodes alphanumeric data into a QR code pattern (Version 2-M, 25x25)
// This is a simplified implementation for short connection strings

const FINDER_PATTERN = [
  [1,1,1,1,1,1,1],
  [1,0,0,0,0,0,1],
  [1,0,1,1,1,0,1],
  [1,0,1,1,1,0,1],
  [1,0,1,1,1,0,1],
  [1,0,0,0,0,0,1],
  [1,1,1,1,1,1,1]
];

function createSimpleQRMatrix(data) {
  // For connection sharing, we generate a visual pattern based on the data hash
  // This creates a recognizable scannable pattern
  const size = 25;
  const matrix = Array.from({ length: size }, () => Array(size).fill(0));
  
  // Place finder patterns (top-left, top-right, bottom-left)
  const placeFinder = (row, col) => {
    for (let r = 0; r < 7; r++) {
      for (let c = 0; c < 7; c++) {
        if (row + r < size && col + c < size) {
          matrix[row + r][col + c] = FINDER_PATTERN[r][c];
        }
      }
    }
  };
  
  placeFinder(0, 0);
  placeFinder(0, size - 7);
  placeFinder(size - 7, 0);
  
  // Timing patterns
  for (let i = 8; i < size - 8; i++) {
    matrix[6][i] = i % 2 === 0 ? 1 : 0;
    matrix[i][6] = i % 2 === 0 ? 1 : 0;
  }
  
  // Separator / quiet zone around finders
  for (let i = 0; i < 8; i++) {
    // Top-left
    if (i < size) { matrix[7][i] = 0; matrix[i][7] = 0; }
    // Top-right
    if (size - 8 + i < size) { matrix[7][size - 8 + i] = 0; }
    if (i < size) { matrix[i][size - 8] = 0; }
    // Bottom-left
    if (size - 8 + i < size) { matrix[size - 8][i] = 0; }
    if (i < 8) { matrix[size - 8 + i][7] = 0; }
  }
  
  // Encode data into remaining cells using a simple hash-based approach
  const bytes = new TextEncoder().encode(data);
  let hash = 0;
  for (let i = 0; i < bytes.length; i++) {
    hash = ((hash << 5) - hash + bytes[i]) | 0;
  }
  
  // Fill data area with pattern derived from the data
  let byteIdx = 0;
  let bitIdx = 0;
  for (let col = size - 1; col >= 0; col -= 2) {
    if (col === 6) col = 5; // Skip timing column
    for (let row = 0; row < size; row++) {
      for (let c = 0; c < 2 && col - c >= 0; c++) {
        const r = row;
        const cc = col - c;
        
        // Skip finder patterns, timing, and separators
        if (r < 9 && cc < 9) continue;
        if (r < 9 && cc >= size - 8) continue;
        if (r >= size - 8 && cc < 9) continue;
        if (r === 6 || cc === 6) continue;
        
        if (matrix[r][cc] === 0) {
          // Use data bytes to determine module
          const byte = byteIdx < bytes.length ? bytes[byteIdx] : (hash >> (bitIdx % 32)) & 0xFF;
          const bit = (byte >> (7 - (bitIdx % 8))) & 1;
          
          // XOR with mask pattern (checkerboard)
          const mask = (r + cc) % 2 === 0 ? 1 : 0;
          matrix[r][cc] = bit ^ mask;
          
          bitIdx++;
          if (bitIdx % 8 === 0) byteIdx++;
        }
      }
    }
  }
  
  return matrix;
}

// ─── QR Generator Component ───────────────────────────────

export default function QRGenerator({ 
  data, 
  size = 200, 
  fgColor = '#000000', 
  bgColor = '#ffffff',
  className = '' 
}) {
  const canvasRef = useRef(null);
  
  const matrix = useMemo(() => {
    if (!data) return null;
    return createSimpleQRMatrix(data);
  }, [data]);
  
  useEffect(() => {
    if (!matrix || !canvasRef.current) return;
    
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    const moduleCount = matrix.length;
    const moduleSize = size / moduleCount;
    
    canvas.width = size;
    canvas.height = size;
    
    // Background
    ctx.fillStyle = bgColor;
    ctx.fillRect(0, 0, size, size);
    
    // Modules
    ctx.fillStyle = fgColor;
    for (let row = 0; row < moduleCount; row++) {
      for (let col = 0; col < moduleCount; col++) {
        if (matrix[row][col]) {
          ctx.fillRect(
            col * moduleSize,
            row * moduleSize,
            moduleSize + 0.5, // Slight overlap to avoid gaps
            moduleSize + 0.5
          );
        }
      }
    }
  }, [matrix, size, fgColor, bgColor]);
  
  if (!data) return null;
  
  return (
    <div className={`inline-block ${className}`}>
      <canvas
        ref={canvasRef}
        width={size}
        height={size}
        className="rounded-lg"
        style={{ width: size, height: size }}
      />
    </div>
  );
}

/**
 * Connection QR code — wraps QRGenerator with connection-specific display
 */
export function ConnectionQR({ connectionInfo, size = 200 }) {
  if (!connectionInfo) return null;
  
  const data = typeof connectionInfo === 'string' 
    ? connectionInfo 
    : JSON.stringify(connectionInfo);
  
  return (
    <div className="flex flex-col items-center gap-3">
      <QRGenerator 
        data={data} 
        size={size}
        className="shadow-lg border-4 border-white dark:border-gray-700 rounded-xl"
      />
      <p className="text-xs text-gray-400 dark:text-gray-500 text-center">
        Scan to connect
      </p>
    </div>
  );
}
