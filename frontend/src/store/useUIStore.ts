import { create } from 'zustand'
import { persist } from 'zustand/middleware'

type Theme = 'dark' | 'shell'

// Cycle order for the single toolbar toggle: Shell ⇄ Dark.
const THEME_CYCLE: Theme[] = ['shell', 'dark']

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
      theme: 'shell',
      sidebarCollapsed: false,
      mobileNavOpen: false,
      toggleTheme: () =>
        set((s) => {
          const i = THEME_CYCLE.indexOf(s.theme)
          return { theme: THEME_CYCLE[(i + 1) % THEME_CYCLE.length] }
        }),
      toggleSidebar: () =>
        set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
      setMobileNavOpen: (open) => set({ mobileNavOpen: open }),
      setTheme: (theme) => set({ theme }),
    }),
    {
      name: 'vp-ui-prefs',
      // Bumped when the old 'light' theme was retired — migrate any stored
      // 'light' preference to the Shell theme.
      version: 1,
      migrate: (persisted, version) => {
        const s = { ...(persisted as Record<string, unknown>) }
        if (version < 1 && s.theme === 'light') s.theme = 'shell'
        return s as { theme: Theme; sidebarCollapsed: boolean }
      },
      // Only persist durable prefs; the mobile drawer must always start closed.
      partialize: (s) => ({ theme: s.theme, sidebarCollapsed: s.sidebarCollapsed }),
    }
  )
)
