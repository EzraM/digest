import { useCallback, useEffect, useState, useContext } from "react";
import { MantineProvider } from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";
import { theme } from "./config/theme";
import { useRendererDocuments } from "./hooks/useRendererDocuments";
import { useDocumentCreationFlow } from "./hooks/useDocumentCreationFlow";
import { useSlashCommandBridge } from "./hooks/useSlashCommandBridge";
import { useProfileCreationModal } from "./hooks/useProfileCreationModal";
import { useProfileRenameModal } from "./hooks/useProfileRenameModal";
import { useProfileDeleteModal } from "./hooks/useProfileDeleteModal";
import { useRendererEditor } from "./hooks/useRendererEditor";
import { useDocumentActions } from "./hooks/useDocumentActions";
import { useBlockRouteProps } from "./hooks/useBlockRouteProps";
import { RendererLayout } from "./components/renderer/RendererLayout";
import { BlockRouteView } from "./components/renderer/BlockRouteView";
import { FileTreePane } from "./components/renderer/FileTreePane";
import { EditorPane } from "./components/renderer/EditorPane";
import { DebugPane } from "./components/renderer/DebugPane";
import { ProfileModal } from "./components/renderer/ProfileModal";
import { ProfileDeleteModal } from "./components/renderer/ProfileDeleteModal";
import { DocumentProvider } from "./context/DocumentContext";
import { DEFAULT_PROFILE_ID } from "./config/profiles";
import { useActiveProfileData } from "./hooks/useActiveProfileData";
import { AppRouteProvider, useAppRoute, AppRoute } from "./context/AppRouteContext";
import {
  BlockNotificationProvider,
  BlockNotificationContext,
} from "./context/BlockNotificationContext";
import { ClipDraftProvider } from "./context/ClipDraftContext";
import { toFullViewId } from "./utils/viewId";
import { PageToolSlotProvider } from "./context/PageToolSlotContext";
import { ClipInbox } from "./components/clip/ClipInbox";
import { useBrowserSelection } from "./hooks/useBrowserSelection";
import { LinkCaptureProvider } from "./domains/link-capture/ui/LinkCaptureContext";
import { LinkCaptureNotification } from "./domains/link-capture/ui/LinkCaptureNotification";
import { useLinkCaptureNotification } from "./domains/link-capture/ui/useLinkCaptureNotification";
import { DownloadProvider } from "./domains/downloads/ui/DownloadContext";
import { DownloadNotification } from "./domains/downloads/ui/DownloadNotification";
import { useDownloadNotification } from "./domains/downloads/ui/useDownloadNotification";

