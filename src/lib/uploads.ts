// ─── Shared upload constraints ────────────────────────────────────────────────
//
// One source of truth used by every client-side upload trigger. The server
// endpoint at /api/upload also enforces the same byte limit independently.

export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024; // 5 MB

const ACCEPTED_IMAGE_TYPES = new Set([
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
  "image/gif",
]);

export interface ValidationResult {
  ok:     boolean;
  error?: string;
}

/**
 * Validate a file the user picked before we upload it.
 * - Checks size against MAX_UPLOAD_BYTES
 * - Checks MIME type is an accepted image format
 *
 * Returns a friendly error string suitable for showing in a toast / inline
 * message when the file fails. Callers should bail out early on `!ok`.
 */
export function validateImageFile(file: File): ValidationResult {
  if (!file) {
    return { ok: false, error: "No file selected" };
  }

  if (!ACCEPTED_IMAGE_TYPES.has(file.type)) {
    return { ok: false, error: "Please choose a JPG, PNG, WebP, or GIF image" };
  }

  if (file.size > MAX_UPLOAD_BYTES) {
    const mb = (file.size / (1024 * 1024)).toFixed(1);
    return {
      ok:    false,
      error: `Image is ${mb} MB — maximum allowed is ${MAX_UPLOAD_BYTES / (1024 * 1024)} MB`,
    };
  }

  return { ok: true };
}

/** Human-readable size label for hints, e.g. "Max 5 MB". */
export const MAX_UPLOAD_LABEL = `Max ${MAX_UPLOAD_BYTES / (1024 * 1024)} MB`;
