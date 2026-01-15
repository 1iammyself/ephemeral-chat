import React, { useState, useEffect, useRef } from 'react';

/**
 * GhostWatermark Component
 * Implements a forensic, theme-agnostic, and tamper-proof watermark system.
 * 
 * Watermark format: hashed_username | timestamp
 * - Username is normalized to lowercase and SHA-256 hashed
 * - Timestamp is in plaintext
 * - For verification: hash the suspected username and compare with watermark
 */
const GhostWatermark = ({ nickname }) => {
    const [hashedUsername, setHashedUsername] = useState('');
    const [timestamp] = useState(new Date().toISOString().replace('T', ' ').substring(0, 19));
    const layerRef = useRef(null);

    // Generate a SHA-256 Hash for the username
    const hashUsername = async (username) => {
        try {
            // Ensure username is lowercase for consistent hashing
            const normalizedUsername = (username || 'anonymous').toLowerCase();
            const encoder = new TextEncoder();
            const data = encoder.encode(normalizedUsername);
            const hashBuffer = await crypto.subtle.digest('SHA-256', data);
            const hashArray = Array.from(new Uint8Array(hashBuffer));
            // Return first 12 characters of the hash in uppercase for readability
            return hashArray.map(b => b.toString(16).padStart(2, '0')).join('').substring(0, 12).toUpperCase();
        } catch (err) {
            console.error('Failed to hash username:', err);
            return 'UNKNOWN';
        }
    };

    useEffect(() => {
        const init = async () => {
            const hash = await hashUsername(nickname);
            setHashedUsername(hash);
        };
        init();
    }, [nickname]);

    useEffect(() => {
        // Only start observing once the watermark is actually rendered
        if (!hashedUsername || !layerRef.current) return;

        const securityObserver = new MutationObserver((mutations) => {
            const layer = layerRef.current;
            if (!layer) {
                window.location.href = "/";
                return;
            }

            const style = window.getComputedStyle(layer);
            if (style.display === 'none' || style.visibility === 'hidden' || parseFloat(style.opacity) < 0.01) {
                alert("Security Violation: Watermark integrity compromised.");
                window.location.href = "/";
            }
        });

        securityObserver.observe(document.body, { childList: true, subtree: true, attributes: true });

        return () => securityObserver.disconnect();
    }, [hashedUsername]);

    if (!hashedUsername) return null;

    // Format: hashed_username | timestamp
    const displayText = `${hashedUsername} | ${timestamp}`;

    // Create 150 items to fill the oversized grid
    const items = Array.from({ length: 150 }).map((_, i) => (
        <div key={i} className="watermark-item">
            {displayText}
        </div>
    ));

    return (
        <div
            id="watermark-layer"
            ref={layerRef}
            className="watermark-layer"
            aria-hidden="true"
        >
            {items}
        </div>
    );
};

export default GhostWatermark;
