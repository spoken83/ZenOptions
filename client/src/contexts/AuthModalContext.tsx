import { createContext, useContext, useState, type ReactNode } from "react";
import { AuthModal } from "@/components/auth/AuthModal";

interface AuthModalContextType {
  openAuthModal: (tab?: "login" | "signup") => void;
  closeAuthModal: () => void;
}

const AuthModalContext = createContext<AuthModalContextType | undefined>(undefined);

export function AuthModalProvider({ children }: { children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  const [defaultTab, setDefaultTab] = useState<"login" | "signup">("signup");

  const openAuthModal = (tab: "login" | "signup" = "signup") => {
    setDefaultTab(tab);
    setIsOpen(true);
  };

  const closeAuthModal = () => {
    setIsOpen(false);
  };

  return (
    <AuthModalContext.Provider value={{ openAuthModal, closeAuthModal }}>
      {children}
      <AuthModal 
        open={isOpen} 
        onOpenChange={setIsOpen}
        defaultTab={defaultTab}
      />
    </AuthModalContext.Provider>
  );
}

export function useAuthModal() {
  const context = useContext(AuthModalContext);
  if (context === undefined) {
    throw new Error("useAuthModal must be used within an AuthModalProvider");
  }
  return context;
}
