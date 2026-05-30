/**
 * XHR-based upload that exposes real upload progress via onProgress callback.
 * Drop-in replacement for fetch() when progress tracking is needed.
 */

export type UploadProgressCallback = (sent: number, total: number) => void;

type UploadOptions = {
  url: string;
  body: FormData;
  headers?: Record<string, string>;
  onProgress?: UploadProgressCallback;
  timeoutMs?: number;
};

type UploadResult = {
  status: number;
  data: any;
};

export function uploadWithProgress(options: UploadOptions): {
  promise: Promise<UploadResult>;
  abort: () => void;
} {
  const { url, body, headers = {}, onProgress, timeoutMs = 120000 } = options;

  let xhr: XMLHttpRequest | null = new XMLHttpRequest();

  const promise = new Promise<UploadResult>((resolve, reject) => {
    if (!xhr) return reject(new Error("XHR not initialized"));

    let timedOut = false;
    const timeout = setTimeout(() => {
      timedOut = true;
      xhr?.abort();
      reject(new Error("Report upload timed out. Please try again."));
    }, timeoutMs);

    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable && onProgress) {
        onProgress(event.loaded, event.total);
      }
    };

    xhr.onload = () => {
      clearTimeout(timeout);
      let data: any = null;
      try {
        data = xhr!.responseText ? JSON.parse(xhr!.responseText) : null;
      } catch {
        data = { message: xhr!.responseText };
      }

      if (xhr!.status >= 200 && xhr!.status < 300) {
        resolve({ status: xhr!.status, data });
      } else {
        reject(
          new Error(
            data?.error ||
              data?.message ||
              `Failed to create report (${xhr!.status})`,
          ),
        );
      }
    };

    xhr.onerror = () => {
      clearTimeout(timeout);
      if (timedOut) return;
      reject(
        new Error(
          "Failed to reach report API. Check your network connection.",
        ),
      );
    };

    xhr.onabort = () => {
      clearTimeout(timeout);
      if (timedOut) return;
      reject(new Error("Upload was cancelled."));
    };

    xhr.open("POST", url);

    for (const [key, value] of Object.entries(headers)) {
      xhr.setRequestHeader(key, value);
    }

    xhr.send(body);
  });

  return {
    promise,
    abort: () => xhr?.abort(),
  };
}
