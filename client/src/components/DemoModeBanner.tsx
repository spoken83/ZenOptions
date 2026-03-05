import { Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useState } from "react";
import { AuthModal } from "@/components/auth/AuthModal";

export function DemoModeBanner() {
  const [showAuthModal, setShowAuthModal] = useState(false);

  return (
    <>
      <div 
        className="bg-gradient-to-r from-blue-600 to-purple-600 text-white px-4 py-3 shadow-md"
        data-testid="banner-demo-mode"
      >
        <div className="container mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Info className="h-5 w-5 flex-shrink-0" />
            <p className="text-sm font-medium">
              You're viewing a demo. Sign up to track your own positions and receive alerts!
            </p>
          </div>
          <Button
            onClick={() => setShowAuthModal(true)}
            variant="secondary"
            size="sm"
            className="ml-4 bg-white text-purple-600 hover:bg-gray-100"
            data-testid="button-signup-from-banner"
          >
            Sign Up Free
          </Button>
        </div>
      </div>
      
      <AuthModal 
        open={showAuthModal} 
        onOpenChange={setShowAuthModal}
        defaultTab="signup"
      />
    </>
  );
}
