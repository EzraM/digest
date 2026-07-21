import { LivePageProjectionStore } from "./LivePageProjectionStore";

describe("LivePageProjectionStore", () => {
  it("increments revisions only for semantic projection changes", () => {
    const store = new LivePageProjectionStore();
    const references = [
      { profileId: "profile-b", url: "https://b.test/" },
      { profileId: "profile-a", url: "https://a.test/" },
    ];

    expect(store.getSnapshot()).toEqual({ revision: 0, references: [] });
    expect(store.sync(references)).toEqual({
      revision: 1,
      references: [
        { profileId: "profile-a", url: "https://a.test/" },
        { profileId: "profile-b", url: "https://b.test/" },
      ],
    });
    expect(store.sync([...references].reverse())).toBeUndefined();
    expect(store.sync([references[0]])).toEqual({
      revision: 2,
      references: [references[0]],
    });
  });

  it("deduplicates identical profile and URL references", () => {
    const store = new LivePageProjectionStore();
    const reference = { profileId: "profile-a", url: "https://a.test/" };

    expect(store.sync([reference, reference])).toEqual({
      revision: 1,
      references: [reference],
    });
  });
});
