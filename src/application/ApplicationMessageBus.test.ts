import { ApplicationMessageBus } from "./ApplicationMessageBus";

describe("ApplicationMessageBus", () => {
  it("stamps trusted producer context and returns results to the caller", async () => {
    const bus = new ApplicationMessageBus(5, () => 10, () => "message-1");
    bus.register("query", "documents.get", (message) => ({
      producer: message.producer,
      payload: message.payload,
    }));

    const result = await bus.dispatch({
      kind: "query",
      type: "documents.get",
      payload: { documentId: "doc-a" },
      producer: {
        kind: "window",
        id: "window-a",
        windowId: "window-a",
        rendererId: 7,
      },
      context: { documentId: "doc-a" },
    });

    expect(result).toEqual({
      producer: {
        kind: "window",
        id: "window-a",
        windowId: "window-a",
        rendererId: 7,
      },
      payload: { documentId: "doc-a" },
    });
  });

  it("retains bounded metadata without retaining sensitive payloads", async () => {
    let time = 0;
    const bus = new ApplicationMessageBus(2, () => time++, () => `m-${time}`);
    bus.register("command", "save", () => ({ ok: true }));

    for (const secret of ["one", "two", "three"]) {
      await bus.dispatch({
        kind: "command",
        type: "save",
        payload: { documentBody: secret },
        producer: { kind: "internal", id: "test" },
      });
    }

    const diagnostics = bus.getDiagnostics();
    expect(diagnostics.length).toBe(2);
    expect(JSON.stringify(diagnostics)).not.toContain("documentBody");
    expect(JSON.stringify(diagnostics)).not.toContain("three");
  });
});
