import React, { useRef, useState, useCallback, useEffect } from 'react';
import { Camera, X, SwitchCamera, Loader2 } from 'lucide-react';

/**
 * QR Code Scanner Component
 * 
 * Uses the device camera to scan QR-like visual patterns.
 * For Nearby Transfer: reads connection info from QR codes displayed
 * by other devices to join the same signaling channel.
 * 
 * Uses native BarcodeDetector API where available,
 * falls back to manual connection code entry.
 */

export default function QRScanner({ onScan, onClose, isOpen }) {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);
  const animFrameRef = useRef(null);
  const [error, setError] = useState(null);
  const [isStarting, setIsStarting] = useState(false);
  const [facingMode, setFacingMode] = useState('environment');
  const [manualCode, setManualCode] = useState('');
  const [hasBarcodeDetector, setHasBarcodeDetector] = useState(false);

  useEffect(() => {
    // Check for BarcodeDetector support
    setHasBarcodeDetector('BarcodeDetector' in window);
  }, []);

  const stopCamera = useCallback(() => {
    if (animFrameRef.current) {
      cancelAnimationFrame(animFrameRef.current);
      animFrameRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
  }, []);

  const startCamera = useCallback(async () => {
    setIsStarting(true);
    setError(null);
    
    try {
      stopCamera();
      
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode,
          width: { ideal: 640 },
          height: { ideal: 480 }
        }
      });
      
      streamRef.current = stream;
      
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      
      // If BarcodeDetector is available, start scanning
      if ('BarcodeDetector' in window) {
        const detector = new BarcodeDetector({ formats: ['qr_code'] });
        
        const scan = async () => {
          if (!videoRef.current || !streamRef.current) return;
          
          try {
            const barcodes = await detector.detect(videoRef.current);
            if (barcodes.length > 0) {
              const value = barcodes[0].rawValue;
              if (value && onScan) {
                onScan(value);
                stopCamera();
                return;
              }
            }
          } catch {
            // Detection failed, try again
          }
          
          animFrameRef.current = requestAnimationFrame(scan);
        };
        
        animFrameRef.current = requestAnimationFrame(scan);
      }
      
      setIsStarting(false);
    } catch (err) {
      setError(err.name === 'NotAllowedError' 
        ? 'Camera permission denied. Please allow camera access.'
        : 'Failed to start camera. Try entering the code manually.');
      setIsStarting(false);
    }
  }, [facingMode, onScan, stopCamera]);

  useEffect(() => {
    if (isOpen) {
      startCamera();
    }
    return () => stopCamera();
  }, [isOpen, startCamera, stopCamera]);

  const toggleCamera = useCallback(() => {
    setFacingMode(prev => prev === 'environment' ? 'user' : 'environment');
  }, []);

  // When facingMode changes, restart camera
  useEffect(() => {
    if (isOpen && streamRef.current) {
      startCamera();
    }
  }, [facingMode]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleManualSubmit = (e) => {
    e.preventDefault();
    if (manualCode.trim() && onScan) {
      onScan(manualCode.trim());
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white dark:bg-gray-800 rounded-2xl w-full max-w-md overflow-hidden shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
            <Camera className="w-5 h-5 text-blue-500" />
            Scan QR Code
          </h3>
          <button
            onClick={() => { stopCamera(); onClose?.(); }}
            className="p-1 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Camera View */}
        <div className="relative aspect-square bg-black">
          {isStarting && (
            <div className="absolute inset-0 flex items-center justify-center bg-gray-900">
              <Loader2 className="w-8 h-8 text-blue-400 animate-spin" />
            </div>
          )}
          
          <video
            ref={videoRef}
            className="w-full h-full object-cover"
            playsInline
            muted
          />
          
          {/* Scan overlay */}
          <div className="absolute inset-0 pointer-events-none">
            <div className="absolute inset-[15%] border-2 border-white/50 rounded-xl">
              {/* Corner accents */}
              <div className="absolute -top-0.5 -left-0.5 w-6 h-6 border-t-3 border-l-3 border-blue-400 rounded-tl-lg" />
              <div className="absolute -top-0.5 -right-0.5 w-6 h-6 border-t-3 border-r-3 border-blue-400 rounded-tr-lg" />
              <div className="absolute -bottom-0.5 -left-0.5 w-6 h-6 border-b-3 border-l-3 border-blue-400 rounded-bl-lg" />
              <div className="absolute -bottom-0.5 -right-0.5 w-6 h-6 border-b-3 border-r-3 border-blue-400 rounded-br-lg" />
            </div>
            
            {/* Scanning line animation */}
            <div className="absolute left-[15%] right-[15%] h-0.5 bg-blue-400/60 animate-pulse"
              style={{ top: '50%' }} />
          </div>
          
          {/* Camera switch button */}
          <button
            onClick={toggleCamera}
            className="absolute top-3 right-3 p-2 bg-black/50 rounded-full text-white hover:bg-black/70 transition-colors"
          >
            <SwitchCamera className="w-5 h-5" />
          </button>

          {error && (
            <div className="absolute inset-0 flex items-center justify-center bg-gray-900/90 p-6">
              <p className="text-red-400 text-sm text-center">{error}</p>
            </div>
          )}
        </div>

        {/* Manual Entry */}
        <div className="p-4 border-t border-gray-200 dark:border-gray-700">
          {!hasBarcodeDetector && (
            <p className="text-xs text-amber-500 dark:text-amber-400 mb-2 text-center">
              QR scanning not supported in this browser. Enter the code manually:
            </p>
          )}
          <form onSubmit={handleManualSubmit} className="flex gap-2">
            <input
              type="text"
              value={manualCode}
              onChange={(e) => setManualCode(e.target.value)}
              placeholder="Enter connection code manually"
              data-allow-copy="true"
              className="flex-1 px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-blue-500"
            />
            <button
              type="submit"
              disabled={!manualCode.trim()}
              className="px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
            >
              Connect
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
