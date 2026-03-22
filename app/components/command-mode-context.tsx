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
    function onKeyDown(e: KeyboardEvent) {
      if (e.metaKey || e.ctrlKey) setCommandMode(true);
    }
    function onKeyUp(e: KeyboardEvent) {
      if (e.key === "Meta" || e.key === "Control") setCommandMode(false);
    }
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
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
