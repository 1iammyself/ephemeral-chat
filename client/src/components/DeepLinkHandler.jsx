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
            handleUrl(data.url);
        });

        // 2. Handle initial deep link (Cold start)
        const checkInitialUrl = async () => {
            if (hasHandledInitialUrl.current) return;

            const result = await CapApp.getLaunchUrl();
            if (result && result.url) {
                hasHandledInitialUrl.current = true;
                handleUrl(result.url);
            }
        };

        const handleUrl = (urlStr) => {
            try {
                const url = new URL(urlStr);

                // For custom schemes like ephemeral://invite/TOKEN:
                // new URL() parses 'invite' as the hostname and '/TOKEN' as the pathname.
                // We must join them to reconstruct the correct React Router slug: /invite/TOKEN
                //
                // For https:// links the hostname is the domain and should NOT be included.
                const isCustomScheme = !['https:', 'http:'].includes(url.protocol);

                let slug;
                if (isCustomScheme && url.hostname) {
                    // e.g. ephemeral://invite/TOKEN → hostname='invite', pathname='/TOKEN'
                    slug = '/' + url.hostname + url.pathname + url.search + url.hash;
                } else {
                    // Standard https: link — just use the path portion
                    slug = url.pathname + url.search + url.hash;
                }

                // Normalise double slashes just in case
                slug = slug.replace(/\/\//g, '/');

                if (slug && slug !== '/') {
                    navigate(slug, { replace: true });
                }
            } catch (e) {
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
