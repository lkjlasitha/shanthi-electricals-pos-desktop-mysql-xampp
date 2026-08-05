import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App.jsx';
import { AuthProvider } from './context/AuthContext.jsx';
import { DialogProvider } from './context/DialogContext.jsx';
import ErrorBoundary from './components/ErrorBoundary.jsx';
import './index.css';

// These fire for errors *outside* React's render cycle (event handlers,
// promise chains, timers) which ErrorBoundary below cannot catch on its own.
// We only log them here so a background failure doesn't get lost silently —
// they will not crash the UI, since they weren't going to anyway.
window.addEventListener('error', (event) => {
  console.error('Unhandled error:', event.error || event.message);
});
window.addEventListener('unhandledrejection', (event) => {
  console.error('Unhandled promise rejection:', event.reason);
});

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ErrorBoundary>
      <BrowserRouter>
        <AuthProvider>
          <DialogProvider>
            <App />
          </DialogProvider>
        </AuthProvider>
      </BrowserRouter>
    </ErrorBoundary>
  </React.StrictMode>
);
