import type { WebContents } from "electron";
import { reduce } from "../core/reducer";
import { emptyWorld, ViewWorld } from "../core/types";
import { NotificationLayer } from "./NotificationLayer";

type SentMessage = {
  channel: string;
  payload: Record<string, unknown>;
};

function createRenderer(messages: SentMessage[]): WebContents {
  return {
    isDestroyed: () => false,
    send: (channel: string, payload: Record<string, unknown>) => {
      messages.push({ channel, payload });
    },
  } as unknown as WebContents;
}

function createWorld(id = "block-1"): ViewWorld {
  return reduce(emptyWorld, {
    type: "create",
    id,
    url: "https://example.com",
    bounds: { x: 0, y: 0, width: 800, height: 600 },
    profile: "default",
  });
}

describe("NotificationLayer", () => {
  it("notifies load and initial navigation state when a view is created", () => {
    const messages: SentMessage[] = [];
    const notifications = new NotificationLayer(createRenderer(messages));

    notifications.notify("block-1", emptyWorld, createWorld());

    expect(messages).toEqual([
      {
        channel: "browser:initialized",
        payload: {
          blockId: "block-1",
          success: true,
          status: "loading",
        },
      },
      {
        channel: "browser:navigation-state",
        payload: {
          blockId: "block-1",
          url: "https://example.com",
          canGoBack: false,
        },
      },
    ]);
  });

  it("notifies when only the URL changes", () => {
    const messages: SentMessage[] = [];
    const notifications = new NotificationLayer(createRenderer(messages));
    const previous = createWorld();
    const next = reduce(previous, {
      type: "updateNavigation",
      id: "block-1",
      url: "https://example.com/next",
      canGoBack: false,
    });

    notifications.notify("block-1", previous, next);

    expect(messages).toEqual([
      {
        channel: "browser:navigation-state",
        payload: {
          blockId: "block-1",
          url: "https://example.com/next",
          canGoBack: false,
        },
      },
    ]);
  });

  it("notifies when only canGoBack changes", () => {
    const messages: SentMessage[] = [];
    const notifications = new NotificationLayer(createRenderer(messages));
    const previous = createWorld();
    const next = reduce(previous, {
      type: "updateNavigation",
      id: "block-1",
      url: "https://example.com",
      canGoBack: true,
    });

    notifications.notify("block-1", previous, next);

    expect(messages).toEqual([
      {
        channel: "browser:navigation-state",
        payload: {
          blockId: "block-1",
          url: "https://example.com",
          canGoBack: true,
        },
      },
    ]);
  });

  it("notifies navigation and readiness as independent transitions", () => {
    const messages: SentMessage[] = [];
    const notifications = new NotificationLayer(createRenderer(messages));
    const loading = createWorld();
    const navigated = reduce(loading, {
      type: "updateNavigation",
      id: "block-1",
      url: "https://example.com/next",
      canGoBack: true,
    });
    const ready = reduce(navigated, {
      type: "markReady",
      id: "block-1",
    });

    notifications.notify("block-1", loading, navigated);
    notifications.notify("block-1", navigated, ready);

    expect(messages).toEqual([
      {
        channel: "browser:navigation-state",
        payload: {
          blockId: "block-1",
          url: "https://example.com/next",
          canGoBack: true,
        },
      },
      {
        channel: "browser:initialized",
        payload: {
          blockId: "block-1",
          success: true,
          status: "loaded",
        },
      },
    ]);
  });

  it("does not notify for an unrelated bounds change", () => {
    const messages: SentMessage[] = [];
    const notifications = new NotificationLayer(createRenderer(messages));
    const previous = createWorld();
    const next = reduce(previous, {
      type: "updateBounds",
      id: "block-1",
      bounds: { x: 10, y: 20, width: 900, height: 700 },
    });

    notifications.notify("block-1", previous, next);

    expect(messages).toEqual([]);
  });

  it("owns live-reference and placement-ready renderer notifications", () => {
    const messages: SentMessage[] = [];
    const notifications = new NotificationLayer(createRenderer(messages));

    notifications.notifyLiveReferencesChanged({
      revision: 7,
      references: [
        { profileId: "profile-1", url: "https://example.com/" },
      ],
    });
    notifications.notifyPlacementReady({
      routeId: "route-1",
      placementId: "placement-1",
      journeyId: "journey-1",
      handleId: "handle-1",
      transitionGeneration: 7,
    });

    expect(messages).toEqual([
      {
        channel: "browser:live-pages-changed",
        payload: {
          revision: 7,
          references: [
            { profileId: "profile-1", url: "https://example.com/" },
          ],
        },
      },
      {
        channel: "browser:initialized",
        payload: {
          blockId: "placement-1",
          success: true,
          status: "loaded",
          presentation: {
            routeId: "route-1",
            placementId: "placement-1",
            journeyId: "journey-1",
            handleId: "handle-1",
            transitionGeneration: 7,
          },
        },
      },
    ]);
  });

  it("routes native readiness through the complete active presentation", () => {
    const messages: SentMessage[] = [];
    const presentation = {
      routeId: "route-PD-3772",
      placementId: "placement-PD-3772",
      journeyId: "journey-17",
      handleId: "handle-PS-5606",
      transitionGeneration: 23,
    };
    const notifications = new NotificationLayer(
      createRenderer(messages),
      () => presentation
    );
    const loading = createWorld("handle-PS-5606");
    const ready = reduce(loading, {
      type: "markReady",
      id: "handle-PS-5606",
    });

    notifications.notify("handle-PS-5606", loading, ready);

    expect(messages).toEqual([
      {
        channel: "browser:initialized",
        payload: {
          blockId: "placement-PD-3772",
          success: true,
          status: "loaded",
          presentation,
        },
      },
    ]);
  });

  it("drops delayed events from an inactive retained handle", () => {
    const messages: SentMessage[] = [];
    const notifications = new NotificationLayer(
      createRenderer(messages),
      () => null
    );
    const loading = createWorld("handle-PS-5606");
    const ready = reduce(loading, {
      type: "markReady",
      id: "handle-PS-5606",
    });

    notifications.notify("handle-PS-5606", loading, ready);

    expect(messages).toEqual([]);
  });
});
