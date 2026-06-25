"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import TimelineChart from "@/components/TimelineChart";
import ClusterDetail from "@/components/ClusterDetail";
import SourceFilter from "@/components/SourceFilter";
import RefreshButton from "@/components/RefreshButton";
import VolumeChart from "@/components/VolumeChart";
import ThemeToggle from "@/components/ThemeToggle";
import { getTimeline, getClusterDetail } from "@/lib/api";
import type { TimelineItem, ClusterDetail as ClusterDetailType } from "@/lib/types";

export default function Home() {
  const [timelineItems, setTimelineItems] = useState<TimelineItem[]>([]);
  const [allSources, setAllSources] = useState<string[]>([]);
  const [activeSources, setActiveSources] = useState<string[]>([]);
  const [selectedClusterId, setSelectedClusterId] = useState<number | null>(null);
  const [clusterDetail, setClusterDetail] = useState<ClusterDetailType | null>(null);
  const [isDetailLoading, setIsDetailLoading] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Fetch timeline data
  const fetchTimelineData = useCallback(async () => {
    try {
      // Don't filter at the API level so we can get all sources initially
      const data = await getTimeline();
      setTimelineItems(data.items);
      setLastUpdated(data.lastUpdated);
      
      // Extract unique sources
      const sources = new Set<string>();
      data.items.forEach(item => item.sources.forEach(s => sources.add(s)));
      const sourceList = Array.from(sources).sort();
      setAllSources(sourceList);
      
      // Initially, all sources are active if none selected yet
      setActiveSources(prev => prev.length > 0 ? prev : sourceList);
    } catch (error) {
      console.error("Failed to fetch timeline:", error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Initial load
  useEffect(() => {
    fetchTimelineData();
  }, [fetchTimelineData]);

  // Handle cluster click
  const handleClusterClick = async (clusterId: number) => {
    setSelectedClusterId(clusterId);
    setIsDetailLoading(true);
    setClusterDetail(null);
    try {
      const data = await getClusterDetail(clusterId);
      setClusterDetail(data);
    } catch (error) {
      console.error("Failed to fetch cluster details:", error);
      setSelectedClusterId(null); // Close the loading panel
      
      // If the cluster was deleted (e.g., by a background scraper run), auto-refresh the timeline
      if (error instanceof Error && error.message.toLowerCase().includes("not found")) {
        alert("This topic is no longer available. Refreshing the timeline with the latest news...");
        fetchTimelineData();
      }
    } finally {
      setIsDetailLoading(false);
    }
  };

  const handleCloseDetail = () => {
    setSelectedClusterId(null);
    setClusterDetail(null);
  };

  const handleToggleSource = (source: string) => {
    setActiveSources(prev => 
      prev.includes(source) 
        ? prev.filter(s => s !== source)
        : [...prev, source]
    );
  };

  // Filter items based on active sources
  const filteredItems = useMemo(() => {
    return timelineItems.filter(item => 
      item.sources.some(source => activeSources.includes(source))
    );
  }, [timelineItems, activeSources]);

  return (
    <div className="flex w-full min-h-screen relative overflow-hidden bg-transparent">
      {/* Left Area (Nav + Main Content) */}
      <div 
        className="flex flex-col flex-grow relative w-full h-screen overflow-y-auto transition-all duration-300"
        style={{ marginRight: selectedClusterId ? (typeof window !== 'undefined' && window.innerWidth >= 768 ? '400px' : '0') : '0' }}
      >
        {/* Top Navigation Bar */}
        <nav className="glass-panel sticky top-0 z-40 border-b border-slate-200 dark:border-white/5 px-6 py-4 w-full backdrop-blur-xl bg-white/60 dark:bg-[#0B0E14]/80">
          <div className="max-w-7xl mx-auto flex justify-between items-center w-full">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center font-bold text-white shadow-lg shadow-indigo-500/20">
                NP
              </div>
              <h1 className="text-xl font-bold tracking-tight text-slate-900 dark:text-white">News Pulse</h1>
            </div>
            <div className="flex items-center gap-4">
              {lastUpdated && (
                <span className="text-xs text-slate-500 dark:text-slate-400 font-medium hidden sm:block">
                  Updated: {new Date(lastUpdated).toLocaleTimeString()}
                </span>
              )}
              <RefreshButton onComplete={fetchTimelineData} />
              <ThemeToggle />
            </div>
          </div>
        </nav>

        <main className="flex-grow relative w-full flex justify-center">
          {/* Main Content Area */}
          <div className="w-full max-w-7xl p-6 flex flex-col gap-8 pb-20">
            {/* Header Section */}
            <section>
              <h2 className="text-3xl font-semibold mb-2 text-slate-900 dark:text-white">Trending Events</h2>
              <p className="text-slate-500 dark:text-slate-400 text-sm max-w-2xl leading-relaxed">
                Track how global stories unfold in real-time. We automatically group related coverage across top publishers so you can see the full picture at a glance. Select a timeline to dive deeper.
              </p>
            </section>

            {/* Interactive Filters */}
            <section className="glass-panel rounded-2xl p-4">
              <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
                <span className="text-sm font-semibold text-slate-600 dark:text-slate-300 uppercase tracking-wider">Sources</span>
                <SourceFilter 
                  allSources={allSources} 
                  activeSources={activeSources} 
                  onToggleSource={handleToggleSource} 
                />
              </div>
            </section>

            {/* Chart.js Supplementary Visualization */}
            {!isLoading && <VolumeChart items={filteredItems} />}

            {/* Timeline Section */}
            <section className="flex flex-col gap-6">
              {isLoading ? (
                <div className="flex flex-col gap-4 animate-pulse">
                  {[
                    { w: "60%", ml: "10%" },
                    { w: "45%", ml: "5%" },
                    { w: "75%", ml: "15%" },
                    { w: "30%", ml: "0%" },
                    { w: "50%", ml: "20%" },
                  ].map((skel, i) => (
                    <div key={i} className="glass-bar dark:!border-transparent dark:!shadow-none dark:!backdrop-blur-none rounded-xl p-4 bg-white/40 dark:bg-transparent">
                      <div className="flex justify-between items-center mb-4">
                        <div className="h-5 bg-slate-300/50 dark:bg-white/10 rounded-md w-1/3"></div>
                        <div className="h-4 bg-slate-200/50 dark:bg-white/5 rounded-md w-1/4"></div>
                      </div>
                      <div className="h-3 bg-slate-200/50 dark:bg-white/5 rounded-md w-1/4 mb-4"></div>
                      <div className="timeline-track w-full mt-2">
                        <div 
                          className="h-full bg-slate-300/50 dark:bg-white/10 rounded-xl"
                          style={{ width: skel.w, marginLeft: skel.ml }}
                        ></div>
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
              )}
            </section>
          </div>
        </main>
      </div>

      {/* Slide-out Cluster Detail Panel */}
      <ClusterDetail 
        cluster={clusterDetail} 
        isLoading={isDetailLoading} 
        onClose={handleCloseDetail}
        isOpen={selectedClusterId !== null} 
      />
    </div>
  );
}
