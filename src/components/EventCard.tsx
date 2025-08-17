import React, { useState } from "react";
import {
  Card,
  Group,
  Stack,
  Text,
  Badge,
  Collapse,
  UnstyledButton,
  Code,
  Divider,
  ScrollArea,
} from "@mantine/core";
import { DigestEvent, DetailBlock } from "../types/events";

interface EventCardProps {
  event: DigestEvent;
}

export const EventCard: React.FC<EventCardProps> = ({ event }) => {
  const [isExpanded, setIsExpanded] = useState(false);

  // Safety check: if event is undefined or null, render nothing
  if (!event) {
    return null;
  }

  const formatTime = (timestamp: number) => {
    if (!timestamp) return "Unknown time";
    return new Date(timestamp).toLocaleTimeString();
  };

  const formatDuration = (duration?: number) => {
    if (!duration) return "";
    return `${duration}ms`;
  };

  const getEventIcon = () => {
    // Safely access the icon with fallbacks
    return event?.display?.icon || "📄";
  };

  const getEventTitle = () => {
    // Safely access the title with fallback
    return event?.display?.title || "Untitled Event";
  };

  const getEventDetails = () => {
    // Safely access the details with fallback
    return event?.display?.details || [];
  };

  const getEventMetadata = () => {
    // Safely access metadata with fallbacks
    return {
      timing: event?.metadata?.timing || {
        startTime: 0,
        endTime: undefined,
        duration: undefined,
      },
      cost: event?.metadata?.cost,
      tokens: event?.metadata?.tokens,
    };
  };

  const renderDetailBlock = (detail: DetailBlock, index: number) => {
    switch (detail.type) {
      case "text":
        return (
          <Stack key={index} gap="xs">
            <Text size="xs" tt="uppercase" fw={600} c="dimmed">
              {detail.label}
            </Text>
            <Text size="sm">{detail.content}</Text>
          </Stack>
        );
      case "code":
        return (
          <Stack key={index} gap="xs">
            <Text size="xs" tt="uppercase" fw={600} c="dimmed">
              {detail.label}
            </Text>
            <Code block>{detail.content}</Code>
          </Stack>
        );
    }
  };

  const renderEventDetails = () => {
    if (!isExpanded) return null;

    const details = getEventDetails();

    // Use display.details if available, otherwise fall back to default rendering
    if (details && details.length > 0) {
      return (
        <Stack p="md" gap="md">
          {details.map((detail, index) => renderDetailBlock(detail, index))}
        </Stack>
      );
    }

    // Fallback: render raw event data if no display details provided
    return (
      <Stack p="md" gap="md">
        <Stack gap="xs">
          <Text size="xs" tt="uppercase" fw={600} c="dimmed">
            Event Data
          </Text>
          <Code block>{JSON.stringify(event?.data || {}, null, 2)}</Code>
        </Stack>
      </Stack>
    );
  };

  return (
    <Card
      p={0}
      radius="md"
      withBorder
      style={{ backgroundColor: "var(--mantine-color-dark-7)" }}
    >
      <UnstyledButton
        onClick={() => setIsExpanded(!isExpanded)}
        style={{ width: "100%" }}
      >
        <Group p="md" justify="space-between" align="center" wrap="nowrap">
          <Group gap="sm" style={{ flex: 1, minWidth: 0 }}>
            <Text size="lg" style={{ flexShrink: 0 }}>
              {getEventIcon()}
            </Text>
            <Text
              size="sm"
              fw={500}
              style={{
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
                flex: 1,
              }}
            >
              {getEventTitle()}
            </Text>
          </Group>

          <Group gap="xs" style={{ flexShrink: 0 }}>
            <Badge variant="light" size="xs" c="dimmed">
              {formatTime(event.timestamp)}
            </Badge>
            {Boolean(getEventMetadata().timing?.duration) && (
              <Badge variant="light" size="xs" c="blue">
                {formatDuration(getEventMetadata().timing.duration)}
              </Badge>
            )}
            <Text size="xs" c="dimmed">
              {isExpanded ? "▲" : "▼"}
            </Text>
          </Group>
        </Group>
      </UnstyledButton>

      <Collapse in={isExpanded}>
        <Divider />
        <ScrollArea h={400}>{renderEventDetails()}</ScrollArea>
      </Collapse>
    </Card>
  );
};
