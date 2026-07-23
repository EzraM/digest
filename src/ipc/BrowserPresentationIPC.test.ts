import {
  parseDetachPlacementCommand,
  parseOpenReferenceCommand,
} from "./BrowserPresentationIPC";

const validRequest = {
  viewId: "primary-browser",
  routeId: "block:PD-3772",
  blockId: "PD-3772",
  url: "https://example.test/",
  bounds: { x: 0, y: 0, width: 800, height: 600 },
  profileId: "profile",
  layout: "full",
  referenceKind: "site-block",
  placementGeneration: 7,
  transitionGeneration: 11,
};

describe("browser presentation IPC contract", () => {
  it("converts compatibility names into one strict internal command", () => {
    expect(parseOpenReferenceCommand(validRequest)).toEqual({
      routeId: "block:PD-3772",
      placementId: "primary-browser",
      referenceId: "PD-3772",
      url: "https://example.test/",
      bounds: { x: 0, y: 0, width: 800, height: 600 },
      profileId: "profile",
      layout: "full",
      referenceKind: "site-block",
      placementGeneration: 7,
      transitionGeneration: 11,
    });
  });

  it("rejects missing identity instead of creating an internal fallback state", () => {
    let message = "";
    try {
      parseOpenReferenceCommand({
        ...validRequest,
        transitionGeneration: undefined,
      });
    } catch (error) {
      message = error instanceof Error ? error.message : String(error);
    }

    expect(message).toBe(
      "Invalid browser presentation field: transitionGeneration"
    );
  });

  it("rejects non-visible bounds at the boundary", () => {
    let message = "";
    try {
      parseOpenReferenceCommand({
        ...validRequest,
        bounds: { ...validRequest.bounds, width: 0 },
      });
    } catch (error) {
      message = error instanceof Error ? error.message : String(error);
    }

    expect(message).toBe("Invalid browser presentation field: bounds");
  });

  it("requires both generations when detaching a placement", () => {
    expect(
      parseDetachPlacementCommand({
        viewId: "primary-browser",
        placementGeneration: 7,
        transitionGeneration: 11,
      })
    ).toEqual({
      placementId: "primary-browser",
      placementGeneration: 7,
      transitionGeneration: 11,
    });

    let message = "";
    try {
      parseDetachPlacementCommand({
        viewId: "primary-browser",
        placementGeneration: 7,
      });
    } catch (error) {
      message = error instanceof Error ? error.message : String(error);
    }
    expect(message).toBe(
      "Invalid browser presentation field: transitionGeneration"
    );
  });
});
