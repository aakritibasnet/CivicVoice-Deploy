"use client";

import React from "react";
import { LuChevronLeft, LuChevronRight, LuX } from "react-icons/lu";
import { Modal } from "@/src/ui/Modal";

interface ImageLightboxProps {
  images: string[];
  selectedIndex: number;
  isOpen: boolean;
  onClose: () => void;
  onChange: (index: number) => void;
}

export default function ImageLightbox({
  images,
  selectedIndex,
  isOpen,
  onClose,
  onChange,
}: ImageLightboxProps) {
  if (!isOpen || images.length === 0) return null;

  const currentImage = images[selectedIndex] ?? images[0];
  const canNavigate = images.length > 1;

  return (
    <Modal isOpen={isOpen} onClose={onClose} size="xl">
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="text-sm text-gray-500">
            {selectedIndex + 1} / {images.length}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-2 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-700"
          >
            <LuX className="text-lg" />
          </button>
        </div>

        <div className="relative overflow-hidden rounded-2xl bg-gray-950">
          <img
            src={currentImage}
            alt={`Preview ${selectedIndex + 1}`}
            className="max-h-[70vh] w-full object-contain"
          />

          {canNavigate && (
            <>
              <button
                type="button"
                onClick={() =>
                  onChange((selectedIndex - 1 + images.length) % images.length)
                }
                className="absolute left-3 top-1/2 -translate-y-1/2 rounded-full bg-black/60 p-2 text-white transition-colors hover:bg-black/80"
              >
                <LuChevronLeft className="text-xl" />
              </button>
              <button
                type="button"
                onClick={() => onChange((selectedIndex + 1) % images.length)}
                className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full bg-black/60 p-2 text-white transition-colors hover:bg-black/80"
              >
                <LuChevronRight className="text-xl" />
              </button>
            </>
          )}
        </div>

        {canNavigate && (
          <div className="flex gap-2 overflow-x-auto pb-1">
            {images.map((image, index) => (
              <button
                key={`${image}-${index}`}
                type="button"
                onClick={() => onChange(index)}
                className={`h-16 w-16 overflow-hidden rounded-lg border-2 transition-colors ${
                  index === selectedIndex
                    ? "border-blue-500"
                    : "border-transparent"
                }`}
              >
                <img
                  src={image}
                  alt={`Thumbnail ${index + 1}`}
                  className="h-full w-full object-cover"
                />
              </button>
            ))}
          </div>
        )}
      </div>
    </Modal>
  );
}
