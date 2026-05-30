import React, {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  Animated,
  Easing,
  Platform,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { AnimatedPressable } from "@/components/ui/tap-feedback";
import { colors } from "@/theme/colors";

type ToastType = "success" | "error" | "info";

type ToastInput = {
  title: string;
  message?: string;
  type?: ToastType;
  durationMs?: number;
};

type ToastRecord = ToastInput & {
  id: number;
  type: ToastType;
};

type ToastContextValue = {
  showToast: (toast: ToastInput) => void;
};

const ToastContext = createContext<ToastContextValue | null>(null);

function ToastCard({
  toast,
  onRemove,
}: {
  toast: ToastRecord;
  onRemove: (id: number) => void;
}) {
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(-16)).current;

  React.useEffect(() => {
    Animated.parallel([
      Animated.timing(opacity, {
        toValue: 1,
        duration: 180,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(translateY, {
        toValue: 0,
        duration: 180,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start();
  }, [opacity, translateY]);

  const dismiss = useCallback(() => {
    Animated.parallel([
      Animated.timing(opacity, {
        toValue: 0,
        duration: 140,
        easing: Easing.in(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(translateY, {
        toValue: -10,
        duration: 140,
        easing: Easing.in(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start(() => onRemove(toast.id));
  }, [onRemove, opacity, toast.id, translateY]);

  const iconName =
    toast.type === "success"
      ? "checkmark-circle"
      : toast.type === "error"
        ? "alert-circle"
        : "information-circle";

  return (
    <Animated.View
      style={[
        styles.toastCard,
        styles[`toast_${toast.type}`],
        { opacity, transform: [{ translateY }] },
      ]}
    >
      <AnimatedPressable
        style={styles.toastInner}
        onPress={dismiss}
        tapVariant="quiet"
        disableGlobalRipple
      >
        <Ionicons
          name={iconName}
          size={18}
          color={toast.type === "error" ? colors.danger : colors.white}
        />
        <View style={styles.toastBody}>
          <Text
            style={[
              styles.toastTitle,
              toast.type === "error" && styles.toastTitleDark,
            ]}
          >
            {toast.title}
          </Text>
          {toast.message ? (
            <Text
              style={[
                styles.toastMessage,
                toast.type === "error" && styles.toastMessageDark,
              ]}
            >
              {toast.message}
            </Text>
          ) : null}
        </View>
      </AnimatedPressable>
    </Animated.View>
  );
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastRecord[]>([]);
  const idRef = useRef(0);

  const removeToast = useCallback((id: number) => {
    setToasts((prev) => prev.filter((toast) => toast.id !== id));
  }, []);

  const showToast = useCallback(
    ({ title, message, type = "info", durationMs = 2800 }: ToastInput) => {
      const id = ++idRef.current;
      const toast: ToastRecord = { id, title, message, type, durationMs };

      setToasts((prev) => {
        const duplicate = prev.find(
          (item) =>
            item.type === toast.type &&
            item.title === toast.title &&
            item.message === toast.message,
        );

        if (duplicate) {
          return prev;
        }

        return [...prev.filter((item) => item.type !== "error"), toast];
      });

      setTimeout(() => {
        removeToast(id);
      }, durationMs);
    },
    [removeToast],
  );

  const value = useMemo(() => ({ showToast }), [showToast]);

  return (
    <ToastContext.Provider value={value}>
      <View style={styles.root}>
        {children}
        <View pointerEvents="box-none" style={styles.toastLayer}>
          {toasts.map((toast) => (
            <ToastCard key={toast.id} toast={toast} onRemove={removeToast} />
          ))}
        </View>
      </View>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const value = useContext(ToastContext);
  if (!value) {
    throw new Error("useToast must be used within ToastProvider");
  }
  return value;
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  toastLayer: {
    position: "absolute",
    top: Platform.select({ ios: 58, android: 26, default: 26 }),
    left: 12,
    right: 12,
    gap: 10,
    zIndex: 999,
  },
  toastCard: {
    borderRadius: 16,
    borderWidth: 1,
    overflow: "hidden",
    shadowColor: colors.black,
    shadowOpacity: 0.1,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 6 },
    elevation: 6,
  },
  toast_success: {
    backgroundColor: "#166534",
    borderColor: "#166534",
  },
  toast_error: {
    backgroundColor: "#FEF2F2",
    borderColor: "#FECACA",
  },
  toast_info: {
    backgroundColor: colors.text,
    borderColor: colors.text,
  },
  toastInner: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  toastBody: {
    flex: 1,
  },
  toastTitle: {
    color: colors.white,
    fontSize: 14,
    fontWeight: "900",
  },
  toastTitleDark: {
    color: colors.danger,
  },
  toastMessage: {
    marginTop: 2,
    color: colors.white,
    fontSize: 12,
    lineHeight: 17,
  },
  toastMessageDark: {
    color: "#991B1B",
  },
});
