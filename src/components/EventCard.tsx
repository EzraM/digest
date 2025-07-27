import React, { useState } from 'react';
import { DigestEvent } from '../types/events';
import './EventCard.css';

interface EventCardProps {
  event: DigestEvent;
}

export const EventCard: React.FC<EventCardProps> = ({ event }) => {
  const [isExpanded, setIsExpanded] = useState(false);

  const formatTime = (timestamp: number) => {
    return new Date(timestamp).toLocaleTimeString();
  };

  const formatDuration = (duration?: number) => {
    if (!duration) return '';
    return `${duration}ms`;
  };

  const getEventIcon = (eventType: string) => {
    switch (eventType) {
      case 'user_prompt': return '💬';
      case 'model_call': return '🤖';
      case 'model_response': return '📤';
      case 'response_parsing': return '⚙️';
      case 'block_operation': return '📝';
      case 'system_event': return '⚡';
      default: return '📄';
    }
  };

  const getEventTitle = (event: DigestEvent) => {
    switch (event.eventType) {
      case 'user_prompt':
        return `User Prompt: "${(event.data as any).prompt?.slice(0, 50)}${(event.data as any).prompt?.length > 50 ? '...' : ''}"`;
      case 'model_call':
        return 'Model API Call';
      case 'model_response':
        return `Model Response (${event.metadata.tokens || 0} tokens)`;
      case 'response_parsing':
        return `Response Parsing (${(event.data as any).proposedOperations?.length || 0} operations)`;
      case 'block_operation':
        return `Block Operations (${(event.data as any).operations?.length || 0} ops, ${(event.data as any).source})`;
      case 'system_event':
        return `System: ${(event.data as any).action}`;
      default:
        return event.eventType;
    }
  };

  const renderEventDetails = () => {
    if (!isExpanded) return null;

    switch (event.eventType) {
      case 'user_prompt':
        return (
          <div className="event-details">
            <div className="event-section">
              <h4>User Input</h4>
              <div className="event-content">{(event.data as any).prompt}</div>
            </div>
            {(event.data as any).context && (
              <div className="event-section">
                <h4>Context</h4>
                <pre className="event-code">{(event.data as any).context}</pre>
              </div>
            )}
          </div>
        );

      case 'model_call':
        return (
          <div className="event-details">
            <div className="event-section">
              <h4>System Prompt</h4>
              <div className="event-content">{(event.data as any).systemPrompt}</div>
            </div>
            <div className="event-section">
              <h4>User Prompt</h4>
              <div className="event-content">{(event.data as any).userPrompt}</div>
            </div>
            <div className="event-section">
              <h4>Full Request</h4>
              <pre className="event-code">{JSON.stringify((event.data as any).fullRequest, null, 2)}</pre>
            </div>
          </div>
        );

      case 'model_response':
        return (
          <div className="event-details">
            <div className="event-section">
              <h4>Raw Response</h4>
              <div className="event-content">{(event.data as any).rawResponse}</div>
            </div>
            {(event.data as any).usage && (
              <div className="event-section">
                <h4>Token Usage</h4>
                <pre className="event-code">{JSON.stringify((event.data as any).usage, null, 2)}</pre>
              </div>
            )}
            {event.metadata.cost && (
              <div className="event-section">
                <h4>Cost</h4>
                <div className="event-content">${event.metadata.cost.toFixed(6)}</div>
              </div>
            )}
          </div>
        );

      case 'response_parsing':
        return (
          <div className="event-details">
            <div className="event-section">
              <h4>Parse Success</h4>
              <div className="event-content">{(event.data as any).parseSuccess ? 'Yes' : 'No'}</div>
            </div>
            {(event.data as any).parseError && (
              <div className="event-section">
                <h4>Parse Error</h4>
                <div className="event-content error">{(event.data as any).parseError}</div>
              </div>
            )}
            <div className="event-section">
              <h4>Proposed Operations ({(event.data as any).proposedOperations?.length || 0})</h4>
              <pre className="event-code">{JSON.stringify((event.data as any).proposedOperations, null, 2)}</pre>
            </div>
            {(event.data as any).parsedXml && (
              <div className="event-section">
                <h4>Parsed XML</h4>
                <pre className="event-code">{JSON.stringify((event.data as any).parsedXml, null, 2)}</pre>
              </div>
            )}
          </div>
        );

      case 'block_operation':
        return (
          <div className="event-details">
            <div className="event-section">
              <h4>Operations ({(event.data as any).operations?.length || 0})</h4>
              <pre className="event-code">{JSON.stringify((event.data as any).operations, null, 2)}</pre>
            </div>
            <div className="event-section">
              <h4>Source</h4>
              <div className="event-content">{(event.data as any).source}</div>
            </div>
            <div className="event-section">
              <h4>Result</h4>
              <pre className="event-code">{JSON.stringify((event.data as any).result, null, 2)}</pre>
            </div>
          </div>
        );

      case 'system_event':
        return (
          <div className="event-details">
            <div className="event-section">
              <h4>Action</h4>
              <div className="event-content">{(event.data as any).action}</div>
            </div>
            <div className="event-section">
              <h4>Details</h4>
              <pre className="event-code">{JSON.stringify((event.data as any).details, null, 2)}</pre>
            </div>
          </div>
        );

      default:
        return (
          <div className="event-details">
            <div className="event-section">
              <h4>Event Data</h4>
              <pre className="event-code">{JSON.stringify(event.data, null, 2)}</pre>
            </div>
          </div>
        );
    }
  };

  return (
    <div className="event-card">
      <div className="event-card-header" onClick={() => setIsExpanded(!isExpanded)}>
        <div className="event-card-title">
          <span className="event-icon">{getEventIcon(event.eventType)}</span>
          <span className="event-title-text">{getEventTitle(event)}</span>
        </div>
        <div className="event-card-meta">
          <span className="event-time">{formatTime(event.timestamp)}</span>
          {event.metadata.timing?.duration && (
            <span className="event-duration">{formatDuration(event.metadata.timing.duration)}</span>
          )}
          <span className={`event-expand-icon ${isExpanded ? 'expanded' : ''}`}>▼</span>
        </div>
      </div>
      {renderEventDetails()}
    </div>
  );
};