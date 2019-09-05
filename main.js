const { app, BrowserWindow } = require('electron')
const fs = require('fs')
const path = require('path')
const childProcess = require('child_process')

let win
let processes = []

const findRootLocation = (filePath) => {
    if (filePath == '/') {
        return null
    }
    const dir = path.dirname(filePath)
    const files = fs.readdirSync(dir)
    // 1. .git, requirements.txt, .ipynb_checkpoints
    const matches = files.filter((f) => f in [".git", "requirements.txt", ".ipynb_checkpoints"])
    if (matches) {
        return dir
    }
    return findRootLocation(dir)
}

const startNotebook = (filePath) => {

    const rootLocation = findRootLocation(filePath) || path.dirname(filePath)

    const cp = childProcess.spawn("jupyter", ["notebook"], {
        cwd: rootLocation
    })
    processes.push(cp)
    let out = ""
    let loaded = false
    cp.stderr.on("data", (data) => {
        if (loaded) {
            return
        }
        out += data.toString()
        const match = out.match(/http:\/\/.*/)
        if (match) {
            loaded = true
            win.loadURL(match[0])
            // "data"のlistenを中止。
            // cp.stderr.on("data", null)
            const fp = filePath.substring(rootLocation.length)
            const url = `${match[0].split("?")[0]}notebooks${fp}`
            setTimeout(() => {
                win.loadURL(url)
            }, 1000)
        }
    })
}

function createWindow() {
    win = new BrowserWindow({
        width: 800,
        height: 600,
        webPreferences: {
        }
    })

    win.loadFile("index.html")
    //win.webContents.openDevTools()

    // const filePath = "/Users/pluswing/develop/electron/Untitled.ipynb"
    // startNotebook(filePath)

    win.on('closed', () => {
        win = null
        console.log("*** KILL PROCESSES")
        processes.map((p) => p.kill())
        processes = []
    })
}

app.on('ready', createWindow)
app.on('open-file', (event, filePath) => {
    // console.log(filePath);
    startNotebook(filePath)
    // ファイルが渡ってきたときの処理
})

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit()
    }
})

app.on('activate', () => {
    if (win === null) {
        createWindow()
    }
})
