import DashboardEntryRedirect from "@/src/components/dashboard/DashboardEntryRedirect";

export default function Home() {
  return <DashboardEntryRedirect unauthenticatedTarget="/auth/login" />;
}
