import { ProfileManager } from "../../services/ProfileManager";
import { IPCHandlerMap } from "../IPCRouter";

export function createProfileHandlers(
  profileManager: ProfileManager,
  broadcastProfiles: () => void,
  broadcastDocumentTree: (profileId: string | null) => void
): IPCHandlerMap {
  return {
    "profiles:create": {
      type: "invoke",
      fn: (
        _event,
        payload: { name: string; icon?: string | null; color?: string | null }
      ) => {
        const profile = profileManager.createProfile(payload.name, {
          icon: payload.icon ?? null,
          color: payload.color ?? null,
        });
        broadcastProfiles();
        broadcastDocumentTree(profile.id);
        return profile;
      },
    },
    "profiles:rename": {
      type: "invoke",
      fn: (_event, payload: { profileId: string; name: string }) => {
        const profile = profileManager.renameProfile(payload.profileId, payload.name);
        broadcastProfiles();
        return profile;
      },
    },
    "profiles:delete": {
      type: "invoke",
      fn: (_event, profileId: string) => {
        profileManager.deleteProfile(profileId);
        broadcastProfiles();
        broadcastDocumentTree(null);
        return { success: true };
      },
    },
  };
}
