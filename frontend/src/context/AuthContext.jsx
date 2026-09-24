import { createContext, useContext, useEffect, useState, useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { authApi } from "@/api/auth";
import { remembered, forgetKept, lastKept } from "@/lib/kept";

// Who is signed in, kept: opened with no signal, the app still knows.
const whoAmI = remembered("me", () => authApi.me());

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  // Drawn at once as whoever was signed in last time; the check below confirms it or signs them out.
  const [user, setUser] = useState(() => lastKept("me")?.user || null);
  const [loading, setLoading] = useState(() => !lastKept("me")?.user);
  const queryClient = useQueryClient();

  const refresh = useCallback(async () => {
    try {
      const { user } = await whoAmI();
      setUser(user);
    } catch {
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const login = useCallback(async (credentials) => {
    const { user } = await authApi.login(credentials);
    setUser(user);
    return user;
  }, []);

  const register = useCallback(async (payload) => {
    const { user } = await authApi.register(payload);
    setUser(user);
    return user;
  }, []);

  const updateProfile = useCallback(async (payload) => {
    const { user } = await authApi.updateProfile(payload);
    setUser(user);
    return user;
  }, []);

  const logout = useCallback(async () => {
    try {
      await authApi.logout();
    } finally {
      setUser(null);
      queryClient.clear();
      forgetKept();
    }
  }, [queryClient]);

  return (
    <AuthContext.Provider value={{ user, loading, login, register, logout, refresh, updateProfile }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}
