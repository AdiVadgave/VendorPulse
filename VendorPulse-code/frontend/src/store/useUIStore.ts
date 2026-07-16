import { create } from 'zustand'
import { persist } from 'zustand/middleware'

type Theme = 'light' | 'dark'

interface UIStore {
  theme: Theme
  sidebarCollapsed: boolean
  /** Small-screen off-canvas nav drawer (not persisted — always starts closed). */
  mobileNavOpen: boolean
  toggleTheme: () => void
  toggleSidebar: () => void
  setMobileNavOpen: (open: boolean) => void
  setTheme: (theme: Theme) => void
}

export const useUIStore = create<UIStore>()(
  persist(
    (set) => ({
      theme: 'light',
      sidebarCollapsed: false,
      mobileNavOpen: false,
      toggleTheme: () =>
        set((s) => ({ theme: s.theme === 'light' ? 'dark' : 'light' })),
      toggleSidebar: () =>
        set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
      setMobileNavOpen: (open) => set({ mobileNavOpen: open }),
      setTheme: (theme) => set({ theme }),
    }),
    {
      name: 'vp-ui-prefs',
      // Only persist durable prefs; the mobile drawer must always start closed.
      partialize: (s) => ({ theme: s.theme, sidebarCollapsed: s.sidebarCollapsed }),
    }
  )
)
