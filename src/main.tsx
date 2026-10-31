// Entry: mounts the editor with its tooltip and toast providers.

import { Toast } from '@base-ui/react/toast'
import { Tooltip } from '@base-ui/react/tooltip'
import { createRoot } from 'react-dom/client'
import { App } from '@/app/App'
import { Toasts, toast } from '@/components/ui'
import '@/styles/globals.css'

createRoot(document.getElementById('root')!).render(
  <Toast.Provider toastManager={toast}>
    <Tooltip.Provider delay={400}>
      <App />
    </Tooltip.Provider>
    <Toasts />
  </Toast.Provider>,
)
