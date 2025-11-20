/**
 * This file will automatically be loaded by vite and run in the "renderer" context.
 * To learn more about the differences between the "main" and the "renderer" context in
 * Electron, visit:
 *
 * https://electronjs.org/docs/tutorial/application-architecture#main-and-renderer-processes
 *
 * By default, Node.js integration in this file is disabled. When enabling Node.js integration
 * in a renderer process, please be aware of potential security implications. You can read
 * more about security risks here:
 *
 * https://electronjs.org/docs/tutorial/security
 *
 * To enable Node.js integration in this file, open up `main.ts` and enable the `nodeIntegration`
 * flag:
 *
 * ```
 *  // Create the browser window.
 *  mainWindow = new BrowserWindow({
 *    width: 800,
 *    height: 600,
 *    webPreferences: {
 *      nodeIntegration: true
 *    }
 *  });
 * ```
 */
import React, { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";

import { BlockNoteView } from "@blocknote/mantine";
import "@mantine/core/styles.css";
import "@blocknote/mantine/style.css";
import "@blocknote/core/fonts/inter.css";

import { useCreateBlockNote, SuggestionMenuController } from "@blocknote/react";
import { insertOrUpdateBlock } from "@blocknote/core";
import { log } from "./utils/rendererLogger";
import {
  schema,
  CustomBlockNoteEditor,
  CustomPartialBlock,
} from "./types/schema";
import { useDocumentSync } from "./hooks/useDocumentSync";
import { useBrowserScrollForward } from "./hooks/useBrowserScrollForward";
import { DebugSidebar } from "./components/DebugSidebar";
import { DebugToggle } from "./components/DebugToggle";
import {
  AppShell,
  Button,
  Group,
  MantineProvider,
  Modal,
  Stack,
  TextInput,
} from "@mantine/core";
import { GoogleSearchExtensionName } from "./Search/GoogleSearchBlock";
import { ChatGPTExtensionName } from "./Search/ChatGPTBlock";
import { URLExtensionName } from "./Search/URLBlock";
import {
  slashCommandOptions,
  filterSlashCommandOptions,
} from "./data/slashCommandOptions";
import {
  SlashCommandLoadingState,
  SlashCommandOption,
} from "./types/slashCommand";
import {
  DocumentRecord,
  DocumentTreeNode,
  ProfileRecord,
} from "./types/documents";
import { FileTree } from "./components/FileTree/FileTree";

const root = createRoot(document.getElementById("root"));
root.render(<App />);

// Note: Site blocks are no longer user-selectable from slash menu
// They are created programmatically when links are clicked

// Store current editor globally to access in IPC handlers
let currentEditor: CustomBlockNoteEditor | null = null;

const URL_BLOCK_TYPES = new Set([URLExtensionName, "url"]);

// Function to create a new browser block with the specified URL
const createNewBrowserBlock = (url: string): void => {
  if (currentEditor) {
    insertOrUpdateBlock(currentEditor, {
      type: "site",
      props: { url },
    } as unknown as CustomPartialBlock);
  }
};

type SlashCommandMenuProps = {
  items: SlashCommandOption[];
  selectedIndex?: number;
  loadingState: SlashCommandLoadingState;
  onItemClick?: (item: SlashCommandOption) => void;
};

function App() {
  // Debug sidebar state
  const [isDebugSidebarVisible, setIsDebugSidebarVisible] = useState(false);
  const [profiles, setProfiles] = useState<ProfileRecord[]>([]);
  const [documentTrees, setDocumentTrees] = useState<
    Record<string, DocumentTreeNode[]>
  >({});
  const [activeProfileId, setActiveProfileId] = useState<string | null>(null);
  const [activeDocument, setActiveDocument] = useState<DocumentRecord | null>(
    null
  );
  const [pendingRenameDocumentId, setPendingRenameDocumentId] = useState<
    string | null
  >(null);
  const [isCreateProfileModalOpen, setIsCreateProfileModalOpen] =
    useState(false);
  const [profileModalName, setProfileModalName] = useState("");
  const [profileModalError, setProfileModalError] = useState<string | null>(
    null
  );
  const [isCreatingProfile, setIsCreatingProfile] = useState(false);

  // Create editor immediately with no initial content - Y.js sync will populate it
  const editor = useCreateBlockNote({
    schema,
    initialContent: undefined, // Start with no content, Y.js will sync content automatically
  }) as CustomBlockNoteEditor;

  // Store editor reference for IPC handlers
  useEffect(() => {
    currentEditor = editor;
    return () => {
      currentEditor = null;
    };
  }, [editor]);

  // Set up IPC listener for new browser blocks
  useEffect(() => {
    if (!window.electronAPI?.onNewBrowserBlock) {
      return;
    }

    const unsubscribe = window.electronAPI.onNewBrowserBlock((data) => {
      if (data?.url) {
        createNewBrowserBlock(data.url);
      }
    });

    return unsubscribe;
  }, []);

  // Set up scroll forwarding from web views
  useBrowserScrollForward();

  // Set up IPC listener for block insertion from slash command manager
  useEffect(() => {
    if (!window.electronAPI?.onSlashCommandInsert) {
      return;
    }

    const unsubscribe = window.electronAPI.onSlashCommandInsert(
      (blockKey: string) => {
        log.debug(
          `Received block insertion from slash command: ${blockKey}`,
          "renderer"
        );

        // Handle the block insertion based on the selected block type
        if (currentEditor) {
          try {
            // Mimic BlockNote's default slash command cleanup so the "/" trigger is removed.
            currentEditor.suggestionMenus.closeMenu();
            currentEditor.suggestionMenus.clearQuery();

            // Use BlockNote's insertOrUpdateBlock like the built-in slash menu items do
            // This handles all focus, cursor positioning, and insertion logic automatically
            switch (blockKey) {
              // Note: 'site' blocks are no longer user-selectable from HUD
              // They are created programmatically when links are clicked
              case "paragraph":
                insertOrUpdateBlock(currentEditor, { type: "paragraph" });
                break;
              case "heading":
                insertOrUpdateBlock(currentEditor, {
                  type: "heading",
                  props: { level: 1 },
                } as unknown as CustomPartialBlock);
                break;
              case "heading_2":
                insertOrUpdateBlock(currentEditor, {
                  type: "heading",
                  props: { level: 2 },
                } as unknown as CustomPartialBlock);
                break;
              case "heading_3":
                insertOrUpdateBlock(currentEditor, {
                  type: "heading",
                  props: { level: 3 },
                } as unknown as CustomPartialBlock);
                break;
              case "bullet_list":
                insertOrUpdateBlock(currentEditor, { type: "bulletListItem" });
                break;
              case "numbered_list":
                insertOrUpdateBlock(currentEditor, {
                  type: "numberedListItem",
                });
                break;
              case "check_list":
                insertOrUpdateBlock(currentEditor, { type: "checkListItem" });
                break;
              case "table":
                insertOrUpdateBlock(currentEditor, { type: "table" });
                break;
              case "image":
                insertOrUpdateBlock(currentEditor, { type: "image" });
                break;
              case "video":
                insertOrUpdateBlock(currentEditor, { type: "video" });
                break;
              case "audio":
                insertOrUpdateBlock(currentEditor, { type: "audio" });
                break;
              case "file":
                insertOrUpdateBlock(currentEditor, { type: "file" });
                break;
              case "google_search":
                insertOrUpdateBlock(currentEditor, {
                  type: GoogleSearchExtensionName,
                });
                break;
              case "chatgpt":
                insertOrUpdateBlock(currentEditor, {
                  type: ChatGPTExtensionName,
                });
                break;
              case "url":
                insertOrUpdateBlock(currentEditor, { type: URLExtensionName });
                break;
              default:
                log.debug(`Unknown block type: ${blockKey}`, "renderer");
            }

            log.debug(`Successfully inserted block: ${blockKey}`, "renderer");
          } catch (error) {
            log.debug(
              `Error inserting block ${blockKey}: ${error}`,
              "renderer"
            );
          }
        }
      }
    );

    return unsubscribe;
  }, []);

  // Load profiles/documents on startup
  useEffect(() => {
    let isCancelled = false;

    const bootstrap = async () => {
      if (!window.electronAPI?.profiles || !window.electronAPI.documents) {
        return;
      }

      try {
        const [profileList, activeDoc] = await Promise.all([
          window.electronAPI.profiles.list(),
          window.electronAPI.documents.getActive(),
        ]);

        if (isCancelled) return;

        setProfiles(profileList);

        if (activeDoc) {
          setActiveDocument(activeDoc);
          setActiveProfileId(activeDoc.profileId);

          const tree = await window.electronAPI.documents.getTree(
            activeDoc.profileId
          );
          if (isCancelled) return;
          setDocumentTrees((prev) => ({
            ...prev,
            [activeDoc.profileId]: tree,
          }));
        } else if (profileList.length > 0) {
          const fallbackProfileId = profileList[0].id;
          setActiveProfileId(fallbackProfileId);
          const tree = await window.electronAPI.documents.getTree(
            fallbackProfileId
          );
          if (isCancelled) return;
          setDocumentTrees((prev) => ({
            ...prev,
            [fallbackProfileId]: tree,
          }));
        }
      } catch (error) {
        log.debug(`Failed to bootstrap profiles/documents: ${error}`, "renderer");
      }
    };

    bootstrap();

    return () => {
      isCancelled = true;
    };
  }, []);

  // Listen for profile updates pushed from main
  useEffect(() => {
    if (!window.electronAPI?.profiles?.onUpdated) {
      return;
    }

    const unsubscribe = window.electronAPI.profiles.onUpdated(
      ({ profiles: nextProfiles }) => {
        setProfiles(nextProfiles);
        setActiveProfileId((current) => {
          if (current && nextProfiles.some((profile) => profile.id === current)) {
            return current;
          }

          const activeDocProfile = activeDocument?.profileId;
          if (
            activeDocProfile &&
            nextProfiles.some((profile) => profile.id === activeDocProfile)
          ) {
            return activeDocProfile;
          }

          return nextProfiles[0]?.id ?? null;
        });
      }
    );

    return unsubscribe;
  }, [activeDocument]);

  // Listen for tree updates
  useEffect(() => {
    if (!window.electronAPI?.documents?.onTreeUpdated) {
      return;
    }

    const unsubscribe = window.electronAPI.documents.onTreeUpdated(
      ({ profileId, tree }) => {
        setDocumentTrees((prev) => ({
          ...prev,
          [profileId]: tree,
        }));
      }
    );

    return unsubscribe;
  }, []);

  // Listen for active document changes from main
  useEffect(() => {
    if (!window.electronAPI?.documents?.onDocumentSwitched) {
      return;
    }

    const unsubscribe = window.electronAPI.documents.onDocumentSwitched(
      ({ document }) => {
        setActiveDocument(document ?? null);
        if (document) {
          setActiveProfileId(document.profileId);
        }
      }
    );

    return unsubscribe;
  }, []);

  // Fetch tree when active profile changes (e.g., manual selection)
  useEffect(() => {
    if (!activeProfileId || !window.electronAPI?.documents?.getTree) {
      return;
    }

    let isCancelled = false;

    const fetchTree = async () => {
      try {
        const tree = await window.electronAPI.documents.getTree(
          activeProfileId
        );
        if (isCancelled) return;
        setDocumentTrees((prev) => ({
          ...prev,
          [activeProfileId]: tree,
        }));
      } catch (error) {
        log.debug(`Failed to load tree for profile ${activeProfileId}`, "renderer");
      }
    };

    fetchTree();

    return () => {
      isCancelled = true;
    };
  }, [activeProfileId]);

  const activeDocumentId = activeDocument?.id ?? null;

  const activeProfileTree = useMemo(() => {
    if (!activeProfileId) return [];
    return documentTrees[activeProfileId] ?? [];
  }, [documentTrees, activeProfileId]);

  // Set up continuous document state synchronization
  useDocumentSync(editor);

  // Handle debug sidebar toggle
  const handleDebugToggle = (enabled: boolean) => {
    setIsDebugSidebarVisible(enabled);
  };

  const slashCommandActiveRef = React.useRef(false);
  const slashQueryRef = React.useRef("");

  const handleSlashMenuItems = React.useCallback(
    async (query: string): Promise<SlashCommandOption[]> => {
      const { block } = editor.getTextCursorPosition();
      if (block && URL_BLOCK_TYPES.has(block.type)) {
        log.debug("Slash menu suppressed inside URL block", "renderer");
        editor.suggestionMenus.closeMenu();
        slashCommandActiveRef.current = false;
        window.electronAPI?.cancelSlashCommand();
        return [];
      }

      slashQueryRef.current = query;

      if (!slashCommandActiveRef.current) {
        log.debug(
          "Slash menu triggered, starting custom slash command",
          "renderer"
        );
        slashCommandActiveRef.current = true;
        window.electronAPI?.startSlashCommand();
      }

      const filtered = filterSlashCommandOptions(query, slashCommandOptions);
      return filtered;
    },
    [editor]
  );

  const SlashCommandSyncMenu: React.FC<SlashCommandMenuProps> = ({
    items,
    selectedIndex,
    loadingState,
  }) => {
    React.useEffect(() => {
      const normalizedIndex =
        typeof selectedIndex === "number"
          ? selectedIndex
          : items.length > 0
          ? 0
          : null;

      window.electronAPI?.updateSlashCommandResults({
        query: slashQueryRef.current,
        items,
        selectedIndex: normalizedIndex,
        loadingState,
      });
    }, [items, selectedIndex, loadingState]);

    React.useEffect(() => {
      return () => {
        slashCommandActiveRef.current = false;
        window.electronAPI?.cancelSlashCommand();
      };
    }, []);

    return null;
  };

  const handleSlashMenuItemClick = React.useCallback(
    (item: SlashCommandOption) => {
      window.electronAPI?.selectSlashCommandBlock(item.key);
    },
    []
  );

  const handleProfileSelect = React.useCallback((profileId: string) => {
    setActiveProfileId(profileId);
  }, []);

  const handleCreateProfile = React.useCallback(async (name: string) => {
    if (!window.electronAPI?.profiles) {
      return null;
    }

    try {
      const profile = await window.electronAPI.profiles.create({
        name,
      });
      setActiveProfileId(profile.id);
      return profile;
    } catch (error) {
      log.debug(`Failed to create profile: ${error}`, "renderer");
      return null;
    }
  }, []);

  const handleOpenCreateProfileModal = React.useCallback(() => {
    setProfileModalName(`Profile ${profiles.length + 1}`);
    setProfileModalError(null);
    setIsCreateProfileModalOpen(true);
  }, [profiles.length]);

  const handleCloseCreateProfileModal = React.useCallback(() => {
    setIsCreateProfileModalOpen(false);
    setProfileModalError(null);
    setProfileModalName("");
  }, []);

  const handleConfirmCreateProfile = React.useCallback(async () => {
    const trimmed = profileModalName.trim();
    if (!trimmed) {
      setProfileModalError("Profile name is required");
      return;
    }

    setIsCreatingProfile(true);
    try {
      const profile = await handleCreateProfile(trimmed);
      if (profile) {
        setIsCreateProfileModalOpen(false);
        setProfileModalError(null);
        setProfileModalName("");
      }
    } finally {
      setIsCreatingProfile(false);
    }
  }, [profileModalName, handleCreateProfile]);

  const handleDocumentSelect = React.useCallback(
    async (documentId: string) => {
      if (!window.electronAPI?.documents) {
        return;
      }

      if (documentId === activeDocumentId) {
        return;
      }

      try {
        await window.electronAPI.documents.switch(documentId);
      } catch (error) {
        log.debug(`Failed to switch document: ${error}`, "renderer");
      }
    },
    [activeDocumentId]
  );

  const handlePendingRenameConsumed = React.useCallback(() => {
    setPendingRenameDocumentId(null);
  }, []);

  const handleCreateDocument = React.useCallback(
    async ({
      profileId,
      parentDocumentId = null,
    }: {
      profileId: string;
      parentDocumentId?: string | null;
    }) => {
      if (!window.electronAPI?.documents) {
        return null;
      }

      try {
        const document = await window.electronAPI.documents.create({
          profileId,
          parentDocumentId,
        });
        setPendingRenameDocumentId(document.id);
        setActiveProfileId(document.profileId);
        return document;
      } catch (error) {
        log.debug(`Failed to create document: ${error}`, "renderer");
        return null;
      }
    },
    []
  );

  const handleRenameDocument = React.useCallback(
    async (documentId: string, title: string) => {
      if (!window.electronAPI?.documents) {
        return null;
      }

      try {
        return await window.electronAPI.documents.rename({
          documentId,
          title,
        });
      } catch (error) {
        log.debug(`Failed to rename document: ${error}`, "renderer");
        return null;
      }
    },
    []
  );

  const handleDeleteDocument = React.useCallback(async (documentId: string) => {
    if (!window.electronAPI?.documents) {
      return false;
    }

    try {
      await window.electronAPI.documents.delete(documentId);
      if (documentId === pendingRenameDocumentId) {
        setPendingRenameDocumentId(null);
      }
      return true;
    } catch (error) {
      log.debug(`Failed to delete document: ${error}`, "renderer");
      return false;
    }
  }, [pendingRenameDocumentId]);

  const handleMoveDocumentToProfile = React.useCallback(
    async (documentId: string, newProfileId: string) => {
      if (!window.electronAPI?.documents) {
        return false;
      }

      try {
        await window.electronAPI.documents.moveToProfile({
          documentId,
          newProfileId,
        });
        return true;
      } catch (error) {
        log.debug(`Failed to move document to profile: ${error}`, "renderer");
        return false;
      }
    },
    []
  );

  return (
    <MantineProvider defaultColorScheme="auto">
      <AppShell
        navbar={{
          width: 320,
          breakpoint: "sm",
        }}
        aside={{
          width: 400,
          breakpoint: "sm",
          collapsed: { desktop: !isDebugSidebarVisible },
        }}
        padding="md"
      >
        <AppShell.Navbar p="md">
          <FileTree
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
            pendingEditDocumentId={pendingRenameDocumentId}
            onPendingEditConsumed={handlePendingRenameConsumed}
          />
        </AppShell.Navbar>

        <AppShell.Main>
          <div className="App">
            <BlockNoteView editor={editor} slashMenu={false}>
              <SuggestionMenuController
                triggerCharacter={"/"}
                suggestionMenuComponent={SlashCommandSyncMenu}
                getItems={handleSlashMenuItems}
                onItemClick={handleSlashMenuItemClick}
              />
            </BlockNoteView>
            <div style={{ height: "2000px", width: "100%", color: "gray" }} />

            {/* Debug toggle button */}
            <DebugToggle onToggle={handleDebugToggle} />
          </div>
        </AppShell.Main>

        <AppShell.Aside p="md">
          <DebugSidebar
            isVisible={isDebugSidebarVisible}
            onToggle={() => setIsDebugSidebarVisible(false)}
          />
        </AppShell.Aside>
      </AppShell>
      <Modal
        opened={isCreateProfileModalOpen}
        onClose={handleCloseCreateProfileModal}
        title="Create profile"
        centered
      >
        <Stack gap="sm">
          <TextInput
            label="Profile name"
            placeholder="Work"
            value={profileModalName}
            onChange={(event) => {
              setProfileModalName(event.currentTarget.value);
              if (profileModalError) {
                setProfileModalError(null);
              }
            }}
            error={profileModalError}
            data-autofocus
          />
          <Group justify="flex-end">
            <Button variant="default" onClick={handleCloseCreateProfileModal}>
              Cancel
            </Button>
            <Button
              onClick={handleConfirmCreateProfile}
              loading={isCreatingProfile}
            >
              Create
            </Button>
          </Group>
        </Stack>
      </Modal>
    </MantineProvider>
  );
}
