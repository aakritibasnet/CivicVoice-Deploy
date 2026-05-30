"use client";

import React, { useState } from "react";
import { LuEye, LuEyeOff } from "react-icons/lu";

// ─── Types ───────────────────────────────────────────
type InputSize = "sm" | "md" | "lg";

interface InputProps extends Omit<
  React.InputHTMLAttributes<HTMLInputElement>,
  "size"
> {
  label?: string;
  error?: string;
  helperText?: string;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
  inputSize?: InputSize;
  fullWidth?: boolean;
}

// ─── Styles ──────────────────────────────────────────
const baseLabelStyles = "block text-sm font-medium text-gray-700 mb-1.5";

const baseInputStyles =
  "w-full rounded-lg border bg-white text-gray-900 placeholder:text-gray-400 transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-offset-0 disabled:bg-gray-50 disabled:text-gray-500 disabled:cursor-not-allowed";

const stateStyles = {
  default: "border-gray-300 focus:border-blue-500 focus:ring-blue-500/20",
  error: "border-red-400 focus:border-red-500 focus:ring-red-500/20",
};

const sizeStyles: Record<InputSize, string> = {
  sm: "px-3 py-1.5 text-sm",
  md: "px-3.5 py-2.5 text-sm",
  lg: "px-4 py-3 text-base",
};

const iconPaddingLeft: Record<InputSize, string> = {
  sm: "pl-9",
  md: "pl-10",
  lg: "pl-11",
};

const iconPaddingRight: Record<InputSize, string> = {
  sm: "pr-9",
  md: "pr-10",
  lg: "pr-11",
};

const iconContainerStyles =
  "absolute top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none";

const iconContainerLeft: Record<InputSize, string> = {
  sm: "left-2.5 text-sm",
  md: "left-3 text-base",
  lg: "left-3.5 text-lg",
};

const iconContainerRight: Record<InputSize, string> = {
  sm: "right-2.5 text-sm",
  md: "right-3 text-base",
  lg: "right-3.5 text-lg",
};

// ─── Component ───────────────────────────────────────
const Input = React.forwardRef<HTMLInputElement, InputProps>(
  (
    {
      label,
      error,
      helperText,
      leftIcon,
      rightIcon,
      inputSize = "md",
      fullWidth = true,
      type = "text",
      className = "",
      id,
      ...props
    },
    ref,
  ) => {
    const [showPassword, setShowPassword] = useState(false);

    const isPassword = type === "password";
    const inputType = isPassword ? (showPassword ? "text" : "password") : type;

    // Generate a stable ID if not provided
    const inputId = id || `input-${label?.toLowerCase().replace(/\s+/g, "-")}`;

    // Determine right icon — password toggle takes priority
    const effectiveRightIcon = isPassword ? null : rightIcon;
    const hasRightElement = isPassword || !!effectiveRightIcon;

    return (
      <div className={fullWidth ? "w-full" : ""}>
        {/* Label */}
        {label && (
          <label htmlFor={inputId} className={baseLabelStyles}>
            {label}
          </label>
        )}

        {/* Input wrapper */}
        <div className="relative">
          {/* Left icon */}
          {leftIcon && (
            <div
              className={`${iconContainerStyles} ${iconContainerLeft[inputSize]}`}
            >
              {leftIcon}
            </div>
          )}

          {/* Input */}
          <input
            ref={ref}
            id={inputId}
            type={inputType}
            className={`
              ${baseInputStyles}
              ${error ? stateStyles.error : stateStyles.default}
              ${sizeStyles[inputSize]}
              ${leftIcon ? iconPaddingLeft[inputSize] : ""}
              ${hasRightElement ? iconPaddingRight[inputSize] : ""}
              ${className}
            `}
            aria-invalid={!!error}
            aria-describedby={
              error
                ? `${inputId}-error`
                : helperText
                  ? `${inputId}-helper`
                  : undefined
            }
            {...props}
          />

          {/* Right icon or password toggle */}
          {isPassword ? (
            <button
              type="button"
              onClick={() => setShowPassword((prev) => !prev)}
              className={`absolute top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors cursor-pointer focus:outline-none ${iconContainerRight[inputSize]}`}
              tabIndex={-1}
              aria-label={showPassword ? "Hide password" : "Show password"}
            >
              {showPassword ? <LuEyeOff /> : <LuEye />}
            </button>
          ) : effectiveRightIcon ? (
            <div
              className={`${iconContainerStyles} ${iconContainerRight[inputSize]}`}
            >
              {effectiveRightIcon}
            </div>
          ) : null}
        </div>

        {/* Error message */}
        {error && (
          <p
            id={`${inputId}-error`}
            className="mt-1.5 text-sm text-red-600 flex items-center gap-1"
            role="alert"
          >
            {error}
          </p>
        )}

        {/* Helper text */}
        {!error && helperText && (
          <p id={`${inputId}-helper`} className="mt-1.5 text-sm text-gray-500">
            {helperText}
          </p>
        )}
      </div>
    );
  },
);

Input.displayName = "Input";
export { Input };
export type { InputProps, InputSize };
