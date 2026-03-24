import { useGetMe, useLogout } from "@/lib/api-client";
import { useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";

export function useAuth() {
  const queryClient = useQueryClient();
  const [, setLocation] = useLocation();

  const { data, isLoading, error } = useGetMe({
    query: {
      retry: false,
      staleTime: 5 * 60 * 1000, // 5 mins
    }
  });

  const logoutMutation = useLogout({
    mutation: {
      onSuccess: () => {
        queryClient.clear();
        setLocation("/");
      }
    }
  });

  const logout = () => {
    logoutMutation.mutate();
  };

  return {
    user: data?.user || null,
    isAuthenticated: !!data?.user,
    isLoading,
    error,
    logout,
    isLoggingOut: logoutMutation.isPending
  };
}
