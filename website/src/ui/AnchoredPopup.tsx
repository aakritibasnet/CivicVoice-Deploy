"use client";

import React, { useEffect, useRef, useState } from "react";

interface AnchoredPopupProps {
  isOpen: boolean;
  onClose: () => void;
  anchorEl: HTMLElement | null;
  children: React.ReactNode;
  placement?: "bottom-left" | "bottom-right" | "top-left" | "top-right";
  offset?: { x: number; y: number };
}

export default function AnchoredPopup({
  isOpen,
  onClose,
  anchorEl,
  children,
  placement = "bottom-right",
  offset = { x: 0, y: 8 },
}: AnchoredPopupProps) {
  const popupRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({ top: 0, left: 0 });

  // Calculate position based on anchor element
  useEffect(() => {
    if (!isOpen || !anchorEl || !popupRef.current) return;

    const updatePosition = () => {
      const anchorRect = anchorEl.getBoundingClientRect();
      const popupRect = popupRef.current!.getBoundingClientRect();

      let top = 0;
      let left = 0;

      switch (placement) {
        case "bottom-right":
          top = anchorRect.bottom + offset.y;
          left = anchorRect.right - popupRect.width + offset.x;
          break;
        case "bottom-left":
          top = anchorRect.bottom + offset.y;
          left = anchorRect.left + offset.x;
          break;
        case "top-right":
          top = anchorRect.top - popupRect.height - offset.y;
          left = anchorRect.right - popupRect.width + offset.x;
          break;
        case "top-left":
          top = anchorRect.top - popupRect.height - offset.y;
          left = anchorRect.left + offset.x;
          break;
      }

      // Keep within viewport
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;

      if (left + popupRect.width > viewportWidth) {
        left = viewportWidth - popupRect.width - 8;
      }
      if (left < 8) left = 8;

      if (top + popupRect.height > viewportHeight) {
        top = viewportHeight - popupRect.height - 8;
      }
      if (top < 8) top = 8;

      setPosition({ top, left });
    };

    updatePosition();
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);

    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [isOpen, anchorEl, placement, offset]);

  // Close on click outside
  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (event: MouseEvent) => {
      if (
        popupRef.current &&
        !popupRef.current.contains(event.target as Node) &&
        anchorEl &&
        !anchorEl.contains(event.target as Node)
      ) {
        onClose();
      }
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleEscape);

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [isOpen, onClose, anchorEl]);

  if (!isOpen) return null;

  return (
    <div
      ref={popupRef}
      className="fixed z-50 bg-white rounded-lg shadow-lg border border-gray-200 min-w-[200px] animate-in fade-in zoom-in-95 duration-200"
      style={{
        top: `${position.top}px`,
        left: `${position.left}px`,
      }}
    >
      {children}
    </div>
  );
}
