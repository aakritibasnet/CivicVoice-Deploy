import React from "react";
import { Stack, type ErrorBoundaryProps } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { GestureHandlerRootView } from "react-native-gesture-handler";

import {
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  View,
} from "react-native";

import { useBackgroundUpload } from "@/hooks/useBackgroundUpload";
import { useNotificationHeartbeat } from "@/hooks/useNotificationHeartbeat";
import { usePushNotifications } from "@/hooks/usePushNotifications";
import UploadProgressOverlay from "@/components/report/UploadProgressOverlay";
import AppErrorFallback from "@/components/ui/feedback/AppErrorFallback";
import OfflineBanner from "@/components/ui/feedback/OfflineBanner";
import { ToastProvider } from "@/components/ui/feedback/ToastProvider";
import { TapFeedbackProvider } from "@/components/ui/tap-feedback";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000,
      retry: 1,
    },
  },
});

export function ErrorBoundary(props: ErrorBoundaryProps) {
  return <AppErrorFallback {...props} />;
}

function AppBootstrap() {
  usePushNotifications();
  useNotificationHeartbeat();
  return null;
}

export default function RootLayout() {
  // Global background upload: retries pending offline uploads when connectivity returns
  useBackgroundUpload();

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <QueryClientProvider client={queryClient}>
        <AppBootstrap />
        <ToastProvider>
          <TapFeedbackProvider>
            <View style={{ flex: 1 }}>
              <KeyboardAvoidingView
                style={styles.container}
                behavior={Platform.OS === "ios" ? "padding" : "height"}
                keyboardVerticalOffset={Platform.OS === "ios" ? 60 : 0}
              >
                <Stack
                  screenOptions={{
                    headerShown: false,
                    animation: "slide_from_right",
                  }}
                >
                  <Stack.Screen name="index" options={{ animation: "none" }} />
                  <Stack.Screen name="onboarding" />
                  <Stack.Screen name="(tabs)" options={{ animation: "none" }} />
                  <Stack.Screen
                    name="(officer-tabs)"
                    options={{ animation: "none" }}
                  />
                  <Stack.Screen name="(officer-auth)" />
                  <Stack.Screen name="report/[id]" />
                  <Stack.Screen name="report-post/[id]" />
                  <Stack.Screen name="user/[id]" />
                  <Stack.Screen name="search" />
                  <Stack.Screen name="ward-publish" />
                  <Stack.Screen name="published-report/[id]" />
                  <Stack.Screen name="officer/[id]" />
                  <Stack.Screen name="officer-task/[id]" />
                  <Stack.Screen name="officer-report/[id]" />
                  <Stack.Screen name="officer-notifications" />
                  <Stack.Screen name="officer-chat/[id]" />
                  <Stack.Screen name="officer-chat/new" />
                  <Stack.Screen name="officer-chat/archived" />
                  <Stack.Screen name="ward-map" />
                  <Stack.Screen name="task-map" />
                  <Stack.Screen name="notifications" />
                  <Stack.Screen name="notification-settings" />
                </Stack>

                <StatusBar style="auto" />
              </KeyboardAvoidingView>
              <UploadProgressOverlay />
              <OfflineBanner />
            </View>
          </TapFeedbackProvider>
        </ToastProvider>
      </QueryClientProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
});
