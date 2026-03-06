import ShareClient from "@/components/ShareClient";

export default async function Page({
  params,
}: {
  params: Promise<{ roomId: string }>;
}) {
  const { roomId } = await params;
  return <ShareClient roomId={roomId} />;
}
