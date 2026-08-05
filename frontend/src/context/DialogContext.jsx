import React, { createContext, useCallback, useContext, useRef, useState } from 'react';
import { Button, Modal } from '../components/ui.jsx';

/**
 * Replaces window.confirm()/window.alert().
 *
 * Why this exists: window.confirm()/alert() are *synchronous, blocking*
 * native dialogs. In Electron, showing one of these stalls the renderer's
 * own event loop, and Chromium can come back from it without properly
 * restoring input/focus handling to the page — so after a delete
 * confirmation, text inputs and <select> dropdowns across the whole app can
 * stop responding until the window is resized/refocused. (The app previously
 * tried to patch the *symptom* in App.jsx with a pointerdown-based focus
 * recovery listener; this fixes the actual *cause* by never invoking the
 * blocking native dialog in the first place.)
 *
 * This provides an in-app, promise-based replacement backed by the existing
 * <Modal>, which is just normal React state — nothing blocks the renderer.
 */

const DialogContext = createContext(null);

export function DialogProvider({ children }) {
  const [state, setState] = useState(null); // { mode: 'confirm'|'alert', message, title, confirmLabel, cancelLabel, danger }
  const resolverRef = useRef(null);

  const close = useCallback((result) => {
    if (resolverRef.current) {
      resolverRef.current(result);
      resolverRef.current = null;
    }
    setState(null);
  }, []);

  const confirm = useCallback((message, opts = {}) => {
    return new Promise((resolve) => {
      resolverRef.current = resolve;
      setState({
        mode: 'confirm',
        message,
        title: opts.title || 'Please confirm',
        confirmLabel: opts.confirmLabel || 'Confirm',
        cancelLabel: opts.cancelLabel || 'Cancel',
        danger: opts.danger ?? true,
      });
    });
  }, []);

  const alertDialog = useCallback((message, opts = {}) => {
    return new Promise((resolve) => {
      resolverRef.current = resolve;
      setState({
        mode: 'alert',
        message,
        title: opts.title || 'Notice',
        confirmLabel: opts.confirmLabel || 'OK',
      });
    });
  }, []);

  return (
    <DialogContext.Provider value={{ confirm, alert: alertDialog }}>
      {children}
      <Modal open={!!state} onClose={() => close(false)} title={state?.title} width="max-w-sm">
        {state && (
          <div>
            <p className="text-sm text-graphite-700 whitespace-pre-line">{state.message}</p>
            <div className="flex justify-end gap-2 mt-5">
              {state.mode === 'confirm' && (
                <Button type="button" variant="secondary" onClick={() => close(false)}>
                  {state.cancelLabel}
                </Button>
              )}
              <Button
                type="button"
                variant={state.mode === 'confirm' && state.danger ? 'danger' : 'primary'}
                onClick={() => close(true)}
                autoFocus
              >
                {state.confirmLabel}
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </DialogContext.Provider>
  );
}

export function useDialog() {
  const ctx = useContext(DialogContext);
  if (!ctx) throw new Error('useDialog must be used within a DialogProvider');
  return ctx;
}
