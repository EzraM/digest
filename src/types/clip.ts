// Re-export from new location for backwards compatibility
// TODO: Update imports to use '@/domains/clip/types' directly
export type {
  ClipDraft,
  ClipBlockProps,
  ConversionStatus,
  ConversionStrategy,
  ConversionState,
  SelectionContext,
  ClipCapturePayload,
  ClipCommitResult,
} from '../domains/clip/core/types';
