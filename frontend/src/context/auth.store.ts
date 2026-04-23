import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface User {
  id: string;
  email: string;
  name: string;
  displayName?: string;
  dashboardSubtitle?: string | null;
  showDashboardSubtitle?: boolean;
  uiRadius?: number;
  globalRole: string;
}

interface AuthState {
  accessToken: string | null;
  refreshToken: string | null;
  user: User | null;
  isAuthenticated: boolean;
  setAuth: (tokens: { accessToken: string; refreshToken: string; user: User }) => void;
  setTokens: (tokens: { accessToken: string; refreshToken: string }) => void;
  logout: () => void;
  updateUser: (user: Partial<User>) => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      accessToken: null,
      refreshToken: null,
      user: null,
      isAuthenticated: false,
      setAuth: ({ accessToken, refreshToken, user }) =>
        set({ accessToken, refreshToken, user, isAuthenticated: true }),
      setTokens: ({ accessToken, refreshToken }) =>
        set((state) => ({
          accessToken,
          refreshToken,
          user: state.user,
          isAuthenticated: Boolean(state.user),
        })),
      logout: () =>
        set({ accessToken: null, refreshToken: null, user: null, isAuthenticated: false }),
      updateUser: (userData) =>
        set((state) => ({ user: state.user ? { ...state.user, ...userData } : null })),
    }),
    { name: 'auth-storage' }
  )
);
