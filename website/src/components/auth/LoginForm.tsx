"use client";

import React, { useState, FormEvent, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { LuMail, LuShield, LuArrowRight } from "react-icons/lu";
import { IoAlertCircleOutline } from "react-icons/io5";

import { Button } from "@/src/ui/Button";
import { Input } from "@/src/ui/Input";
import { useAuth } from "@/src/hooks/useAuth";

interface LoginFormErrors {
  email?: string;
  password?: string;
}

const FEATURES = [
  "Kanban board for report management",
  "Real-time status tracking",
  "Officer assignment & workload balancing",
  "Deadline monitoring & escalation",
] as const;

function BrandingPanel() {
  return (
    <div className="hidden lg:flex lg:w-1/2 bg-blue-600 relative overflow-hidden">
      <div className="relative z-10 flex flex-col justify-between p-12 text-white w-full">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-white/20 flex items-center justify-center">
            <LuShield className="text-xl" />
          </div>
          <span className="text-2xl font-bold tracking-tight">CivicVoice</span>
        </div>

        <div className="space-y-6">
          <h1 className="text-4xl font-bold leading-tight">Ward Dashboard</h1>
          <p className="text-lg text-blue-100 max-w-md leading-relaxed">
            Manage citizen reports, track resolutions, and improve your
            ward&apos;s civic infrastructure - all in one place.
          </p>

          <div className="space-y-3 pt-4">
            {FEATURES.map((feature) => (
              <div key={feature} className="flex items-center gap-3">
                <div className="h-1.5 w-1.5 rounded-full bg-blue-200 shrink-0" />
                <span className="text-blue-100 text-sm">{feature}</span>
              </div>
            ))}
          </div>
        </div>

        <p className="text-sm text-blue-200">
          © {new Date().getFullYear()} CivicVoice. Government Dashboard.
        </p>
      </div>

      <div className="absolute inset-0">
        <div className="absolute -top-24 -right-24 w-96 h-96 rounded-full bg-blue-500/30" />
        <div className="absolute -bottom-32 -left-32 w-[500px] h-[500px] rounded-full bg-blue-700/30" />
        <div className="absolute top-1/2 right-12 w-64 h-64 rounded-full bg-blue-400/10" />
      </div>
    </div>
  );
}

function MobileLogo() {
  return (
    <div className="lg:hidden flex items-center justify-center gap-3">
      <div className="h-10 w-10 rounded-xl bg-blue-600 flex items-center justify-center text-white">
        <LuShield className="text-xl" />
      </div>
      <span className="text-2xl font-bold tracking-tight text-gray-900">
        CivicVoice
      </span>
    </div>
  );
}

function ErrorAlert({ message }: { message: string }) {
  return (
    <div className="flex items-start gap-3 p-4 bg-red-50 border border-red-200 rounded-lg">
      <IoAlertCircleOutline className="text-red-500 text-lg shrink-0 mt-0.5" />
      <div>
        <p className="text-sm font-medium text-red-800">Login failed</p>
        <p className="text-sm text-red-600 mt-0.5">{message}</p>
      </div>
    </div>
  );
}

function LoginFormContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const callbackUrl = searchParams.get("callbackUrl") || "/dashboard";

  const { login, isAuthenticated, hasHydrated, token, user } = useAuth();
  const hasValidSession = isAuthenticated && Boolean(token) && Boolean(user);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errors, setErrors] = useState<LoginFormErrors>({});
  const [isLoading, setIsLoading] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  useEffect(() => {
    if (hasHydrated && hasValidSession) {
      router.replace(callbackUrl);
    }
  }, [hasHydrated, hasValidSession, callbackUrl, router]);

  function validate(): boolean {
    const newErrors: LoginFormErrors = {};
    const trimmedEmail = email.trim();

    if (!trimmedEmail) {
      newErrors.email = "Email is required";
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
      newErrors.email = "Enter a valid email address";
    }

    if (!password) {
      newErrors.password = "Password is required";
    } else if (password.length < 6) {
      newErrors.password = "Password must be at least 6 characters";
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  }

  function clearFieldError(field: keyof LoginFormErrors) {
    if (errors[field]) {
      setErrors((prev) => ({ ...prev, [field]: undefined }));
    }
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();

    if (!validate()) return;

    setIsLoading(true);
    setServerError(null);

    try {
      await login(email.toLowerCase().trim(), password, callbackUrl);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Login failed";
      setServerError(message);
      setIsLoading(false);
    }
  }

  return (
    <div className="w-full max-w-md space-y-8">
      <MobileLogo />

      <div className="text-center lg:text-left">
        <h2 className="text-2xl font-bold text-gray-900">
          Sign in to Dashboard
        </h2>
        <p className="mt-2 text-sm text-gray-600">
          Enter your credentials to access the ward management dashboard.
        </p>
      </div>

      {serverError && <ErrorAlert message={serverError} />}

      <form onSubmit={handleSubmit} className="space-y-5" noValidate>
        <Input
          label="Email Address"
          type="email"
          placeholder="you@civicvoice.gov.np"
          value={email}
          onChange={(e) => {
            setEmail(e.target.value);
            clearFieldError("email");
          }}
          error={errors.email}
          leftIcon={<LuMail />}
          autoComplete="email"
          autoFocus
        />

        <Input
          label="Password"
          type="password"
          placeholder="Enter your password"
          value={password}
          onChange={(e) => {
            setPassword(e.target.value);
            clearFieldError("password");
          }}
          error={errors.password}
          autoComplete="current-password"
        />

        <Button
          type="submit"
          fullWidth
          size="lg"
          isLoading={isLoading}
          rightIcon={<LuArrowRight />}
        >
          {isLoading ? "Signing in..." : "Sign In"}
        </Button>
      </form>

      <p className="text-center text-xs text-gray-400 pt-4">
        This dashboard is restricted to authorized ward staff only.
        <br />
        Contact your administrator if you need access.
      </p>

      <div className="mt-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
        <p className="text-xs text-blue-800 font-medium">
          ✓ Session persistence enabled
        </p>
        <p className="text-xs text-blue-600 mt-1">
          Your login will stay saved on this device until you sign out.
        </p>
      </div>
    </div>
  );
}

export default function LoginForm() {
  return (
    <div className="min-h-screen bg-gray-50 flex">
      <BrandingPanel />
      <div className="w-full lg:w-1/2 flex items-center justify-center p-6 sm:p-12">
        <LoginFormContent />
      </div>
    </div>
  );
}
