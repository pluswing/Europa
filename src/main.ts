import * as childProcess from "child_process";
import { app, BrowserWindow, dialog, ipcMain, Menu, MenuItemConstructorOptions } from "electron";
import Store from "electron-store";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";

// TODO: 型定義作る
// tslint:disable-next-line: no-var-requires
const ElectronPreferences = require("electron-preferences");

const preferences = new ElectronPreferences({
  dataStore: path.resolve(app.getPath("userData"), "preferences.json"),
  defaults: {
    setting: {
      command_path: "",
      use_lab: false,
    },
  },
  onLoad: (aPreferences: any) => {
    return aPreferences;
  },
  sections: [
    {
      id: "setting",
      label: "Setting",
      icon: "settings-gear-63",
      form: {
        groups: [
          {
            label: "jupyter setting",
            fields: [
              {
                label: "command path",
                key: "command_path",
                type: "text",
                help: "",
              },
              {
                label: "use lab",
                key: "use_lab",
                type: "radio",
                options: [
                  { label: "notebook", value: false },
                  { label: "lab", value: true },
                ],
                help: "",
              },
            ],
          },
        ],
      },
    },
  ],
});

let ready = false;
let openUrlFilePath = "";
let win: BrowserWindow | null = null;
const store = new Store();

interface IWindow {
  root: string;
  window: BrowserWindow;
  process: childProcess.ChildProcess;
  url: string;
  filePath: string;
}

const windows: { [key: string]: IWindow } = {};

const refreshMenu = () => {
  const isMac = process.platform === "darwin";
  const submenu: MenuItemConstructorOptions[] = [
    { role: "about" },
    { type: "separator" },
    { // TODO: macのmenu onlyなので、他のプラットフォームに対応するときに注意！
      label: "Setting",
      click: () => {
        preferences.show();
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

const findWindow = (filePath: string): IWindow | null => {
  const rootLocation = findRootLocation(filePath);
  return windows[rootLocation];
};

const findRootLocation = (filePath: string): string => {
  // フォルダなら、そのままのパスを返す
  if (fs.statSync(filePath).isDirectory()) {
    return filePath;
  }
  return findRootLocationInternal(filePath) || path.dirname(filePath);
};

const findRootLocationInternal = (filePath: string): string | null => {
  if (filePath === "/") {
    return null;
  }
  const dir = path.dirname(filePath);
  const files = fs.readdirSync(dir);
  const matches = files.filter((f) => {
    return [
      ".git",
      "requirements.txt",
      ".ipynbroot",
    ].includes(f);
  });
  if (matches.length) {
    return dir;
  }
  return findRootLocationInternal(dir);
};

const startNotebook = (filePath: string) => {

  const w = findWindow(filePath);
  if (w) {
    openFile(w, filePath);
    return;
  }

  const rootLocation = findRootLocation(filePath);

  const widthKey = `window-size-width:${rootLocation}`;
  const heightKey = `window-size-height:${rootLocation}`;
  const width = store.get(widthKey) || 800;
  const height = store.get(heightKey) || 600;

  const window = new BrowserWindow({
    height,
    width,
  });
  window.on("resize", () => {
    store.set(widthKey, window.getSize()[0]);
    store.set(heightKey, window.getSize()[1]);
  });

  const home = process.env.HOME || "";
  const pyenv = fs.existsSync(path.join(home, ".pyenv"));
  const command = pyenv ? path.join(home, ".pyenv", "shims", "jupyter") : "jupyter";
  const cp = childProcess.spawn(command, ["notebook", "--no-browser"], {
    cwd: rootLocation,
  });

  const newWindow: IWindow = {
    filePath,
    process: cp,
    root: rootLocation,
    url: "",
    window,
  };

  windows[rootLocation] = newWindow;

  let userClosed = false;
  window.on("closed", () => {
    userClosed = true;
    cp.kill();
    delete (windows[rootLocation]);
    refreshMenu();
  });

  let out = "";
  const dataListener = (data: Buffer) => {
    out += data.toString();
    const match = out.match(/http:\/\/.*/);
    if (match) {

      window.loadURL(match[0]);
      const url = match[0].split("?")[0];
      newWindow.url = url;

      refreshMenu();

      // "data"のlistenを中止。
      cp.stderr.off("data", dataListener);

      // フォルダを開く場合は、ファイルじゃないので開かない。
      if (fs.statSync(filePath).isDirectory()) {
        return;
      }

      setTimeout(() => {
        window.loadURL(createUrl(url, rootLocation, filePath));
      }, 1000);
    }
  };
  cp.stderr.on("data", dataListener);

  const closeDataListener = (data: Buffer) => {
    cp.stderr.off("close", closeDataListener);
    if (userClosed) { return; }

    // 意図せぬcloseなので、エラーを表示する。
    // TODO メッセージを良い感じにする
    dialog.showErrorBox("jupyter boot error.", command);
  };
  cp.stderr.on("close", closeDataListener);
};

const createUrl = (url: string, root: string, filePath: string): string => {
  const p = filePath.endsWith(".ipynb") ? "notebooks" : "edit";
  return `${url}${p}${filePath.substring(root.length)}`;
};

const openFile = (window: IWindow, filePath: string): void => {
  const url = createUrl(window.url, window.root, filePath);
  window.window.loadURL(url);
  window.window.focus();
};

function createWindow() {
  win = new BrowserWindow({
    height: 600,
    webPreferences: {
      nodeIntegration: true,
    },
    width: 800,
  });

  win.loadFile("index.html");
  // win.webContents.openDevTools();

  win.on("closed", () => {
    win = null;
  });
}

app.on("ready", () => {
  ready = true;
  refreshMenu();
  if (openUrlFilePath) {
    startNotebook(openUrlFilePath);
    openUrlFilePath = "";
  } else {
    createWindow();
  }
});

app.on("open-file", (_, filePath) => {
  if (!ready) {
    openUrlFilePath = filePath;
  } else {
    startNotebook(filePath);
  }
});

ipcMain.on("drop", (_, filePath) => {
  startNotebook(filePath);
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("activate", () => {
  if (win === null && Object.keys(windows).length === 0) {
    createWindow();
  }
});
