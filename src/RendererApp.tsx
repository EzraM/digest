import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import { AppRouteProvider, useAppRoute } from "./context/AppRouteContext";
import { toFullViewId } from "./utils/viewId";
import { PageToolSlotProvider } from "./context/PageToolSlotContext";
import { useBrowserSelection } from "./hooks/useBrowserSelection";
import { useBrowserImageClips } from "./hooks/useBrowserImageClips";
import { LinkCaptureProvider } from "./domains/link-capture/ui/LinkCaptureContext";
import { LinkCaptureNotification } from "./domains/link-capture/ui/LinkCaptureNotification";
import { useLinkCaptureNotification } from "./domains/link-capture/ui/useLinkCaptureNotification";
import { DownloadProvider } from "./domains/downloads/ui/DownloadContext";
import { DownloadNotification } from "./domains/downloads/ui/DownloadNotification";
import { useDownloadNotification } from "./domains/downloads/ui/useDownloadNotification";
import { StatusBar } from "./components/renderer/StatusBar";
import { useStatusBar } from "./hooks/useStatusBar";
import { TitleBarContext } from "./context/TitleBarContext";

const RendererAppContent = () => {
  const [contextualTitleBar, setContextualTitleBar] = useState<React.ReactNode>(null);
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

  const pluginProfile = activeDocument
    ? {
        profileId: activeDocument.profileId,
        documentId: activeDocument.id,
        settings: profiles.find((profile) => profile.id === activeDocument.profileId)
          ?.settings,
      }
    : undefined;
  const editor = useRendererEditor(pluginProfile);

  // Listen for browser selection events
  useBrowserSelection();
  useBrowserImageClips();

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
  const previousRenderedBranchRef = useRef<string | null>(null);

  useEffect(() => {
    const branch = route.kind;
    console.log(
      `[RendererApp] branch committed ${JSON.stringify({
        previous: previousRenderedBranchRef.current,
        branch,
        route,
        activeDocumentId,
        hash: window.location.hash,
      })}`
    );
    previousRenderedBranchRef.current = branch;
  }, [route, activeDocumentId]);

  // Get block route props for block routes
  const { blockRouteProps, updateCachedBlockUrl } = useBlockRouteProps(
    route.kind === "block" ? route.blockId : undefined,
    route.kind === "block" ? (route.docId ?? activeDocumentId) : null,
    editor
  );

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
  const { breadcrumbText, handleClick: handleTitleBarClick } = useStatusBar({
    profileName: activeProfileName,
    documentTitle: activeDocumentTitle,
    onToggleSidebar: toggleNavbar,
  });
  const titleBarContextValue = useMemo(
    () => ({ setContextualContent: setContextualTitleBar }),
    []
  );
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

  const handleToggleJiraLinks = useCallback(
    async (profileId: string, enabled: boolean) => {
      const profile = profiles.find((candidate) => candidate.id === profileId);
      if (!profile || !window.electronAPI?.profiles?.updateSettings) return;
      await window.electronAPI.profiles.updateSettings({
        profileId,
        settings: {
          ...profile.settings,
          plugins: {
            ...profile.settings?.plugins,
            "builtin.jira-links": {
              enabled,
              baseUrl: "https://learning-ally.atlassian.net/browse",
              projectKeys: ["PD"],
            },
          },
        },
      });
    },
    [profiles]
  );

  return (
    <MantineProvider theme={theme} defaultColorScheme="auto">
      <TitleBarContext.Provider value={titleBarContextValue}>
      <div
        style={{
          height: "100vh",
          display: "grid",
          gridTemplateRows: "38px minmax(0, 1fr)",
          overflow: "hidden",
        }}
      >
        {contextualTitleBar ?? (
          <StatusBar
            breadcrumbText={breadcrumbText}
            onClick={handleTitleBarClick}
          />
        )}
        <div style={{ position: "relative", minHeight: 0, overflow: "hidden" }}>
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
        />
      )}
      {route.kind === "doc" && (
        <RendererLayout
          isNavbarOpened={isNavbarOpened}
          onNavbarToggle={toggleNavbar}
          isDebugSidebarVisible={isDebugSidebarVisible}
          navbar={
            <FileTreePane
              profiles={profiles}
              activeProfileId={activeProfileId}
              onSelectProfile={handleProfileSelect}
              onCreateProfile={handleOpenCreateProfileModal}
              onRenameProfile={handleRenameProfile}
              onDeleteProfile={handleDeleteProfile}
              onToggleJiraLinks={handleToggleJiraLinks}
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
        </div>
      </div>
      </TitleBarContext.Provider>
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
    <LinkCaptureProvider>
      <DownloadProvider>
        <PageToolSlotProvider>
          <RendererAppWithRouteContext />
        </PageToolSlotProvider>
      </DownloadProvider>
    </LinkCaptureProvider>
  );
};
