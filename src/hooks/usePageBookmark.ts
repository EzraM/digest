import { useCallback, useEffect, useRef, useState } from "react";
import type { PageBookmarkCandidate } from "../components/clip/AddPageButton";
import { NotebookWriteClient } from "../domains/notebook-content/application/NotebookWriteClient";
import { NotebookAddress } from "../domains/notebook-content/core/NotebookAddress";
import { createInlineLinkBlock } from "./inlineLinkInsertion";

export type BookmarkPhase = "idle" | "naming" | "saving" | "saved" | "error";

export type BookmarkDraft = PageBookmarkCandidate & {
  name: string;
  deadline: number;
};

const NAME_TIMEOUT_MS = 20_000;
const NAME_TIMEOUT_SECONDS = NAME_TIMEOUT_MS / 1_000;
const TYPING_IDLE_MS = 750;

export const usePageBookmark = (
  notebookAddress: NotebookAddress,
  notebookWriter: NotebookWriteClient
) => {
  const [phase, setPhaseState] = useState<BookmarkPhase>("idle");
  const [draft, setDraftState] = useState<BookmarkDraft | null>(null);
  const [secondsRemaining, setSecondsRemaining] = useState(NAME_TIMEOUT_SECONDS);
  const [isTyping, setIsTyping] = useState(false);
  const phaseRef = useRef<BookmarkPhase>("idle");
  const draftRef = useRef<BookmarkDraft | null>(null);
  const feedbackTimeoutRef = useRef<number | null>(null);
  const typingStartedAtRef = useRef<number | null>(null);
  const typingIdleTimeoutRef = useRef<number | null>(null);

  const setPhase = useCallback((next: BookmarkPhase) => {
    phaseRef.current = next;
    setPhaseState(next);
  }, []);

  const setDraft = useCallback((next: BookmarkDraft | null) => {
    draftRef.current = next;
    setDraftState(next);
  }, []);

  const stopTyping = useCallback(() => {
    if (typingIdleTimeoutRef.current !== null) {
      window.clearTimeout(typingIdleTimeoutRef.current);
      typingIdleTimeoutRef.current = null;
    }
    typingStartedAtRef.current = null;
    setIsTyping(false);
  }, []);

  const showSaved = useCallback(() => {
    setPhase("saved");
    if (feedbackTimeoutRef.current !== null) window.clearTimeout(feedbackTimeoutRef.current);
    feedbackTimeoutRef.current = window.setTimeout(() => setPhase("idle"), 1500);
  }, [setPhase]);

  const begin = useCallback((candidate: PageBookmarkCandidate) => {
    if (phaseRef.current === "naming" || phaseRef.current === "saving" || phaseRef.current === "error") return;
    if (feedbackTimeoutRef.current !== null) window.clearTimeout(feedbackTimeoutRef.current);
    stopTyping();
    setDraft({ ...candidate, name: "", deadline: Date.now() + NAME_TIMEOUT_MS });
    setSecondsRemaining(NAME_TIMEOUT_SECONDS);
    setPhase("naming");
  }, [setDraft, setPhase, stopTyping]);

  const rename = useCallback((name: string) => {
    const current = draftRef.current;
    if (!current) return;

    setDraft({ ...current, name });
    if (phaseRef.current !== "naming") return;

    if (typingStartedAtRef.current === null) {
      typingStartedAtRef.current = Date.now();
      setIsTyping(true);
    }
    if (typingIdleTimeoutRef.current !== null) {
      window.clearTimeout(typingIdleTimeoutRef.current);
    }
    typingIdleTimeoutRef.current = window.setTimeout(() => {
      const typingStartedAt = typingStartedAtRef.current;
      const latestDraft = draftRef.current;
      typingStartedAtRef.current = null;
      typingIdleTimeoutRef.current = null;
      if (typingStartedAt !== null && latestDraft && phaseRef.current === "naming") {
        setDraft({
          ...latestDraft,
          deadline: latestDraft.deadline + Date.now() - typingStartedAt,
        });
      }
      setIsTyping(false);
    }, TYPING_IDLE_MS);
  }, [setDraft]);

  const save = useCallback(async () => {
    const current = draftRef.current;
    if (!current || phaseRef.current !== "naming" && phaseRef.current !== "error") return;
    stopTyping();
    setPhase("saving");
    const title = current.name.trim() || current.pageTitle;
    const result = await notebookWriter.insert(
      notebookAddress,
      [createInlineLinkBlock({ url: current.url, title })],
      { source: "page-link", sourceUrl: current.url, capturedAt: Date.now() }
    );
    if (result.status === "rejected") {
      console.error("[usePageBookmark] Failed to add current page link", {
        url: current.url,
        notebookAddress,
      });
      setPhase("error");
      return;
    }
    setDraft(null);
    showSaved();
  }, [notebookAddress, notebookWriter, setDraft, setPhase, showSaved, stopTyping]);

  useEffect(() => {
    if (phase !== "naming" || !draft || isTyping) return;
    const update = () => setSecondsRemaining(
      Math.ceil(Math.max(0, draft.deadline - Date.now()) / 1000)
    );
    update();
    const interval = window.setInterval(update, 200);
    const timeout = window.setTimeout(
      () => void save(),
      Math.max(0, draft.deadline - Date.now())
    );
    return () => {
      window.clearInterval(interval);
      window.clearTimeout(timeout);
    };
  }, [draft?.deadline, isTyping, phase, save]);

  useEffect(() => () => {
    if (feedbackTimeoutRef.current !== null) window.clearTimeout(feedbackTimeoutRef.current);
    if (typingIdleTimeoutRef.current !== null) window.clearTimeout(typingIdleTimeoutRef.current);
  }, []);

  return { phase, draft, secondsRemaining, isTyping, begin, rename, save, showSaved };
};
