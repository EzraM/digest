import { useCallback, useEffect, useState } from "react";
import { Button, Group, Paper, Stack, Text } from "@mantine/core";
import { usePageToolSlot } from "../../context/PageToolSlotContext";
import { MeetingAction } from "../../types/calendar";

export const MeetingNotification = (): null => {
  const [actions, setActions] = useState<MeetingAction[]>([]);
  const { registerTool, unregisterTool } = usePageToolSlot();

  useEffect(
    () =>
      window.electronAPI.calendar.onMeetingReady((action) => {
        setActions((current) => [
          ...current.filter((candidate) => candidate.eventId !== action.eventId),
          action,
        ]);
      }),
    []
  );

  const join = useCallback(async (action: MeetingAction) => {
    await window.electronAPI.calendar.join(action);
    setActions((current) =>
      current.filter((candidate) => candidate.eventId !== action.eventId)
    );
  }, []);

  useEffect(() => {
    if (actions.length === 0) {
      unregisterTool("meeting-ready");
      return;
    }
    registerTool(
      "meeting-ready",
      <Stack gap="xs">
        {actions.map((action) => (
          <Paper key={`${action.calendarId}:${action.eventId}`} p="sm" withBorder>
            <Group gap="md" justify="space-between" wrap="nowrap">
              <div>
                <Text size="sm" fw={600}>{action.title}</Text>
                <Text size="xs" c="dimmed">
                  {new Date(action.startAt).toLocaleTimeString([], {
                    hour: "numeric",
                    minute: "2-digit",
                  })}
                </Text>
              </div>
              <Button size="xs" onClick={() => void join(action)}>
                Join meeting
              </Button>
            </Group>
          </Paper>
        ))}
      </Stack>
    );
    return () => unregisterTool("meeting-ready");
  }, [actions, join, registerTool, unregisterTool]);

  return null;
};
