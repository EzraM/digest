import { useMemo } from "react";
import { DocumentTreeNode, ProfileRecord } from "../types/documents";

type Params = {
  profiles: ProfileRecord[];
  activeProfileId: string | null;
  documentTrees: Record<string, DocumentTreeNode[]>;
};

export const useActiveProfileData = ({
  profiles,
  activeProfileId,
  documentTrees,
}: Params) => {
  const activeProfileName = useMemo(() => {
    if (!activeProfileId) return null;
    const profile = profiles.find((p) => p.id === activeProfileId);
    return profile?.name ?? null;
  }, [profiles, activeProfileId]);

  const activeProfileTree = useMemo(() => {
    if (!activeProfileId) return [];
    return documentTrees[activeProfileId] ?? [];
  }, [documentTrees, activeProfileId]);

  return { activeProfileName, activeProfileTree };
};
