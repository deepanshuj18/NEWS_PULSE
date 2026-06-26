"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import TimelineChart from "@/components/TimelineChart";
import ClusterDetail from "@/components/ClusterDetail";
import SourceFilter from "@/components/SourceFilter";
import RefreshButton from "@/components/RefreshButton";
import VolumeChart from "@/components/VolumeChart";
import ThemeToggle from "@/components/ThemeToggle";
import ViewToggle from "@/components/ViewToggle";
import StoryGroupFeed from "@/components/StoryGroupFeed";
import { getTimeline, getClusterDetail, getStoryGroups } from "@/lib/api";
import type {
  TimelineItem,
  ClusterDetail as ClusterDetailType,
  StoryGroup,
  StoryGroupsResponse,
} from "@/lib/types";

type ViewMode = "top-stories" | "live-timeline";

// Shape of the selected item in the drawer
type SelectedItem =
  | { type: "story"; data: StoryGroup }
  | { type: "cluster"; id: number; detail: ClusterDetailType | null };

export default function Home() {
  // ── Timeline / source state (Live Timeline mode) ─────────────────────────
  const [timelineItems, setTimelineItems] = useState<TimelineItem[]>([]);
  const [allSources, setAllSources] = useState<string[]>([]);
  const [activeSources, setActiveSources] = useState<string[]>([]);
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // ── Story Groups state (Top Stories mode) ────────────────────────────────
  const [storyGroupsData, setStoryGroupsData] = useState<StoryGroupsResponse>({
    storyGroups: [],
    standaloneItems: [],
  });
  const [isSgLoading, setIsSgLoading] = useState(true);

  // ── Shared view state ────────────────────────────────────────────────────
  const [viewMode, setViewMode] = useState<ViewMode>("top-stories");
  const [selectedItem, setSelectedItem] = useState<SelectedItem | null>(null);
  const [isDetailLoading, setIsDetailLoading] = useState(false);

  // ── Derived: drawer is open when something is selected ──────────────────
  const drawerOpen = selectedItem !== null;

  // ── Derived: cluster detail and story group for ClusterDetail component ──
  const openCluster =
    selectedItem?.type === "cluster" ? selectedItem.detail : null;
  const openStoryGroup =
    selectedItem?.type === "story" ? selectedItem.data : null;

  // ── Fetch timeline data ───────────────────────────────────────────────────
  const fetchTimelineData = useCallback(async () => {
    try {
      const data = await getTimeline();
      setTimelineItems(data.items);
      setLastUpdated(data.lastUpdated);

      const sources = new Set<string>();
      data.items.forEach((item) => item.sources.forEach((s) => sources.add(s)));
      const sourceList = Array.from(sources).sort();
      setAllSources(sourceList);
      setActiveSources((prev) => (prev.length > 0 ? prev : sourceList));
    } catch (error) {
      console.error("Failed to fetch timeline:", error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // ── Fetch story groups ────────────────────────────────────────────────────
  const fetchStoryGroups = useCallback(async () => {
    try {
      const data = await getStoryGroups();
      setStoryGroupsData(data);
    } catch (error) {
      console.error("Failed to fetch story groups:", error);
    } finally {
      setIsSgLoading(false);
    }
  }, []);

  // ── Refresh both data sources ─────────────────────────────────────────────
  const handleRefresh = useCallback(async () => {
    setIsLoading(true);
    setIsSgLoading(true);
    await Promise.all([fetchTimelineData(), fetchStoryGroups()]);
  }, [fetchTimelineData, fetchStoryGroups]);

  // ── Initial load ──────────────────────────────────────────────────────────
  useEffect(() => {
    fetchTimelineData();
    fetchStoryGroups();
  }, [fetchTimelineData, fetchStoryGroups]);

  // ── Click handlers ────────────────────────────────────────────────────────
  const handleStoryGroupClick = (sg: StoryGroup) => {
    setSelectedItem({ type: "story", data: sg });
  };

  const handleClusterClick = async (clusterId: number) => {
    setSelectedItem({ type: "cluster", id: clusterId, detail: null });
    setIsDetailLoading(true);
    try {
      const data = await getClusterDetail(clusterId);
      setSelectedItem({ type: "cluster", id: clusterId, detail: data });
    } catch (error) {
      setSelectedItem(null);
      if (error instanceof Error && error.message.toLowerCase().includes("not found")) {
        console.warn(`Cluster ${clusterId} not found (likely removed by a new pipeline run). Refreshing...`);
        alert("This topic is no longer available. Refreshing...");
        handleRefresh();
      } else {
        console.error("Failed to fetch cluster details:", error);
      }
    } finally {
      setIsDetailLoading(false);
    }
  };

  const handleCloseDetail = () => {
    setSelectedItem(null);
  };

  const handleToggleSource = (source: string) => {
    setActiveSources((prev) =>
      prev.includes(source) ? prev.filter((s) => s !== source) : [...prev, source]
    );
  };

  // ── Filtered timeline items for source filter ─────────────────────────────
  const filteredItems = useMemo(
    () =>
      timelineItems.filter((item) =>
        item.sources.some((source) => activeSources.includes(source))
      ),
    [timelineItems, activeSources]
  );

  // ── Derived selected ID for StoryGroupFeed highlighting ──────────────────
  const feedSelectedId = useMemo(() => {
    if (!selectedItem) return null;
    if (selectedItem.type === "story") return { type: "story" as const, id: selectedItem.data.id };
    return { type: "cluster" as const, id: selectedItem.id };
  }, [selectedItem]);

  // ── The cluster ID selected in timeline (for TimelineChart highlighting) ──
  const selectedClusterId =
    selectedItem?.type === "cluster" ? selectedItem.id : null;

  return (
    <div className="flex w-full min-h-screen relative overflow-hidden bg-transparent">
      {/* Left area (Nav + Main Content) */}
      <div
        className="flex flex-col flex-grow relative w-full h-screen overflow-y-auto transition-all duration-300"
        style={{
          marginRight: drawerOpen
            ? typeof window !== "undefined" && window.innerWidth >= 768
              ? "420px"
              : "0"
            : "0",
        }}
      >
        {/* Top Navigation Bar */}
        <nav className="glass-panel sticky top-0 z-40 border-b border-slate-200 dark:border-white/5 px-6 py-4 w-full backdrop-blur-xl bg-white/60 dark:bg-[#0B0E14]/80">
          <div className="max-w-7xl mx-auto flex flex-col gap-4 sm:flex-row sm:justify-between sm:items-center w-full">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center font-bold text-white shadow-lg shadow-indigo-500/20">
                NP
              </div>
              <h1 className="text-xl font-bold tracking-tight text-slate-900 dark:text-white">
                News Pulse
              </h1>
            </div>
            <div className="flex items-center gap-3 self-end sm:self-auto">
              {lastUpdated && (
                <span className="text-xs text-slate-500 dark:text-slate-400 font-medium hidden sm:block">
                  Updated: {new Date(lastUpdated).toLocaleTimeString()}
                </span>
              )}
              <RefreshButton onComplete={handleRefresh} />
              <ThemeToggle />
            </div>
          </div>
        </nav>

        <main className="flex-grow relative w-full flex justify-center">
          <div className="w-full max-w-7xl p-6 flex flex-col gap-8 pb-20">
            {/* Header */}
            <section>
              <h2 className="text-3xl font-semibold mb-2 text-slate-900 dark:text-white">
                Trending Events
              </h2>
              <p className="text-slate-500 dark:text-slate-400 text-sm max-w-2xl leading-relaxed">
                Track how global stories unfold in real-time. We automatically group related
                coverage across top publishers so you can see the full picture at a glance.
              </p>
            </section>

            {/* Source filter */}
            <section className="glass-panel rounded-2xl p-4">
              <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
                <span className="text-sm font-semibold text-slate-600 dark:text-slate-300 uppercase tracking-wider">
                  Sources
                </span>
                <SourceFilter
                  allSources={allSources}
                  activeSources={activeSources}
                  onToggleSource={handleToggleSource}
                />
              </div>
            </section>

            {/* View Toggle + feed header */}
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-slate-700 dark:text-slate-300">
                Latest Feed
              </h2>
              <ViewToggle value={viewMode} onChange={setViewMode} />
            </div>

            {/* Volume chart — only in Live Timeline mode */}
            {viewMode === "live-timeline" && !isLoading && (
              <VolumeChart items={filteredItems} />
            )}

            {/* Main Content section */}
            <section className="flex flex-col gap-6">
              {viewMode === "live-timeline" ? (
                /* ── Live Timeline ──────────────────────────────────────── */
                isLoading ? (
                  <div className="flex flex-col gap-4 animate-pulse">
                    {[
                      { w: "60%", ml: "10%" },
                      { w: "45%", ml: "5%" },
                      { w: "75%", ml: "15%" },
                      { w: "30%", ml: "0%" },
                      { w: "50%", ml: "20%" },
                    ].map((skel, i) => (
                      <div
                        key={i}
                        className="glass-bar dark:!border-transparent dark:!shadow-none dark:!backdrop-blur-none rounded-xl p-4 bg-white/40 dark:bg-transparent"
                      >
                        <div className="flex justify-between items-center mb-4">
                          <div className="h-5 bg-slate-300/50 dark:bg-white/10 rounded-md w-1/3" />
                          <div className="h-4 bg-slate-200/50 dark:bg-white/5 rounded-md w-1/4" />
                        </div>
                        <div className="h-3 bg-slate-200/50 dark:bg-white/5 rounded-md w-1/4 mb-4" />
                        <div className="timeline-track w-full mt-2">
                          <div
                            className="h-full bg-slate-300/50 dark:bg-white/10 rounded-xl"
                            style={{ width: skel.w, marginLeft: skel.ml }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <TimelineChart
                    items={filteredItems}
                    onClusterClick={handleClusterClick}
                    selectedClusterId={selectedClusterId}
                  />
                )
              ) : (
                /* ── Top Stories ─────────────────────────────────────────── */
                isSgLoading ? (
                  <div className="flex flex-col gap-3 animate-pulse">
                    {[80, 65, 55, 70, 50].map((w, i) => (
                      <div
                        key={i}
                        className="glass-bar dark:!border-transparent rounded-2xl p-5 bg-white/40 dark:bg-transparent"
                      >
                        <div className="flex justify-between items-start gap-4">
                          <div className="flex-1">
                            <div className="h-3 w-24 bg-indigo-200/50 dark:bg-indigo-500/10 rounded-full mb-3" />
                            <div
                              className="h-5 bg-slate-300/50 dark:bg-white/10 rounded-md mb-2"
                              style={{ width: `${w}%` }}
                            />
                            <div className="h-3 bg-slate-200/50 dark:bg-white/5 rounded-md w-1/3" />
                          </div>
                          <div className="w-24 h-9 bg-indigo-100/50 dark:bg-indigo-500/10 rounded-xl" />
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <StoryGroupFeed
                    storyGroups={storyGroupsData.storyGroups}
                    standaloneItems={storyGroupsData.standaloneItems}
                    onStoryGroupClick={handleStoryGroupClick}
                    onClusterClick={handleClusterClick}
                    selectedId={feedSelectedId}
                  />
                )
              )}
            </section>
          </div>
        </main>
      </div>

      {/* Slide-out Drawer */}
      <ClusterDetail
        cluster={openCluster}
        storyGroup={openStoryGroup}
        isLoading={isDetailLoading}
        onClose={handleCloseDetail}
        isOpen={drawerOpen}
      />
    </div>
  );
}
