"use client";

import { useEffect, useState } from "react";
import { LuImagePlus, LuLoaderCircle, LuX } from "react-icons/lu";
import { Modal } from "@/src/ui/Modal";
import { Button } from "@/src/ui/Button";
import { uploadReportImage } from "@/src/features/report-posts/uploads";

interface TaskCompletionDialogProps {
  isOpen: boolean;
  title: string;
  descriptionText: string;
  submitLabel: string;
  initialDescription?: string | null;
  initialImageUrl?: string | null;
  taskTitle?: string | null;
  onClose: () => void;
  onSubmit: (input: { afterImageUrl: string; description: string | null }) => Promise<void>;
}

export default function TaskCompletionDialog({
  isOpen,
  title,
  descriptionText,
  submitLabel,
  initialDescription = null,
  initialImageUrl = null,
  taskTitle = null,
  onClose,
  onSubmit,
}: TaskCompletionDialogProps) {
  const [description, setDescription] = useState(initialDescription ?? "");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(initialImageUrl);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    setDescription(initialDescription ?? "");
    setSelectedFile(null);
    setError(null);
    setIsSubmitting(false);
    setPreviewUrl(initialImageUrl);
  }, [initialDescription, initialImageUrl, isOpen]);

  useEffect(() => {
    if (!selectedFile) {
      setPreviewUrl(initialImageUrl);
      return;
    }

    const objectUrl = URL.createObjectURL(selectedFile);
    setPreviewUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [initialImageUrl, selectedFile]);

  const handleSubmit = async () => {
    if (!selectedFile && !initialImageUrl) {
      setError("A completion image is required.");
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      const afterImageUrl = selectedFile
        ? await uploadReportImage(selectedFile)
        : initialImageUrl;

      if (!afterImageUrl) {
        throw new Error("A completion image is required.");
      }

      await onSubmit({
        afterImageUrl,
        description: description.trim() || null,
      });
      onClose();
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : "Failed to submit completion details",
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={isSubmitting ? () => {} : onClose} size="lg">
      <div className="space-y-5">
        <div className="space-y-1">
          <h3 className="text-xl font-semibold text-gray-900">{title}</h3>
          <p className="text-sm text-gray-500">{descriptionText}</p>
        </div>

        {taskTitle ? (
          <div className="rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-700">
            <span className="font-semibold text-gray-900">{taskTitle}</span>
          </div>
        ) : null}

        <div className="space-y-2">
          <label className="block text-sm font-medium text-gray-700">
            Completion image <span className="text-red-500">*</span>
          </label>

          <label className="flex cursor-pointer flex-col items-center justify-center rounded-2xl border border-dashed border-gray-300 bg-gray-50 px-4 py-6 text-center transition-colors hover:border-sky-300 hover:bg-sky-50">
            <LuImagePlus className="mb-2 text-2xl text-sky-600" />
            <span className="text-sm font-medium text-gray-900">
              {selectedFile ? selectedFile.name : "Upload completion image"}
            </span>
            <span className="mt-1 text-xs text-gray-500">
              PNG, JPG, or WEBP up to 5MB
            </span>
            <input
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(event) => {
                setError(null);
                setSelectedFile(event.target.files?.[0] ?? null);
              }}
            />
          </label>

          {previewUrl ? (
            <div className="relative overflow-hidden rounded-2xl border border-gray-200">
              <img
                src={previewUrl}
                alt="Completion preview"
                className="h-64 w-full object-cover"
              />
              {selectedFile ? (
                <button
                  type="button"
                  onClick={() => setSelectedFile(null)}
                  className="absolute right-3 top-3 rounded-full bg-black/60 p-2 text-white"
                >
                  <LuX />
                </button>
              ) : null}
            </div>
          ) : null}
        </div>

        <div className="space-y-2">
          <label className="block text-sm font-medium text-gray-700">
            Description <span className="text-gray-400">(optional)</span>
          </label>
          <textarea
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            rows={5}
            placeholder="Add a public completion note. If left empty, the original task description will be used."
            className="w-full rounded-2xl border border-gray-300 px-4 py-3 text-sm text-gray-900 outline-none transition-colors focus:border-sky-500 focus:ring-2 focus:ring-sky-100"
          />
        </div>

        {error ? (
          <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        ) : null}

        <div className="flex items-center justify-end gap-3 border-t border-gray-100 pt-4">
          <Button variant="outline" onClick={onClose} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button onClick={() => void handleSubmit()} disabled={isSubmitting}>
            {isSubmitting ? <LuLoaderCircle className="animate-spin" /> : null}
            {isSubmitting ? "Uploading..." : submitLabel}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
