// Smooth scroll for anchor links
document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', function (e) {
        e.preventDefault();
        const target = document.querySelector(this.getAttribute('href'));
        if (target) {
            target.scrollIntoView({
                behavior: 'smooth',
                block: 'start'
            });
        }
    });
});

// Intersection Observer for fade-in animations
const observerOptions = {
    threshold: 0.1,
    rootMargin: '0px 0px -100px 0px'
};

const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
        if (entry.isIntersecting) {
            entry.target.style.opacity = '1';
            entry.target.style.transform = 'translateY(0)';
        }
    });
}, observerOptions);

// Observe all feature cards, steps, and FAQ items
document.querySelectorAll('.feature-card, .step, .faq-card, .download-card').forEach(el => {
    el.style.opacity = '0';
    el.style.transform = 'translateY(30px)';
    el.style.transition = 'opacity 0.6s ease-out, transform 0.6s ease-out';
    observer.observe(el);
});

// Carousel Logic
function initCarousel(carouselSelector) {
    const container = document.querySelector(carouselSelector);
    if (!container) return;

    const track = container.querySelector('.carousel-track');
    const dotsContainer = container.querySelector('.carousel-dots');
    const prevBtn = container.querySelector('.prev');
    const nextBtn = container.querySelector('.next');
    const items = container.querySelectorAll('.carousel-item');

    // Reset scroll position to start
    track.scrollLeft = 0;

    // Create dots
    items.forEach((_, i) => {
        const dot = document.createElement('div');
        dot.classList.add('carousel-dot');
        if (i === 0) dot.classList.add('active');
        dot.addEventListener('click', () => {
            track.scrollTo({
                left: items[i].offsetLeft - track.offsetLeft,
                behavior: 'smooth'
            });
        });
        dotsContainer.appendChild(dot);
    });

    const dots = dotsContainer.querySelectorAll('.carousel-dot');

    // Update dots on scroll
    track.addEventListener('scroll', () => {
        const index = Math.round(track.scrollLeft / items[0].offsetWidth);
        dots.forEach((dot, i) => {
            dot.classList.toggle('active', i === index);
        });
    });

    // Button controls
    prevBtn.addEventListener('click', () => {
        const scrollAmount = track.offsetWidth * 0.8;
        track.scrollBy({ left: -scrollAmount, behavior: 'smooth' });
    });

    nextBtn.addEventListener('click', () => {
        const scrollAmount = track.offsetWidth * 0.8;
        track.scrollBy({ left: scrollAmount, behavior: 'smooth' });
    });
}

// FAQ Accordion logic
document.querySelectorAll('.faq-header').forEach(header => {
    header.addEventListener('click', () => {
        const row = header.parentElement;
        const isActive = row.classList.contains('active');

        // Close all other rows for a clean accordion experience
        document.querySelectorAll('.faq-row').forEach(r => r.classList.remove('active'));

        if (!isActive) {
            row.classList.add('active');
        }
    });
});

// Initialize carousels
initCarousel('.features-carousel');
initCarousel('.steps-carousel');
initCarousel('.download-carousel');

// Force reset steps carousel scroll position on load
window.addEventListener('load', () => {
    const stepsTrack = document.querySelector('.steps-carousel .carousel-track');
    if (stepsTrack) stepsTrack.scrollLeft = 0;
});

// Handle resize (already handled by responsive CSS, just ensures dots are sync'd)
window.addEventListener('resize', () => {
    // Optionally re-init or sync dots if needed
});

// Add parallax effect to hero gradient
window.addEventListener('scroll', () => {
    const scrolled = window.pageYOffset;
    const heroGradient = document.querySelector('.hero-gradient');
    if (heroGradient) {
        heroGradient.style.transform = `translateY(${scrolled * 0.5}px)`;
    }
});

// Theme Toggle Logic
const themeToggle = document.getElementById('theme-toggle');
const currentTheme = localStorage.getItem('theme');

if (currentTheme) {
    document.documentElement.setAttribute('data-theme', currentTheme);
} else {
    // Check system preference
    if (window.matchMedia('(prefers-color-scheme: dark)').matches) {
        document.documentElement.setAttribute('data-theme', 'dark');
    }
}

themeToggle.addEventListener('click', () => {
    let theme = document.documentElement.getAttribute('data-theme');
    if (theme === 'dark') {
        document.documentElement.setAttribute('data-theme', 'light');
        localStorage.setItem('theme', 'light');
    } else {
        document.documentElement.setAttribute('data-theme', 'dark');
        localStorage.setItem('theme', 'dark');
    }
});
// Hide theme toggle on scroll
window.addEventListener('scroll', () => {
    if (window.scrollY > 100) {
        themeToggle.classList.add('hidden');
    } else {
        themeToggle.classList.remove('hidden');
    }
});

// Language selector — hide on scroll like theme toggle
const langSelector = document.getElementById('lang-selector');
window.addEventListener('scroll', () => {
    if (window.scrollY > 100) {
        langSelector.classList.add('hidden');
    } else {
        langSelector.classList.remove('hidden');
    }
});

// Language switching
const langSelect = document.getElementById('lang-select');
langSelect.addEventListener('change', () => setLang(langSelect.value));

// Apply saved/detected language on load
const initialLang = getStoredLang();
langSelect.value = initialLang;
applyTranslations(initialLang);
