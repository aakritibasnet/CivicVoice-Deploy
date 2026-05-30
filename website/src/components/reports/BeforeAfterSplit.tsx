"use client";

interface BeforeAfterSplitProps {
  beforeImageUrl: string | null;
  afterImageUrl: string;
  title: string;
}

function Placeholder({ label }: { label: string }) {
  return (
    <div className="flex h-full min-h-44 items-center justify-center bg-gray-100 text-sm font-medium text-gray-400">
      {label}
    </div>
  );
}

export default function BeforeAfterSplit({
  beforeImageUrl,
  afterImageUrl,
  title,
}: BeforeAfterSplitProps) {
  return (
    <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white">
      <div className="grid grid-cols-2">
        <div className="border-r border-gray-200">
          <div className="border-b border-gray-200 bg-gray-50 px-3 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-gray-500">
            Before
          </div>
          {beforeImageUrl ? (
            <img
              src={beforeImageUrl}
              alt={`${title} before completion`}
              className="h-52 w-full object-cover"
            />
          ) : (
            <Placeholder label="No before image" />
          )}
        </div>

        <div>
          <div className="border-b border-gray-200 bg-emerald-50 px-3 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-emerald-700">
            After
          </div>
          <img
            src={afterImageUrl}
            alt={`${title} after completion`}
            className="h-52 w-full object-cover"
          />
        </div>
      </div>
    </div>
  );
}
