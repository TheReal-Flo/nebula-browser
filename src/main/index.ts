import {
  app,
  shell,
  BrowserWindow,
  ipcMain,
  globalShortcut,
  session,
  Menu, // import Menu from electron
  BrowserView
} from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'
import { ElectronBlocker } from '@ghostery/adblocker-electron'

interface Windows {
  [key: string]: BrowserWindow
}

interface Tabs {
  [key: string]: BrowserView
}

// New interface for tracking which tab belongs to which window.
interface TabToWindowMapping {
  [key: string]: number
}

const sidebarState = {}

const windows: Windows = {}
const tabs: Tabs = {}
// This mapping tracks each BrowserView by its tab id to the BrowserWindow id it
// is associated with.
const tabToWindow: TabToWindowMapping = {}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function broadcast(channel: string, ...args: any[]): void {
  BrowserWindow.getAllWindows().forEach((win) => {
    win.webContents.send(channel, ...args)
  })
}

// Create new windows on demand.
function createWindow(): void {
  // Generate a unique key for our windows dictionary.
  const windowKey = Math.random().toString(36).substr(2, 9)

  const window = new BrowserWindow({
    width: 900,
    height: 670,
    show: false,
    autoHideMenuBar: true,
    titleBarStyle: 'hiddenInset',
    ...(process.platform === 'linux' ? { icon } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false
    }
  })

  // We are using the Electron-generated window.id for our mapping.
  sidebarState[window.id] = false

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

  windows[windowKey] = window

  // Always clean up the window entry and also remove any tab associations
  // that pertain to this window when it is closed.
  window.on('closed', () => {
    // Clean tab mappings that reference this window.
    for (const tab in tabToWindow) {
      if (tabToWindow[tab] === window.id) {
        delete tabToWindow[tab]
        // Optionally, you might also want to remove the BrowserView itself:
        delete tabs[tab]
      }
    }
    delete windows[windowKey]
  })
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

  ipcMain.on('sidebar-off', () => {
    const focusedWindow = BrowserWindow.getFocusedWindow()
    sidebarState[focusedWindow?.id || 0] = false

    focusedWindow?.getBrowserView()?.setBounds({
      x: 0,
      y: 50,
      width: focusedWindow?.getBounds().width || 0,
      height: (focusedWindow?.getBounds().height || 0) - 50
    })
  })

  ipcMain.on('sidebar-on', () => {
    const focusedWindow = BrowserWindow.getFocusedWindow()
    sidebarState[focusedWindow?.id || 0] = true

    focusedWindow?.getBrowserView()?.setBounds({
      x: 250,
      y: 50,
      width: (focusedWindow?.getBounds().width || 0) - 250,
      height: (focusedWindow?.getBounds().height || 0) - 50
    })
  })

  ipcMain.on('request-tab', (_e, data) => {
    const focusedWindow = BrowserWindow.getFocusedWindow()
    if (focusedWindow) {
      // Assign the BrowserView to the focused window.
      focusedWindow.setBrowserView(tabs[data])
      // Update the association mapping.
      tabToWindow[data] = focusedWindow.id

      tabs[data].setAutoResize({
        width: true,
        height: true
      })
      tabs[data].setBounds({
        x: sidebarState[focusedWindow.id] ? 250 : 0,
        y: 50,
        width: (focusedWindow.getBounds().width || 0) - (sidebarState[focusedWindow.id] ? 250 : 0),
        height: (focusedWindow.getBounds().height || 0) - 50
      })

      focusedWindow.webContents.send(
        'tab-data',
        JSON.stringify({
          id: data,
          url: tabs[data].webContents.getURL(),
          title: tabs[data].webContents.getTitle()
        })
      )
    }
  })

  ipcMain.on('navigate-to', (_e, _data) => {
    const data = JSON.parse(_data)

    tabs[data.tabId].webContents.loadURL(data.url)
  })

  ipcMain.on('close-tab', (_e, _data) => {
    delete tabs[_data]
    // Remove the mapping for the closed tab.
    delete tabToWindow[_data]
  })

  ipcMain.on('new-tab', (_e, _data) => {
    const tabId = Math.random().toString(36).substr(2, 9)

    console.log(`New Tab with id ${tabId} has been created.`)

    const focusedWindow = BrowserWindow.getFocusedWindow()

    // When a tab is created, optionally track its initial window.
    if (focusedWindow) {
      tabToWindow[tabId] = focusedWindow.id
    }

    const view = new BrowserView()
    view.webContents.loadURL(_data)

    view.webContents.on('page-title-updated', (_e, title) => {
      broadcast(
        'tab-data',
        JSON.stringify({
          id: tabId,
          url: view.webContents.getURL(),
          title
        })
      )
    })

    tabs[tabId] = view
    focusedWindow?.webContents.send(
      'tab-ready',
      JSON.stringify({
        id: tabId,
        url: view.webContents.getURL() || '',
        title: view.webContents.getTitle() || ''
      })
    )
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
