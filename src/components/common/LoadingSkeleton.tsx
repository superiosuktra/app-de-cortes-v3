import React from 'react';

export const TabLoadingSkeleton: React.FC = () => {
  return (
    <div className="space-y-6 max-w-5xl mx-auto animate-pulse p-4">
      {/* Top Banner Skeleton */}
      <div className="h-32 rounded-3xl bg-zinc-800/50 border border-zinc-700/30 flex flex-col justify-center px-8 space-y-3">
        <div className="w-40 h-4 bg-zinc-700/60 rounded-full" />
        <div className="w-72 h-7 bg-zinc-700/80 rounded-xl" />
        <div className="w-96 h-3.5 bg-zinc-700/40 rounded-full" />
      </div>

      {/* Cards Grid Skeleton */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {[1, 2, 3, 4].map((i) => (
          <div
            key={i}
            className="p-6 rounded-3xl bg-[#141520]/80 border border-zinc-800/80 space-y-4"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-zinc-800/80" />
                <div className="space-y-1.5">
                  <div className="w-32 h-4 bg-zinc-700/60 rounded-md" />
                  <div className="w-20 h-3 bg-zinc-800/60 rounded-md" />
                </div>
              </div>
              <div className="w-16 h-6 rounded-full bg-zinc-800/80" />
            </div>
            <div className="w-full h-10 rounded-xl bg-zinc-800/50" />
            <div className="flex gap-2">
              <div className="flex-1 h-8 rounded-xl bg-zinc-800/40" />
              <div className="w-24 h-8 rounded-xl bg-zinc-800/60" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export const CutsListSkeleton: React.FC<{ count?: number }> = ({ count = 3 }) => {
  return (
    <div className="space-y-4 animate-pulse">
      {Array.from({ length: count }).map((_, idx) => (
        <div
          key={idx}
          className="p-4 rounded-2xl bg-[#12131c] border border-zinc-800/80 flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between"
        >
          <div className="flex items-center gap-3 w-full sm:w-auto">
            {/* 9:16 aspect preview skeleton */}
            <div className="w-16 h-28 sm:w-20 sm:h-32 rounded-xl bg-zinc-800/80 shrink-0" />
            <div className="space-y-2 flex-1">
              <div className="flex items-center gap-2">
                <div className="w-20 h-5 rounded-md bg-purple-900/40" />
                <div className="w-12 h-5 rounded-md bg-zinc-800" />
              </div>
              <div className="w-48 sm:w-64 h-4 rounded bg-zinc-700/60" />
              <div className="w-36 h-3 rounded bg-zinc-800" />
              <div className="w-28 h-3 rounded bg-zinc-800/60" />
            </div>
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
            <div className="w-24 h-9 rounded-xl bg-zinc-800/80" />
            <div className="w-28 h-9 rounded-xl bg-purple-950/60" />
          </div>
        </div>
      ))}
    </div>
  );
};
