import { useCallback, useEffect, useMemo, useState } from "react";
import { Button, Group, Paper, Stack, Text } from "@mantine/core";
import { usePageToolSlot } from "../../context/PageToolSlotContext";
import { RendererModule } from "../../services/RendererModule";
import { RendererModuleClient } from "../../services/RendererModuleClient";
import { MeetingAction } from "../../types/calendar";
import {
  GoogleCalendarProtocol,
  googleCalendarProtocol,
} from "./GoogleCalendarProtocol";

const GoogleCalendarRenderer = (): null => {
  const [meetings, setMeetings] = useState<MeetingAction[]>([]);
  const { registerTool, unregisterTool } = usePageToolSlot();
  const calendar = useMemo(
    () =>
      new RendererModuleClient<GoogleCalendarProtocol>(
        "google-calendar",
        googleCalendarProtocol
      ),
    []
  );

  useEffect(() => {
    let mounted = true;
    const receive = (meeting: MeetingAction) => {
      if (!mounted) return;
      setMeetings((current) => [
        ...current.filter(
          (candidate) =>
            candidate.accountId !== meeting.accountId ||
            candidate.calendarId !== meeting.calendarId ||
            candidate.eventId !== meeting.eventId
        ),
        meeting,
      ]);
    };
    const unsubscribe = calendar.on("meetingReady", receive);
    void calendar.invoke("readyMeetings", {}).then((ready) => {
      for (const meeting of ready) receive(meeting);
    });
    return () => {
      mounted = false;
      unsubscribe();
    };
  }, [calendar]);

  const join = useCallback(
    async (meeting: MeetingAction) => {
      await calendar.invoke("join", {
        identity: {
          accountId: meeting.accountId,
          calendarId: meeting.calendarId,
          eventId: meeting.eventId,
        },
      });
      setMeetings((current) =>
        current.filter(
          (candidate) =>
            candidate.accountId !== meeting.accountId ||
            candidate.calendarId !== meeting.calendarId ||
            candidate.eventId !== meeting.eventId
        )
      );
    },
    [calendar]
  );

  useEffect(() => {
    if (meetings.length === 0) {
      unregisterTool("google-calendar.meetings");
      return;
    }
    registerTool(
      "google-calendar.meetings",
      <Stack gap="xs">
        {meetings.map((meeting) => (
          <Paper
            key={`${meeting.accountId}:${meeting.calendarId}:${meeting.eventId}`}
            p="sm"
            withBorder
          >
            <Group gap="md" justify="space-between" wrap="nowrap">
              <div>
                <Text size="sm" fw={600}>{meeting.title}</Text>
                <Text size="xs" c="dimmed">
                  {new Date(meeting.startAt).toLocaleTimeString([], {
                    hour: "numeric",
                    minute: "2-digit",
                  })}
                </Text>
              </div>
              <Button size="xs" onClick={() => void join(meeting)}>
                Join meeting
              </Button>
            </Group>
          </Paper>
        ))}
      </Stack>
    );
    return () => unregisterTool("google-calendar.meetings");
  }, [join, meetings, registerTool, unregisterTool]);

  return null;
};

export const googleCalendarRendererModule: RendererModule = {
  id: "google-calendar",
  Root: GoogleCalendarRenderer,
};
