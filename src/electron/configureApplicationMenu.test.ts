import { applicationMenuTemplate } from "./configureApplicationMenu";

describe("applicationMenuTemplate", () => {
  it("opens a new window from Cmd+N", async () => {
    let calls = 0;
    const template = applicationMenuTemplate(async () => {
      calls += 1;
    }, "darwin");
    const fileMenu = template.find((item) => item.label === "File");
    const submenu = fileMenu?.submenu as Electron.MenuItemConstructorOptions[];
    const newWindow = submenu.find((item) => item.label === "New Window");

    expect(newWindow?.accelerator).toBe("CmdOrCtrl+N");
    newWindow?.click?.(undefined as never, undefined as never, undefined as never);
    await Promise.resolve();
    expect(calls).toBe(1);
  });

  it("includes the native macOS application menu", () => {
    const template = applicationMenuTemplate(async () => undefined, "darwin");

    expect(template[0].role).toBe("appMenu");
  });
});
