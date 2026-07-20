import { LivePageCache } from "./LivePageCache";

describe("LivePageCache", () => {
  it("evicts the least recently used cached page", () => {
    const cache = new LivePageCache(2);
    cache.addVisible("a:full", "a");
    cache.markCached("a:full");
    cache.addVisible("b:full", "b");
    cache.markCached("b:full");

    expect(cache.addVisible("c:full", "c")).toEqual(["a:full"]);
    expect(cache.getLiveBlockIds()).toEqual(["b", "c"]);
  });

  it("does not evict visible pages", () => {
    const cache = new LivePageCache(1);
    cache.addVisible("a:full", "a");

    expect(cache.addVisible("b:full", "b")).toEqual([]);
    expect(cache.getLiveBlockIds()).toEqual(["a", "b"]);
    expect(cache.markCached("a:full")).toEqual(["a:full"]);
    expect(cache.getLiveBlockIds()).toEqual(["b"]);
  });

  it("refreshes recency when a cached page is reopened", () => {
    const cache = new LivePageCache(2);
    cache.addVisible("a:full", "a");
    cache.markCached("a:full");
    cache.addVisible("b:full", "b");
    cache.markCached("b:full");
    cache.markVisible("a:full");
    cache.markCached("a:full");

    expect(cache.addVisible("c:full", "c")).toEqual(["b:full"]);
  });
});
