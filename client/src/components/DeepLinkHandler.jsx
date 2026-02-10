import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { App as CapApp } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';
import { toast } from 'react-toastify';

const DeepLinkHandler = () => {
    const navigate = useNavigate();
    const hasHandledInitialUrl = useRef(false);

    useEffect(() => {
        // Only run this logic in native Capacitor environments (Android/iOS)
        if (Capacitor.getPlatform() === 'web') return;

        // 1. Handle runtime deep links (Warm/Hot start)
        const urlListener = CapApp.addListener('appUrlOpen', (data) => {
            console.log('App opened with URL (runtime):', data.url);
            handleUrl(data.url);
        });

        // 2. Handle initial deep link (Cold start)
        const checkInitialUrl = async () => {
            if (hasHandledInitialUrl.current) return;

            const result = await CapApp.getLaunchUrl();
            if (result && result.url) {
                console.log('App launched with URL (cold start):', result.url);
                hasHandledInitialUrl.current = true;
                handleUrl(result.url);
            }
        };

        const handleUrl = (urlStr) => {
            try {
                const url = new URL(urlStr);
                // Construct the full path: /invite/token...
                // slug is often just pathname if no query/hash, but we want to be safe
                const slug = url.pathname + url.search + url.hash;

                if (slug && slug !== '/') {
                    console.log('Navigating to deep link slug:', slug);
                    // toast.info(`Deep link received: ${slug}`); // Optional feedback for user
                    // Use replace to avoid polluting history on initial launch
                    navigate(slug, { replace: true });
                }
            } catch (e) {
                console.error('Error parsing deep link URL:', e);
            }
        };

        checkInitialUrl();

        return () => {
            urlListener.remove();
        };
    }, [navigate]);

    return null;
};

export default DeepLinkHandler;
