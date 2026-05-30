"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { LuBell, LuCheck, LuFileWarning, LuX } from "react-icons/lu";

import { useNotificationStore } from "@/src/store/notification-store";

function getToastAccent(type: string) {
  switch (type) {
    case "success":
      return {
        icon: <LuCheck className="text-green-600" />,
        ring: "ring-green-100",
        border: "border-green-200",
      };
    case "warning":
    case "error":
      return {
        icon: <LuFileWarning className="text-amber-600" />,
        ring: "ring-amber-100",
        border: "border-amber-200",
      };
    default:
      return {
        icon: <LuBell className="text-blue-600" />,
        ring: "ring-blue-100",
        border: "border-blue-200",
      };
  }
}

export default function NotificationToaster() {
  const router = useRouter();
  const { toasts, dismissToast } = useNotificationStore();

  useEffect(() => {
    const timers = toasts.map((toast) =>
      window.setTimeout(() => {
        dismissToast(toast.id);
      }, 5000),
    );

    return () => {
      timers.forEach((timer) => window.clearTimeout(timer));
    };
  }, [dismissToast, toasts]);

  if (toasts.length === 0) {
    return null;
  }

  return (
    <div className="pointer-events-none fixed right-4 top-4 z-[80] flex w-full max-w-sm flex-col gap-3">
      {toasts.map((toast) => {
        const accent = getToastAccent(toast.type);

        return (
          <div
            key={toast.id}
            className={`pointer-events-auto rounded-2xl border bg-white p-4 shadow-lg ring-1 ${accent.border} ${accent.ring}`}
          >
            <div className="flex items-start gap-3">
              <div className="mt-0.5 text-lg">{accent.icon}</div>

              <button
                type="button"
                className="min-w-0 flex-1 text-left"
                onClick={() => {
                  dismissToast(toast.id);
                  if (toast.link) {
                    router.push(toast.link);
                  }
                }}
              >
                <p className="text-sm font-semibold text-gray-900">{toast.title}</p>
                <p className="mt-1 text-sm text-gray-600">{toast.message}</p>
              </button>

              <button
                type="button"
                onClick={() => dismissToast(toast.id)}
                className="rounded-lg p-1 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600"
                aria-label="Dismiss notification"
              >
                <LuX className="text-sm" />
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
