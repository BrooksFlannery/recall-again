"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";

const CommandModeContext = createContext(false);

export function CommandModeProvider({ children }: { children: ReactNode }) {
  const [commandMode, setCommandMode] = useState(false);

  useEffect(() => {
    /** Reads actual modifier state so “hold ⌘ only” works (metaKey is often false on Meta’s own keydown). */
    function syncFromEvent(e: KeyboardEvent) {
      setCommandMode(
        e.getModifierState("Meta") || e.getModifierState("Control"),
      );
    }
    function onBlur() {
      setCommandMode(false);
    }
    window.addEventListener("keydown", syncFromEvent);
    window.addEventListener("keyup", syncFromEvent);
    window.addEventListener("blur", onBlur);
    return () => {
      window.removeEventListener("keydown", syncFromEvent);
      window.removeEventListener("keyup", syncFromEvent);
      window.removeEventListener("blur", onBlur);
    };
  }, []);

  return (
    <CommandModeContext.Provider value={commandMode}>
      {children}
    </CommandModeContext.Provider>
  );
}

export function useCommandMode() {
  return useContext(CommandModeContext);
}
