export const DEFAULT_PROFILE_ID = "default-profile";
export const DEFAULT_PROFILE_NAME = "Default";

export const PROFILE_PARTITION_PREFIX = "persist:";

export const getProfilePartition = (profileId: string): string => {
  return `${PROFILE_PARTITION_PREFIX}${profileId}`;
};
