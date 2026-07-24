import * as Y from "yjs";
import { CollaborationDocumentService } from "./CollaborationDocumentService";

const createDatabase = () => {
  const rows: Array<{
    update_id: string;
    document_id: string;
    update_data: Buffer;
    producer_renderer_id: number;
    created_at: number;
  }> = [];
  return {
    rows,
    prepare(sql: string) {
      return {
        get(...args: unknown[]) {
          if (sql.includes("WHERE update_id")) {
            return rows.find((row) => row.update_id === args[0]);
          }
          if (sql.includes("COUNT(*)")) {
            return {
              count: rows.filter((row) => row.document_id === args[0]).length,
            };
          }
          return undefined;
        },
        all(documentId: string) {
          return rows.filter((row) => row.document_id === documentId);
        },
        run(
          updateId: string,
          documentId: string,
          updateData: Buffer,
          producerRendererId: number,
          createdAt: number
        ) {
          rows.push({
            update_id: updateId,
            document_id: documentId,
            update_data: updateData,
            producer_renderer_id: producerRendererId,
            created_at: createdAt,
          });
        },
      };
    },
    close() {
      return undefined;
    },
  };
};

describe("CollaborationDocumentService", () => {
  it("accepts concurrent renderer updates and converges replicas", async () => {
    const database = createDatabase();
    const service = new CollaborationDocumentService(database as any);
    const published: Array<{
      update: Uint8Array;
      producerRendererId: number;
    }> = [];
    service.setPublisher((event) => published.push(event));

    const windowA = new Y.Doc();
    const windowB = new Y.Doc();
    service.subscribe("doc", 11, Y.encodeStateVector(windowA));
    service.subscribe("doc", 22, Y.encodeStateVector(windowB));

    windowA.getText("text").insert(0, "A");
    windowB.getText("text").insert(0, "B");
    await service.applyUpdate({
      documentId: "doc",
      updateId: "update-a",
      update: Y.encodeStateAsUpdate(windowA),
      producerRendererId: 11,
    });
    await service.applyUpdate({
      documentId: "doc",
      updateId: "update-b",
      update: Y.encodeStateAsUpdate(windowB),
      producerRendererId: 22,
    });

    for (const event of published) {
      if (event.producerRendererId !== 11) {
        Y.applyUpdate(windowA, event.update);
      }
      if (event.producerRendererId !== 22) {
        Y.applyUpdate(windowB, event.update);
      }
    }

    const canonical = new Y.Doc();
    Y.applyUpdate(canonical, service.encodeState("doc"));
    expect(windowA.getText("text").toString()).toBe(
      canonical.getText("text").toString()
    );
    expect(windowB.getText("text").toString()).toBe(
      canonical.getText("text").toString()
    );
    expect(canonical.getText("text").toString().length).toBe(2);
    expect(database.rows.length).toBe(2);
    database.close();
  });

  it("returns only state missing from a subscribing replica", async () => {
    const database = createDatabase();
    const service = new CollaborationDocumentService(database as any);
    const source = new Y.Doc();
    service.subscribe("doc", 1, Y.encodeStateVector(source));
    source.getMap("values").set("answer", 42);
    await service.applyUpdate({
      documentId: "doc",
      updateId: "first",
      update: Y.encodeStateAsUpdate(source),
      producerRendererId: 1,
    });

    const replica = new Y.Doc();
    const subscription = service.subscribe(
      "doc",
      2,
      Y.encodeStateVector(replica)
    );
    Y.applyUpdate(replica, subscription.update);
    expect(replica.getMap("values").get("answer")).toBe(42);
    database.close();
  });

  it("rejects updates from renderers not subscribed to the document", async () => {
    const database = createDatabase();
    const service = new CollaborationDocumentService(database as any);
    let error: unknown;
    try {
      await service.applyUpdate({
        documentId: "doc",
        updateId: "unauthorized",
        update: new Uint8Array(),
        producerRendererId: 99,
      });
    } catch (caught) {
      error = caught;
    }
    expect(String(error)).toContain("not subscribed");
    database.close();
  });
});
