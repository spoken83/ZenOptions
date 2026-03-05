import { Link } from "wouter";
import { useAuthModal } from "@/contexts/AuthModalContext";
import logoBlackBg from "@assets/logo-blackbg__1__1763214067805.png";

export default function Footer() {
  const { openAuthModal } = useAuthModal();
  
  const scrollToTop = () => {
    window.scrollTo({ top: 0, behavior: 'instant' });
  };
  
  return (
    <footer className="main-footer" data-testid="main-footer">
      <div className="container max-w-[1280px] mx-auto px-4 sm:px-8">
        <div className="footer-content">
          <div className="footer-brand">
            <img src={logoBlackBg} alt="ZenOptions" className="h-8" />
            <p>Design for the Zen option trader</p>
          </div>
          
          <div className="footer-links">
            <div className="link-column">
              <h4>Product</h4>
              <Link href="/#features" onClick={scrollToTop} data-testid="footer-link-features">Features</Link>
              <Link href="/how-it-works" onClick={scrollToTop} data-testid="footer-link-how-it-works">How It Works</Link>
              <Link href="/pricing" onClick={scrollToTop} data-testid="footer-link-pricing">Pricing</Link>
              <button 
                onClick={() => openAuthModal("signup")} 
                className="footer-auth-link"
                data-testid="footer-link-signup"
              >
                Sign Up for Free
              </button>
            </div>
            <div className="link-column">
              <h4>Resources</h4>
              <Link href="/resources" onClick={scrollToTop} data-testid="footer-link-resources">Videos & Tutorials</Link>
              <Link href="/how-it-works#faq" onClick={scrollToTop} data-testid="footer-link-faq">FAQ</Link>
              <Link href="/contact" onClick={scrollToTop} data-testid="footer-link-contact">Contact</Link>
              <Link href="/legal?tab=data" onClick={scrollToTop} data-testid="footer-link-data">Data Sources</Link>
              <Link href="/legal" onClick={scrollToTop} data-testid="footer-link-terms">Terms of Service</Link>
            </div>
          </div>
        </div>
        
        <div className="footer-legal">
          <p>ZenOptions is a platform of research, analysis and monitoring tools intended to assist options traders in making their own decisions. Nothing on this platform should be construed as investment advice. The platform and its features are provided 'as-is' without warranty of any kind.</p>
          <p>See our <Link href="/legal" className="text-primary hover:underline">Terms of Service</Link> and <Link href="/legal?tab=data" className="text-primary hover:underline">Data Sources</Link> for additional disclaimers. Market data is provided by Polygon, FRED, Finnhub and others. Always do your own research before making trading decisions.</p>
          <p>© 2025 ZenOptions. All rights reserved.</p>
        </div>
      </div>
    </footer>
  );
}
