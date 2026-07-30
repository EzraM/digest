const SCHEME = "digest-image";

export const assetAddress = {
  create(id: string): string {
    if (!id) throw new Error("Asset id is required");
    return `${SCHEME}://${id}`;
  },

  parse(value: string): string | null {
    try {
      const url = new URL(value);
      if (url.protocol !== `${SCHEME}:`) return null;
      return url.hostname || url.pathname.replace(/^\//, "").split("/")[0] || null;
    } catch {
      return null;
    }
  },
};
