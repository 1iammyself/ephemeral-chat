/**
 * Camera Filters Library
 * Provides Instagram-like filters for video and canvas elements.
 */

export const FILTERS = [
    {
        id: 'normal',
        name: 'Normal',
        css: 'none'
    },
    {
        id: 'vivid',
        name: 'Vivid',
        css: 'saturate(1.5) contrast(1.1)'
    },
    {
        id: 'noir',
        name: 'Noir',
        css: 'grayscale(1) contrast(1.2) brightness(0.9)'
    },
    {
        id: 'vintage',
        name: 'Vintage',
        css: 'sepia(0.4) contrast(1.1) brightness(0.9) saturate(0.8)',
        overlay: (ctx, width, height) => {
            // Vignette effect
            const gradient = ctx.createRadialGradient(width / 2, height / 2, height / 3, width / 2, height / 2, height);
            gradient.addColorStop(0, 'rgba(0,0,0,0)');
            gradient.addColorStop(1, 'rgba(0,0,0,0.4)');
            ctx.fillStyle = gradient;
            ctx.fillRect(0, 0, width, height);
        }
    },
    {
        id: 'summer',
        name: 'Summer',
        css: 'sepia(0.3) saturate(1.3) contrast(1.1)',
        overlay: (ctx, width, height) => {
            ctx.globalCompositeOperation = 'overlay';
            ctx.fillStyle = 'rgba(255, 165, 0, 0.2)';
            ctx.fillRect(0, 0, width, height);
            ctx.globalCompositeOperation = 'source-over';
        }
    },
    {
        id: 'frosty',
        name: 'Frosty',
        css: 'saturate(0.8) brightness(1.1) contrast(0.9) hue-rotate(10deg)',
        overlay: (ctx, width, height) => {
            ctx.globalCompositeOperation = 'overlay';
            ctx.fillStyle = 'rgba(0, 100, 255, 0.15)';
            ctx.fillRect(0, 0, width, height);
            ctx.globalCompositeOperation = 'source-over';
        }
    },
    {
        id: 'cyber',
        name: 'Cyber',
        css: 'saturate(1.8) contrast(1.2) hue-rotate(-10deg)',
        overlay: (ctx, width, height) => {
            ctx.shadowColor = 'cyan';
            ctx.shadowBlur = 20;
            ctx.strokeStyle = 'cyan';
            ctx.lineWidth = 2;
            ctx.strokeRect(10, 10, width - 20, height - 20);
        }
    },
    {
        id: 'drama',
        name: 'Drama',
        css: 'contrast(1.4) brightness(0.9) saturate(0.9)'
    }
];
