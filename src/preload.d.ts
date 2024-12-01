export interface IElectronAPI {
  addBlockEvent: (event: { type: string }) => void;
}

declare global {
  interface Window {
    electronAPI: IElectronAPI;
  }
}
