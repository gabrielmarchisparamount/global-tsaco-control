import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Each backend server is added at runtime via the "Manage Servers" page
// (see src/backend.js) and connects directly by host:port — no dev proxy
// needed, since Socket.IO here is websocket-only and browsers don't apply
// CORS restrictions to raw WebSocket connections.
export default defineConfig({
  plugins: [react()],
  server: {
    host: true,
    port: 5173,
  },
});
