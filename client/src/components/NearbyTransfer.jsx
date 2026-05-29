import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  ArrowLeft, Radio, Wifi, WifiOff, Monitor, Smartphone, Tablet,
  Send, FileUp, MessageSquare, X, CheckCircle2, XCircle, AlertCircle,
  Loader2, Zap, Share2, QrCode, Camera, Files, Lock
} from 'lucide-react';
import StegoModal from './StegoModal';
import { useNearbyPeers } from '../hooks/useNearbyPeers';
import { useProximityTransfer } from '../hooks/useProximityTransfer';
import TransferProgress from './TransferProgress';
import PairingCodeModal from './PairingCodeModal';
import HotspotSetup from './HotspotSetup';
import { ConnectionQR } from './QRGenerator';
import QRScanner from './QRScanner';
import { isCapacitor, isElectron } from '../utils/platform';
import { formatBytes, formatSpeed, decompressPayload } from '../utils/proximity';

const NearbyTransfer = () => {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const [nickname, setNickname] = useState(
    localStorage.getItem('ephchat-nearby-nickname') || ''
  );
  const [isSetup, setIsSetup] = useState(false);
  const [showHotspot, setShowHotspot] = useState(false);
  const [showPairing, setShowPairing] = useState(false);
  const [connectingPeerId, setConnectingPeerId] = useState(null);
  const [selectedPeer, setSelectedPeer] = useState(null);
  const [textInput, setTextInput] = useState('');
  const [sendMode, setSendMode] = useState('file'); // 'file' | 'text'
  const [showQR, setShowQR] = useState(false);
  const [showScanner, setShowScanner] = useState(false);
  const [offlineStep, setOfflineStep] = useState('none');
  const [offlinePayload, setOfflinePayload] = useState(null);
  const [offlinePeerId, setOfflinePeerId] = useState(null);
  const [batchFiles, setBatchFiles] = useState([]);
  const [isBatchSending, setIsBatchSending] = useState(false);
  const [connectionQuality, setConnectionQuality] = useState(null);
  const [pendingImageFile, setPendingImageFile] = useState(null);
  const [showStegoModal, setShowStegoModal] = useState(false);
  const fileInputRef = useRef(null);
  const batchInputRef = useRef(null);
  const statsTimerRef = useRef(null);

  const {
    peers,
    isDiscovering,
    isConnected,
    error: discoveryError,
    connectedPeer,
    pairingCode,
    startDiscovery,
    stopDiscovery,
    connectToPeer,
    disconnectFromPeer,
    setConnectedPeer,
    setPairingCode,
    service
  } = useNearbyPeers();

  const {
    transfers,
    incomingRequest,
    textMessages,
    sendFile,
    sendText,
    acceptTransfer,
    rejectTransfer,
    cancelTransfer,
    downloadFile,
    clearTransfer,
    clearCompleted
  } = useProximityTransfer();

  // Poll connection quality when connected
  useEffect(() => {
    if (connectedPeer && service) {
      const pollStats = async () => {
        const stats = await service.getConnectionStats(connectedPeer.id);
        if (stats) setConnectionQuality(stats);
      };
      pollStats();
      statsTimerRef.current = setInterval(pollStats, 3000);
      return () => clearInterval(statsTimerRef.current);
    } else {
      setConnectionQuality(null);
    }
  }, [connectedPeer, service]);

  // Quality indicator helper
  const getQualityIndicator = () => {
    if (!connectionQuality) return null;
    const { quality, rtt } = connectionQuality;
    const colors = {
      excellent: 'text-green-500',
      good: 'text-green-400',
      fair: 'text-yellow-500',
      poor: 'text-red-500',
      unknown: 'text-gray-400'
    };
    const bars = {
      excellent: 4, good: 3, fair: 2, poor: 1, unknown: 0
    };
    const count = bars[quality] || 0;
    return (
      <div className="flex items-center gap-1" title={`RTT: ${rtt >= 0 ? rtt + 'ms' : 'N/A'}`}>
        {[1, 2, 3, 4].map(i => (
          <div
            key={i}
            className={`w-1 rounded-full ${i <= count ? colors[quality] : 'bg-gray-300 dark:bg-gray-600'}`}
            style={{ height: 4 + i * 3 }}
          />
        ))}
        {rtt >= 0 && (
          <span className="text-[10px] text-gray-500 dark:text-gray-400 ml-0.5">{rtt}ms</span>
        )}
      </div>
    );
  };

  // Start discovery with nickname
  const handleStart = async () => {
    if (!nickname.trim()) return;
    localStorage.setItem('ephchat-nearby-nickname', nickname.trim());
    await startDiscovery(nickname.trim());
    setIsSetup(true);
  };

  // Connect to a peer
  const handleConnectPeer = async (peerId) => {
    setConnectingPeerId(peerId);
    try {
      const result = await connectToPeer(peerId);
      setSelectedPeer(peers.find(p => p.id === peerId));
      if (result.pairingCode && result.pairingCode !== '------') {
        setShowPairing(true);
      }
    } catch (e) {
      console.error('Failed to connect:', e);
    } finally {
      setConnectingPeerId(null);
    }
  };

  // Send file
  const handleFileSelect = async (e) => {
    const file = e.target.files?.[0];
    if (!file || !connectedPeer) return;
    e.target.value = '';
    if (file.type.startsWith('image/')) {
      setPendingImageFile(file);
    } else {
      try { await sendFile(connectedPeer.id, file); }
      catch (err) { console.error('Send failed:', err); }
    }
  };

  const handleSendImageAsIs = async () => {
    const file = pendingImageFile;
    setPendingImageFile(null);
    if (!file || !connectedPeer) return;
    try { await sendFile(connectedPeer.id, file); }
    catch (err) { console.error('Send failed:', err); }
  };

  const handleStegoEmbedResult = async (blob) => {
    const original = pendingImageFile;
    setPendingImageFile(null);
    setShowStegoModal(false);
    if (!connectedPeer) return;
    const stegoFile = new File([blob], original.name.replace(/\.[^.]+$/, '.png'), { type: 'image/png' });
    try { await sendFile(connectedPeer.id, stegoFile); }
    catch (err) { console.error('Stego send failed:', err); }
  };

  // Send text
  const handleSendText = () => {
    if (!textInput.trim() || !connectedPeer) return;
    sendText(connectedPeer.id, textInput.trim());
    setTextInput('');
  };

  // Batch file selection
  const handleBatchFileSelect = (e) => {
    const files = Array.from(e.target.files || []);
    if (files.length > 0) {
      setBatchFiles(files);
    }
    e.target.value = '';
  };

  // Batch send
  const handleBatchSend = async () => {
    if (!connectedPeer || batchFiles.length === 0) return;
    setIsBatchSending(true);
    try {
      for (const file of batchFiles) {
        await sendFile(connectedPeer.id, file);
      }
      setBatchFiles([]);
    } catch (err) {
      console.error('Batch send failed:', err);
    } finally {
      setIsBatchSending(false);
    }
  };

  // Create Offline Offer for True Local Connection
  const handleCreateOfflineOffer = async () => {
    if (!service) return;
    setOfflineStep('creating');
    setShowQR(true);
    try {
      const { payload, peerId } = await service.createOfflineOffer();
      setOfflinePayload(payload);
      setOfflinePeerId(peerId);
      setOfflineStep('offer-ready');
    } catch (e) {
      console.error('Failed to create offline offer:', e);
      setOfflineStep('none');
      setShowQR(false);
    }
  };

  // QR scan result
  const handleQRScan = async (data) => {
    try {
      const info = await decompressPayload(data);

      if (info.t === 'offer' && service) {
        setShowScanner(false);
        setOfflineStep('generating-answer');
        setShowQR(true);
        const answerPayload = await service.acceptOfflineOffer(data);
        setOfflinePayload(answerPayload);
        setOfflineStep('answer-ready');
      } else if (info.t === 'answer' && service) {
        setShowScanner(false);
        if (offlinePeerId) {
          setConnectingPeerId(offlinePeerId);
          try {
            const result = await service.finalizeOfflineConnection(data, offlinePeerId);
            const peerInfo = service.peers.get(result.peerId);
            setSelectedPeer(peerInfo);
            setConnectedPeer({ ...peerInfo, pairingCode: result.pairingCode });
            setPairingCode(result.pairingCode);
            if (result.pairingCode && result.pairingCode !== '------') {
              setShowPairing(true);
            }
          } catch (err) {
            console.error('Offline finalization failed:', err);
          }
          setConnectingPeerId(null);
        }
        setOfflineStep('none');
        setShowQR(false);
      } else if (info.deviceId) {
        const existingPeer = peers.find(p => p.id === info.deviceId);
        if (!existingPeer && service) {
          const peerInfo = {
            id: info.deviceId,
            nickname: info.nickname || 'QR Device',
            platform: info.platform || 'unknown',
            deviceType: info.platform === 'electron' ? 'desktop' : 'phone',
            lastSeen: Date.now()
          };
          service.peers.set(info.deviceId, peerInfo);
          service.emit('peer-discovered', peerInfo);
        }
        handleConnectPeer(info.deviceId);
        setShowScanner(false);
      }
    } catch {
      // Not a JSON QR - ignore
    }
  };

  // Stop everything
  const handleStop = () => {
    stopDiscovery();
    setIsSetup(false);
    setSelectedPeer(null);
    setShowPairing(false);
  };

  // Get device icon
  const getDeviceIcon = (peer) => {
    switch (peer.deviceType || peer.platform) {
      case 'desktop':
      case 'electron':
        return Monitor;
      case 'tablet':
        return Tablet;
      case 'phone':
      case 'android':
      default:
        return Smartphone;
    }
  };

  // Get platform label
  const getPlatformLabel = (peer) => {
    switch (peer.platform) {
      case 'electron': return t('nearby.platforms.desktop');
      case 'android': return t('nearby.platforms.android');
      default: return t('nearby.platforms.web');
    }
  };

  return (
    <div className="h-screen flex flex-col bg-gradient-to-br from-cyan-50 to-blue-100 dark:from-gray-900 dark:to-gray-800">
      {/* Header */}
      <header className="flex-shrink-0 bg-white dark:bg-gray-800 shadow-sm border-b border-gray-200 dark:border-gray-700">
        <div className="max-w-2xl mx-auto px-4 pt-10 pb-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              onClick={() => navigate('/')}
              className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
            >
              <ArrowLeft className="w-5 h-5 text-gray-600 dark:text-gray-400" />
            </button>
            <div>
              <h1 className="text-lg font-bold text-gray-900 dark:text-white flex items-center gap-2">
                <Radio className="w-5 h-5 text-cyan-500" />
                {t('nearby.title')}
              </h1>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                {isDiscovering ? (
                  <span className="flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
                    {t('nearby.scanning')}
                  </span>
                ) : t('nearby.direct')}
              </p>
            </div>
          </div>
          {isSetup && (
            <button
              onClick={handleStop}
              className="px-3 py-1.5 text-xs font-medium rounded-lg bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-900/40 transition-colors"
            >
              {t('common.stop')}
            </button>
          )}
        </div>
      </header>

      <main className="flex-1 overflow-y-auto overscroll-contain" style={{ WebkitOverflowScrolling: 'touch' }}>
        <div className="max-w-2xl mx-auto px-4 py-6 space-y-4 pb-safe">
          {/* Setup Screen */}
          {!isSetup ? (
            <div className="space-y-4">
              {/* Info Card */}
              <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-lg border border-gray-100 dark:border-gray-700">
                <div className="text-center space-y-3">
                  <div className="w-16 h-16 mx-auto rounded-2xl bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center">
                    <Radio className="w-8 h-8 text-white" />
                  </div>
                  <h2 className="text-xl font-bold text-gray-900 dark:text-white">
                    {t('nearby.title')}
                  </h2>
                  <p className="text-sm text-gray-500 dark:text-gray-400 max-w-sm mx-auto">
                    {t('nearby.subtitle')}
                  </p>
                </div>

                <div className="mt-6 grid grid-cols-3 gap-3">
                  <div className="text-center p-3 bg-gray-50 dark:bg-gray-700/50 rounded-xl">
                    <Zap className="w-5 h-5 mx-auto text-yellow-500 mb-1" />
                    <p className="text-xs font-medium text-gray-700 dark:text-gray-300">{t('nearby.ultraFast')}</p>
                    <p className="text-[10px] text-gray-500">{t('nearby.wifiSpeed')}</p>
                  </div>
                  <div className="text-center p-3 bg-gray-50 dark:bg-gray-700/50 rounded-xl">
                    <Share2 className="w-5 h-5 mx-auto text-green-500 mb-1" />
                    <p className="text-xs font-medium text-gray-700 dark:text-gray-300">{t('nearby.encrypted')}</p>
                    <p className="text-[10px] text-gray-500">{t('nearby.tlsDtls')}</p>
                  </div>
                  <div className="text-center p-3 bg-gray-50 dark:bg-gray-700/50 rounded-xl">
                    <WifiOff className="w-5 h-5 mx-auto text-purple-500 mb-1" />
                    <p className="text-xs font-medium text-gray-700 dark:text-gray-300">{t('nearby.noServer')}</p>
                    <p className="text-[10px] text-gray-500">{t('nearby.p2p')}</p>
                  </div>
                </div>
              </div>

              {/* Nickname Input */}
              <div className="bg-white dark:bg-gray-800 rounded-2xl p-5 shadow-lg border border-gray-100 dark:border-gray-700">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  {t('nearby.deviceName')}
                </label>
                <input
                  type="text"
                  value={nickname}
                  onChange={(e) => setNickname(e.target.value)}
                  placeholder={t('nearby.deviceNamePlaceholder')}
                  className="w-full px-4 py-3 rounded-xl border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400 focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
                  maxLength={30}
                  onKeyDown={(e) => e.key === 'Enter' && handleStart()}
                />
                <button
                  onClick={handleStart}
                  disabled={!nickname.trim()}
                  className="w-full mt-3 py-3 rounded-xl font-bold text-white bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-600 hover:to-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all transform active:scale-[0.98] shadow-lg shadow-cyan-500/20"
                >
                  <Radio className="inline-block w-4 h-4 mr-2 -mt-0.5" />
                  {t('nearby.startScanning')}
                </button>

                {!isCapacitor && !isElectron && (
                  <p className="mt-3 text-xs text-center text-amber-600 dark:text-amber-400 flex items-center justify-center gap-1">
                    <AlertCircle className="w-3 h-3" />
                    {t('nearby.bestExperience')}
                  </p>
                )}
              </div>
            </div>
          ) : (
            <>
              {/* Discovery Error */}
              {discoveryError && (
                <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl p-3 flex items-center gap-2 text-sm text-red-600 dark:text-red-400">
                  <AlertCircle className="w-4 h-4 flex-shrink-0" />
                  {discoveryError}
                </div>
              )}

              {/* Incoming Transfer Request */}
              {incomingRequest && (
                <div className="bg-cyan-50 dark:bg-cyan-900/20 border-2 border-cyan-300 dark:border-cyan-700 rounded-2xl p-4 animate-pulse-slow">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-semibold text-cyan-800 dark:text-cyan-200 flex items-center gap-2">
                        <FileUp className="w-4 h-4" />
                        {t('nearby.incomingTransfer')}
                      </p>
                      <p className="text-sm text-cyan-600 dark:text-cyan-400 mt-1">
                        {incomingRequest.metadata.name} ({formatBytes(incomingRequest.metadata.size)})
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => acceptTransfer(incomingRequest.transferId)}
                        className="p-2 rounded-lg bg-green-500 hover:bg-green-600 text-white transition-colors"
                      >
                        <CheckCircle2 className="w-5 h-5" />
                      </button>
                      <button
                        onClick={() => rejectTransfer(incomingRequest.transferId)}
                        className="p-2 rounded-lg bg-red-500 hover:bg-red-600 text-white transition-colors"
                      >
                        <XCircle className="w-5 h-5" />
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* Peer List */}
              <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-lg border border-gray-100 dark:border-gray-700 overflow-hidden">
                <div className="px-4 py-3 border-b border-gray-100 dark:border-gray-700 flex items-center justify-between">
                  <h3 className="font-semibold text-gray-900 dark:text-white text-sm">
                    {t('nearby.nearbyDevices')}
                  </h3>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-gray-500 dark:text-gray-400">
                      {peers.length} {t('nearby.found')}
                    </span>
                    {isDiscovering && (
                      <Loader2 className="w-3.5 h-3.5 text-cyan-500 animate-spin" />
                    )}
                  </div>
                </div>

                {peers.length === 0 ? (
                  <div className="p-8 text-center">
                    <Radio className="w-10 h-10 mx-auto text-gray-300 dark:text-gray-600 mb-3 animate-pulse" />
                    <p className="text-sm text-gray-700 dark:text-gray-400">
                      {t('nearby.scanningMsg')}
                    </p>
                    <p className="text-xs text-gray-600 dark:text-gray-500 mt-1">
                      {t('nearby.scanningHint')}
                    </p>
                  </div>
                ) : (
                  <div className="divide-y divide-gray-50 dark:divide-gray-700/50">
                    {peers.map(peer => {
                      const Icon = getDeviceIcon(peer);
                      const isConnecting = connectingPeerId === peer.id;
                      const isSelected = connectedPeer?.id === peer.id;

                      return (
                        <div
                          key={peer.id}
                          className={`px-4 py-3 flex items-center justify-between transition-colors ${isSelected
                            ? 'bg-cyan-50 dark:bg-cyan-900/20'
                            : 'hover:bg-gray-50 dark:hover:bg-gray-700/30'
                            }`}
                        >
                          <div className="flex items-center gap-3">
                            <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${isSelected
                              ? 'bg-cyan-100 dark:bg-cyan-900/40'
                              : 'bg-gray-100 dark:bg-gray-700'
                              }`}>
                              <Icon className={`w-5 h-5 ${isSelected ? 'text-cyan-600 dark:text-cyan-400' : 'text-gray-500 dark:text-gray-400'
                                }`} />
                            </div>
                            <div>
                              <p className="font-medium text-sm text-gray-900 dark:text-white">
                                {peer.nickname}
                              </p>
                              <p className="text-xs text-gray-500 dark:text-gray-400">
                                {getPlatformLabel(peer)}
                              </p>
                            </div>
                          </div>
                          {isSelected ? (
                            <div className="flex items-center gap-2">
                              {getQualityIndicator()}
                              <span className="text-xs font-medium text-cyan-600 dark:text-cyan-400 flex items-center gap-1">
                                <CheckCircle2 className="w-3.5 h-3.5" />
                                {t('nearby.connected')}
                              </span>
                            </div>
                          ) : (
                            <button
                              onClick={() => handleConnectPeer(peer.id)}
                              disabled={isConnecting}
                              className="px-3 py-1.5 text-xs font-medium rounded-lg bg-cyan-500 hover:bg-cyan-600 text-white transition-colors disabled:opacity-50"
                            >
                              {isConnecting ? (
                                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                              ) : (
                                t('nearby.connect')
                              )}
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Hotspot / Wi-Fi Direct / QR options */}
                <div className="px-4 py-3 border-t border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
                  <p className="text-xs text-gray-500 dark:text-gray-400 text-center mb-2">
                    {t('nearby.tools')}
                  </p>
                  <div className="flex gap-2 justify-center flex-wrap">
                    <button
                      onClick={() => setShowHotspot(true)}
                      className="px-3 py-1.5 text-xs font-medium rounded-lg bg-purple-50 dark:bg-purple-900/20 text-purple-600 dark:text-purple-400 hover:bg-purple-100 dark:hover:bg-purple-900/40 transition-colors border border-purple-200 dark:border-purple-800"
                    >
                      <Wifi className="inline-block w-3 h-3 mr-1" />
                      {t('nearby.hotspot')}
                    </button>
                    <button
                      onClick={showQR ? () => { setShowQR(false); setOfflineStep('none'); } : handleCreateOfflineOffer}
                      className="px-3 py-1.5 text-xs font-medium rounded-lg bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 hover:bg-blue-100 dark:hover:bg-blue-900/40 transition-colors border border-blue-200 dark:border-blue-800"
                    >
                      <QrCode className="inline-block w-3 h-3 mr-1" />
                      {t('nearby.offlineQr')}
                    </button>
                    <button
                      onClick={() => setShowScanner(true)}
                      className="px-3 py-1.5 text-xs font-medium rounded-lg bg-green-50 dark:bg-green-900/20 text-green-600 dark:text-green-400 hover:bg-green-100 dark:hover:bg-green-900/40 transition-colors border border-green-200 dark:border-green-800"
                    >
                      <Camera className="inline-block w-3 h-3 mr-1" />
                      {t('nearby.scanQr')}
                    </button>
                  </div>

                  {/* QR Code Display */}
                  {showQR && (
                    <div className="mt-4 flex flex-col items-center p-4 bg-white dark:bg-gray-700/50 rounded-xl border border-gray-100 dark:border-gray-600">
                      {offlineStep === 'creating' || offlineStep === 'generating-answer' ? (
                        <div className="flex flex-col items-center justify-center p-8 space-y-3">
                          <Loader2 className="w-8 h-8 text-cyan-500 animate-spin" />
                          <p className="text-sm font-medium text-gray-700 dark:text-gray-300">
                            {offlineStep === 'creating' ? t('nearby.generatingPayload') : t('nearby.generatingResponse')}
                          </p>
                        </div>
                      ) : (
                        <>
                          <ConnectionQR
                            connectionInfo={offlinePayload || {
                              deviceId: service?.deviceId,
                              nickname: nickname,
                              platform: isElectron ? 'electron' : isCapacitor ? 'android' : 'web',
                              version: '1.0'
                            }}
                            size={280}
                          />
                          {offlineStep === 'offer-ready' && (
                            <div className="mt-4 text-center">
                              <p className="text-sm font-bold text-gray-800 dark:text-gray-100 mb-1">
                                {t('nearby.waitForScan')}
                              </p>
                              <p className="text-xs text-gray-600 dark:text-gray-400 mb-3">
                                {t('nearby.onceScanned')}
                              </p>
                              <button
                                onClick={() => { setShowQR(false); setShowScanner(true); }}
                                className="px-4 py-2 w-full bg-blue-500 hover:bg-blue-600 shadow-md text-white rounded-xl text-sm font-medium transition-colors"
                              >
                                {t('nearby.scanReplyQr')}
                              </button>
                            </div>
                          )}
                          {offlineStep === 'answer-ready' && (
                            <div className="mt-4 text-center">
                              <p className="text-sm font-bold text-green-600 dark:text-green-400 mb-1">
                                {t('nearby.replyGenerated')}
                              </p>
                              <p className="text-xs text-gray-600 dark:text-gray-300 mb-3">
                                {t('nearby.showReplyQr')}
                              </p>
                              <button
                                onClick={() => { setShowQR(false); setOfflineStep('none'); }}
                                className="px-4 py-2 w-full bg-gray-200 dark:bg-gray-600 hover:bg-gray-300 dark:hover:bg-gray-500 text-gray-800 dark:text-gray-100 rounded-xl text-sm font-medium transition-colors"
                              >
                                {t('nearby.closeQr')}
                              </button>
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  )}
                </div>
              </div>

              {/* Send Section (when connected) */}
              {connectedPeer && (
                <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-lg border border-gray-100 dark:border-gray-700 overflow-hidden">
                  <div className="px-4 py-3 border-b border-gray-100 dark:border-gray-700">
                    <div className="flex items-center justify-between">
                      <h3 className="font-semibold text-gray-900 dark:text-white text-sm">
                        {t('nearby.sendTo')} {connectedPeer.nickname}
                      </h3>
                      <div className="flex bg-gray-100 dark:bg-gray-700 rounded-lg p-0.5">
                        <button
                          onClick={() => setSendMode('file')}
                          className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors ${sendMode === 'file'
                            ? 'bg-white dark:bg-gray-600 text-gray-900 dark:text-white shadow-sm'
                            : 'text-gray-500 dark:text-gray-400'
                            }`}
                        >
                          <FileUp className="inline-block w-3 h-3 mr-1" />
                          {t('nearby.fileTab')}
                        </button>
                        <button
                          onClick={() => setSendMode('text')}
                          className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors ${sendMode === 'text'
                            ? 'bg-white dark:bg-gray-600 text-gray-900 dark:text-white shadow-sm'
                            : 'text-gray-500 dark:text-gray-400'
                            }`}
                        >
                          <MessageSquare className="inline-block w-3 h-3 mr-1" />
                          {t('nearby.textTab')}
                        </button>
                      </div>
                    </div>
                  </div>

                  <div className="p-4">
                    {sendMode === 'file' ? (
                      <div className="space-y-3">
                        <input
                          ref={fileInputRef}
                          type="file"
                          onChange={handleFileSelect}
                          className="hidden"
                        />
                        <input
                          ref={batchInputRef}
                          type="file"
                          multiple
                          onChange={handleBatchFileSelect}
                          className="hidden"
                        />
                        <button
                          onClick={() => fileInputRef.current?.click()}
                          className="w-full py-8 border-2 border-dashed border-gray-200 dark:border-gray-600 rounded-xl hover:border-cyan-400 dark:hover:border-cyan-600 hover:bg-cyan-50/50 dark:hover:bg-cyan-900/10 transition-colors cursor-pointer group"
                        >
                          <FileUp className="w-8 h-8 mx-auto text-gray-300 dark:text-gray-600 group-hover:text-cyan-500 transition-colors mb-2" />
                          <p className="text-sm text-gray-500 dark:text-gray-400 group-hover:text-cyan-600 dark:group-hover:text-cyan-400">
                            {t('nearby.chooseFile')}
                          </p>
                          <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                            {t('nearby.noSizeLimit')}
                          </p>
                        </button>

                        {/* Image pre-send card */}
                        {pendingImageFile && (
                          <div className="p-3 rounded-xl border border-indigo-200 dark:border-indigo-700/50 bg-indigo-50 dark:bg-indigo-900/10 space-y-2">
                            <p className="text-xs font-bold text-indigo-700 dark:text-indigo-400 truncate">{pendingImageFile.name}</p>
                            <div className="flex gap-2">
                              <button
                                onClick={handleSendImageAsIs}
                                className="flex-1 py-1.5 text-xs rounded-lg bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors font-medium"
                              >
                                {t('nearby.sendAsIs')}
                              </button>
                              <button
                                onClick={() => setShowStegoModal(true)}
                                className="flex-1 py-1.5 text-xs rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white font-bold transition-colors flex items-center justify-center gap-1"
                              >
                                <Lock className="w-3 h-3" />
                                {t('nearby.embedAndSend')}
                              </button>
                            </div>
                          </div>
                        )}

                        {/* Batch send button */}
                        <button
                          onClick={() => batchInputRef.current?.click()}
                          className="w-full py-2 text-xs font-medium rounded-lg bg-gray-50 dark:bg-gray-700/50 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors border border-gray-200 dark:border-gray-600"
                        >
                          <Files className="inline-block w-3.5 h-3.5 mr-1 -mt-0.5" />
                          {t('nearby.selectMultiple')}
                        </button>

                        {/* Batch file preview */}
                        {batchFiles.length > 0 && (
                          <div className="bg-gray-50 dark:bg-gray-700/50 rounded-xl p-3 space-y-2">
                            <p className="text-xs font-medium text-gray-700 dark:text-gray-300">
                              {batchFiles.length} {t('nearby.filesSelected')} ({formatBytes(batchFiles.reduce((s, f) => s + f.size, 0))})
                            </p>
                            <div className="max-h-24 overflow-y-auto space-y-1">
                              {batchFiles.map((f, i) => (
                                <div key={i} className="text-xs text-gray-500 dark:text-gray-400 flex justify-between">
                                  <span className="truncate flex-1">{f.name}</span>
                                  <span className="ml-2 text-gray-400">{formatBytes(f.size)}</span>
                                </div>
                              ))}
                            </div>
                            <div className="flex gap-2">
                              <button
                                onClick={handleBatchSend}
                                disabled={isBatchSending}
                                className="flex-1 py-2 text-xs font-bold rounded-lg bg-cyan-500 hover:bg-cyan-600 text-white transition-colors disabled:opacity-50"
                              >
                                {isBatchSending ? (
                                  <Loader2 className="inline-block w-3.5 h-3.5 animate-spin mr-1" />
                                ) : (
                                  <Send className="inline-block w-3.5 h-3.5 mr-1 -mt-0.5" />
                                )}
                                {t('nearby.sendAll')}
                              </button>
                              <button
                                onClick={() => setBatchFiles([])}
                                className="px-3 py-2 text-xs rounded-lg bg-gray-200 dark:bg-gray-600 text-gray-600 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-500 transition-colors"
                              >
                                {t('common.clear')}
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="flex gap-2">
                        <input
                          type="text"
                          value={textInput}
                          onChange={(e) => setTextInput(e.target.value)}
                          placeholder={t('nearby.typeMessage')}
                          className="flex-1 px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
                          onKeyDown={(e) => e.key === 'Enter' && handleSendText()}
                        />
                        <button
                          onClick={handleSendText}
                          disabled={!textInput.trim()}
                          className="px-4 py-2.5 rounded-xl bg-cyan-500 hover:bg-cyan-600 text-white transition-colors disabled:opacity-50"
                        >
                          <Send className="w-4 h-4" />
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Text Messages */}
                  {textMessages.length > 0 && sendMode === 'text' && (
                    <div className="px-4 pb-4 space-y-2 max-h-40 overflow-y-auto">
                      {textMessages.slice(-10).map(msg => (
                        <div
                          key={msg.id}
                          className={`px-3 py-2 rounded-lg text-sm max-w-[80%] ${msg.direction === 'sent'
                            ? 'ml-auto bg-cyan-500 text-white'
                            : 'bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-white'
                            }`}
                        >
                          {msg.text}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Active Transfers */}
              {transfers.length > 0 && (
                <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-lg border border-gray-100 dark:border-gray-700 overflow-hidden">
                  <div className="px-4 py-3 border-b border-gray-100 dark:border-gray-700 flex items-center justify-between">
                    <h3 className="font-semibold text-gray-900 dark:text-white text-sm">
                      {t('nearby.transfers')}
                    </h3>
                    <button
                      onClick={clearCompleted}
                      className="text-xs text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 transition-colors"
                    >
                      {t('nearby.clearCompleted')}
                    </button>
                  </div>
                  <div className="divide-y divide-gray-50 dark:divide-gray-700/50">
                    {transfers.map(transfer => (
                      <TransferProgress
                        key={transfer.transferId}
                        transfer={transfer}
                        onCancel={() => cancelTransfer(transfer.transferId)}
                        onDownload={() => downloadFile(transfer)}
                        onClear={() => clearTransfer(transfer.transferId)}
                      />
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </main>

      {/* Pairing Code Modal */}
      {showPairing && pairingCode && (
        <PairingCodeModal
          code={pairingCode}
          peerName={connectedPeer?.nickname}
          onConfirm={() => setShowPairing(false)}
          onReject={() => {
            setShowPairing(false);
            if (connectedPeer) disconnectFromPeer(connectedPeer.id);
          }}
        />
      )}

      {/* Hotspot Setup Modal */}
      {showHotspot && (
        <HotspotSetup onClose={() => setShowHotspot(false)} />
      )}

      {/* QR Scanner Modal */}
      <QRScanner
        isOpen={showScanner}
        onScan={handleQRScan}
        onClose={() => setShowScanner(false)}
      />

      {showStegoModal && pendingImageFile && (
        <StegoModal
          isOpen={showStegoModal}
          onClose={() => setShowStegoModal(false)}
          initialCarrierImage={pendingImageFile}
          onEmbedResult={handleStegoEmbedResult}
        />
      )}
    </div>
  );
};

export default NearbyTransfer;
