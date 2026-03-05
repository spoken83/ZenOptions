import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Sparkles, Rocket, ChevronRight, X, PlayCircle, RotateCcw } from "lucide-react";

interface WelcomeModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onStartTutorial: () => void;
  onResumeTutorial?: () => void;
  onSkip: () => void;
  savedStep?: number;
}

export default function WelcomeModal({ open, onOpenChange, onStartTutorial, onResumeTutorial, onSkip, savedStep = 0 }: WelcomeModalProps) {
  const hasProgress = savedStep > 0;
  
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg p-0 overflow-hidden" hideCloseButton>
        <div className="relative">
          <div className="absolute inset-0 bg-gradient-to-br from-primary/20 via-primary/5 to-transparent" />
          
          <div className="relative p-8">
            <div className="flex items-center justify-center mb-6">
              <div className="h-16 w-16 rounded-full bg-primary/10 flex items-center justify-center">
                <Sparkles className="h-8 w-8 text-primary" />
              </div>
            </div>
            
            <DialogHeader className="text-center space-y-3">
              <DialogTitle className="text-2xl font-bold">
                {hasProgress ? "Welcome Back!" : "Welcome to Zen Options"}
              </DialogTitle>
              <DialogDescription className="text-base text-muted-foreground">
                {hasProgress 
                  ? `You're on step ${savedStep + 1} of 9. Ready to continue?`
                  : "Let's set up your first trade in 2 minutes. We'll show you how to:"}
              </DialogDescription>
            </DialogHeader>

            <div className="mt-6 space-y-3">
              <div className="flex items-start gap-3 p-3 rounded-lg bg-muted/50">
                <div className="h-6 w-6 rounded-full bg-primary/20 flex items-center justify-center shrink-0 mt-0.5">
                  <span className="text-xs font-bold text-primary">1</span>
                </div>
                <div>
                  <p className="font-medium text-sm">Add tickers to your watchlist</p>
                  <p className="text-xs text-muted-foreground">Auto-detect support and resistance levels</p>
                </div>
              </div>
              
              <div className="flex items-start gap-3 p-3 rounded-lg bg-muted/50">
                <div className="h-6 w-6 rounded-full bg-primary/20 flex items-center justify-center shrink-0 mt-0.5">
                  <span className="text-xs font-bold text-primary">2</span>
                </div>
                <div>
                  <p className="font-medium text-sm">Scan for trading opportunities</p>
                  <p className="text-xs text-muted-foreground">Credit Spreads, Iron Condors, and LEAPS</p>
                </div>
              </div>
              
              <div className="flex items-start gap-3 p-3 rounded-lg bg-muted/50">
                <div className="h-6 w-6 rounded-full bg-primary/20 flex items-center justify-center shrink-0 mt-0.5">
                  <span className="text-xs font-bold text-primary">3</span>
                </div>
                <div>
                  <p className="font-medium text-sm">Track positions with ZenStatus</p>
                  <p className="text-xs text-muted-foreground">Know exactly when to act on your trades</p>
                </div>
              </div>
            </div>

            <div className="mt-8 flex flex-col gap-3">
              {hasProgress ? (
                <>
                  <Button 
                    size="lg" 
                    className="w-full gap-2"
                    onClick={onResumeTutorial}
                    data-testid="button-resume-tutorial"
                  >
                    <PlayCircle className="h-4 w-4" />
                    Continue Where I Left Off
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                  
                  <Button 
                    variant="outline" 
                    size="sm"
                    className="w-full gap-2"
                    onClick={onStartTutorial}
                    data-testid="button-restart-tutorial"
                  >
                    <RotateCcw className="h-4 w-4" />
                    Start Over
                  </Button>
                </>
              ) : (
                <Button 
                  size="lg" 
                  className="w-full gap-2"
                  onClick={onStartTutorial}
                  data-testid="button-start-tutorial"
                >
                  <Rocket className="h-4 w-4" />
                  Start Quick Tour
                  <ChevronRight className="h-4 w-4" />
                </Button>
              )}
              
              <Button 
                variant="ghost" 
                size="sm"
                className="w-full text-muted-foreground"
                onClick={onSkip}
                data-testid="button-skip-tutorial"
              >
                <X className="h-4 w-4 mr-1" />
                Skip for now - I'll explore on my own
              </Button>
            </div>

            <p className="mt-4 text-center text-xs text-muted-foreground">
              You can restart this quickstart anytime from your profile menu
            </p>
            
            <p className="mt-2 text-center text-xs text-muted-foreground">
              Prefer video?{" "}
              <a 
                href="https://www.youtube.com/watch?v=663KA-c1LT8"
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary hover:underline"
              >
                Watch the video tutorial
              </a>
            </p>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
