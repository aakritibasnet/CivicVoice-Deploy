"use client";

interface OfficerMetricsProps {
  totalVisible: number;
  manageableCount: number;
  readOnlyCount: number;
  departmentCount: number;
}

const cardStyles = [
  "rounded-[28px] border p-5 shadow-sm",
  "bg-white/90 backdrop-blur",
].join(" ");

export function OfficerMetrics({
  totalVisible,
  manageableCount,
  readOnlyCount,
  departmentCount,
}: OfficerMetricsProps) {
  const items = [
    {
      label: "Visible officers",
      value: totalVisible,
      tone: "from-sky-50 to-white border-sky-100",
    },
    {
      label: "Editable within scope",
      value: manageableCount,
      tone: "from-emerald-50 to-white border-emerald-100",
    },
    {
      label: "Read only outside scope",
      value: readOnlyCount,
      tone: "from-amber-50 to-white border-amber-100",
    },
    {
      label: "Departments connected",
      value: departmentCount,
      tone: "from-slate-50 to-white border-slate-200",
    },
  ];

  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
      {items.map((item) => (
        <div
          key={item.label}
          className={`${cardStyles} bg-gradient-to-br ${item.tone}`}
        >
          <p className="text-sm font-medium text-slate-500">{item.label}</p>
          <p className="mt-3 text-3xl font-semibold tracking-tight text-slate-900">
            {item.value}
          </p>
        </div>
      ))}
    </div>
  );
}
