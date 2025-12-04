import { useCallback, useEffect, useState, useContext } from "react";
import { MantineProvider } from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";
import { useRendererDocuments } from "./hooks/useRendererDocuments";
import { useDocumentCreationFlow } from "./hooks/useDocumentCreationFlow";
import { useSlashCommandBridge } from "./hooks/useSlashCommandBridge";
import { useProfileCreationModal } from "./hooks/useProfileCreationModal";
import { useRendererEditor } from "./hooks/useRendererEditor";
import { useDocumentActions } from "./hooks/useDocumentActions";
import { useRendererRouter } from "./hooks/useRendererRouter";
import { RendererLayout } from "./components/renderer/RendererLayout";
import { BlockRouteView } from "./components/renderer/BlockRouteView";
import { FileTreePane } from "./components/renderer/FileTreePane";
import { EditorPane } from "./components/renderer/EditorPane";
import { DebugPane } from "./components/renderer/DebugPane";
import { ProfileModal } from "./components/renderer/ProfileModal";
import { DocumentProvider } from "./context/DocumentContext";
import { DEFAULT_PROFILE_ID } from "./config/profiles";
import { useActiveProfileData } from "./hooks/useActiveProfileData";
import { RendererRouteProvider } from "./context/RendererRouteContext";
import {
  BlockNotificationProvider,
  BlockNotificationContext,
} from "./context/BlockNotificationContext";

const RendererAppContent = () => {
  const [isNavbarOpened, { toggle: toggleNavbar }] = useDisclosure(true);
  const [isDebugSidebarVisible, setIsDebugSidebarVisible] = useState(false);
  const {
    profiles,
    documentTrees,
    activeProfileId,
    activeDocument,
    setActiveProfileId,
  } = useRendererDocuments();

  // Use useContext directly to avoid throwing if context isn't available during initial render
  const notificationContext = useContext(BlockNotificationContext);
  const triggerNotification = notificationContext?.triggerNotification;
  const editor = useRendererEditor(triggerNotification);
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
  const { route, navigateToDoc, navigateToBlock } = useRendererRouter(
    activeDocumentId,
    activeDocumentId
  );

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

  const { activeProfileName, activeProfileTree } = useActiveProfileData({
    profiles,
    activeProfileId,
    documentTrees,
  });

  const activeDocumentTitle = activeDocument?.title ?? null;

  const showDebug = useCallback(async () => {
    setIsDebugSidebarVisible(true);

    if (!window.electronAPI?.debug) return;

    try {
      const isEnabled = await window.electronAPI.debug.isEnabled();
      if (!isEnabled) {
        await window.electronAPI.debug.toggle();
      }
    } catch (error) {
      console.error("Failed to enable debug mode:", error);
    }
  }, []);

  useEffect(() => {
    // Expose a global helper for showing the debug sidebar.
    window.showDebug = showDebug;

    return () => {
      if (window.showDebug === showDebug) {
        delete window.showDebug;
      }
    };
  }, [showDebug]);

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
      <RendererRouteProvider value={{ route, navigateToDoc, navigateToBlock }}>
        {route.kind === "block" ? (
          <BlockRouteView
            blockId={route.blockId}
            docId={route.docId ?? activeDocumentId}
            profileId={activeDocument?.profileId ?? null}
            editor={editor}
          />
        ) : (
          <RendererLayout
            isNavbarOpened={isNavbarOpened}
            onNavbarToggle={toggleNavbar}
            isDebugSidebarVisible={isDebugSidebarVisible}
            profileName={activeProfileName}
            documentTitle={activeDocumentTitle}
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
              <DocumentProvider
                profileId={activeDocument?.profileId ?? DEFAULT_PROFILE_ID}
                documentId={activeDocumentId}
              >
                <EditorPane
                  editor={editor}
                  SlashCommandSyncMenu={SlashCommandSyncMenu}
                  onSlashMenuItems={handleSlashMenuItems}
                  onSlashMenuItemClick={handleSlashMenuItemClick}
                  focusBlockId={
                    route.kind === "doc" ? (route.focusBlockId ?? null) : null
                  }
                />
              </DocumentProvider>
            }
            aside={
              <DebugPane
                isVisible={isDebugSidebarVisible}
                onClose={() => setIsDebugSidebarVisible(false)}
              />
            }
          />
        )}
        <ProfileModal
          opened={isCreateProfileModalOpen}
          profileName={profileModalName}
          error={profileModalError}
          isCreating={isCreatingProfile}
          onNameChange={handleProfileModalNameChange}
          onClose={handleCloseCreateProfileModal}
          onConfirm={handleConfirmCreateProfile}
        />
      </RendererRouteProvider>
    </MantineProvider>
  );
};

export const RendererApp = () => {
  return (
    <BlockNotificationProvider>
      <RendererAppContent />
    </BlockNotificationProvider>
  );
};
