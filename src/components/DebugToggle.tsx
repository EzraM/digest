import React, { useState, useEffect } from 'react';
import './DebugToggle.css';

interface DebugToggleProps {
  onToggle: (enabled: boolean) => void;
}

export const DebugToggle: React.FC<DebugToggleProps> = ({ onToggle }) => {
  const [isEnabled, setIsEnabled] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  // Check initial debug mode state
  useEffect(() => {
    if (window.electronAPI?.debug) {
      window.electronAPI.debug.isEnabled().then(setIsEnabled);

      // Listen for debug mode changes
      const unsubscribe = window.electronAPI.debug.onModeChanged((enabled: boolean) => {
        setIsEnabled(enabled);
      });

      return unsubscribe;
    }
  }, []);

  const handleToggle = async () => {
    if (!window.electronAPI?.debug || isLoading) return;

    setIsLoading(true);
    try {
      const newState = await window.electronAPI.debug.toggle();
      setIsEnabled(newState);
      onToggle(newState);
    } catch (error) {
      console.error('Failed to toggle debug mode:', error);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <button
      className={`debug-toggle ${isEnabled ? 'active' : ''}`}
      onClick={handleToggle}
      disabled={isLoading}
      title={isEnabled ? 'Hide sidebar' : 'Show sidebar'}
    >
      {isLoading ? '⏳' : '☰'}
    </button>
  );
};