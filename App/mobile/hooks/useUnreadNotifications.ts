import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { getUnreadCountApi } from "@/api/notifications";
import { useNotificationsStore } from "@/store/notifications";

export function useUnreadNotifications() {
  const setUnreadCount = useNotificationsStore((s) => s.setUnreadCount);
  const unreadCount = useNotificationsStore((s) => s.unreadCount);

  const query = useQuery({
    queryKey: ["notifications-unread-count"],
    queryFn: getUnreadCountApi,
    refetchInterval: 15000,
    refetchIntervalInBackground: false,
  });

  useEffect(() => {
    if (typeof query.data === "number") {
      setUnreadCount(query.data);
    }
  }, [query.data, setUnreadCount]);

  return {
    unreadCount,
    isLoading: query.isLoading,
    refetch: query.refetch,
  };
}
