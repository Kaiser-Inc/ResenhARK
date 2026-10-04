import { RoomGate } from "@/components/room/room-gate";

export default async function RoomPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  return <RoomGate code={code.toUpperCase()} />;
}
