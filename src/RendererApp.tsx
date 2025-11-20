import React, { useCallback, useMemo, useState } from "react";
import { MantineProvider } from "@mantine/core";
import { useRendererDocuments } from "./hooks/useRendererDocuments";
import { useDocumentCreationFlow } from "./hooks/useDocumentCreationFlow";
import { useSlashCommandBridge } from "./hooks/useSlashCommandBridge";
import { useProfileCreationModal } from "./hooks/useProfileCreationModal";
import { useRendererEditor } from "./hooks/useRendererEditor";
import { useDocumentActions } from "./hooks/useDocumentActions";
import { RendererLayout } from "./components/renderer/RendererLayout";
import { FileTreePane } from "./components/renderer/FileTreePane";
import { EditorPane } from "./components/renderer/EditorPane";
import { DebugPane } from "./components/renderer/DebugPane";
import { ProfileModal } from "./components/renderer/ProfileModal";

export const RendererApp = () => {
  const [isDebugSidebarVisible, setIsDebugSidebarVisible] = useState(false);
  const {
    profiles,
    documentTrees,
    activeProfileId,
    activeDocument,
    setActiveProfileId,
  } = useRendererDocuments();

  const editor = useRendererEditor();
  const {
    SlashCommandSyncMenu,
    handleSlashMenuItems,
    handleSlashMenuItemClick,
  } = useSlashCommandBridge(editor);

  const activateProfileForCreation = useCallback(
    (profileId: string) => setActiveProfileId(profileId),
    [setActiveProfileId]
  );

  const {
    pendingRenameDocumentId,
    handleCreateDocument,
    handlePendingRenameConsumed,
    handlePendingDocumentNamed,
    handlePendingDocumentRemoved,
  } = useDocumentCreationFlow({
    activateProfile: activateProfileForCreation,
  });

  const activeDocumentId = activeDocument?.id ?? null;

  const {
    handleDocumentSelect,
    handleRenameDocument,
    handleDeleteDocument,
    handleMoveDocumentToProfile,
    handleMoveDocumentWithinTree,
  } = useDocumentActions({
    activeDocumentId,
    onPendingDocumentRemoved: handlePendingDocumentRemoved,
  });

  const {
    isModalOpen: isCreateProfileModalOpen,
    profileName: profileModalName,
    profileError: profileModalError,
    isCreating: isCreatingProfile,
    openModal: openProfileModal,
    closeModal: closeProfileModal,
    handleNameChange: handleProfileModalNameChange,
    handleConfirm: handleConfirmCreateProfile,
  } = useProfileCreationModal({
    onProfileCreated: (profile) => setActiveProfileId(profile.id),
  });

  const activeProfileTree = useMemo(() => {
    if (!activeProfileId) return [];
    return documentTrees[activeProfileId] ?? [];
  }, [documentTrees, activeProfileId]);

  const handleDebugToggle = useCallback((enabled: boolean) => {
    setIsDebugSidebarVisible(enabled);
  }, []);

  const handleProfileSelect = useCallback(
    (profileId: string) => {
      setActiveProfileId(profileId);
    },
    [setActiveProfileId]
  );

  const handleOpenCreateProfileModal = useCallback(() => {
    openProfileModal(`Profile ${profiles.length + 1}`);
  }, [openProfileModal, profiles.length]);

  const handleCloseCreateProfileModal = useCallback(() => {
    closeProfileModal();
  }, [closeProfileModal]);

  return (
    <MantineProvider defaultColorScheme="auto">
      <RendererLayout
        isDebugSidebarVisible={isDebugSidebarVisible}
        navbar={
          <FileTreePane
            profiles={profiles}
            activeProfileId={activeProfileId}
            onSelectProfile={handleProfileSelect}
            onCreateProfile={handleOpenCreateProfileModal}
            documentTree={activeProfileTree}
            activeDocumentId={activeDocumentId}
            onSelectDocument={handleDocumentSelect}
            onCreateDocument={handleCreateDocument}
            onRenameDocument={handleRenameDocument}
            onDeleteDocument={handleDeleteDocument}
            onMoveDocumentToProfile={handleMoveDocumentToProfile}
            onMoveDocument={handleMoveDocumentWithinTree}
            pendingEditDocumentId={pendingRenameDocumentId}
            onPendingEditConsumed={handlePendingRenameConsumed}
            onPendingDocumentNamed={handlePendingDocumentNamed}
          />
        }
        main={
          <EditorPane
            editor={editor}
            SlashCommandSyncMenu={SlashCommandSyncMenu}
            onSlashMenuItems={handleSlashMenuItems}
            onSlashMenuItemClick={handleSlashMenuItemClick}
            onDebugToggle={handleDebugToggle}
          />
        }
        aside={
          <DebugPane
            isVisible={isDebugSidebarVisible}
            onClose={() => setIsDebugSidebarVisible(false)}
          />
        }
      />
      <ProfileModal
        opened={isCreateProfileModalOpen}
        profileName={profileModalName}
        error={profileModalError}
        isCreating={isCreatingProfile}
        onNameChange={handleProfileModalNameChange}
        onClose={handleCloseCreateProfileModal}
        onConfirm={handleConfirmCreateProfile}
      />
    </MantineProvider>
  );
};
