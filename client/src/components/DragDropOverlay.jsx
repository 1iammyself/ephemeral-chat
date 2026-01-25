import React from 'react';
import { Upload } from 'lucide-react';

const DragDropOverlay = ({ isDragging }) => {
    if (!isDragging) return null;
    return (
        <div className="fixed inset-0 z-50 bg-primary-600/90 backdrop-blur-sm flex flex-col items-center justify-center animate-in fade-in duration-200 pointer-events-none">
            <div className="bg-white dark:bg-gray-800 p-8 rounded-3xl shadow-2xl flex flex-col items-center animate-bounce">
                <div className="w-20 h-20 bg-primary-100 dark:bg-primary-900/30 rounded-full flex items-center justify-center mb-4">
                    <Upload className="w-10 h-10 text-primary-600 dark:text-primary-400" />
                </div>
                <h2 className="text-2xl font-bold text-gray-900 dark:text-white">Drop to Upload</h2>
                <p className="text-gray-500 dark:text-gray-400 mt-2">Share files instantly</p>
            </div>
        </div>
    );
};

export default DragDropOverlay;
