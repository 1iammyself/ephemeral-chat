/**
 * Camera Filters Library
 * Provides Instagram-like filters for video and canvas elements.
 */


// Helper to draw a digital date stamp (like classic camcorders/film)
const drawDateStamp = (ctx, width, height) => {
    const now = new Date();
    const dateStr = `'${now.getFullYear().toString().slice(-2)} ${String(now.getMonth() + 1).padStart(2, '0')} ${String(now.getDate()).padStart(2, '0')}`;
    // const timeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

    ctx.save();
    ctx.font = `bold ${height * 0.05}px "Courier New", monospace`;
    ctx.fillStyle = '#ff9900'; // Classic orange/amber date color
    ctx.shadowColor = 'black';
    ctx.shadowBlur = 2;
    ctx.shadowOffsetX = 1;
    ctx.shadowOffsetY = 1;
    ctx.textAlign = 'right';
    ctx.textBaseline = 'bottom';
    ctx.fillText(dateStr, width - (width * 0.05), height - (height * 0.05));
    ctx.restore();
};

export const FILTERS = [
    {
        id: 'normal',
        name: 'Normal',
        css: 'none'
    },
    {
        id: 'vivid',
        name: 'Vivid',
        css: 'saturate(1.6) contrast(1.1) brightness(1.05)'
    },
    {
        id: 'golden',
        name: 'Golden',
        css: 'sepia(0.3) saturate(1.4) contrast(1.05) brightness(1.05)',
        overlay: (ctx, width, height) => {
            // Warm overlay
            ctx.globalCompositeOperation = 'overlay';
            const gradient = ctx.createLinearGradient(0, 0, width, height);
            gradient.addColorStop(0, 'rgba(255, 180, 0, 0.2)');
            gradient.addColorStop(1, 'rgba(255, 0, 100, 0.1)');
            ctx.fillStyle = gradient;
            ctx.fillRect(0, 0, width, height);
            ctx.globalCompositeOperation = 'source-over';
        }
    },
    {
        id: 'dream',
        name: 'Dream',
        css: 'brightness(1.1) contrast(0.9) saturate(1.2) sepia(0.1)',
        overlay: (ctx, width, height) => {
            // Soft pink glow
            ctx.globalCompositeOperation = 'screen';
            ctx.fillStyle = 'rgba(255, 150, 150, 0.15)';
            ctx.fillRect(0, 0, width, height);

            // Vignette
            ctx.globalCompositeOperation = 'multiply';
            const gradient = ctx.createRadialGradient(width / 2, height / 2, height / 3, width / 2, height / 2, height);
            gradient.addColorStop(0, 'rgba(0,0,0,0)');
            gradient.addColorStop(1, 'rgba(50,0,20,0.3)');
            ctx.fillStyle = gradient;
            ctx.fillRect(0, 0, width, height);
            ctx.globalCompositeOperation = 'source-over';
        }
    },
    {
        id: 'retro',
        name: 'Retro 98',
        css: 'sepia(0.2) contrast(1.1) brightness(0.9) saturate(0.9)',
        overlay: (ctx, width, height) => {
            drawDateStamp(ctx, width, height);

            // Subtle Vignette
            const gradient = ctx.createRadialGradient(width / 2, height / 2, height * 0.4, width / 2, height / 2, height);
            gradient.addColorStop(0, 'rgba(0,0,0,0)');
            gradient.addColorStop(1, 'rgba(0,0,0,0.3)');
            ctx.fillStyle = gradient;
            ctx.fillRect(0, 0, width, height);
        }
    },
    {
        id: 'noir',
        name: 'Noir',
        css: 'grayscale(1) contrast(1.3) brightness(0.9)'
    },
    {
        id: 'bw-chic',
        name: 'B&W Chic',
        css: 'grayscale(1) contrast(1.05) brightness(1.1)',
        overlay: (ctx, width, height) => {
            // Lifted blacks overlay
            ctx.fillStyle = 'rgba(20, 20, 30, 0.1)';
            ctx.fillRect(0, 0, width, height);
        }
    },
    {
        id: 'cinematic',
        name: 'Cinema',
        css: 'contrast(1.1) saturate(1.1) sepia(0.2)',
        overlay: (ctx, width, height) => {
            // Letterbox (Cinematic Bars)
            const barHeight = height * 0.12;
            ctx.fillStyle = 'black';
            ctx.fillRect(0, 0, width, barHeight);
            ctx.fillRect(0, height - barHeight, width, barHeight);

            // Teal/Orange look (Simulated)
            ctx.globalCompositeOperation = 'overlay';
            const gradient = ctx.createLinearGradient(0, 0, width, 0);
            gradient.addColorStop(0, 'rgba(0, 200, 255, 0.15)'); // Teal shadows
            gradient.addColorStop(1, 'rgba(255, 100, 0, 0.15)'); // Orange highlights
            ctx.fillStyle = gradient;
            ctx.fillRect(0, barHeight, width, height - (barHeight * 2));
            ctx.globalCompositeOperation = 'source-over';
        }
    },
    {
        id: 'cyber',
        name: 'Cyber',
        css: 'saturate(2.0) contrast(1.2) hue-rotate(-10deg)',
        overlay: (ctx, width, height) => {
            // Neon frame
            ctx.shadowColor = '#0ff';
            ctx.shadowBlur = 20;
            ctx.strokeStyle = '#0ff';
            ctx.lineWidth = 4;
            ctx.strokeRect(20, 20, width - 40, height - 40);
        }
    },
    {
        id: 'vhs',
        name: 'VHS',
        css: 'contrast(1.2) saturate(1.2) brightness(1.1)',
        overlay: (ctx, width, height) => {
            // Scanlines
            ctx.fillStyle = 'rgba(0, 0, 0, 0.1)';
            for (let i = 0; i < height; i += 4) {
                ctx.fillRect(0, i, width, 2);
            }

            // Date stamp green
            ctx.font = `bold ${height * 0.05}px "Courier New", monospace`;
            ctx.fillStyle = '#0f0';
            ctx.shadowColor = 'rgba(0, 255, 0, 0.5)';
            ctx.shadowBlur = 5;
            ctx.textAlign = 'left';
            ctx.fillText('PLAY >', width * 0.05, height * 0.1);
        }
    }
];
