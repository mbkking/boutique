import { ProductGridSkeleton } from "@/app/_components/loading-skeletons";

export default function Loading() {
  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-4 py-8 sm:px-6">
      <div aria-busy="true" className="flex flex-col gap-3">
        <div className="h-8 w-1/3 animate-pulse rounded-md bg-surface-alt" />
        <div className="h-4 w-1/2 animate-pulse rounded-md bg-surface-alt" />
      </div>
      <ProductGridSkeleton />
    </div>
  );
}