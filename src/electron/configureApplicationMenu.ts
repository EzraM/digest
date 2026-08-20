import { Menu, MenuItemConstructorOptions } from "electron";

type OpenWindow = () => Promise<void>;
type OpenNotebook = () => void;
type RequestBookmark = () => void;

export const applicationMenuTemplate = (
  openWindow: OpenWindow,
  platform: NodeJS.Platform = process.platform,
  openNotebook: OpenNotebook = () => undefined,
  requestBookmark: RequestBookmark = () => undefined
): MenuItemConstructorOptions[] => [
  ...(platform === "darwin"
    ? [
        {
          role: "appMenu" as const,
        },
      ]
    : []),
  {
    label: "File",
    submenu: [
      {
        label: "New Window",
        accelerator: "CmdOrCtrl+N",
        click: () => void openWindow(),
      },
      {
        label: "Open Notebook",
        accelerator: "CmdOrCtrl+L",
        click: openNotebook,
      },
      {
        label: "Bookmark Page",
        accelerator: "CmdOrCtrl+D",
        click: requestBookmark,
      },
      { type: "separator" },
      platform === "darwin"
        ? { role: "close" as const }
        : { role: "quit" as const },
    ],
  },
  { role: "editMenu" },
  { role: "viewMenu" },
  { role: "windowMenu" },
];

export const configureApplicationMenu = (
  openWindow: OpenWindow,
  openNotebook: OpenNotebook,
  requestBookmark: RequestBookmark
): void => {
  const menu = Menu.buildFromTemplate(
    applicationMenuTemplate(
      openWindow,
      process.platform,
      openNotebook,
      requestBookmark
    )
  );
  Menu.setApplicationMenu(menu);
};
