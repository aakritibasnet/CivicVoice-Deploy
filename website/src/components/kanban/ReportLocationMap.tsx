"use client";

import React, { useMemo, useState } from "react";
import { LuExpand, LuMapPinned } from "react-icons/lu";
import { Modal } from "@/src/ui/Modal";

interface ReportLocationMapProps {
  latitude: number | null;
  longitude: number | null;
  address: string | null;
}

function buildMapUrl(
  latitude: number | null,
  longitude: number | null,
  address: string | null,
) {
  if (latitude !== null && longitude !== null) {
    return `https://www.google.com/maps?q=${latitude},${longitude}&z=16&output=embed`;
  }

  if (address) {
    return `https://www.google.com/maps?q=${encodeURIComponent(address)}&z=15&output=embed`;
  }

  return null;
}

export default function ReportLocationMap({
  latitude,
  longitude,
  address,
}: ReportLocationMapProps) {
  const [isFullscreen, setIsFullscreen] = useState(false);
  const mapUrl = useMemo(
    () => buildMapUrl(latitude, longitude, address),
    [latitude, longitude, address],
  );

  if (!mapUrl) {
    return (
      <div className="rounded-xl border border-dashed border-gray-300 bg-gray-50 p-4 text-sm text-gray-500">
        No map preview is available for this report location.
      </div>
    );
  }

  const mapFrame = (
    <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
      <div className="flex items-center justify-between border-b border-gray-100 px-3 py-2">
        <div className="flex items-center gap-2 text-sm font-medium text-gray-700">
          <LuMapPinned className="text-base text-blue-600" />
          Location Map
        </div>
        <button
          type="button"
          onClick={() => setIsFullscreen(true)}
          className="inline-flex items-center gap-1 rounded-lg border border-gray-200 px-2.5 py-1.5 text-xs font-medium text-gray-600 transition-colors hover:bg-gray-50"
        >
          <LuExpand className="text-sm" />
          Fullscreen
        </button>
      </div>
      <iframe
        title="Report location map"
        src={mapUrl}
        loading="lazy"
        className="h-64 w-full border-0"
        referrerPolicy="no-referrer-when-downgrade"
      />
    </div>
  );

  return (
    <>
      {mapFrame}
      <Modal isOpen={isFullscreen} onClose={() => setIsFullscreen(false)} size="xl">
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold text-gray-900">Location Map</h3>
            <button
              type="button"
              onClick={() => setIsFullscreen(false)}
              className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm text-gray-600 transition-colors hover:bg-gray-50"
            >
              Close
            </button>
          </div>
          <iframe
            title="Fullscreen report location map"
            src={mapUrl}
            loading="lazy"
            className="h-[70vh] w-full rounded-xl border-0"
            referrerPolicy="no-referrer-when-downgrade"
          />
        </div>
      </Modal>
    </>
  );
}
