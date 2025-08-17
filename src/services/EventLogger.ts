import Database from 'better-sqlite3';
import { EventEmitter } from 'events';
import { DigestEvent, EventFilter, EventType } from '../types/events';
import { randomUUID } from 'crypto';

export class EventLogger extends EventEmitter {
  private db: Database.Database;
  private sessionId: string;
  private insertStmt: Database.Statement;

  constructor(database: Database.Database) {
    super();
    
    this.sessionId = randomUUID();
    this.db = database;
    
    this.prepareStatements();
  }


  private prepareStatements(): void {
    this.insertStmt = this.db.prepare(`
      INSERT INTO events (timestamp, session_id, event_type, event_data, metadata)
      VALUES (?, ?, ?, ?, ?)
    `);

    // Note: selectStmt will be prepared dynamically in getEvents() to handle variable eventTypes
  }

  logEvent(eventData: Omit<DigestEvent, 'id' | 'timestamp' | 'sessionId'>): DigestEvent {
    // Validate event structure before logging
    const validationError = this.validateEventData(eventData);
    if (validationError) {
      console.error('Event validation failed:', validationError);
      throw new Error(`Invalid event data: ${validationError}`);
    }

    const event: DigestEvent = {
      ...eventData,
      timestamp: Date.now(),
      sessionId: this.sessionId,
    } as DigestEvent;

    try {
      const result = this.insertStmt.run(
        event.timestamp,
        event.sessionId,
        event.eventType,
        JSON.stringify(event.data),
        JSON.stringify(event.metadata)
      );

      const finalEvent = { ...event, id: result.lastInsertRowid as number };
      
      // Emit to real-time subscribers
      this.emit('event', finalEvent);
      this.emit(event.eventType, finalEvent);
      
      return finalEvent;
    } catch (error) {
      console.error('Failed to log event:', error);
      throw error;
    }
  }

  private validateEventData(eventData: Omit<DigestEvent, 'id' | 'timestamp' | 'sessionId'>): string | null {
    // Basic structural validation only
    if (!eventData.eventType) {
      return 'Missing eventType';
    }
    
    if (!eventData.data) {
      return 'Missing data property';
    }
    
    if (!eventData.metadata) {
      return 'Missing metadata property';
    }
    
    if (!eventData.display) {
      return 'Missing display property';
    }

    // Validate eventType is one of the allowed values
    const validEventTypes: EventType[] = [
      'user_prompt', 'model_call', 'model_response', 
      'block_operation', 'response_parsing', 'system_event'
    ];
    if (!validEventTypes.includes(eventData.eventType as EventType)) {
      return `Invalid eventType: ${eventData.eventType}. Must be one of: ${validEventTypes.join(', ')}`;
    }

    // Light validation of display details if present
    if (eventData.display.details) {
      for (let i = 0; i < eventData.display.details.length; i++) {
        const detail = eventData.display.details[i];
        if (detail.type && detail.type !== 'text' && detail.type !== 'code') {
          return `Invalid detail type at index ${i}: must be 'text' or 'code'`;
        }
      }
    }

    return null; // Valid
  }

  getEvents(filter: EventFilter = {}): DigestEvent[] {
    const {
      sessionId,
      startTime,
      endTime,
      eventTypes = [],
      limit = 100,
      offset = 0
    } = filter;

    // Build dynamic query based on eventTypes
    let sql = `
      SELECT id, timestamp, session_id, event_type, event_data, metadata
      FROM events
      WHERE 1=1
    `;
    const params: any[] = [];

    if (sessionId) {
      sql += ` AND session_id = ?`;
      params.push(sessionId);
    }

    if (startTime) {
      sql += ` AND timestamp >= ?`;
      params.push(startTime);
    }

    if (endTime) {
      sql += ` AND timestamp <= ?`;
      params.push(endTime);
    }

    if (eventTypes.length > 0) {
      const placeholders = eventTypes.map(() => '?').join(',');
      sql += ` AND event_type IN (${placeholders})`;
      params.push(...eventTypes);
    }

    sql += ` ORDER BY timestamp DESC LIMIT ? OFFSET ?`;
    params.push(limit, offset);

    try {
      const stmt = this.db.prepare(sql);
      const rows = stmt.all(...params) as any[];
      
      return rows.map(row => ({
        id: row.id,
        timestamp: row.timestamp,
        sessionId: row.session_id,
        eventType: row.event_type as EventType,
        data: JSON.parse(row.event_data),
        metadata: JSON.parse(row.metadata)
      })) as DigestEvent[];
    } catch (error) {
      console.error('Failed to retrieve events:', error);
      return [];
    }
  }

  getCurrentSessionEvents(eventTypes?: EventType[]): DigestEvent[] {
    return this.getEvents({
      sessionId: this.sessionId,
      eventTypes
    });
  }

  getSessionId(): string {
    return this.sessionId;
  }

  close(): void {
    this.db.close();
  }

  // Convenience methods for common event types
  logUserPrompt(prompt: string, context?: string, metadata: any = {}): DigestEvent {
    return this.logEvent({
      eventType: 'user_prompt',
      data: { prompt, context },
      metadata: { source: 'prompt_overlay', ...metadata },
      display: {
        icon: '💬'
      }
    });
  }

  logModelCall(systemPrompt: string, userPrompt: string, fullRequest: any, metadata: any = {}): DigestEvent {
    return this.logEvent({
      eventType: 'model_call',
      data: { systemPrompt, userPrompt, fullRequest },
      metadata,
      display: {
        icon: '🤖'
      }
    });
  }

  logModelResponse(rawResponse: string, usage: any, metadata: any = {}): DigestEvent {
    return this.logEvent({
      eventType: 'model_response',
      data: { rawResponse, usage },
      metadata,
      display: {
        icon: '📝'
      }
    });
  }

  logResponseParsing(rawResponse: string, parsedXml: any, proposedOperations: any[], parseSuccess: boolean, parseError?: string, metadata: any = {}): DigestEvent {
    return this.logEvent({
      eventType: 'response_parsing',
      data: { rawResponse, parsedXml, proposedOperations, parseSuccess, parseError },
      metadata,
      display: {
        icon: parseSuccess ? '✅' : '❌'
      }
    });
  }

  logBlockOperation(operations: any[], source: 'user' | 'ai' | 'sync', result: any, metadata: any = {}): DigestEvent {
    return this.logEvent({
      eventType: 'block_operation',
      data: { operations, source, result },
      metadata,
      display: {
        icon: source === 'user' ? '👤' : source === 'ai' ? '🤖' : '🔄'
      }
    });
  }

  logSystemEvent(action: string, details: any, metadata: any = {}): DigestEvent {
    return this.logEvent({
      eventType: 'system_event',
      data: { action, details },
      metadata,
      display: {
        title: 'System Event',
        description: `System action: ${action}`,
        icon: '⚙️',
        details: [
          { type: 'text', label: 'Action', content: action },
          { type: 'code', label: 'Details', content: JSON.stringify(details, null, 2) }
        ]
      }
    });
  }
}

// Singleton instance
let eventLogger: EventLogger | null = null;

export function getEventLogger(): EventLogger {
  if (!eventLogger) {
    // This will be called after database initialization
    throw new Error('EventLogger not initialized. Call initializeEventLogger() first.');
  }
  return eventLogger;
}

export function initializeEventLogger(database: Database.Database): EventLogger {
  if (!eventLogger) {
    eventLogger = new EventLogger(database);
  }
  return eventLogger;
}

export function closeEventLogger(): void {
  if (eventLogger) {
    eventLogger.close();
    eventLogger = null;
  }
}