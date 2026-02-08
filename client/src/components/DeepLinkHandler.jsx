import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { App as CapApp } from '@capacitor/app';

const DeepLinkHandler = () => {
    const navigate = useNavigate();
    const hasHandledInitialUrl = useRef(false);

    useEffect(() => {
        // Only run this logic in native Capacitor environments
        if (!window.Capacitor?.isNative) return;

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
                const path = url.pathname;
                if (path && path !== '/') {
                    // Use replace to avoid polluting history on initial launch
                    navigate(path, { replace: true });
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
