"use client";

import { useEffect } from "react";
import { ApolloProviderWrapper } from "@/src/lib/apollo-provider";
import { useAuthStore } from "@/src/store/auth-store";
import NotificationToaster from "@/src/components/notifications/NotificationToaster";
import NotificationRealtimeBootstrap from "@/src/components/notifications/NotificationRealtimeBootstrap";

export function Providers({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    if (useAuthStore.persist.hasHydrated()) {
      useAuthStore.setState({ hasHydrated: true });
      return;
    }

    void useAuthStore.persist.rehydrate();
  }, []);

  return (
    <ApolloProviderWrapper>
      <NotificationRealtimeBootstrap />
      {children}
      <NotificationToaster />
    </ApolloProviderWrapper>
  );
}
