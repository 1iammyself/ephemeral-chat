import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { App as CapApp } from '@capacitor/app';

const DeepLinkHandler = () => {
    const navigate = useNavigate();

    useEffect(() => {
        // 1. Handle runtime deep links (Warm/Hot start)
        const urlListener = CapApp.addListener('appUrlOpen', (data) => {
            console.log('App opened with URL (runtime):', data.url);
            handleUrl(data.url);
        });

        // 2. Handle initial deep link (Cold start)
        const checkInitialUrl = async () => {
            const result = await CapApp.getLaunchUrl();
            if (result && result.url) {
                console.log('App launched with URL (cold start):', result.url);
                handleUrl(result.url);
            }
        };

        const handleUrl = (urlStr) => {
            try {
                const url = new URL(urlStr);
                const path = url.pathname;
                if (path && path !== '/') {
                    navigate(path);
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
