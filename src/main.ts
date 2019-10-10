import { app, BrowserWindow, ipcMain } from "electron";
import startNotebookInternal from "./jupyer";
import refreshMenu from "./menu";
import preferences from "./preferences";
import { IWindowDict } from "./types";

let ready = false;
let openUrlFilePath = "";
let win: BrowserWindow | null = null;

const windows: IWindowDict = {};

const showPreference = () => {
  preferences.show();
};

const getPrefecenceValue = (key: string): any => {
  return preferences.value(key);
};

const startNotebook = (filePath: string) => {
  startNotebookInternal(windows, filePath, getPrefecenceValue, showPreference);
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
