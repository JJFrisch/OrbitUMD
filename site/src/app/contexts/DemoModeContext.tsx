/**
 * React context for demo mode state.
 * Components use `useDemoMode()` to read the toggle and show indicators.
 * The actual data interception happens in the repository/auth layer via
 * the standalone `isDemoMode()` check — this context is purely for UI.
 */

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { isDemoMode, enableDemoMode, disableDemoMode } from "@/lib/demo/demoMode";

interface DemoModeValue {
  isDemo: boolean;
  toggle: () => void;
}

const DemoModeContext = createContext<DemoModeValue>({
  isDemo: false,
  toggle: () => {},
});

export function DemoModeProvider({ children }: { children: ReactNode }) {
  const [isDemo, setIsDemo] = useState(isDemoMode);

  const toggle = useCallback(() => {
    setIsDemo((prev) => {
      if (prev) {
        disableDemoMode();
        // Reload to clear any cached demo state from repositories
        window.location.href = "/";
        return false;
      }
      enableDemoMode();
      // Reload to enter demo mode cleanly — RequireAuth will let us through
      window.location.href = "/dashboard";
      return true;
    });
  }, []);

  const value = useMemo(() => ({ isDemo, toggle }), [isDemo, toggle]);

  return (
    <DemoModeContext.Provider value={value}>
      {children}
    </DemoModeContext.Provider>
  );
}

export function useDemoMode(): DemoModeValue {
  return useContext(DemoModeContext);
}
