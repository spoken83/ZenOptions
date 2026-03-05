/**
 * ZenOptions Intelligence Platform - Main JavaScript
 * Handles interactive functionality and dynamic updates
 */

// ============================================
// Smooth Scroll for Navigation Links
// ============================================
document.addEventListener('DOMContentLoaded', function() {
    // Smooth scroll for anchor links
    const anchorLinks = document.querySelectorAll('a[href^="#"]');
    
    anchorLinks.forEach(link => {
        link.addEventListener('click', function(e) {
            const href = this.getAttribute('href');
            
            // Skip empty anchors
            if (href === '#' || href === '#!') {
                e.preventDefault();
                return;
            }
            
            const targetElement = document.querySelector(href);
            if (targetElement) {
                e.preventDefault();
                targetElement.scrollIntoView({
                    behavior: 'smooth',
                    block: 'start'
                });
            }
        });
    });

    // ============================================
    // Market Ticker Animation Enhancement
    // ============================================
    const tickerScroll = document.querySelector('.ticker-scroll');
    if (tickerScroll) {
        // Clone ticker items for seamless loop
        const tickerContent = tickerScroll.innerHTML;
        tickerScroll.innerHTML = tickerContent + tickerContent;
    }

    // ============================================
    // Mobile Navigation Toggle
    // ============================================
    const createMobileMenu = () => {
        const header = document.querySelector('.main-header');
        const logoSection = document.querySelector('.logo-section');
        
        if (window.innerWidth <= 768 && !document.querySelector('.mobile-menu-toggle')) {
            const menuToggle = document.createElement('button');
            menuToggle.className = 'mobile-menu-toggle';
            menuToggle.innerHTML = '<i class="fas fa-bars"></i>';
            menuToggle.setAttribute('aria-label', 'Toggle navigation menu');
            
            menuToggle.addEventListener('click', () => {
                logoSection.classList.toggle('mobile-active');
                const icon = menuToggle.querySelector('i');
                icon.className = logoSection.classList.contains('mobile-active') 
                    ? 'fas fa-times' 
                    : 'fas fa-bars';
            });
            
            header.querySelector('.header-content').prepend(menuToggle);
        }
    };

    createMobileMenu();
    window.addEventListener('resize', createMobileMenu);

    // ============================================
    // Button Interactions
    // ============================================
    const buttons = document.querySelectorAll('button');
    buttons.forEach(button => {
        button.addEventListener('click', function(e) {
            // Add ripple effect
            const ripple = document.createElement('span');
            ripple.className = 'ripple';
            this.appendChild(ripple);
            
            const rect = this.getBoundingClientRect();
            const size = Math.max(rect.width, rect.height);
            const x = e.clientX - rect.left - size / 2;
            const y = e.clientY - rect.top - size / 2;
            
            ripple.style.width = ripple.style.height = size + 'px';
            ripple.style.left = x + 'px';
            ripple.style.top = y + 'px';
            
            setTimeout(() => ripple.remove(), 600);
        });
    });

    // ============================================
    // Intersection Observer for Animations
    // ============================================
    const observerOptions = {
        threshold: 0.1,
        rootMargin: '0px 0px -50px 0px'
    };

    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.classList.add('fade-in');
                observer.unobserve(entry.target);
            }
        });
    }, observerOptions);

    // Observe cards and sections for fade-in animations
    const animateElements = document.querySelectorAll(
        '.snapshot-card, .premium-card, .pillar-card, .opportunity-card, .advantage-item'
    );
    
    animateElements.forEach(el => {
        el.style.opacity = '0';
        el.style.transform = 'translateY(20px)';
        el.style.transition = 'opacity 0.6s ease, transform 0.6s ease';
        observer.observe(el);
    });

    // ============================================
    // Dynamic Market Data Updates (Simulated)
    // ============================================
    const updateMarketData = () => {
        const tickerItems = document.querySelectorAll('.ticker-item:not(.ticker-separator)');
        
        tickerItems.forEach(item => {
            if (!item.textContent.includes('VIX')) {
                const currentText = item.textContent;
                const isPositive = item.classList.contains('positive');
                
                // Simulate small price changes
                const change = (Math.random() * 0.2 - 0.1).toFixed(2);
                const newChange = (parseFloat(currentText.split(' ')[1]) + parseFloat(change)).toFixed(2);
                
                item.textContent = `${currentText.split(' ')[0]} ${newChange > 0 ? '+' : ''}${newChange}%`;
                
                // Update color based on new value
                item.classList.remove('positive', 'negative');
                if (newChange > 0) {
                    item.classList.add('positive');
                } else if (newChange < 0) {
                    item.classList.add('negative');
                }
            }
        });
    };

    // Update market data every 30 seconds (simulated)
    setInterval(updateMarketData, 30000);

    // ============================================
    // Login/Signup Button Handlers
    // ============================================
    const loginBtn = document.querySelector('.btn-login');
    const signupBtn = document.querySelector('.btn-signup');

    if (loginBtn) {
        loginBtn.addEventListener('click', () => {
            alert('Login functionality will be implemented. This is a demo.');
            // In production: window.location.href = '/login';
        });
    }

    if (signupBtn) {
        signupBtn.addEventListener('click', () => {
            alert('Sign up functionality will be implemented. This is a demo.');
            // In production: window.location.href = '/signup';
        });
    }

    // ============================================
    // CTA Button Handlers
    // ============================================
    const ctaButtons = document.querySelectorAll('.btn-primary, .btn-primary-large, .btn-outline');
    
    ctaButtons.forEach(button => {
        button.addEventListener('click', function(e) {
            const buttonText = this.textContent.trim().toLowerCase();
            
            if (buttonText.includes('scan') || buttonText.includes('scanner')) {
                alert('Scanner feature will be available in the full platform.');
                // In production: window.location.href = '/scanner';
            } else if (buttonText.includes('analysis')) {
                alert('Full analysis feature will be available in the full platform.');
                // In production: window.location.href = '/analysis';
            } else if (buttonText.includes('trial') || buttonText.includes('free')) {
                alert('Free trial sign-up will be implemented. This is a demo.');
                // In production: window.location.href = '/signup?trial=true';
            } else if (buttonText.includes('methodology')) {
                alert('Methodology documentation will be available in the full platform.');
                // In production: window.location.href = '/methodology';
            }
        });
    });

    // ============================================
    // Navigation Item Handlers
    // ============================================
    const navItems = document.querySelectorAll('.nav-item, .logo');
    
    navItems.forEach(item => {
        item.addEventListener('click', function() {
            const itemText = this.querySelector('span').textContent.toLowerCase();
            
            // Remove active class from all items
            navItems.forEach(nav => nav.classList.remove('active'));
            
            // Add active class to clicked item
            this.classList.add('active');
            
            // Handle navigation
            switch(itemText) {
                case 'home':
                    window.scrollTo({ top: 0, behavior: 'smooth' });
                    break;
                case 'watchlist':
                    alert('Watchlist feature will be available in the full platform.');
                    break;
                case 'positions':
                    alert('Positions tracking will be available in the full platform.');
                    break;
                case 'scanner':
                    alert('Scanner feature will be available in the full platform.');
                    break;
                case 'account':
                    alert('Account management will be available in the full platform.');
                    break;
            }
        });
    });

    // ============================================
    // Scroll Progress Indicator
    // ============================================
    const createScrollProgress = () => {
        const progressBar = document.createElement('div');
        progressBar.className = 'scroll-progress';
        progressBar.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 0%;
            height: 3px;
            background: linear-gradient(90deg, #10b981, #0ea5e9);
            z-index: 9999;
            transition: width 0.1s ease;
        `;
        document.body.appendChild(progressBar);

        window.addEventListener('scroll', () => {
            const windowHeight = document.documentElement.scrollHeight - document.documentElement.clientHeight;
            const scrolled = (window.scrollY / windowHeight) * 100;
            progressBar.style.width = scrolled + '%';
        });
    };

    createScrollProgress();

    // ============================================
    // Back to Top Button
    // ============================================
    const createBackToTop = () => {
        const backToTop = document.createElement('button');
        backToTop.className = 'back-to-top';
        backToTop.innerHTML = '<i class="fas fa-arrow-up"></i>';
        backToTop.setAttribute('aria-label', 'Back to top');
        backToTop.style.cssText = `
            position: fixed;
            bottom: 2rem;
            right: 2rem;
            width: 50px;
            height: 50px;
            border-radius: 50%;
            background-color: #10b981;
            color: white;
            border: none;
            cursor: pointer;
            opacity: 0;
            visibility: hidden;
            transition: all 0.3s ease;
            box-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.1);
            z-index: 999;
        `;

        document.body.appendChild(backToTop);

        window.addEventListener('scroll', () => {
            if (window.scrollY > 500) {
                backToTop.style.opacity = '1';
                backToTop.style.visibility = 'visible';
            } else {
                backToTop.style.opacity = '0';
                backToTop.style.visibility = 'hidden';
            }
        });

        backToTop.addEventListener('click', () => {
            window.scrollTo({ top: 0, behavior: 'smooth' });
        });

        backToTop.addEventListener('mouseenter', () => {
            backToTop.style.transform = 'translateY(-5px)';
            backToTop.style.boxShadow = '0 10px 15px -3px rgb(0 0 0 / 0.1)';
        });

        backToTop.addEventListener('mouseleave', () => {
            backToTop.style.transform = 'translateY(0)';
            backToTop.style.boxShadow = '0 4px 6px -1px rgb(0 0 0 / 0.1)';
        });
    };

    createBackToTop();

    // ============================================
    // Performance Optimization
    // ============================================
    // Lazy load images when they enter viewport
    if ('IntersectionObserver' in window) {
        const imageObserver = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    const img = entry.target;
                    if (img.dataset.src) {
                        img.src = img.dataset.src;
                        img.removeAttribute('data-src');
                        imageObserver.unobserve(img);
                    }
                }
            });
        });

        document.querySelectorAll('img[data-src]').forEach(img => {
            imageObserver.observe(img);
        });
    }

    // ============================================
    // Accessibility Enhancements
    // ============================================
    // Add keyboard navigation support
    document.addEventListener('keydown', (e) => {
        // ESC key to close any open modals or menus
        if (e.key === 'Escape') {
            const mobileMenu = document.querySelector('.logo-section.mobile-active');
            if (mobileMenu) {
                mobileMenu.classList.remove('mobile-active');
                const toggle = document.querySelector('.mobile-menu-toggle i');
                if (toggle) {
                    toggle.className = 'fas fa-bars';
                }
            }
        }
    });

    // ============================================
    // Console Welcome Message
    // ============================================
    console.log('%cWelcome to ZenOptions Intelligence Platform', 
        'font-size: 20px; font-weight: bold; color: #10b981;');
    console.log('%cSystematic Options Trading Intelligence', 
        'font-size: 14px; color: #64748b;');
    console.log('%cInterested in our API? Contact us at: support@zenoptions.com', 
        'font-size: 12px; color: #94a3b8;');

    // Add fade-in class for animation
    const style = document.createElement('style');
    style.textContent = `
        .fade-in {
            opacity: 1 !important;
            transform: translateY(0) !important;
        }
        
        .ripple {
            position: absolute;
            border-radius: 50%;
            background: rgba(255, 255, 255, 0.6);
            transform: scale(0);
            animation: ripple-animation 0.6s ease-out;
            pointer-events: none;
        }
        
        @keyframes ripple-animation {
            to {
                transform: scale(4);
                opacity: 0;
            }
        }
        
        .mobile-menu-toggle {
            display: none;
            background: transparent;
            border: none;
            color: white;
            font-size: 1.5rem;
            cursor: pointer;
            padding: 0.5rem;
        }
        
        @media (max-width: 768px) {
            .mobile-menu-toggle {
                display: block;
            }
            
            .logo-section {
                display: none;
                flex-direction: column;
                position: absolute;
                top: 100%;
                left: 0;
                right: 0;
                background-color: var(--dark-bg);
                padding: 1rem;
                border-top: 1px solid #334155;
            }
            
            .logo-section.mobile-active {
                display: flex;
            }
        }
    `;
    document.head.appendChild(style);
});

// ============================================
// Export for potential module usage
// ============================================
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        // Export any functions that might be useful for testing
    };
}