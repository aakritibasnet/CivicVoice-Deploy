import { Stack } from "expo-router";
import OfficerRouteGuard from "@/components/ui/auth/OfficerRouteGuard";

export default function OfficerAuthLayout() {
  return (
    <OfficerRouteGuard allowMustChangePassword>
      <Stack
        screenOptions={{ headerShown: false, animation: "slide_from_right" }}
      >
        <Stack.Screen name="change-password" />
      </Stack>
    </OfficerRouteGuard>
  );
}
