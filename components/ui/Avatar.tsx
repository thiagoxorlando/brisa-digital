"use client";

import { useState } from "react";

type AvatarProps = {
  name: string;
  imageUrl?: string | null;
  size?: "sm" | "md" | "lg" | "xl";
  className?: string;
};

const sizeClasses = {
  sm: "w-8 h-8 text-xs",
  md: "w-10 h-10 text-sm",
  lg: "w-14 h-14 text-base",
  xl: "w-20 h-20 text-xl",
};

function getInitials(name: string) {
  return (name || "?")
    .trim()
    .split(/\s+/)
    .map((n) => n[0])
    .slice(0, 2)
    .join("")
    .toUpperCase() || "?";
}

function getColor(name: string) {
  const colors = [
    "bg-violet-100 text-violet-700",
    "bg-blue-100 text-blue-700",
    "bg-emerald-100 text-emerald-700",
    "bg-amber-100 text-amber-700",
    "bg-rose-100 text-rose-700",
    "bg-indigo-100 text-indigo-700",
  ];
  return colors[(name || "").charCodeAt(0) % colors.length];
}

export default function Avatar({ name, imageUrl, size = "md", className = "" }: AvatarProps) {
  const [imgError, setImgError] = useState(false);

  if (imageUrl && !imgError) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={imageUrl}
        alt={name}
        onError={() => setImgError(true)}
        className={[
          "rounded-full object-cover flex-shrink-0",
          sizeClasses[size],
          className,
        ].join(" ")}
      />
    );
  }

  return (
    <div
      className={[
        "rounded-full flex items-center justify-center font-semibold flex-shrink-0",
        sizeClasses[size],
        getColor(name || ""),
        className,
      ].join(" ")}
    >
      {getInitials(name || "")}
    </div>
  );
}
