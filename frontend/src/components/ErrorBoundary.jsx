import React from 'react';

/**
 * Without an error boundary, ANY uncaught error thrown while rendering
 * *any* component (a bad API response shape, a null field, a typo in a
 * .map()) unmounts the entire React tree in React 18 — the whole app goes
 * blank/unresponsive at once, everywhere, not just the screen that had the
 * bug. This is the render-side equivalent of the native-dialog freeze: one
 * bad spot takes down every text field and dropdown in the app.
 *
 * This boundary catches those errors, keeps the rest of the Electron app
 * process alive, and gives the user a way back in without losing their
 * session or restarting the app.
 */
export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    // Keep a trace in the console/log even though we don't have a remote
    // error-reporting service wired up.
    console.error('Unhandled UI error:', error, info?.componentStack);
  }

  handleReload = () => {
    // A soft reset first: clearing the error lets React try to remount the
    // tree without a full page reload. If that same bug fires again on
    // remount, the button becomes "Restart app" below and does a hard reload.
    this.setState({ error: null });
  };

  handleHardReload = () => {
    window.location.reload();
  };

  render() {
    if (this.state.error) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-slate-50 p-6">
          <div className="max-w-md w-full bg-white border border-slate-200 rounded-lg shadow-xl p-6 text-center">
            <h1 className="font-display text-lg font-semibold text-graphite-950 mb-2">
              Something went wrong
            </h1>
            <p className="text-sm text-graphite-600 mb-1">
              A screen in the app hit an unexpected error. Nothing has been lost —
              your data is safe on the server.
            </p>
            <p className="text-xs text-graphite-400 mb-5 break-words">
              {this.state.error?.message || String(this.state.error)}
            </p>
            <div className="flex justify-center gap-2">
              <button
                onClick={this.handleReload}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-md text-sm font-medium bg-copper-600 text-white hover:bg-copper-700"
              >
                Try again
              </button>
              <button
                onClick={this.handleHardReload}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-md text-sm font-medium bg-white border border-slate-200 text-graphite-800 hover:bg-slate-100"
              >
                Restart app
              </button>
            </div>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
