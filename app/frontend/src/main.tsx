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
