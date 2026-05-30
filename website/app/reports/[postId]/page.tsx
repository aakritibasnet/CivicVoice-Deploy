import ReportDetailPage from "@/src/components/reports/ReportDetailPage";

export default async function ReportPostPage({
  params,
}: {
  params: Promise<{ postId: string }>;
}) {
  const { postId } = await params;
  return <ReportDetailPage postId={postId} />;
}
