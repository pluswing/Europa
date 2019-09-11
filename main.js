const { app, BrowserWindow } = require('electron')
const fs = require('fs')
const path = require('path')
const childProcess = require('child_process')

let ready = false
let openUrlFilePath = ""
let win = null; // mainWindow

// key: rootPath, value: {
//    root: string,
//    window: BrowserWindow,
//    process: ChildProcess
//    url: string,
// }
let windows = {}

const findWindow = (filePath) => {
    const rootLocation = findRootLocation(filePath)
    return windows[rootLocation]
}

const findRootLocation = (filePath) => {
    return _findRootLocation(filePath) || path.dirname(filePath)
}

const _findRootLocation = (filePath) => {
    if (filePath == '/') {
        return null
    }
    const dir = path.dirname(filePath)
    const files = fs.readdirSync(dir)
    const matches = files.filter((f) => {
        return [
            ".git",
            "requirements.txt"
        ].includes(f)
    })
    if (matches.length) {
        return dir
    }
    return _findRootLocation(dir)
}

const startNotebook = (filePath) => {

    const w = findWindow(filePath)
    if (w) {
        openFile(w, filePath)
        return
    }

    const rootLocation = findRootLocation(filePath)

    const window = new BrowserWindow({
        width: 800,
        height: 600,
        webPreferences: {
        }
    })

    const pyenv = fs.existsSync(path.join(process.env.HOME, ".pyenv"))
    const command = pyenv ? path.join(process.env.HOME, ".pyenv", "shims", "jupyter") : "jupyter"
    const cp = childProcess.spawn(command, ["notebook", "--no-browser"], {
        cwd: rootLocation,
    })

    const newWindow = {
        root: rootLocation,
        window,
        process: cp
    }

    windows[rootLocation] = newWindow

    window.on('closed', () => {
        cp.kill()
        delete(windows[rootLocation])
    })

    let out = ""
    const dataListener = (data) => {
        out += data.toString()
        const match = out.match(/http:\/\/.*/)
        if (match) {

            window.loadURL(match[0])
            const url = match[0].split("?")[0]
            newWindow.url = url

            // "data"のlistenを中止。
            cp.stderr.off("data", dataListener)

            setTimeout(() => {
                window.loadURL(createUrl(url, rootLocation, filePath))
            }, 1000)
        }
    }
    cp.stderr.on("data", dataListener)
}

const createUrl = (url, root, filePath) => {
    return `${url}notebooks${filePath.substring(root.length)}`
}

const openFile = (window, filePath) => {
    const url = createUrl(window.url, window.root, filePath)
    window.window.loadURL(url)
    window.window.focus()
}

function createWindow() {
    win = new BrowserWindow({
        width: 800,
        height: 600,
        webPreferences: {
        }
    })

    win.loadFile("index.html")

    win.on('closed', () => {
        win = null
    })
}

app.on('ready', () => {
    ready = true
    if (openUrlFilePath) {
        startNotebook(openUrlFilePath)
        openUrlFilePath = ""
    } else {
        createWindow()
    }
})

app.on('open-file', (_, filePath) => {
    if (!ready) {
        openUrlFilePath = filePath
    } else {
        startNotebook(filePath)
    }
})

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit()
    }
})

app.on('activate', () => {
    if (win === null && Object.keys(windows).length == 0) {
        createWindow()
    }
})
