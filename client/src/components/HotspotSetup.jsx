import React, { useState, useEffect } from 'react';
import { X, Wifi, WifiOff, QrCode, Copy, Check, Smartphone, Monitor, AlertCircle, Loader2 } from 'lucide-react';
import Proximity from '../plugins/proximity';
import { isCapacitor, isElectron, isAndroid } from '../utils/platform';

/**
 * HotspotSetup — Guides user through creating/joining a hotspot
 * 
 * On Android: Can programmatically create a local-only hotspot
 * On Desktop: Shows instructions to create hotspot manually or connect to one
 */
const HotspotSetup = ({ onClose }) => {
  const [mode, setMode] = useState(null); // 'create' | 'join'
  const [hotspotInfo, setHotspotInfo] = useState(null);
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState(null);
  const [copied, setCopied] = useState(false);
  const [wifiInfo, setWifiInfo] = useState(null);

  const canCreateHotspot = isCapacitor && isAndroid;

  // Get current Wi-Fi info
  useEffect(() => {
    (async () => {
      const info = await Proximity.getWifiInfo();
      setWifiInfo(info);
    })();
  }, []);

  // Create hotspot (Android only)
  const handleCreateHotspot = async () => {
    setIsCreating(true);
    setError(null);
    try {
      // Request permissions first
      const perms = await Proximity.checkPermissions();
      if (!perms.wifi || !perms.location) {
        await Proximity.requestLocationPermission();
      }

      const result = await Proximity.createHotspot();
      if (result.success) {
        setHotspotInfo({ ssid: result.ssid, password: result.password });
      } else {
        setError(result.error || 'Failed to create hotspot');
      }
    } catch (e) {
      setError(e.message || 'Failed to create hotspot');
    } finally {
      setIsCreating(false);
    }
  };

  // Stop hotspot
  const handleStopHotspot = async () => {
    await Proximity.stopHotspot();
    setHotspotInfo(null);
  };

  // Copy text
  const handleCopy = (text) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl max-w-md w-full overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="bg-gradient-to-r from-purple-500 to-indigo-600 px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center">
              <Wifi className="w-5 h-5 text-white" />
            </div>
            <div>
              <h3 className="text-white font-bold">Hotspot Setup</h3>
              <p className="text-white/80 text-xs">Connect without shared Wi-Fi</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-white/20 text-white transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6">
          {/* Current Wi-Fi Info */}
          {wifiInfo && (
            <div className="mb-4 p-3 bg-gray-50 dark:bg-gray-700/50 rounded-xl text-xs text-gray-600 dark:text-gray-400">
              <p>
                <span className="font-medium">Current network:</span>{' '}
                {wifiInfo.ssid || 'Not connected'}
              </p>
              {wifiInfo.ip && (
                <p>
                  <span className="font-medium">IP:</span> {wifiInfo.ip}
                </p>
              )}
            </div>
          )}

          {/* Mode Selection */}
          {!mode && !hotspotInfo && (
            <div className="space-y-3">
              <p className="text-sm text-gray-600 dark:text-gray-300 text-center mb-4">
                When devices aren't on the same Wi-Fi network, create a hotspot to connect them.
              </p>

              {canCreateHotspot && (
                <button
                  onClick={() => { setMode('create'); handleCreateHotspot(); }}
                  className="w-full p-4 rounded-xl border-2 border-purple-200 dark:border-purple-800 hover:border-purple-400 dark:hover:border-purple-600 hover:bg-purple-50 dark:hover:bg-purple-900/20 transition-all text-left flex items-center gap-3"
                >
                  <div className="w-12 h-12 rounded-xl bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center flex-shrink-0">
                    <Smartphone className="w-6 h-6 text-purple-500" />
                  </div>
                  <div>
                    <p className="font-semibold text-gray-900 dark:text-white text-sm">
                      Create Hotspot
                    </p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      This device becomes the access point
                    </p>
                  </div>
                </button>
              )}

              <button
                onClick={() => setMode('join')}
                className="w-full p-4 rounded-xl border-2 border-indigo-200 dark:border-indigo-800 hover:border-indigo-400 dark:hover:border-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 transition-all text-left flex items-center gap-3"
              >
                <div className="w-12 h-12 rounded-xl bg-indigo-100 dark:bg-indigo-900/30 flex items-center justify-center flex-shrink-0">
                  <WifiOff className="w-6 h-6 text-indigo-500" />
                </div>
                <div>
                  <p className="font-semibold text-gray-900 dark:text-white text-sm">
                    {canCreateHotspot ? 'Join a Hotspot' : 'Connect to Same Network'}
                  </p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    {canCreateHotspot
                      ? 'Connect to another device\'s hotspot'
                      : 'Ensure both devices are on the same Wi-Fi'}
                  </p>
                </div>
              </button>
            </div>
          )}

          {/* Creating Hotspot */}
          {mode === 'create' && isCreating && !hotspotInfo && (
            <div className="text-center py-8">
              <Loader2 className="w-10 h-10 mx-auto text-purple-500 animate-spin mb-3" />
              <p className="text-sm text-gray-600 dark:text-gray-300">
                Creating hotspot...
              </p>
            </div>
          )}

          {/* Hotspot Created */}
          {hotspotInfo && (
            <div className="space-y-4">
              <div className="text-center">
                <div className="w-12 h-12 mx-auto rounded-2xl bg-green-100 dark:bg-green-900/30 flex items-center justify-center mb-2">
                  <Wifi className="w-6 h-6 text-green-500" />
                </div>
                <p className="font-semibold text-gray-900 dark:text-white">
                  Hotspot Active!
                </p>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  Share these credentials with the other device
                </p>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-700/50 rounded-xl">
                  <div>
                    <p className="text-xs text-gray-500 dark:text-gray-400">Network Name (SSID)</p>
                    <p className="font-mono font-bold text-gray-900 dark:text-white">
                      {hotspotInfo.ssid}
                    </p>
                  </div>
                  <button
                    onClick={() => handleCopy(hotspotInfo.ssid)}
                    className="p-1.5 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
                  >
                    {copied ? <Check className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4 text-gray-400" />}
                  </button>
                </div>

                <div className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-700/50 rounded-xl">
                  <div>
                    <p className="text-xs text-gray-500 dark:text-gray-400">Password</p>
                    <p className="font-mono font-bold text-gray-900 dark:text-white">
                      {hotspotInfo.password}
                    </p>
                  </div>
                  <button
                    onClick={() => handleCopy(hotspotInfo.password)}
                    className="p-1.5 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
                  >
                    {copied ? <Check className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4 text-gray-400" />}
                  </button>
                </div>
              </div>

              <p className="text-xs text-gray-500 dark:text-gray-400 text-center">
                After the other device connects to this hotspot, both devices will appear in the Nearby list.
              </p>

              <div className="flex gap-2">
                <button
                  onClick={handleStopHotspot}
                  className="flex-1 py-2.5 rounded-xl font-medium text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 hover:bg-red-100 dark:hover:bg-red-900/40 transition-colors"
                >
                  Stop Hotspot
                </button>
                <button
                  onClick={onClose}
                  className="flex-1 py-2.5 rounded-xl font-medium text-sm text-white bg-purple-500 hover:bg-purple-600 transition-colors"
                >
                  Done
                </button>
              </div>
            </div>
          )}

          {/* Join Instructions */}
          {mode === 'join' && (
            <div className="space-y-4">
              <div className="text-center mb-2">
                <p className="font-semibold text-gray-900 dark:text-white text-sm">
                  How to Connect
                </p>
              </div>

              <div className="space-y-3">
                <div className="flex gap-3 items-start">
                  <div className="w-6 h-6 rounded-full bg-indigo-100 dark:bg-indigo-900/30 flex items-center justify-center flex-shrink-0 text-xs font-bold text-indigo-600 dark:text-indigo-400">1</div>
                  <p className="text-sm text-gray-600 dark:text-gray-300">
                    {canCreateHotspot
                      ? 'Ask the other device to create a hotspot and share the SSID & password'
                      : 'Connect both devices to the same Wi-Fi network'}
                  </p>
                </div>
                <div className="flex gap-3 items-start">
                  <div className="w-6 h-6 rounded-full bg-indigo-100 dark:bg-indigo-900/30 flex items-center justify-center flex-shrink-0 text-xs font-bold text-indigo-600 dark:text-indigo-400">2</div>
                  <p className="text-sm text-gray-600 dark:text-gray-300">
                    {canCreateHotspot
                      ? 'Open your Wi-Fi settings and connect to the hotspot'
                      : 'If you can\'t use Wi-Fi, ask the Android device to create a hotspot'}
                  </p>
                </div>
                <div className="flex gap-3 items-start">
                  <div className="w-6 h-6 rounded-full bg-indigo-100 dark:bg-indigo-900/30 flex items-center justify-center flex-shrink-0 text-xs font-bold text-indigo-600 dark:text-indigo-400">3</div>
                  <p className="text-sm text-gray-600 dark:text-gray-300">
                    Once connected, come back here — devices will auto-discover each other
                  </p>
                </div>
              </div>

              {!canCreateHotspot && (
                <div className="p-3 bg-amber-50 dark:bg-amber-900/20 rounded-xl text-xs text-amber-700 dark:text-amber-400 flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                  <p>
                    {isElectron
                      ? 'Desktop apps cannot create hotspots programmatically. Use your OS settings or ask the mobile device to create one.'
                      : 'The web version cannot create hotspots. Use the native app or connect both devices to the same Wi-Fi.'}
                  </p>
                </div>
              )}

              <div className="flex gap-2">
                <button
                  onClick={() => setMode(null)}
                  className="flex-1 py-2.5 rounded-xl font-medium text-sm text-gray-600 dark:text-gray-400 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
                >
                  Back
                </button>
                <button
                  onClick={onClose}
                  className="flex-1 py-2.5 rounded-xl font-medium text-sm text-white bg-indigo-500 hover:bg-indigo-600 transition-colors"
                >
                  Got It
                </button>
              </div>
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="mt-4 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl text-sm text-red-600 dark:text-red-400 flex items-center gap-2">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              {error}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default HotspotSetup;
