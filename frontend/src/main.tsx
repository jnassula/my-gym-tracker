// First: it must be set before any schema is used.
import '@/lib/zod-config'

import { QueryClientProvider } from '@tanstack/react-query'
import { RouterProvider } from '@tanstack/react-router'
import { ThemeProvider } from 'next-themes'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

import '@/i18n'
import { lockPortrait } from '@/lib/orientation'
import { startTheme } from '@/lib/theme/palette'
import { registerServiceWorker } from '@/pwa'
import { queryClient, router } from '@/router'

import './index.css'

startTheme()
// Portrait only. Best effort: the installed app on Android locks; an iPhone can't be asked.
void lockPortrait()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ThemeProvider attribute="class" defaultTheme="dark" storageKey="mygymtracker-theme">
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>
    </ThemeProvider>
  </StrictMode>,
)

registerServiceWorker()
