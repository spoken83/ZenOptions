import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Shield, FileText, Lock, Database } from "lucide-react";
import { PageSEO } from "@/components/seo/PageSEO";

export default function Legal() {
  const [location] = useLocation();
  
  const getDefaultTab = () => {
    const params = new URLSearchParams(window.location.search);
    const tab = params.get('tab');
    if (tab && ['disclaimer', 'terms', 'privacy', 'data'].includes(tab)) {
      return tab;
    }
    return 'disclaimer';
  };
  
  const [activeTab, setActiveTab] = useState(getDefaultTab);
  
  useEffect(() => {
    window.scrollTo(0, 0);
    setActiveTab(getDefaultTab());
  }, [location]);

  return (
    <div className="min-h-screen">
      <PageSEO 
        title="Legal & Privacy" 
        description="Legal disclaimer, terms of service, privacy policy, and data handling information for ZenOptions."
      />
      <section className="py-12 sm:py-16 px-4 sm:px-8 bg-gradient-to-br from-slate-900 to-slate-800 relative overflow-hidden">
        <div className="absolute inset-0 bg-radial-green-glow pointer-events-none"></div>
        <div className="max-w-[900px] mx-auto relative z-10">
          <div className="text-center mb-10">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-primary/20 mb-6">
              <FileText className="w-8 h-8 text-primary" />
            </div>
            <h1 className="text-3xl sm:text-4xl font-bold text-white mb-4" data-testid="legal-title">
              Legal & Privacy
            </h1>
            <p className="text-lg text-slate-300">
              Important information about using ZenOptions
            </p>
          </div>

          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
            <TabsList className="grid w-full grid-cols-2 sm:grid-cols-4 mb-6 bg-slate-800/50">
              <TabsTrigger value="disclaimer" className="text-xs sm:text-sm" data-testid="tab-disclaimer">
                <Shield className="w-4 h-4 mr-1 hidden sm:inline" />
                Disclaimer
              </TabsTrigger>
              <TabsTrigger value="terms" className="text-xs sm:text-sm" data-testid="tab-terms">
                <FileText className="w-4 h-4 mr-1 hidden sm:inline" />
                Terms
              </TabsTrigger>
              <TabsTrigger value="privacy" className="text-xs sm:text-sm" data-testid="tab-privacy">
                <Lock className="w-4 h-4 mr-1 hidden sm:inline" />
                Privacy
              </TabsTrigger>
              <TabsTrigger value="data" className="text-xs sm:text-sm" data-testid="tab-data">
                <Database className="w-4 h-4 mr-1 hidden sm:inline" />
                Data
              </TabsTrigger>
            </TabsList>

            <div className="bg-white rounded-lg border border-slate-200 p-6 sm:p-8 shadow-sm">
              <ScrollArea className="h-[500px] sm:h-[600px] pr-4">
                <TabsContent value="disclaimer" className="mt-0">
                  <h2 className="text-2xl font-bold text-foreground mb-6">Risk Disclaimer</h2>
                  
                  <div className="space-y-6 text-muted-foreground">
                    <div className="p-4 rounded-lg bg-amber-50 border border-amber-200">
                      <p className="text-amber-700 font-semibold mb-2">Important Notice</p>
                      <p className="text-sm text-amber-800">
                        Options trading involves substantial risk of loss and is not appropriate for all investors. 
                        You may lose more than your initial investment. Past performance is not indicative of future results.
                      </p>
                    </div>

                    <div>
                      <h3 className="text-lg font-semibold text-foreground mb-3">Educational Purpose Only</h3>
                      <p className="text-sm leading-relaxed">
                        ZenOptions provides educational analysis and monitoring tools. The information provided by our platform 
                        is for informational and educational purposes only. It should not be considered as investment advice, 
                        financial advice, trading advice, or any other sort of advice. We do not recommend that any 
                        cryptocurrency or financial instrument should be bought, sold, or held by you.
                      </p>
                    </div>

                    <div>
                      <h3 className="text-lg font-semibold text-foreground mb-3">No Liability</h3>
                      <p className="text-sm leading-relaxed">
                        ZenOptions shall not be held liable for any losses, damages, or claims arising from:
                      </p>
                      <ul className="list-disc list-inside text-sm mt-2 space-y-1 ml-2">
                        <li>Trading decisions made based on information from our platform</li>
                        <li>Market volatility or unexpected price movements</li>
                        <li>Data delays, inaccuracies, or interruptions from third-party providers</li>
                        <li>Technical issues, system failures, or service interruptions</li>
                        <li>Incorrect or untimely alerts or notifications</li>
                        <li>Changes in market conditions or regulatory environment</li>
                      </ul>
                    </div>

                    <div>
                      <h3 className="text-lg font-semibold text-foreground mb-3">Your Responsibility</h3>
                      <p className="text-sm leading-relaxed">
                        You are solely responsible for your trading decisions. Before trading options, you should:
                      </p>
                      <ul className="list-disc list-inside text-sm mt-2 space-y-1 ml-2">
                        <li>Consult with a qualified financial advisor</li>
                        <li>Understand the risks involved in options trading</li>
                        <li>Only trade with capital you can afford to lose</li>
                        <li>Verify all information independently before acting</li>
                      </ul>
                    </div>
                  </div>
                </TabsContent>

                <TabsContent value="terms" className="mt-0">
                  <h2 className="text-2xl font-bold text-foreground mb-6">Terms of Service</h2>
                  
                  <div className="space-y-6 text-muted-foreground">
                    <div>
                      <h3 className="text-lg font-semibold text-foreground mb-3">1. Acceptance of Terms</h3>
                      <p className="text-sm leading-relaxed">
                        By accessing or using ZenOptions, you agree to be bound by these Terms of Service. 
                        If you do not agree to these terms, please do not use our services.
                      </p>
                    </div>

                    <div>
                      <h3 className="text-lg font-semibold text-foreground mb-3">2. Service Description</h3>
                      <p className="text-sm leading-relaxed">
                        ZenOptions provides options trading monitoring and analysis tools. Our services include 
                        position tracking, alert notifications, market scanning, and educational content. 
                        We are not a broker, financial advisor, or registered investment company.
                      </p>
                    </div>

                    <div>
                      <h3 className="text-lg font-semibold text-foreground mb-3">3. Account Registration</h3>
                      <p className="text-sm leading-relaxed">
                        You must provide accurate and complete information when creating an account. 
                        You are responsible for maintaining the confidentiality of your account credentials 
                        and for all activities that occur under your account.
                      </p>
                    </div>

                    <div>
                      <h3 className="text-lg font-semibold text-foreground mb-3">4. Subscription & Billing</h3>
                      <p className="text-sm leading-relaxed">
                        Paid subscriptions are billed monthly. You may cancel at any time, and your access 
                        will continue until the end of your current billing period. Refunds are not provided 
                        for partial months or unused features.
                      </p>
                    </div>

                    <div>
                      <h3 className="text-lg font-semibold text-foreground mb-3">5. Prohibited Uses</h3>
                      <p className="text-sm leading-relaxed">
                        You may not use ZenOptions to:
                      </p>
                      <ul className="list-disc list-inside text-sm mt-2 space-y-1 ml-2">
                        <li>Violate any applicable laws or regulations</li>
                        <li>Resell, redistribute, or commercialize our data or services</li>
                        <li>Attempt to access unauthorized areas of our systems</li>
                        <li>Interfere with the proper functioning of the platform</li>
                      </ul>
                    </div>

                    <div>
                      <h3 className="text-lg font-semibold text-foreground mb-3">6. Intellectual Property</h3>
                      <p className="text-sm leading-relaxed">
                        All content, features, and functionality of ZenOptions are owned by us and are 
                        protected by copyright, trademark, and other intellectual property laws.
                      </p>
                    </div>

                    <div>
                      <h3 className="text-lg font-semibold text-foreground mb-3">7. Termination</h3>
                      <p className="text-sm leading-relaxed">
                        We reserve the right to suspend or terminate your account at any time for violation 
                        of these terms or for any other reason at our sole discretion.
                      </p>
                    </div>
                  </div>
                </TabsContent>

                <TabsContent value="privacy" className="mt-0">
                  <h2 className="text-2xl font-bold text-foreground mb-6">Privacy Policy</h2>
                  
                  <div className="space-y-6 text-muted-foreground">
                    <div>
                      <h3 className="text-lg font-semibold text-foreground mb-3">Information We Collect</h3>
                      <p className="text-sm leading-relaxed">
                        We collect information you provide directly to us, including:
                      </p>
                      <ul className="list-disc list-inside text-sm mt-2 space-y-1 ml-2">
                        <li>Account information (name, email, authentication data)</li>
                        <li>Watchlist and position data you enter</li>
                        <li>Usage data and interaction with our platform</li>
                        <li>Feedback and correspondence you send to us</li>
                      </ul>
                    </div>

                    <div>
                      <h3 className="text-lg font-semibold text-foreground mb-3">How We Use Your Information</h3>
                      <p className="text-sm leading-relaxed">
                        We use your information to:
                      </p>
                      <ul className="list-disc list-inside text-sm mt-2 space-y-1 ml-2">
                        <li>Provide, maintain, and improve our services</li>
                        <li>Send you alerts and notifications you've requested</li>
                        <li>Process your subscription payments</li>
                        <li>Respond to your comments and questions</li>
                        <li>Analyze usage patterns to improve user experience</li>
                      </ul>
                    </div>

                    <div>
                      <h3 className="text-lg font-semibold text-foreground mb-3">Data Security</h3>
                      <p className="text-sm leading-relaxed">
                        We implement appropriate security measures to protect your personal information. 
                        However, no method of transmission over the Internet is 100% secure, and we cannot 
                        guarantee absolute security.
                      </p>
                    </div>

                    <div>
                      <h3 className="text-lg font-semibold text-foreground mb-3">Data Sharing</h3>
                      <p className="text-sm leading-relaxed">
                        We do not sell your personal information. We may share your information with:
                      </p>
                      <ul className="list-disc list-inside text-sm mt-2 space-y-1 ml-2">
                        <li>Service providers who assist in operating our platform (Stripe, Auth0)</li>
                        <li>Law enforcement when required by law</li>
                        <li>Third parties with your explicit consent</li>
                      </ul>
                    </div>

                    <div>
                      <h3 className="text-lg font-semibold text-foreground mb-3">Your Rights</h3>
                      <p className="text-sm leading-relaxed">
                        You have the right to access, correct, or delete your personal information. 
                        Contact us at support@zenoptions.app for any privacy-related requests.
                      </p>
                    </div>
                  </div>
                </TabsContent>

                <TabsContent value="data" className="mt-0">
                  <h2 className="text-2xl font-bold text-foreground mb-6">Data Attribution & Sources</h2>
                  
                  <div className="space-y-6 text-muted-foreground">
                    <div className="p-4 rounded-lg bg-slate-100 border border-slate-200">
                      <p className="text-sm">
                        ZenOptions uses data from multiple third-party providers. We do not guarantee 
                        the accuracy, completeness, or timeliness of any data displayed on our platform.
                      </p>
                    </div>

                    <div>
                      <h3 className="text-lg font-semibold text-foreground mb-3">Market Data Providers</h3>
                      <div className="space-y-4">
                        <div className="p-3 rounded bg-slate-100 border border-slate-200">
                          <p className="font-semibold text-foreground">Polygon.io</p>
                          <p className="text-sm">Real-time and historical stock and options market data</p>
                        </div>
                        <div className="p-3 rounded bg-slate-100 border border-slate-200">
                          <p className="font-semibold text-foreground">Federal Reserve Economic Data (FRED)</p>
                          <p className="text-sm">VIX index and economic indicators</p>
                        </div>
                        <div className="p-3 rounded bg-slate-100 border border-slate-200">
                          <p className="font-semibold text-foreground">Finnhub</p>
                          <p className="text-sm">Supplementary market data and news</p>
                        </div>
                      </div>
                    </div>

                    <div>
                      <h3 className="text-lg font-semibold text-foreground mb-3">AI Analysis</h3>
                      <p className="text-sm leading-relaxed">
                        Market context analysis is powered by OpenAI's GPT-4 model. AI-generated insights 
                        are for informational purposes only and should not be considered as financial advice. 
                        AI outputs may contain inaccuracies or errors.
                      </p>
                    </div>

                    <div>
                      <h3 className="text-lg font-semibold text-foreground mb-3">Data Delays & Limitations</h3>
                      <ul className="list-disc list-inside text-sm space-y-2 ml-2">
                        <li>Stock prices may be delayed by 15 minutes during market hours</li>
                        <li>Options data refreshes periodically, not in real-time</li>
                        <li>Support/resistance levels are recalculated weekly</li>
                        <li>Market context analysis runs 4 times daily during trading hours</li>
                        <li>Historical data availability varies by ticker</li>
                      </ul>
                    </div>

                    <div>
                      <h3 className="text-lg font-semibold text-foreground mb-3">No Warranty</h3>
                      <p className="text-sm leading-relaxed">
                        All data is provided "as is" without warranty of any kind. We are not responsible 
                        for any errors, omissions, or delays in the data or for any actions taken in reliance thereon.
                      </p>
                    </div>
                  </div>
                </TabsContent>
              </ScrollArea>
            </div>
          </Tabs>

          <div className="mt-8 text-center text-slate-300 text-sm">
            <p>Last updated: November 2025</p>
            <p className="mt-2">
              Questions? Contact us at{" "}
              <a href="mailto:support@zenoptions.app" className="text-primary hover:underline">
                support@zenoptions.app
              </a>
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}
