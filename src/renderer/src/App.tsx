import { Plus, ShieldAlert, ShieldCheck, Sparkles, X } from 'lucide-react'
import React, { createRef, useEffect, useState } from 'react'

interface TabItem {
  id: number
  title: string
  url: string
  ref: React.RefObject<HTMLWebViewElement>
}

// A separate component for rendering a webview tab.
// It attaches an event listener to update the tab title when the page title changes.
interface TabWebviewProps {
  tab: TabItem
  isVisible: boolean
  updateTabTitle: (id: number, newTitle: string) => void
  updateTabUrl: (id: number, newUrl: string) => void
}

const TabWebview: React.FC<TabWebviewProps> = ({
  tab,
  isVisible,
  updateTabTitle,
  updateTabUrl
}) => {
  useEffect(() => {
    const webviewEl = tab.ref.current
    if (!webviewEl) return

    // Define the event handler for page-title-updated
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const handlePageTitleUpdated = (e: any): void => {
      // e.title contains the new title of the page
      updateTabTitle(tab.id, e.title)
    }

    // When navigation occurs, update the URL stored in the tab item.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const handleNavigation = (e: any): void => {
      updateTabUrl(tab.id, e.url)
    }

    webviewEl.addEventListener('page-title-updated', handlePageTitleUpdated)
    webviewEl.addEventListener('did-navigate', handleNavigation)
    webviewEl.addEventListener('did-navigate-in-page', handleNavigation)

    // Cleanup when the component is unmounted or tab changes.
    return (): void => {
      webviewEl.removeEventListener('page-title-updated', handlePageTitleUpdated)
      webviewEl.removeEventListener('did-navigate', handleNavigation)
      webviewEl.removeEventListener('did-navigate-in-page', handleNavigation)
    }
  }, [tab, updateTabTitle, updateTabUrl])

  return (
    <div className="flex-grow h-full" style={{ display: isVisible ? 'block' : 'none' }}>
      <webview src="https://google.com/" ref={tab.ref} className="w-full h-full"></webview>
    </div>
  )
}

