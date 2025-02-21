import {
  app,
  shell,
  BrowserWindow,
  ipcMain,
  globalShortcut,
  session,
  Menu // import Menu from electron
} from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'
import { ElectronBlocker } from '@ghostery/adblocker-electron'

// Create new windows on demand.
function createWindow(): void {
  const window = new BrowserWindow({
    width: 900,
    height: 670,
    show: false,
    autoHideMenuBar: true,
    titleBarStyle: 'hiddenInset',
    ...(process.platform === 'linux' ? { icon } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      webviewTag: true
    }
  })

  window.on('ready-to-show', () => {
    window.show()
  })

  // Open external links in the default browser.
  window.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  // Load the renderer URL or local file.
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    window.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    window.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

// When the app is ready, set everything up.
app.whenReady().then(() => {
  electronApp.setAppUserModelId('com.electron')

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  // Create the initial window.
  createWindow()

  // Set up Dock menu on macOS with a "New Window" option.
  if (process.platform === 'darwin' && app.dock) {
    const dockMenu = Menu.buildFromTemplate([
      {
        label: 'New Window',
        click: (): void => {
          createWindow()
        }
      },
      { role: 'quit' }
    ])
    app.dock.setMenu(dockMenu)
  }

  // Handle "activate" for macOS (reopen window when clicking dock icon).
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })

  // Handle renderer requests for a new window.
  ipcMain.on('new-window', () => {
    createWindow()
  })

  // Use the event sender's window for close, minimize, and maximize.
  ipcMain.on('close-window', (event) => {
    const window = BrowserWindow.fromWebContents(event.sender)
    if (window) window.close()
  })

  ipcMain.on('minimize-window', (event) => {
    const window = BrowserWindow.fromWebContents(event.sender)
    if (window) window.minimize()
  })

  ipcMain.on('maximize-window', (event) => {
    const window = BrowserWindow.fromWebContents(event.sender)
    if (window) window.isMaximized() ? window.unmaximize() : window.maximize()
  })

  // Global shortcuts now send messages to the focused window.
  globalShortcut.register('CommandOrControl+Shift+S', () => {
    const focusedWindow = BrowserWindow.getFocusedWindow()
    if (focusedWindow) focusedWindow.webContents.send('sidebar')
  })

  globalShortcut.register('CommandOrControl+Shift+T', () => {
    const focusedWindow = BrowserWindow.getFocusedWindow()
    if (focusedWindow) focusedWindow.webContents.send('ai-chat')
  })

  globalShortcut.register('CommandOrControl+Shift+C', () => {
    const focusedWindow = BrowserWindow.getFocusedWindow()
    if (focusedWindow) focusedWindow.webContents.send('copy-url')
  })

  // Enable ad blocking.
  ElectronBlocker.fromPrebuiltAdsAndTracking(fetch).then((blocker) => {
    blocker.enableBlockingInSession(session.defaultSession)
  })
})

// Unregister all shortcuts when quitting.
app.on('will-quit', () => {
  globalShortcut.unregisterAll()
})

// Quit the app when all windows are closed (except on macOS).
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
