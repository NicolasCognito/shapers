import { StrictMode } from "react"
import { createRoot } from "react-dom/client"

import "./index.css"
import "@/i18n"
import App from "./App.tsx"
import { ThemeProvider } from "@/components/theme-provider.tsx"
import { Toaster } from "@/components/ui/sonner"

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ThemeProvider>
      <App />
      {/* Top-right: the bottom-right corner belongs to the Jarvis panel. */}
      <Toaster position="top-right" />
    </ThemeProvider>
  </StrictMode>
)

// After a new deploy an open tab can request page chunks that no longer exist;
// reload once to pick up the new version instead of showing a broken page.
window.addEventListener("vite:preloadError", (event) => {
  try {
    if (sessionStorage.getItem("chunk-reload")) return
    sessionStorage.setItem("chunk-reload", "1")
  } catch {
    /* ignore */
  }
  event.preventDefault()
  window.location.reload()
})
window.addEventListener("load", () => {
  setTimeout(() => {
    try {
      sessionStorage.removeItem("chunk-reload")
    } catch {
      /* ignore */
    }
  }, 10000)
})