function App(): JSX.Element {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [aiChatOpen, setAiChatOpen] = useState(false)
  const [localAiOpen, setLocalAiOpen] = useState(false)
  const [aiResponse, setAiResponse] = useState('')
  const [urlBar, setUrlBar] = useState<string>('')
  const [isUrlFocused, setIsUrlFocused] = useState(false)
  const [tabs, setTabs] = useState<TabItem[]>([
    {
      id: 0,
      title: 'New tab',
      url: 'https://google.com',
      ref: createRef<HTMLWebViewElement>()
    }
  ])
  const [activeTab, setActiveTab] = useState<number>(0)

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  window.electron.ipcRenderer.on('sidebar', (_, _args) => {
    setSidebarOpen((prev) => !prev)
  })

  window.electron.ipcRenderer.on('ai-response', (_, _args) => {
    setAiResponse(_args)
  })

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  window.electron.ipcRenderer.on('ai-chat', (_, _args) => {
    setAiChatOpen((prev) => !prev)
  })

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  window.electron.ipcRenderer.on('new-tab', (_, _args) => {
    newTab()
  })

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  window.electron.ipcRenderer.on('copy-url', (_, _args) => {
    navigator.clipboard.writeText(urlBar)
  })

  /**
   * Extracts the domain from a given URL.
   * @param {string} url - The full URL to be trimmed.
   * @returns {string} - The domain part of the URL.
   */
  function extractDomain(url: string): string {
    try {
      // Create a new URL object from the provided URL string.
      const parsedUrl = new URL(url)
      // The hostname property returns the domain, e.g., "www.google.com"
      return parsedUrl.hostname
    } catch (error) {
      // Handle invalid URLs gracefully.
      console.error('Invalid URL provided:', url)
      return ''
    }
  }

  /**
   * Ensures that the provided URL has a protocol.
   * If the URL doesn't start with "http://" or "https://", it prepends "https://".
   *
   * @param {string} url - The URL to check.
   * @returns {string} - The URL with a protocol.
   */
  const ensureProtocol = (url: string): string => {
    // Regex to test if URL starts with http:// or https:// (case-insensitive)
    if (/^(https?:\/\/)/i.test(url)) {
      return url
    }
    // Prepend the default protocol if missing.
    return `https://${url}`
  }

  const handleUrlChange = (event: React.ChangeEvent<HTMLInputElement>): void => {
    setUrlBar(event.target.value)
  }

  const closeTab = (id: number): void => {
    setTabs((prevTabs) => {
      // If there is only one tab, close the window.
      if (prevTabs.length === 1) {
        window.electron.ipcRenderer.send('close')
        return prevTabs
      }

      // Find the index of the tab to be closed.
      const closingIndex = prevTabs.findIndex((tab) => tab.id === id)
      if (closingIndex === -1) return prevTabs

      // Create a new array without the closed tab.
      const newTabs = [...prevTabs.slice(0, closingIndex), ...prevTabs.slice(closingIndex + 1)]

      // If the closed tab was active, update the activeTab.
      if (activeTab === id) {
        // If the first tab is closed, select the new first tab.
        // Otherwise, select the tab before the closed one.
        const newActiveTab = closingIndex === 0 ? newTabs[0].id : newTabs[closingIndex - 1].id
        setActiveTab(newActiveTab)
      }

      return newTabs
    })
  }

  const navigateTo = (newUrl: string): void => {
    // Ensure the URL has a protocol before using it.
    const finalUrl = ensureProtocol(newUrl)

    // Update the state for the active tab with the final URL.
    setTabs((prevTabs) =>
      prevTabs.map((tab) => (tab.id === activeTab ? { ...tab, url: finalUrl } : tab))
    )

    // Find the active tab item.
    const activeTabItem = tabs.find((tab) => tab.id === activeTab)
    if (activeTabItem && activeTabItem.ref.current) {
      // Instruct the active tab's webview to load the final URL.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ;(activeTabItem as any).ref.current.loadURL(finalUrl)
    }
  }

  const newTabHandler = (): void => {
    newTab()
  }

  // Add a new tab with a unique id.
  const newTab = (url: string = 'https://google.com'): void => {
    setUrlBar('')

    // Create a new id (for simplicity, using the current length)
    const newId = tabs.length > 0 ? Math.max(...tabs.map((t) => t.id)) + 1 : 0
    const tab: TabItem = {
      id: newId,
      title: 'New tab',
      url: url,
      ref: createRef<HTMLWebViewElement>()
    }

    // Use the spread operator to create a new array
    setTabs((prevTabs) => [...prevTabs, tab])
    setActiveTab(tab.id)
  }

  // Update the title of a tab given its id.
  const updateTabTitle = (id: number, newTitle: string): void => {
    setTabs((prevTabs) =>
      prevTabs.map((tab) => (tab.id === id ? { ...tab, title: newTitle } : tab))
    )
  }

  // Update the URL of a tab and update the URL bar if it is the active tab.
  const updateTabUrl = (id: number, newUrl: string): void => {
    setTabs((prevTabs) => prevTabs.map((tab) => (tab.id === id ? { ...tab, url: newUrl } : tab)))
    if (id === activeTab) {
      setUrlBar(newUrl)
    }
  }

  // Handle when the input gains focus.
  const handleFocus = (): void => {
    setIsUrlFocused(true)
  }

  // Handle when the input loses focus.
  const handleBlur = (): void => {
    setIsUrlFocused(false)
  }

  return (
    <>
      {/* Sidebar with tab list */}
      <div
        className={`nebula-sidebar ${sidebarOpen ? 'nebula-sidebar-open' : ''} flex items-center justify-center flex-col h-full absolute w-[250px] bg-gray-400`}
      >
        <div className="nebula-controls flex items-center pt-[10px] ml-[20px] h-[30px] text-xs w-full"></div>
        <button
          className="flex align-center content-center w-[calc(100%-20px)] h-[40px] m-[10px] rounded flex items-center justify-center bg-gray-500 hover:cursor-pointer hover:bg-gray-600"
          onClick={newTabHandler}
        >
          <Plus /> New Tab
        </button>
        <hr className="w-full" />
        {tabs.map((tab) => (
          <div
            key={tab.id}
            className="flex align-center content-center flex-row max-w-[100%] w-[100%] h-[40px] mt-[5px] rounded flex items-center justify-center"
          >
            <button
              className={`nebula-tab flex align-center content-center flex-row flex-grow max-w-[80%] w-[80%] h-[40px] m-[10px] p-[5px] rounded flex items-center justify-center bg-gray-500 text-xs hover:cursor-pointer hover:bg-gray-600 ${
                activeTab === tab.id ? 'active' : ''
              }`}
              onClick={() => setActiveTab(tab.id)}
            >
              <span>{tab.title}</span>
            </button>
            <button
              className="rounded border-1 border-gray-400 hover:cursor-pointer hover:bg-gray-600"
              onClick={() => {
                closeTab(tab.id)
              }}
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
          {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
          {(tabs[activeTab] as any).ref.current?.getURL().startsWith('https://') ? (
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
            if (e.key == 'Enter') {
              navigateTo(urlBar)
            }
          }}
        />
        <button
          className="nebula-newtab rounded bg-gray-500 ml-[5px] p-1 hover:cursor-pointer hover:bg-gray-600"
          onClick={newTabHandler}
        >
          <Plus />
        </button>
        <button
          className="nebula-aibutton rounded bg-gray-500 ml-[5px] p-1 hover:cursor-pointer hover:bg-gray-600 text-blue-400"
          onClick={() => {
            setLocalAiOpen((prev) => {
              return !prev
            })
          }}
        >
          <Sparkles />
        </button>
      </div>

      <div className="nebula-content flex align-center content-center flex-row w-full h-[calc(100vh-50px)]">
        {/* Render webviews for each tab */}
        {tabs.map((tab) => (
          <TabWebview
            key={tab.id}
            tab={tab}
            isVisible={activeTab === tab.id}
            updateTabTitle={updateTabTitle}
            updateTabUrl={updateTabUrl}
          />
        ))}
        <div className={`nebula-chat ${aiChatOpen ? 'active' : ''} w-[35%]`}>
          <webview src="https://t3.chat/" className="w-full h-full"></webview>
        </div>
        <div className={`nebula-chat ${localAiOpen ? 'active' : ''} w-[35%] mw-[35%] mh-full`}>
          {aiResponse}
          <button
            className="nebula-aibutton rounded bg-gray-500 ml-[5px] p-1 hover:cursor-pointer hover:bg-gray-600 text-blue-400"
            onClick={() => {
              window.electron.ipcRenderer.send('ai-request', [
                { role: 'user', content: 'Solve the equation: x^2 - 3x + 2 = 0' }
              ])
            }}
          >
            <Sparkles />
          </button>
        </div>
      </div>
    </>
  )
}

export default App
