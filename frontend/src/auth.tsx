import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { api, tokenStore, type Me, type Role, type TokenOut } from "./api";

interface AuthState {
  me: Me | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<Me>;
  switchRole: (role: Role) => Promise<Me>;
  logout: () => void;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [me, setMe] = useState<Me | null>(null);
  const [loading, setLoading] = useState(true);

  const loadMe = useCallback(async () => {
    const m = await api<Me>("/api/auth/me");
    setMe(m);
    return m;
  }, []);

  useEffect(() => {
    if (!tokenStore.get()) { setLoading(false); return; }
    loadMe().catch(() => tokenStore.set(null)).finally(() => setLoading(false));
  }, [loadMe]);

  const applyToken = useCallback(async (t: TokenOut) => { tokenStore.set(t.access_token); return loadMe(); }, [loadMe]);

  const value: AuthState = {
    me,
    loading,
    login: async (email, password) => applyToken(await api<TokenOut>("/api/auth/login", { method: "POST", json: { email, password } })),
    switchRole: async (role) => applyToken(await api<TokenOut>("/api/auth/switch-role", { method: "POST", json: { role } })),
    logout: () => { tokenStore.set(null); setMe(null); },
  };
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth outside AuthProvider");
  return ctx;
}

export const HOME: Record<Role, string> = {
  admin: "/admin",
  ministry: "/admin",
  athlete: "/calendar",
  coach: "/coach/athletes",
  judge: "/judge",
};
