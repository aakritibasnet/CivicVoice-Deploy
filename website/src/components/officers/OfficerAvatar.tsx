"use client";

import Image from "next/image";
import { LuImage } from "react-icons/lu";

interface OfficerAvatarProps {
  name: string;
  profileImageUrl: string | null;
  size?: "sm" | "md" | "lg";
}

const sizeStyles = {
  sm: "h-10 w-10 text-sm",
  md: "h-12 w-12 text-base",
  lg: "h-16 w-16 text-lg",
};

const sizePixels = {
  sm: 40,
  md: 48,
  lg: 64,
};

export function OfficerAvatar({
  name,
  profileImageUrl,
  size = "md",
}: OfficerAvatarProps) {
  if (profileImageUrl) {
    return (
      <Image
        src={profileImageUrl}
        alt={name}
        width={sizePixels[size]}
        height={sizePixels[size]}
        unoptimized
        className={`${sizeStyles[size]} rounded-2xl object-cover ring-1 ring-slate-200`}
      />
    );
  }

  const initials = name
    .split(" ")
    .map((part) => part[0] ?? "")
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <div
      className={`${sizeStyles[size]} rounded-2xl bg-gradient-to-br from-sky-500 via-cyan-500 to-emerald-500 text-white shadow-sm flex items-center justify-center font-semibold`}
      aria-label={`${name} avatar`}
    >
      {initials || <LuImage />}
    </div>
  );
}
