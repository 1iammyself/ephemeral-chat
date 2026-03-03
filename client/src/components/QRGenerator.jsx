import React, { useRef, useEffect } from 'react';
import QRCode from 'qrcode';

/**
 * QR Code Generator Component
 * 
 * Generates real, scannable QR codes using the `qrcode` library.
 * Used for Nearby Transfer connection info sharing.
 */

// ─── QR Generator Component ───────────────────────────────

export default function QRGenerator({ 
  data, 
  size = 200, 
  fgColor = '#000000', 
  bgColor = '#ffffff',
  className = '' 
}) {
  const canvasRef = useRef(null);
  
  useEffect(() => {
    if (!data || !canvasRef.current) return;
    
    QRCode.toCanvas(canvasRef.current, data, {
      width: size,
      margin: 2,
      color: {
        dark: fgColor,
        light: bgColor,
      },
      errorCorrectionLevel: 'M',
    }).catch(err => {
      console.error('[QRGenerator] Failed to render QR code:', err);
    });
  }, [data, size, fgColor, bgColor]);
  
  if (!data) return null;
  
  return (
    <div className={`inline-block ${className}`}>
      <canvas
        ref={canvasRef}
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
