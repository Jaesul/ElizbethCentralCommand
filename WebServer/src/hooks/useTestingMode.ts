import { useState, useEffect } from "react";
import type { ShotStopperData } from "~/types/shotstopper";

const TESTING_MODE_KEY = "shotstopper-testing-mode";

export function useTestingMode() {
  const [isTestingMode, setIsTestingMode] = useState(false);
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(TESTING_MODE_KEY);
      if (stored !== null) {
        setIsTestingMode(stored === "true");
      }
    } catch (error) {
      console.error("Error loading testing mode:", error);
    } finally {
      setIsLoaded(true);
    }
  }, []);

  const setTestingMode = (enabled: boolean) => {
    try {
      localStorage.setItem(TESTING_MODE_KEY, enabled.toString());
      setIsTestingMode(enabled);
    } catch (error) {
      console.error("Error saving testing mode:", error);
    }
  };

  return {
    isTestingMode,
    isLoaded,
    setTestingMode,
  };
}

