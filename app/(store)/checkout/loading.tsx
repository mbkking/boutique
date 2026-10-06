import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div aria-busy="true" className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-8 sm:px-6 lg:flex-row">
      <div className="flex-1">
        <Skeleton className="h-96 w-full" />
      </div>
      <div className="lg:w-96">
        <Skeleton className="h-72 w-full" />
      </div>
    </div>
  );
}