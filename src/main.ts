import * as childProcess from "child_process";
import { app, BrowserWindow, dialog, ipcMain } from "electron";
import Store from "electron-store";
import * as fs from "fs";
import * as path from "path";
import refreshMenu from "./menu";
import preferences from "./preferences";
import { IWindow, IWindowDict } from "./types";

let ready = false;
let openUrlFilePath = "";
let win: BrowserWindow | null = null;
const store = new Store();

const windows: IWindowDict = {};

const showPreference = () => {
  preferences.show();
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

  const commandPath = preferences.value("setting.command_path");
  const arg1 = preferences.value("setting.use_lab") ? "lab" : "notebook";

  const home = process.env.HOME || "";
  const pyenv = fs.existsSync(path.join(home, ".pyenv"));
  const command = commandPath ? commandPath : pyenv ? path.join(home, ".pyenv", "shims", "jupyter") : "jupyter";

  const cp = childProcess.spawn(command, [arg1, "--no-browser"], {
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
    refreshMenu(windows, showPreference, startNotebook);
  });

  let out = "";
  const dataListener = (data: Buffer) => {
    out += data.toString();
    const match = out.match(/http:\/\/.*/);
    if (match) {

      window.loadURL(match[0]);
      const url = match[0].split("?")[0];
      newWindow.url = url;

      refreshMenu(windows, showPreference, startNotebook);

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

  // command_pathはあるが、実行に失敗した場合。
  cp.on("close", (data: Buffer) => {
    if (userClosed) { return; }

    // 意図せぬcloseなので、エラーを表示する。
    // TODO メッセージを良い感じにする
    window.close();
    dialog.showErrorBox("failed run jupyter", `you shoud install jupyter notebook or jupyter lab\n\n${out}`);
  });

  // command_pathが間違えている場合。
  cp.on("error", (err) => {
    window.close();
    dialog.showErrorBox("failed run jupyter", `incorrect command path\n\n${err.message}`);
  });
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
  refreshMenu(windows, showPreference, startNotebook);
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
