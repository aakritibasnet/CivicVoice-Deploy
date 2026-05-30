"use client";

import React, { useState } from "react";
import Link from "next/link";
import {
  LuBell,
  LuCheck,
  LuCheckCheck,
  LuClock,
  LuFileWarning,
  LuFilter,
  LuTrash2,
} from "react-icons/lu";

import { useNotificationStore, type Notification } from "@/src/store/notification-store";
import { useNotificationActions } from "@/src/hooks/useNotifications";
import { formatRelativeTime, useRelativeTimeNow } from "@/src/lib/time";
import { Badge } from "@/src/ui/Badge";
import { Button } from "@/src/ui/Button";

type FilterType = "all" | "unread" | "read";

function formatFullDate(dateString: string): string {
  const date = new Date(dateString);
  return date.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

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

function getNotificationBadgeVariant(type: string) {
  switch (type) {
    case "success":
      return "success";
    case "warning":
      return "warning";
    case "error":
      return "danger";
    case "report_assigned":
      return "primary";
    default:
      return "default";
  }
}

export default function NotificationsPage() {
  const { markAsRead, markAllAsRead, deleteNotification } =
    useNotificationActions();
  const now = useRelativeTimeNow();

  const {
    notifications,
    unreadCount,
  } = useNotificationStore();

  const [filter, setFilter] = useState<FilterType>("all");

  const filteredNotifications = notifications.filter((notification) => {
    if (filter === "unread") return !notification.is_read;
    if (filter === "read") return notification.is_read;
    return true;
  });

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">
            Notifications
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Stay updated on your reports and system activities
          </p>
        </div>

        {unreadCount > 0 && (
          <Button
            variant="outline"
            size="sm"
            leftIcon={<LuCheckCheck />}
            onClick={markAllAsRead}
          >
            Mark all as read
          </Button>
        )}
      </div>

      {/* Stats and Filters */}
      <div className="flex items-center justify-between gap-4 p-4 bg-gray-50 rounded-xl border border-gray-200">
        <div className="flex items-center gap-6">
          <div>
            <p className="text-xs text-gray-500">Total</p>
            <p className="text-lg font-semibold text-gray-900">
              {notifications.length}
            </p>
          </div>
          <div className="h-8 w-px bg-gray-300" />
          <div>
            <p className="text-xs text-gray-500">Unread</p>
            <p className="text-lg font-semibold text-blue-600">{unreadCount}</p>
          </div>
        </div>

        {/* Filter Buttons */}
        <div className="flex items-center gap-2">
          <LuFilter className="text-gray-400 text-sm" />
          <div className="flex gap-1 bg-white rounded-lg p-1 border border-gray-200">
            <button
              onClick={() => setFilter("all")}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors cursor-pointer ${
                filter === "all"
                  ? "bg-blue-600 text-white"
                  : "text-gray-600 hover:bg-gray-100"
              }`}
            >
              All
            </button>
            <button
              onClick={() => setFilter("unread")}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors cursor-pointer ${
                filter === "unread"
                  ? "bg-blue-600 text-white"
                  : "text-gray-600 hover:bg-gray-100"
              }`}
            >
              Unread
            </button>
            <button
              onClick={() => setFilter("read")}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors cursor-pointer ${
                filter === "read"
                  ? "bg-blue-600 text-white"
                  : "text-gray-600 hover:bg-gray-100"
              }`}
            >
              Read
            </button>
          </div>
        </div>
      </div>

      {/* Notifications List */}
      <div className="space-y-3">
        {filteredNotifications.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 px-4 text-center bg-white rounded-xl border border-gray-200">
            <LuBell className="text-5xl text-gray-300 mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-1">
              {filter === "unread"
                ? "No unread notifications"
                : filter === "read"
                  ? "No read notifications"
                  : "No notifications yet"}
            </h3>
            <p className="text-sm text-gray-500 max-w-sm">
              {filter === "all"
                ? "We'll notify you when something important happens with your reports"
                : filter === "unread"
                  ? "All caught up! Check back later for new updates"
                  : "You haven't read any notifications yet"}
            </p>
          </div>
        ) : (
          filteredNotifications.map((notification) => (
            <NotificationCard
              key={notification.id}
              notification={notification}
              now={now}
              onMarkAsRead={markAsRead}
              onDelete={deleteNotification}
            />
          ))
        )}
      </div>
    </div>
  );
}

interface NotificationCardProps {
  notification: Notification;
  now: Date;
  onMarkAsRead: (id: string) => void;
  onDelete: (id: string) => void;
}

function NotificationCard({
  notification,
  now,
  onMarkAsRead,
  onDelete,
}: NotificationCardProps) {
  const handleMarkAsRead = () => {
    if (!notification.is_read) {
      onMarkAsRead(notification.id);
    }
  };

  const handleDelete = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    onDelete(notification.id);
  };

  const content = (
    <div
      className={`relative p-4 bg-white rounded-xl border transition-all hover:shadow-md group ${
        !notification.is_read
          ? "border-blue-200 bg-blue-50/30"
          : "border-gray-200"
      }`}
    >
      {/* Unread indicator */}
      {!notification.is_read && (
        <div className="absolute top-4 right-4 h-2.5 w-2.5 rounded-full bg-blue-600" />
      )}

      <div className="flex gap-4">
        {/* Icon */}
        <div className="shrink-0 h-10 w-10 rounded-full bg-gray-100 flex items-center justify-center text-lg">
          {getNotificationIcon(notification.type)}
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0 pr-8">
          <div className="flex items-start justify-between gap-2 mb-1">
            <h3
              className={`text-sm ${
                !notification.is_read
                  ? "font-semibold text-gray-900"
                  : "font-medium text-gray-700"
              }`}
            >
              {notification.title}
            </h3>
            <Badge
              variant={getNotificationBadgeVariant(notification.type)}
              size="sm"
            >
              {notification.type.replace(/_/g, " ")}
            </Badge>
          </div>

          <p className="text-sm text-gray-600 mb-2">{notification.message}</p>

          <div className="flex items-center gap-4 text-xs text-gray-400">
            <div className="flex items-center gap-1">
              <LuClock className="text-[10px]" />
              <span>{formatRelativeTime(notification.created_at, now)}</span>
            </div>
            <span>•</span>
            <span>{formatFullDate(notification.created_at)}</span>
          </div>
        </div>
      </div>

      {/* Action Buttons */}
      <div className="absolute top-4 right-12 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        {!notification.is_read && (
          <button
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              handleMarkAsRead();
            }}
            className="p-1.5 rounded-md text-gray-400 hover:text-blue-600 hover:bg-blue-50 transition-colors cursor-pointer"
            title="Mark as read"
          >
            <LuCheck className="text-sm" />
          </button>
        )}
        <button
          onClick={handleDelete}
          className="p-1.5 rounded-md text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors cursor-pointer"
          title="Delete notification"
        >
          <LuTrash2 className="text-sm" />
        </button>
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
        onClick={handleMarkAsRead}
        className="block cursor-pointer"
      >
        {content}
      </Link>
    );
  }

  return <div onClick={handleMarkAsRead}>{content}</div>;
}
