import React, { useState, useEffect, useCallback } from 'react';
import { DigestEvent } from '../types/events';
import { EventCard } from './EventCard';
import { Button, Text, Stack, Group, ScrollArea, LoadingOverlay } from '@mantine/core';
import './DebugSidebar.css';

interface DebugSidebarProps {
  isVisible: boolean;
  onToggle: () => void;
}

export const DebugSidebar: React.FC<DebugSidebarProps> = ({ isVisible, onToggle }) => {
  const [events, setEvents] = useState<DigestEvent[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  // Load initial events when sidebar becomes visible
  useEffect(() => {
    if (isVisible) {
      loadSessionEvents();
    }
  }, [isVisible]);

  // Set up event listeners
  useEffect(() => {
    if (!window.electronAPI?.debug) return;

    // Listen for new events
    const unsubscribeNewEvent = window.electronAPI.debug.onNewEvent((event: DigestEvent) => {
      setEvents(prev => [event, ...prev]); // Add new events to the top
    });

    // Listen for initial events
    const unsubscribeInitialEvents = window.electronAPI.debug.onInitialEvents((initialEvents: DigestEvent[]) => {
      setEvents(initialEvents.reverse()); // Show newest first
    });

    return () => {
      unsubscribeNewEvent();
      unsubscribeInitialEvents();
    };
  }, []);

  const loadSessionEvents = useCallback(async () => {
    if (!window.electronAPI?.debug) return;

    setIsLoading(true);
    try {
      const sessionEvents = await window.electronAPI.debug.getSessionEvents();
      setEvents(sessionEvents.reverse()); // Show newest first
    } catch (error) {
      console.error('Failed to load session events:', error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const clearEvents = useCallback(async () => {
    if (!window.electronAPI?.debug) return;

    try {
      await window.electronAPI.debug.clearEvents();
      setEvents([]);
    } catch (error) {
      console.error('Failed to clear events:', error);
    }
  }, []);

  if (!isVisible) return null;

  return (
    <Stack h="100vh" spacing="md">
      <Group justify="space-between" align="center">
        <Text size="lg" fw={600}>Debug Events</Text>
        <Button variant="subtle" size="xs" onClick={onToggle}>
          ×
        </Button>
      </Group>
      
      <Group>
        <Button 
          size="xs" 
          variant="light" 
          onClick={loadSessionEvents} 
          loading={isLoading}
        >
          Refresh
        </Button>
        <Button 
          size="xs" 
          variant="light" 
          color="red" 
          onClick={clearEvents}
        >
          Clear
        </Button>
      </Group>
      
      <ScrollArea flex={1} style={{ position: 'relative' }}>
        <LoadingOverlay visible={isLoading} />
        {events.length === 0 ? (
          <Stack align="center" justify="center" h={200} spacing="xs">
            <Text size="sm" c="dimmed">No debug events yet</Text>
            <Text size="xs" c="dimmed" ta="center">
              Try editing the notebook to see events appear here.
            </Text>
          </Stack>
        ) : (
          <Stack spacing="xs">
            {events.map((event, index) => (
              <EventCard key={`${event.id || event.timestamp}-${index}`} event={event} />
            ))}
          </Stack>
        )}
      </ScrollArea>
    </Stack>
  );
};
