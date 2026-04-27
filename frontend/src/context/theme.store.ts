import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type ThemeName = 'light' | 'oled' | 'midnight';

interface ThemeState {
  theme: ThemeName;
  setTheme: (theme: ThemeName) => void;
}

export const useThemeStore = create<ThemeState>()(
  persist(
    (set) => ({
      theme: 'light',
      setTheme: (theme) => set({ theme }),
    }),
    {
      name: 'theme-storage',
      version: 1,
      migrate: (persistedState) => {
        if (
          typeof persistedState === 'object' &&
          persistedState !== null &&
          'theme' in persistedState &&
          persistedState.theme === 'sepia'
        ) {
          return { ...persistedState, theme: 'oled' } as ThemeState;
        }
        return persistedState as ThemeState;
      },
    }
  )
);
