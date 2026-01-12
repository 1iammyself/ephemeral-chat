import React, { useState, useEffect, useRef } from 'react';

/**
 * GhostWatermark Component
 * Implements a forensic, theme-agnostic, and tamper-proof watermark system.
 */
const GhostWatermark = ({ userSessionInfo }) => {
    const [traceId, setTraceId] = useState('');
    const [timestamp] = useState(new Date().toISOString().split('T')[0]);
    const layerRef = useRef(null);

    // Generate a SHA-256 Hash for the Trace ID
    const generateTraceId = async (inputData) => {
        try {
            const encoder = new TextEncoder();
            const data = encoder.encode(inputData);
            const hashBuffer = await crypto.subtle.digest('SHA-256', data);
            const hashArray = Array.from(new Uint8Array(hashBuffer));
            return hashArray.map(b => b.toString(16).padStart(2, '0')).join('').substring(0, 10).toUpperCase();
        } catch (err) {
            console.error('Failed to generate trace ID:', err);
            return 'UNKNOWN';
        }
    };

    useEffect(() => {
        const init = async () => {
            const id = await generateTraceId(userSessionInfo || 'ANONYMOUS_SESSION');
            setTraceId(id);
        };
        init();
    }, [userSessionInfo]);

    useEffect(() => {
        // Only start observing once the watermark is actually rendered
        if (!traceId || !layerRef.current) return;

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
    }, [traceId]);

    if (!traceId) return null;

    const displayText = `TRACE: ${traceId} | ${timestamp}`;

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
