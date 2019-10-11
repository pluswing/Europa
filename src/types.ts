import * as childProcess from "child_process";
import { BrowserWindow } from "electron";

export interface IWindow {
  root: string;
  window: BrowserWindow;
  process: childProcess.ChildProcess;
  url: string;
  filePath: string;
}

export interface IWindowDict { [key: string]: IWindow; }
