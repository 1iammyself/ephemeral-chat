import React from 'react';
import {
  FileUp, FileDown, CheckCircle2, XCircle, AlertCircle,
  X, Download, Loader2, ArrowUp, ArrowDown
} from 'lucide-react';
import { formatBytes, formatSpeed } from '../utils/proximity';

/**
 * TransferProgress — Individual transfer progress display
 * Shows file name, progress bar, speed, and action buttons
 */
const TransferProgress = ({ transfer, onCancel, onDownload, onClear }) => {
  if (!transfer) return null;

  const {
    direction,
    state,
    metadata,
    progress = 0,
    speed = 0,
    bytesTransferred = 0,
    totalBytes = 0,
    error
  } = transfer;

  const isSending = direction === 'sending';
  const isComplete = state === 'complete';
  const isError = state === 'error';
  const isCancelled = state === 'cancelled';
  const isActive = state === 'transferring' || state === 'pending' || state === 'receiving';
  const progressPercent = Math.round(progress * 100);

  // Estimated time remaining
  const getETA = () => {
    if (!speed || speed === 0 || isComplete) return '';
    const remaining = totalBytes - bytesTransferred;
    const seconds = Math.round(remaining / speed);
    if (seconds < 60) return `${seconds}s left`;
    if (seconds < 3600) return `${Math.round(seconds / 60)}m left`;
    return `${Math.round(seconds / 3600)}h left`;
  };

  // State color
  const getStateColor = () => {
    if (isComplete) return 'text-green-500';
    if (isError || isCancelled) return 'text-red-500';
    return 'text-cyan-500';
  };

  // Progress bar color
  const getBarColor = () => {
    if (isComplete) return 'bg-green-500';
    if (isError || isCancelled) return 'bg-red-500';
    return 'bg-gradient-to-r from-cyan-500 to-blue-500';
  };

  return (
    <div className="px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-700/20 transition-colors">
      {/* Header Row */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2 min-w-0 flex-1">
          {/* Direction Icon */}
          <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${
            isComplete
              ? 'bg-green-100 dark:bg-green-900/30'
              : isError || isCancelled
                ? 'bg-red-100 dark:bg-red-900/30'
                : isSending
                  ? 'bg-cyan-100 dark:bg-cyan-900/30'
                  : 'bg-blue-100 dark:bg-blue-900/30'
          }`}>
            {isComplete ? (
              <CheckCircle2 className="w-4 h-4 text-green-500" />
            ) : isError || isCancelled ? (
              <XCircle className="w-4 h-4 text-red-500" />
            ) : isSending ? (
              <ArrowUp className="w-4 h-4 text-cyan-500" />
            ) : (
              <ArrowDown className="w-4 h-4 text-blue-500" />
            )}
          </div>

          {/* File Info */}
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
              {metadata?.name || 'Unknown file'}
            </p>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              {isComplete ? (
                <span className="text-green-500 dark:text-green-400">
                  Complete — {formatBytes(totalBytes)} at {formatSpeed(speed)}
                </span>
              ) : isError ? (
                <span className="text-red-500">{error || 'Transfer failed'}</span>
              ) : isCancelled ? (
                <span className="text-red-500">Cancelled</span>
              ) : state === 'pending' ? (
                <span className="flex items-center gap-1">
                  <Loader2 className="w-3 h-3 animate-spin" />
                  Waiting for acceptance...
                </span>
              ) : (
                <span>
                  {formatBytes(bytesTransferred)} / {formatBytes(totalBytes)}
                  {speed > 0 && ` • ${formatSpeed(speed)}`}
                  {getETA() && ` • ${getETA()}`}
                </span>
              )}
            </p>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-1 ml-2">
          {isComplete && !isSending && transfer.blob && (
            <button
              onClick={onDownload}
              className="p-1.5 rounded-lg hover:bg-green-100 dark:hover:bg-green-900/30 text-green-500 transition-colors"
              title="Download"
            >
              <Download className="w-4 h-4" />
            </button>
          )}
          {isActive && (
            <button
              onClick={onCancel}
              className="p-1.5 rounded-lg hover:bg-red-100 dark:hover:bg-red-900/30 text-red-500 transition-colors"
              title="Cancel"
            >
              <X className="w-4 h-4" />
            </button>
          )}
          {(isComplete || isError || isCancelled) && (
            <button
              onClick={onClear}
              className="p-1.5 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-400 transition-colors"
              title="Clear"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Progress Bar */}
      {isActive && (
        <div className="w-full h-1.5 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-300 ${getBarColor()}`}
            style={{ width: `${Math.min(progressPercent, 100)}%` }}
          />
        </div>
      )}
    </div>
  );
};

export default TransferProgress;
