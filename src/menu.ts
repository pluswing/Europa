import * as childProcess from "child_process";
import { app, Menu, MenuItemConstructorOptions } from "electron";
import { IWindowDict } from "./types";

const refreshMenu = (windows: IWindowDict, showPreferece: () => void, startNotebook: (path: string) => void) => {
  const isMac = process.platform === "darwin";
  const submenu: MenuItemConstructorOptions[] = [
    { role: "about" },
    { type: "separator" },
    { // TODO: macのmenu onlyなので、他のプラットフォームに対応するときに注意！
      label: "Setting",
      click: () => {
        showPreferece();
      },
    },
    { type: "separator" },
    { role: "services" },
    { type: "separator" },
    { role: "hide" },
    { role: "unhide" },
    { type: "separator" },
    { role: "quit" },
  ];
  const serverSubmenu: MenuItemConstructorOptions[] = Object.keys(windows).map((root) => {
    return {
      label: root,
      submenu: [
        {
          click: async () => {
            // open browser
            // TODO macに依存。他のプラットフォームの実装もする必要あり。
            childProcess.execSync(`open ${windows[root].url}`);
          },
          label: windows[root].url,
        },
        {
          click: async () => {
            windows[root].window.focus();
          },
          label: "Activate",
        },
        {
          click: async () => {
            // TODO macに依存。他のプラットフォームの実装もする必要あり。
            childProcess.execSync(`open ${root}`);
          },
          label: "Open Finder",
        },
        {
          click: async () => {
            const filePath = windows[root].filePath;
            windows[root].window.close();
            // setTimeoutしないと、新しいウインドウが開かない。。
            setTimeout(() => {
              startNotebook(filePath);
            }, 100);
          },
          label: "Reboot",
        },
      ],
    };
  });
  const editMenu: MenuItemConstructorOptions = {
    label: "Edit",
    submenu: [
      { role: "undo" },
      { role: "redo" },
      { type: "separator" },
      { role: "cut" },
      { role: "copy" },
      { role: "paste" },
      { role: "delete" },
      { role: "selectAll" },
    ],
  };
  const template: MenuItemConstructorOptions[] = [
    ...(isMac ? [{
      label: app.getName(),
      submenu,
    }] : []),
    editMenu,
    {
      label: "Servers",
      submenu: serverSubmenu,
    },
  ];

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
};

export default refreshMenu;
