import { useQuery } from "@tanstack/react-query";
import type { User } from "@shared/schema";

export function useAuth() {
  const { data: user, isLoading } = useQuery<User>({
    queryKey: ["/api/auth/user"],
    retry: false,
  });

  const isAuthenticated = !!user;
  const isPreLoginMode = !isLoading && !isAuthenticated;

  return {
    user,
    isLoading,
    isAuthenticated,
    isPreLoginMode,
  };
}
