import { useCallback, useState } from "react";
import { ProfileRecord } from "../types/documents";
import { log } from "../utils/rendererLogger";

type UseProfileCreationModalOptions = {
  onProfileCreated?: (profile: ProfileRecord) => void;
};

export const useProfileCreationModal = ({
  onProfileCreated,
}: UseProfileCreationModalOptions = {}) => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [profileName, setProfileName] = useState("");
  const [profileError, setProfileError] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);

  const openModal = useCallback((defaultName?: string) => {
    setProfileName(defaultName ?? "");
    setProfileError(null);
    setIsModalOpen(true);
  }, []);

  const closeModal = useCallback(() => {
    setIsModalOpen(false);
    setProfileError(null);
    setProfileName("");
  }, []);

  const handleNameChange = useCallback(
    (value: string) => {
      setProfileName(value);
      if (profileError) {
        setProfileError(null);
      }
    },
    [profileError]
  );

  const handleConfirm = useCallback(async () => {
    const trimmed = profileName.trim();
    if (!trimmed) {
      setProfileError("Profile name is required");
      return;
    }

    if (!window.electronAPI?.profiles) {
      setProfileError("Profiles API unavailable");
      return;
    }

    setIsCreating(true);
    try {
      const profile = await window.electronAPI.profiles.create({
        name: trimmed,
      });
      if (profile) {
        onProfileCreated?.(profile);
        setIsModalOpen(false);
        setProfileName("");
        setProfileError(null);
      }
    } catch (error) {
      log.debug(`Failed to create profile: ${error}`, "renderer");
      setProfileError("Failed to create profile");
    } finally {
      setIsCreating(false);
    }
  }, [profileName, onProfileCreated]);

  return {
    isModalOpen,
    profileName,
    profileError,
    isCreating,
    openModal,
    closeModal,
    handleNameChange,
    handleConfirm,
  };
};