const RendererAppContent = () => {
  const [isNavbarOpened, { toggle: toggleNavbar, close: closeNavbar }] =
    useDisclosure(true);
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

  // Listen for browser selection events
  useBrowserSelection();

  // Listen for link capture events
  useLinkCaptureNotification();

  // Listen for download events
  useDownloadNotification();

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

  // Get route from TanStack Router context
  const { route, navigateToDoc } = useAppRoute();

  // Get block route props for block routes
  const { blockRouteProps, updateCachedBlockUrl } = useBlockRouteProps(
    route.kind === "block" ? route.blockId : undefined,
    route.kind === "block" ? (route.docId ?? activeDocumentId) : null,
    editor
  );

  const [displayedRoute, setDisplayedRoute] = useState<AppRoute>(route);
  const [handoffTarget, setHandoffTarget] = useState<AppRoute | null>(null);

  // Sync route with hash on initial load and when activeDocumentId becomes available
  useEffect(() => {
    if (route.kind === "doc" && !route.docId && activeDocumentId) {
      // Use hash navigation - TanStack Router's hash history will pick it up
      window.location.hash = `#/doc/${encodeURIComponent(activeDocumentId)}`;
    }
  }, [route.kind, route.docId, activeDocumentId]);

  // Keep Electron's active document in sync with route doc id
  useEffect(() => {
    if (!window.electronAPI?.documents?.switch) {
      return;
    }

    const targetDocId =
      route.kind === "doc"
        ? route.docId
        : route.docId ?? activeDocumentId;

    if (!targetDocId || targetDocId === activeDocumentId) {
      return;
    }

    window.electronAPI.documents.switch(targetDocId).catch(() => {
      // Ignore errors; renderer state will stay as-is
    });
  }, [route, activeDocumentId]);

  useEffect(() => {
    if (route.kind === "block" || route.kind === "url") {
      // Entering block/url view; keep doc visible until full view ready
      if (displayedRoute.kind === "doc") {
        setHandoffTarget(route);
      } else {
        setDisplayedRoute(route);
        setHandoffTarget(null);
      }
    } else {
      // Doc route: render doc and clear handoff
      setDisplayedRoute(route);
      setHandoffTarget(null);
    }
  }, [displayedRoute.kind, route]);

  const handleFullscreenReady = useCallback(
    (viewId: string) => {
      if (!handoffTarget) return;

      const isBlockHandoff =
        handoffTarget.kind === "block" &&
        toFullViewId(handoffTarget.blockId) === viewId;

      // For URL routes, generate synthetic blockId for comparison
      const isUrlHandoff =
        handoffTarget.kind === "url" &&
        toFullViewId(`ephemeral-${btoa(handoffTarget.url).replace(/[^a-zA-Z0-9]/g, '')}`) === viewId;

      if (isBlockHandoff || isUrlHandoff) {
        setDisplayedRoute(handoffTarget);
        setHandoffTarget(null);
      }
    },
    [handoffTarget]
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
    navigateToDoc,
  });

  const handleSidebarDocumentSelect = useCallback(
    (documentId: string) => {
      closeNavbar();
      handleDocumentSelect(documentId);
    },
    [closeNavbar, handleDocumentSelect]
  );

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

  const {
    isModalOpen: isRenameProfileModalOpen,
    profileName: renameProfileModalName,
    profileError: renameProfileModalError,
    isRenaming: isRenamingProfile,
    openModal: openRenameProfileModal,
    closeModal: closeRenameProfileModal,
    handleNameChange: handleRenameProfileModalNameChange,
    handleConfirm: handleConfirmRenameProfile,
  } = useProfileRenameModal();

  const {
    isModalOpen: isDeleteProfileModalOpen,
    profile: profileToDelete,
    pageCount,
    isDeleting: isDeletingProfile,
    openModal: openDeleteProfileModal,
    closeModal: closeDeleteProfileModal,
    handleConfirm: handleConfirmDeleteProfile,
  } = useProfileDeleteModal({
    onProfileDeleted: (deletedProfileId) => {
      // If the deleted profile was active, switch to another profile
      if (deletedProfileId === activeProfileId) {
        const remainingProfiles = profiles.filter(
          (p) => p.id !== deletedProfileId
        );
        if (remainingProfiles.length > 0) {
          setActiveProfileId(remainingProfiles[0].id);
        } else {
          setActiveProfileId(null);
        }
      }
    },
  });

  const { activeProfileName, activeProfileTree } = useActiveProfileData({
    profiles,
    activeProfileId,
    documentTrees,
  });

  const activeDocumentTitle = activeDocument?.title ?? null;
  const isHandoff =
    handoffTarget !== null &&
    (handoffTarget.kind === "block" || handoffTarget.kind === "url") &&
    displayedRoute.kind === "doc" &&
    (route.kind === "block" || route.kind === "url");

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

  const handleRenameProfile = useCallback(
    (profileId: string) => {
      const profile = profiles.find((p) => p.id === profileId);
      if (profile) {
        openRenameProfileModal(profile);
      }
    },
    [profiles, openRenameProfileModal]
  );

  const handleDeleteProfile = useCallback(
    (profileId: string) => {
      const profile = profiles.find((p) => p.id === profileId);
      if (profile) {
        openDeleteProfileModal(profile, activeProfileTree);
      }
    },
    [profiles, activeProfileTree, openDeleteProfileModal]
  );

  return (
    <MantineProvider theme={theme} defaultColorScheme="auto">
      {route.kind === "block" && (
        <BlockRouteView
          blockId={route.blockId}
          docId={
            blockRouteProps?.docId ??
            route.docId ??
            activeDocumentId
          }
          profileId={activeDocument?.profileId ?? null}
          url={blockRouteProps?.url ?? null}
          title={blockRouteProps?.title ?? "Block"}
          viewId={toFullViewId(route.blockId)}
          editor={editor}
          onUrlChange={(nextUrl) =>
            updateCachedBlockUrl(route.blockId, nextUrl)
          }
          onReady={handleFullscreenReady}
        />
      )}
      {route.kind === "url" && (
        <BlockRouteView
          blockId={undefined}
          docId={route.docId ?? activeDocumentId}
          profileId={activeDocument?.profileId ?? null}
          url={route.url}
          title={route.url}
          viewId={toFullViewId(`ephemeral-${btoa(route.url).replace(/[^a-zA-Z0-9]/g, '')}`)}
          editor={editor}
          onUrlChange={() => {}} // Ephemeral pages don't update block state
          onReady={handleFullscreenReady}
        />
      )}
      {(displayedRoute.kind === "doc" || isHandoff) && (
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
              onRenameProfile={handleRenameProfile}
              onDeleteProfile={handleDeleteProfile}
              documentTree={activeProfileTree}
              activeDocumentId={activeDocumentId}
              onSelectDocument={handleSidebarDocumentSelect}
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
      <ProfileModal
        opened={isRenameProfileModalOpen}
        title="Rename profile"
        profileName={renameProfileModalName}
        error={renameProfileModalError}
        isCreating={isRenamingProfile}
        onNameChange={handleRenameProfileModalNameChange}
        onClose={closeRenameProfileModal}
        onConfirm={handleConfirmRenameProfile}
      />
      <ProfileDeleteModal
        opened={isDeleteProfileModalOpen}
        profileName={profileToDelete?.name ?? ""}
        pageCount={pageCount}
        onClose={closeDeleteProfileModal}
        onConfirm={handleConfirmDeleteProfile}
      />
      <ClipInbox />
      <LinkCaptureNotification />
      <DownloadNotification />
    </MantineProvider>
  );
};

// Inner component that has access to router context
const RendererAppWithRouteContext = () => {
  const {
    activeDocument,
  } = useRendererDocuments();

  const activeDocumentId = activeDocument?.id ?? null;

  return (
    <AppRouteProvider fallbackDocId={activeDocumentId}>
      <RendererAppContent />
    </AppRouteProvider>
  );
};

export const RendererApp = () => {
  return (
    <BlockNotificationProvider>
      <ClipDraftProvider>
        <LinkCaptureProvider>
          <DownloadProvider>
            <PageToolSlotProvider>
              <RendererAppWithRouteContext />
            </PageToolSlotProvider>
          </DownloadProvider>
        </LinkCaptureProvider>
      </ClipDraftProvider>
    </BlockNotificationProvider>
  );
};
