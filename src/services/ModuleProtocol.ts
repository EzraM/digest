export interface Shape<T> {
  parse(value: unknown): T;
}

export interface RequestShape<Input, Output> {
  input: Shape<Input>;
  output: Shape<Output>;
}

export interface ModuleProtocolDefinition<
  Requests extends Record<string, RequestShape<unknown, unknown>>,
  Events extends Record<string, Shape<unknown>>
> {
  requests: Requests;
  events: Events;
}

export type RequestInput<Request> =
  Request extends RequestShape<infer Input, infer _Output> ? Input : never;

export type RequestOutput<Request> =
  Request extends RequestShape<infer _Input, infer Output> ? Output : never;

export type EventPayload<Event> = Event extends Shape<infer Payload>
  ? Payload
  : never;

export const shape = <T>(parse: (value: unknown) => T): Shape<T> => ({ parse });

export const emptyShape = shape<Record<string, never>>((value) => {
  if (!value || typeof value !== "object" || Object.keys(value).length > 0) {
    throw new Error("Expected an empty object");
  }
  return {};
});

export const voidShape = shape<void>((value) => {
  if (value !== undefined) throw new Error("Expected no value");
});
