"use client";

import React, { useState, FormEvent } from "react";
import { useMutation } from "@apollo/client/react";
import { useRouter } from "next/navigation";
import { LuMail, LuShield, LuArrowRight } from "react-icons/lu";

import { Button } from "@/src/ui/Button";
import { Input } from "@/src/ui/Input";
import { useAuthStore } from "@/src/store/auth-store";
import { LOGIN_MUTATION } from "@/src/graphql/operations/auth";
import { IoAlertCircleOutline } from "react-icons/io5";

// ─── Types ───────────────────────────────────────────
interface LoginFormErrors {
  email?: string;
  password?: string;
}

interface LoginMutationData {
  login: {
    token: string;
    user: {
      id: string;
      name: string;
      email: string;
      role: "municipality" | "ward" | "admin";
      ward_id: string | null;
      municipality_id: string | null;
      must_change_password: boolean;
      ward: {
        id: string;
        name: string;
        ward_code: string;
      } | null;
    };
  };
}

interface LoginMutationVariables {
  email: string;
  password: string;
}

// ─── Features List ───────────────────────────────────
const FEATURES = [
  "Kanban board for report management",
  "Real-time status tracking",
  "Officer assignment & workload balancing",
  "Deadline monitoring & escalation",
] as const;

// ─── Error Message Parser ────────────────────────────
function parseServerError(error: any): string | null {
  if (!error) return null;

  const message = error.graphQLErrors?.[0]?.message || error.message;

  const errorMap: Record<string, string> = {
    "Invalid email or password": "Invalid email or password. Please try again.",
    deactivated:
      "Your account has been deactivated. Contact your administrator.",
    "Access denied":
      "Only admin, municipality and ward can access the dashboard.",
    "Account no longer exists": "This account has been removed.",
  };

  for (const [key, value] of Object.entries(errorMap)) {
    if (message.includes(key)) return value;
  }

  return message;
}

// ─── Branding Panel ──────────────────────────────────
function BrandingPanel() {
  return (
    <div className="hidden lg:flex lg:w-1/2 bg-blue-600 relative overflow-hidden">
      <div className="relative z-10 flex flex-col justify-between p-12 text-white w-full">
        {/* Logo */}
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-white/20 flex items-center justify-center">
            <LuShield className="text-xl" />
          </div>
          <span className="text-2xl font-bold tracking-tight">CivicVoice</span>
        </div>

        {/* Tagline */}
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

        {/* Footer */}
        <p className="text-sm text-blue-200">
          © {new Date().getFullYear()} CivicVoice. Government Dashboard.
        </p>
      </div>

      {/* Background circles */}
      <div className="absolute inset-0">
        <div className="absolute -top-24 -right-24 w-96 h-96 rounded-full bg-blue-500/30" />
        <div className="absolute -bottom-32 -left-32 w-[500px] h-[500px] rounded-full bg-blue-700/30" />
        <div className="absolute top-1/2 right-12 w-64 h-64 rounded-full bg-blue-400/10" />
      </div>
    </div>
  );
}

// ─── Mobile Logo ─────────────────────────────────────
function MobileLogo() {
  return (
    <div className="lg:hidden flex items-center gap-3 justify-center">
      <div className="h-10 w-10 rounded-xl bg-blue-600 flex items-center justify-center">
        <LuShield className="text-xl text-white" />
      </div>
      <span className="text-2xl font-bold text-gray-900 tracking-tight">
        CivicVoice
      </span>
    </div>
  );
}

// ─── Error Alert ─────────────────────────────────────
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

// ─── Login Form ──────────────────────────────────────
function LoginForm() {
  const router = useRouter();
  const { setAuth } = useAuthStore();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errors, setErrors] = useState<LoginFormErrors>({});

  const [login, { loading, error: serverError }] = useMutation<
    LoginMutationData,
    LoginMutationVariables
  >(LOGIN_MUTATION, {
    onCompleted: (data) => {
      const { token, user } = data.login;

      setAuth(
        {
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
          ward_id: user.ward_id,
          municipality_id: user.municipality_id,
          must_change_password: user.must_change_password,
          ward: user.ward
            ? {
                id: user.ward.id,
                name: user.ward.name,
                ward_code: user.ward.ward_code,
              }
            : null,
        },
        token,
      );

      if (user.must_change_password) {
        router.push("/change-password");
      } else {
        router.push("/dashboard");
      }
    },
  });

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

    try {
      await login({
        variables: {
          email: email.toLowerCase().trim(),
          password,
        },
      });
    } catch {
      // Apollo captures the error in serverError state
    }
  }

  const errorMessage = parseServerError(serverError);

  return (
    <div className="w-full max-w-md space-y-8">
      <MobileLogo />

      {/* Header */}
      <div className="text-center lg:text-left">
        <h2 className="text-2xl font-bold text-gray-900">
          Sign in to Dashboard
        </h2>
        <p className="mt-2 text-sm text-gray-600">
          Enter your credentials to access the ward management dashboard.
        </p>
      </div>

      {/* Server error */}
      {errorMessage && <ErrorAlert message={errorMessage} />}

      {/* Form */}
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
          isLoading={loading}
          rightIcon={<LuArrowRight />}
        >
          {loading ? "Signing in..." : "Sign In"}
        </Button>
      </form>

      {/* Footer */}
      <p className="text-center text-xs text-gray-400 pt-4">
        This dashboard is restricted to authorized ward staff only.
        <br />
        Contact your administrator if you need access.
      </p>
    </div>
  );
}

// ─── Main Export ─────────────────────────────────────
export default function Login() {
  return (
    <div className="min-h-screen bg-gray-50 flex">
      <BrandingPanel />

      <div className="w-full lg:w-1/2 flex items-center justify-center p-6 sm:p-12">
        <LoginForm />
      </div>
    </div>
  );
}
