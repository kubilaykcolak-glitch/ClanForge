"use client";

import { useCallback, useRef, useState } from "react";
import { StepUpModal } from "./StepUpModal";

// ─── useStepUp ────────────────────────────────────────────────────────────────
//
// Hook that wraps a server-action call so it transparently re-prompts for
// the password if the server says "step_up_required", then retries.
//
//   const { call, modal } = useStepUp();
//   // …
//   const result = await call(() => banUser(targetUid, reason));
//   // {modal} into the JSX once anywhere in the page.
//
// The wrapper:
//   1. Invokes the action.
//   2. If it returns { needsStepUp: true }, opens the password modal and
//      pends the call.
//   3. When the modal succeeds, re-runs the original action exactly once.
//   4. Returns the final result (or the original result if step-up wasn't
//      needed).

interface StepUpActionResult {
  success: boolean;
  error?:  string;
  needsStepUp?: boolean;
}

interface StepUpState {
  open: boolean;
  resolve: ((value: StepUpActionResult) => void) | null;
  reject:  ((err: Error) => void) | null;
  retry:   (() => Promise<StepUpActionResult>) | null;
}

export function useStepUp() {
  const stateRef = useRef<StepUpState>({ open: false, resolve: null, reject: null, retry: null });
  const [open, setOpen] = useState(false);

  const call = useCallback(<T extends StepUpActionResult>(action: () => Promise<T>): Promise<T> => {
    return (async () => {
      const first = await action();
      if (!first.needsStepUp) return first;

      return new Promise<T>((resolve, reject) => {
        stateRef.current = {
          open: true,
          resolve: resolve as (v: StepUpActionResult) => void,
          reject,
          retry:   action as () => Promise<StepUpActionResult>,
        };
        setOpen(true);
      });
    })();
  }, []);

  const handleSuccess = useCallback(async () => {
    const s = stateRef.current;
    setOpen(false);
    if (s.retry && s.resolve) {
      try {
        const result = await s.retry();
        s.resolve(result);
      } catch (err) {
        s.reject?.(err instanceof Error ? err : new Error(String(err)));
      }
    }
    stateRef.current = { open: false, resolve: null, reject: null, retry: null };
  }, []);

  const handleCancel = useCallback(() => {
    const s = stateRef.current;
    setOpen(false);
    // Resolve with a synthetic "cancelled" result rather than rejecting — the
    // call site just sees the original needsStepUp response and can decide.
    s.resolve?.({ success: false, error: "Cancelled", needsStepUp: true });
    stateRef.current = { open: false, resolve: null, reject: null, retry: null };
  }, []);

  const modal = (
    <StepUpModal
      open={open}
      onSuccess={handleSuccess}
      onCancel={handleCancel}
    />
  );

  return { call, modal };
}
