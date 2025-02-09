import { app, shell, BrowserWindow, ipcMain, globalShortcut } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'
import { pipeline, TextStreamer } from '@huggingface/transformers'

async function createWindow(): Promise<void> {
  // Create the browser window.
  const mainWindow = new BrowserWindow({
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

  mainWindow.on('ready-to-show', () => {
    mainWindow.show()
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  ipcMain.on('close', () => {
    mainWindow.close()
  })

  ipcMain.on('minimize', () => {
    mainWindow.minimize()
  })

  ipcMain.on('maximize', () => {
    mainWindow.maximize()
  })

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ipcMain.on('ai-request', async (_e, prompt) => {
    console.log('Executing AI request...')
    console.log(prompt)
    // Create a text generation pipeline
    const generator = await pipeline(
      'text-generation',
      'onnx-community/DeepSeek-R1-Distill-Qwen-1.5B-ONNX',
      { dtype: 'uint8' }
    )

    // Create text streamer
    const streamer = new TextStreamer(generator.tokenizer, {
      skip_prompt: true
    })

    // Generate a response
    const output = await generator(prompt, { max_new_tokens: 512, do_sample: false, streamer })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mainWindow.webContents.send('ai-response', (output[0] as any).generated_text.at(-1).content)
  })

  globalShortcut.register('CommandOrControl+Shift+S', () => {
    mainWindow.webContents.send('sidebar')
  })

  globalShortcut.register('CommandOrControl+Shift+T', () => {
    mainWindow.webContents.send('ai-chat')
  })

  globalShortcut.register('CommandOrControl+Shift+C', () => {
    mainWindow.webContents.send('copy-url')
  })

  // HMR for renderer base on electron-vite cli.
  // Load the remote URL for development or the local html file for production.
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.whenReady().then(() => {
  // Set app user model id for windows
  electronApp.setAppUserModelId('com.electron')

  // Default open or close DevTools by F12 in development
  // and ignore CommandOrControl + R in production.
  // see https://github.com/alex8088/electron-toolkit/tree/master/packages/utils
  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  createWindow()

  app.on('activate', function () {
    // On macOS it's common to re-create a window in the app when the
    // dock icon is clicked and there are no other windows open.
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('will-quit', () => {
  // Unregister all shortcuts.
  globalShortcut.unregisterAll()
})

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

// In this file you can include the rest of your app"s specific main process
// code. You can also put them in separate files and require them here.
