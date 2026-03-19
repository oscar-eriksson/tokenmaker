import { defineConfig } from 'vite'
/// <reference types="node" />
import { svelte } from '@sveltejs/vite-plugin-svelte'

// https://vite.dev/config/
export default defineConfig({
  plugins: [svelte()],
  define: {
    // @ts-ignore
    __APP_VERSION__: JSON.stringify(process.env.npm_package_version || '1.1.0'),
    __BUILD_DATE__: JSON.stringify(new Date().toLocaleString('en-GB', { 
        day: '2-digit', 
        month: 'short', 
        year: 'numeric', 
        hour: '2-digit', 
        minute: '2-digit' 
    }))
  }
})
