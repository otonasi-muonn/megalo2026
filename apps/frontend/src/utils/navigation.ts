const NAVIGATE_EVENT_NAME = 'app:navigate'

export interface AppLocation {
  pathname: string
  search: string
}

export const getCurrentLocation = (): AppLocation => ({
  pathname: window.location.pathname,
  search: window.location.search,
})

export const navigate = (to: string, options?: { replace?: boolean }): void => {
  if (options?.replace) {
    window.history.replaceState(null, '', to)
  } else {
    window.history.pushState(null, '', to)
  }

  window.dispatchEvent(new Event(NAVIGATE_EVENT_NAME))
}

export const subscribeLocation = (listener: () => void): (() => void) => {
  const handleLocationChange = () => listener()

  window.addEventListener('popstate', handleLocationChange)
  window.addEventListener(NAVIGATE_EVENT_NAME, handleLocationChange)

  return () => {
    window.removeEventListener('popstate', handleLocationChange)
    window.removeEventListener(NAVIGATE_EVENT_NAME, handleLocationChange)
  }
}
