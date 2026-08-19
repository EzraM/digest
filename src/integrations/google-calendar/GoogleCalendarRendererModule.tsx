import { useCallback, useEffect, useMemo, useState } from "react";
import { Alert, Button, Checkbox, Group, Paper, Stack, Text } from "@mantine/core";
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
    const refresh = () => void calendar.invoke("readyMeetings", {}).then((ready) => {
      if (mounted) setMeetings(ready);
    });
    const unsubscribeMeeting = calendar.on("meetingReady", receive);
    const unsubscribePreferences = calendar.on(
      "calendarPreferencesChanged",
      refresh
    );
    refresh();
    return () => {
      mounted = false;
      unsubscribeMeeting();
      unsubscribePreferences();
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

const GoogleCalendarSettings = () => {
  const [accounts, setAccounts] = useState<Array<{ id: string; email?: string; displayName: string }>>([]);
  const [calendars, setCalendars] = useState<Array<{
    accountId: string;
    calendarId: string;
    summary: string;
    primary: boolean;
    notificationsEnabled: boolean;
  }>>([]);
  const [connecting, setConnecting] = useState(false);
  const [savingCalendar, setSavingCalendar] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const calendar = useMemo(
    () => new RendererModuleClient<GoogleCalendarProtocol>(
      "google-calendar",
      googleCalendarProtocol
    ),
    []
  );

  const refresh = useCallback(async () => {
    const [view, notificationCalendars] = await Promise.all([
      window.electronAPI.integrations.list(),
      calendar.invoke("listNotificationCalendars", {}),
    ]);
    setAccounts(view.accounts.filter((account) => account.integrationId === "google-calendar"));
    setCalendars(notificationCalendars);
  }, [calendar]);

  useEffect(() => { void refresh(); }, [refresh]);

  const connect = async () => {
    setConnecting(true);
    setError(null);
    try {
      await window.electronAPI.integrations.connect("google-calendar");
      await refresh();
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "Google authorization failed";
      if (!message.toLowerCase().includes("cancel")) setError(message);
    } finally {
      setConnecting(false);
    }
  };

  const cancelConnect = async () => {
    setError(null);
    try {
      await window.electronAPI.integrations.cancelConnect("google-calendar");
    } finally {
      setConnecting(false);
    }
  };

  const setCalendarNotifications = async (
    accountId: string,
    calendarId: string,
    enabled: boolean
  ) => {
    const key = `${accountId}:${calendarId}`;
    setSavingCalendar(key);
    setError(null);
    try {
      await calendar.invoke("setCalendarNotifications", {
        accountId,
        calendarId,
        enabled,
      });
      await refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not update calendar");
    } finally {
      setSavingCalendar(null);
    }
  };

  const accountEmail = new Map(accounts.map((account) => [account.id, account.email]));

  return (
    <Stack gap="md">
      {accounts.map((account) => (
        <Group key={account.id} justify="space-between">
          <div><Text fw={600}>{account.displayName}</Text><Text size="sm" c="dimmed">{account.email}</Text></div>
          <Button variant="light" color="red" onClick={async () => { await window.electronAPI.integrations.disconnect("google-calendar", account.id); await refresh(); }}>Disconnect</Button>
        </Group>
      ))}
      {calendars.length > 0 && (
        <Stack gap="xs">
          <Text fw={600}>Meeting notifications</Text>
          <Text size="sm" c="dimmed">
            Show the notification bar for meetings from these calendars.
          </Text>
          {calendars.map((item) => {
            const key = `${item.accountId}:${item.calendarId}`;
            return (
              <Checkbox
                key={key}
                checked={item.notificationsEnabled}
                disabled={savingCalendar === key}
                onChange={(event) => void setCalendarNotifications(
                  item.accountId,
                  item.calendarId,
                  event.currentTarget.checked
                )}
                label={item.summary}
                description={`${accountEmail.get(item.accountId) ?? item.accountId}${item.primary ? " · Primary" : ""}`}
              />
            );
          })}
        </Stack>
      )}
      {error && <Alert color="red">{error}</Alert>}
      <Group>
        {connecting ? (
          <Button variant="light" onClick={() => void cancelConnect()}>
            Cancel authorization
          </Button>
        ) : (
          <Button onClick={() => void connect()}>
            {accounts.length ? "Connect another Google account" : "Enable Google Calendar"}
          </Button>
        )}
      </Group>
      <Text size="xs" c="dimmed">Google will ask for read-only Calendar access. This does not give Digest permission to edit events.</Text>
    </Stack>
  );
};

export const googleCalendarRendererModule: RendererModule = {
  id: "google-calendar",
  Root: GoogleCalendarRenderer,
  settings: [{
    id: "google-calendar",
    title: "Google Calendar",
    description: "Show upcoming events and make meeting links available in Digest.",
    Panel: GoogleCalendarSettings,
  }],
};
