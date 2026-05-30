import KanbanBoard from "@/src/components/kanban/KanbanBoard";

export default function KanbanPage() {
  return (
    <div className="h-[calc(100vh-(--spacing(16))-(--spacing(12)))]">
      <KanbanBoard />
    </div>
  );
}
