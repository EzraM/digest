import { Rect } from './types';

export type Command =
  | { type: 'create'; id: string; url: string; bounds: Rect; profile: string }
  | { type: 'updateBounds'; id: string; bounds: Rect }
  | { type: 'updateUrl'; id: string; url: string }
  | { type: 'remove'; id: string }
  | { type: 'markLoading'; id: string }
  | { type: 'markReady'; id: string; canGoBack: boolean }
  | { type: 'markError'; id: string; code: number; message: string }
  | { type: 'retry'; id: string };
