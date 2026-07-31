import { Menu, MenuItemConstructorOptions } from "electron";

type OpenWindow = () => Promise<void>;

export const applicationMenuTemplate = (
  openWindow: OpenWindow,
  platform: NodeJS.Platform = process.platform
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

export const configureApplicationMenu = (openWindow: OpenWindow): void => {
  const menu = Menu.buildFromTemplate(applicationMenuTemplate(openWindow));
  Menu.setApplicationMenu(menu);
};
