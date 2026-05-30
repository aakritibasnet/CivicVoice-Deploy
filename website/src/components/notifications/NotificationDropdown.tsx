"use client";

import React, { useEffect, useRef } from "react";
import Link from "next/link";
import {
  LuBell,
  LuCheck,
  LuCheckCheck,
  LuClock,
  LuFileWarning,
  LuX,
} from "react-icons/lu";

import { useNotificationStore } from "@/src/store/notification-store";
import { useNotificationActions } from "@/src/hooks/useNotifications";
import { formatRelativeTime, useRelativeTimeNow } from "@/src/lib/time";
import { Badge } from "@/src/ui/Badge";
import { Button } from "@/src/ui/Button";

function getNotificationIcon(type: string) {
  switch (type) {
    case "success":
      return <LuCheck className="text-green-600" />;
    case "warning":
      return <LuFileWarning className="text-yellow-600" />;
    case "error":
      return <LuFileWarning className="text-red-600" />;
    case "report_assigned":
      return <LuBell className="text-blue-600" />;
    default:
      return <LuBell className="text-gray-600" />;
  }
}

export default function NotificationDropdown() {
  const { markAsRead, markAllAsRead } = useNotificationActions();
  const now = useRelativeTimeNow();

  const {
    notifications,
    unreadCount,
    isDropdownOpen,
    toggleDropdown,
    closeDropdown,
  } = useNotificationStore();

  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node)
      ) {
        closeDropdown();
      }
    }

    if (isDropdownOpen) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => {
        document.removeEventListener("mousedown", handleClickOutside);
      };
    }
  }, [isDropdownOpen, closeDropdown]);

  const recentNotifications = notifications.slice(0, 5);

  return (
    <div className="relative" ref={dropdownRef}>
      {/* Bell Icon Button */}
      <button
        onClick={toggleDropdown}
        className="relative p-2 rounded-lg text-gray-500 hover:text-gray-700 hover:bg-gray-100 transition-colors cursor-pointer"
        title="Notifications"
      >
        <LuBell className="text-xl" />
        {unreadCount > 0 && (
          <span className="absolute top-1.5 right-1.5 h-2 w-2 rounded-full bg-red-500 ring-2 ring-white" />
        )}
      </button>

      {/* Dropdown */}
      {isDropdownOpen && (
        <div className="absolute right-0 mt-2 w-96 bg-white rounded-xl shadow-lg border border-gray-200 z-50 overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200">
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-semibold text-gray-900">
                Notifications
              </h3>
              {unreadCount > 0 && (
                <Badge variant="primary" size="sm">
                  {unreadCount}
                </Badge>
              )}
            </div>

            {unreadCount > 0 && (
              <button
                onClick={markAllAsRead}
                className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700 cursor-pointer"
              >
                <LuCheckCheck className="text-sm" />
                Mark all read
              </button>
            )}
          </div>

          {/* Notification List */}
          <div className="max-h-96 overflow-y-auto">
            {recentNotifications.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
                <LuBell className="text-4xl text-gray-300 mb-3" />
                <p className="text-sm text-gray-500">No notifications yet</p>
                <p className="text-xs text-gray-400 mt-1">
                  We'll notify you when something important happens
                </p>
              </div>
            ) : (
              <div className="divide-y divide-gray-100">
                {recentNotifications.map((notification) => (
                  <NotificationItem
                    key={notification.id}
                    notification={notification}
                    now={now}
                    onMarkAsRead={markAsRead}
                    onClose={closeDropdown}
                  />
                ))}
              </div>
            )}
          </div>

          {/* Footer */}
          {notifications.length > 0 && (
            <div className="border-t border-gray-200 px-4 py-3">
              <Link
                href="/dashboard/notifications"
                onClick={closeDropdown}
                className="block text-center text-sm text-blue-600 hover:text-blue-700 font-medium cursor-pointer"
              >
                View all notifications
              </Link>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

interface NotificationItemProps {
  notification: {
    id: string;
    title: string;
    message: string;
    type: string;
    is_read: boolean;
    created_at: string;
    report_id: string | null;
    link?: string | null;
  };
  now: Date;
  onMarkAsRead: (id: string) => void;
  onClose: () => void;
}

function NotificationItem({
  notification,
  now,
  onMarkAsRead,
  onClose,
}: NotificationItemProps) {
  const handleClick = () => {
    if (!notification.is_read) {
      onMarkAsRead(notification.id);
    }
  };

  const content = (
    <div
      className={`flex gap-3 px-4 py-3 hover:bg-gray-50 transition-colors ${
        !notification.is_read ? "bg-blue-50/50" : ""
      }`}
    >
      {/* Icon */}
      <div className="shrink-0 mt-0.5 text-lg">
        {getNotificationIcon(notification.type)}
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-2">
          <h4
            className={`text-sm ${
              !notification.is_read
                ? "font-semibold text-gray-900"
                : "font-medium text-gray-700"
            }`}
          >
            {notification.title}
          </h4>
          {!notification.is_read && (
            <div className="shrink-0 h-2 w-2 rounded-full bg-blue-600 mt-1.5" />
          )}
        </div>

        <p className="text-xs text-gray-600 mt-0.5 line-clamp-2">
          {notification.message}
        </p>

        <div className="flex items-center gap-1 mt-1.5 text-xs text-gray-400">
          <LuClock className="text-[10px]" />
          <span>{formatRelativeTime(notification.created_at, now)}</span>
        </div>
      </div>
    </div>
  );

  const targetHref =
    notification.link ??
    (notification.report_id ? `/reports/${notification.report_id}` : null);

  if (targetHref) {
    return (
      <Link
        href={targetHref}
        onClick={() => {
          handleClick();
          onClose();
        }}
        className="block cursor-pointer"
      >
        {content}
      </Link>
    );
  }

  // Otherwise, just make it clickable to mark as read
  return (
    <div onClick={handleClick} className="cursor-pointer">
      {content}
    </div>
  );
}
