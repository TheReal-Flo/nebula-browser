/* eslint-disable @typescript-eslint/no-unused-vars */
import { Plus, ShieldAlert, ShieldCheck, X } from 'lucide-react'
import React, { useEffect, useState } from 'react'

interface TabItems {
  [key: string]: {
    title: string
    url: string
  }
}

function App(): JSX.Element {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [urlBar, setUrlBar] = useState('')
  const [isUrlFocused, setIsUrlFocused] = useState(false)
  const [tabs, setTabs] = useState<TabItems>({})
  const [activeTab, setActiveTab] = useState<string>('')
  const [tabKeys, setTabKeys] = useState<string[]>([])

  useEffect(() => {
    newTab()
  }, [])

  useEffect(() => {
    if (activeTab !== '') window.electron.ipcRenderer.send('request-tab', activeTab)
  }, [activeTab])

  useEffect(() => {
    setUrlBar(tabs[activeTab]?.url || '')
  }, [activeTab, tabs])

  useEffect(() => {
    const keys = Object.keys(tabs)
    setTabKeys(keys)
    if (keys.length === 1) setActiveTab(keys[0])
  }, [tabs])

  // Electron ipcRenderer event listeners.
  window.electron.ipcRenderer.on('sidebar', (_, _args) => {
    setSidebarOpen((prev) => {
      window.electron.ipcRenderer.send(`sidebar-${!prev ? 'on' : 'off'}`)
      return !prev
    })
  })

  window.electron.ipcRenderer.on('new-tab', (_, _args) => {
    newTab()
  })

  window.electron.ipcRenderer.on('tab-data', (_, _data) => {
    const data = JSON.parse(_data)

    setTabs((prevTabs) => {
      // Check if the tab exists; if not, return the previous state unchanged.
      if (!prevTabs[data.id]) return prevTabs

      return {
        ...prevTabs,
        [data.id]: {
          ...prevTabs[data.id],
          title: data.title,
          url: data.url
        }
      }
    })
  })

  window.electron.ipcRenderer.on('tab-ready', (_, _data) => {
    const data = JSON.parse(_data)

    setTabs((prevTabs) => {
      return {
        ...prevTabs,
        [data.id]: {
          ...prevTabs[data.id],
          title: data.title,
          url: data.url
        }
      }
    })
  })

  window.electron.ipcRenderer.on('copy-url', (_, _args) => {
    navigator.clipboard.writeText(urlBar)
  })

  // Extract the domain from a URL.
  function extractDomain(url: string): string {
    try {
      const parsedUrl = new URL(url)
      return parsedUrl.hostname
    } catch (error) {
      console.error('Invalid URL provided:', url)
      return url
    }
  }

  // Ensure a URL has http:// or https://.
  const ensureProtocol = (url: string): string => {
    return /^(https?:\/\/)/i.test(url) ? url : `https://${url}`
  }

  // Check if the input looks like a URL or a search query.
  // If it contains spaces or doesn't look like a URL, treat it as a search query.
  const processInput = (input: string): string => {
    if (!input.includes(' ')) {
      // Check if input looks like a valid URL.
      try {
        // Throws if not a valid URL.
        new URL(ensureProtocol(input))
        return ensureProtocol(input)
      } catch {
        // Not a valid URL using URL. Continue to search query.
      }
    }
    // If it includes spaces or isn't a URL, perform a search with Google.
    return `https://www.google.com/search?q=${encodeURIComponent(input)}`
  }

  const handleUrlChange = (event: React.ChangeEvent<HTMLInputElement>): void => {
    setUrlBar(event.target.value)
  }

  // Update the URL of the active tab.
  const navigateTo = (id: string, input: string): void => {
    const targetUrl = processInput(input)
    window.electron.ipcRenderer.send(
      'navigate-to',
      JSON.stringify({
        tabId: id,
        url: targetUrl
      })
    )
  }

  const newTabHandler = (): void => {
    newTab()
  }

  // Create a new tab.
  const newTab = (url: string = 'https://google.com'): void => {
    window.electron.ipcRenderer.send('new-tab', ensureProtocol(url))
  }

  const closeTab = (tabId: string): void => {
    window.electron.ipcRenderer.send('close-tab', tabId)
  }

  const handleFocus = (): void => setIsUrlFocused(true)
  const handleBlur = (): void => setIsUrlFocused(false)

  return (
    <>
      {/* Sidebar */}
      <div
        className={`nebula-sidebar ${
          sidebarOpen ? 'nebula-sidebar-open' : ''
        } flex items-center justify-center flex-col h-full absolute w-[250px] bg-gray-400`}
      >
        <div className="nebula-controls flex items-center pt-[10px] ml-[20px] h-[30px] text-xs w-full"></div>
        <button
          className="flex align-center content-center w-[calc(100%-20px)] h-[40px] m-[10px] rounded flex items-center justify-center bg-gray-500 hover:cursor-pointer hover:bg-gray-600"
          onClick={newTabHandler}
        >
          <Plus /> New Tab
        </button>
        <hr className="w-full" />
        {tabs &&
          tabKeys.map((tabId) => (
            <div
              key={tabId}
              className="flex align-center content-center flex-row max-w-[100%] w-[100%] h-[40px] mt-[5px] rounded flex items-center justify-center"
            >
              <button
                className={`nebula-tab flex align-center content-center flex-row flex-grow max-w-[80%] w-[80%] h-[40px] m-[10px] p-[5px] rounded flex items-center justify-center bg-gray-500 text-xs hover:cursor-pointer hover:bg-gray-600 ${
                  activeTab === tabId ? 'active' : ''
                }`}
                onClick={() => setActiveTab(tabId)}
              >
                <span>{tabs[tabId].title}</span>
              </button>
              <button
                className="rounded border-1 border-gray-400 hover:cursor-pointer hover:bg-gray-600"
                onClick={() => closeTab(tabId)}
              >
                <X />
              </button>
            </div>
          ))}
        <span className="flex-grow"></span>
      </div>

      {/* URL Bar */}
      <div className="nebula-urlbar w-full h-[50px] bg-gray-400 flex items-center justify-center outline-none">
        <button className="mr-[5px] p-1">
          {activeTab && tabs[activeTab].url.startsWith('https://') ? (
            <ShieldCheck className="text-green-600" />
          ) : (
            <ShieldAlert className="text-red-500" />
          )}
        </button>
        <input
          className="bg-gray-500 w-[60%] rounded p-1 text-gray-200"
          type="text"
          value={isUrlFocused ? urlBar : extractDomain(urlBar)}
          onFocus={handleFocus}
          onBlur={handleBlur}
          onChange={handleUrlChange}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              navigateTo(activeTab, urlBar)
            }
          }}
        />
        <button
          className="nebula-newtab rounded bg-gray-500 ml-[5px] p-1 hover:cursor-pointer hover:bg-gray-600"
          onClick={newTabHandler}
        >
          <Plus />
        </button>
      </div>

      {/* Content Area */}
      <div className="nebula-content flex flex-row w-full h-[calc(100vh-50px)]" />
    </>
  )
}

export default App
