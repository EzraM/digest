import { useEffect, useRef } from "react";
import { useCreateBlockNote } from "@blocknote/react";
import { BlockNoteView } from "@blocknote/mantine";
import { schema, CustomBlockNoteEditor } from "../../types/schema";
import { ClipDraft } from "../../types/clip";
import { useClipDraftContext } from "../../context/ClipDraftContext";

type ClipDraftEditorProps = {
  draft: ClipDraft;
};

/**
 * Mini BlockNote editor instance for previewing/editing clip draft
 * Isolated from main document
 * Saves edits immediately to in-memory draft (no debouncing needed)
 */
export const ClipDraftEditor = ({ draft }: ClipDraftEditorProps) => {
  const { updateDraft } = useClipDraftContext();
  const isInitializingRef = useRef(true);
  const isMountedRef = useRef(true);

  // Create editor with proposed blocks as initial content
  const editor = useCreateBlockNote({
    schema,
    initialContent: draft.proposedBlocks || undefined,
  }) as CustomBlockNoteEditor;

  // Listen for document changes and save them immediately (in-memory, no debounce needed)
  useEffect(() => {
    if (!editor) return;

    // Mark initialization as complete after first render
    const timeoutId = setTimeout(() => {
      isInitializingRef.current = false;
    }, 100);

    const handleChange = () => {
      if (!isMountedRef.current || isInitializingRef.current) {
        return; // Don't save during initialization or after unmount
      }
      const blocks = editor.document;
      if (blocks && blocks.length > 0) {
        // Save immediately - ClipService stores in memory, no need to debounce
        updateDraft(draft.id, { proposedBlocks: blocks });
      }
    };

    editor.onChange(handleChange);

    return () => {
      clearTimeout(timeoutId);
      isMountedRef.current = false;
    };
  }, [editor, draft.id, updateDraft]);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  if (!draft.proposedBlocks || draft.proposedBlocks.length === 0) {
    return (
      <div style={{ padding: "8px", color: "gray" }}>No content to preview</div>
    );
  }

  return (
    <div style={{ fontSize: "14px" }}>
      <BlockNoteView editor={editor} editable={true} theme="light" />
    </div>
  );
};
