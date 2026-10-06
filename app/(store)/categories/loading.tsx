import { PageHeaderSkeleton, PanelSkeleton } from "@/app/_components/loading-skeletons";

export default function Loading() {
  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-4 py-8 sm:px-6">
      <PageHeaderSkeleton lines={2} />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <PanelSkeleton rows={6} />
      </div>
    </div>
  );
}