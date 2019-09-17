import * as childProcess from "child_process";
import { app, BrowserWindow, ipcMain, Menu, MenuItemConstructorOptions } from "electron";
import * as fs from "fs";
import * as path from "path";

let ready = false;
let openUrlFilePath = "";
let win: BrowserWindow | null = null;

interface IWindow {
  root: string;
  window: BrowserWindow;
  process: childProcess.ChildProcess;
  url: string;
}

const windows: { [key: string]: IWindow } = {};

const refreshMenu = () => {
  const isMac = process.platform === "darwin";
  const submenu: MenuItemConstructorOptions[] = [
    { role: "about" },
    { type: "separator" },
    { role: "services" },
    { type: "separator" },
    { role: "hide" },
    { role: "unhide" },
    { type: "separator" },
    { role: "quit" },
  ];
  const serverSubmenu: MenuItemConstructorOptions[] = Object.keys(windows).map((k) => {
    return {
      click: async () => {
        windows[k].window.focus();
      },
      label: k,
      submenu: [
        {
          click: async () => {
            windows[k].window.focus();
          },
          label: windows[k].url,
        },
      ],
    };
  });
  const template: MenuItemConstructorOptions[] = [
    ...(isMac ? [{
      label: app.getName(),
      submenu,
    }] : []),
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

  const window = new BrowserWindow({
    height: 600,
    width: 800,
  });

  const home = process.env.HOME || "";
  const pyenv = fs.existsSync(path.join(home, ".pyenv"));
  const command = pyenv ? path.join(home, ".pyenv", "shims", "jupyter") : "jupyter";
  const cp = childProcess.spawn(command, ["notebook", "--no-browser"], {
    cwd: rootLocation,
  });

  const newWindow: IWindow = {
    process: cp,
    root: rootLocation,
    url: "",
    window,
  };

  windows[rootLocation] = newWindow;

  window.on("closed", () => {
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
