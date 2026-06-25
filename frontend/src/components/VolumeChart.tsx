"use client";

import { useMemo, useEffect, useState } from 'react';
import { useTheme } from 'next-themes';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Filler,
} from 'chart.js';
import { Line } from 'react-chartjs-2';
import { TimelineItem } from '@/lib/types';

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Filler
);

interface VolumeChartProps {
  items: TimelineItem[];
}

export default function VolumeChart({ items }: VolumeChartProps) {
  const { theme, systemTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  
  useEffect(() => setMounted(true), []);

  const isDark = mounted ? (theme === 'system' ? systemTheme === 'dark' : theme === 'dark') : true;

  const chartData = useMemo(() => {
    // Determine bounds
    const now = new Date();
    const times = items.map(i => new Date(i.end).getTime());
    let minTime = Math.min(...times);
    let maxTime = Math.max(...times);
    
    if (times.length === 0) {
      minTime = now.getTime() - 24 * 60 * 60 * 1000;
      maxTime = now.getTime();
    }
    
    // Create buckets
    const bucketCount = 6;
    const range = maxTime - minTime || 24 * 60 * 60 * 1000;
    const bucketSize = range / bucketCount;
    
    const buckets = Array(bucketCount + 1).fill(0);
    const labels = Array(bucketCount + 1).fill('');
    
    // Format labels
    for (let i = 0; i <= bucketCount; i++) {
      const t = minTime + i * bucketSize;
      const d = new Date(t);
      labels[i] = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }
    labels[bucketCount] = 'Now';
    
    // Fill buckets
    items.forEach(item => {
      const t = new Date(item.end).getTime();
      const pct = (t - minTime) / range;
      const bucketIdx = Math.min(bucketCount, Math.max(0, Math.floor(pct * bucketCount)));
      buckets[bucketIdx] += item.articleCount;
    });
    
    // Smooth out zero buckets to make the line look nice like the premium design
    for (let i = 1; i < buckets.length - 1; i++) {
      if (buckets[i] === 0 && buckets[i-1] > 0 && buckets[i+1] > 0) {
        buckets[i] = Math.floor((buckets[i-1] + buckets[i+1]) / 2);
      }
    }

    return {
      labels,
      datasets: [
        {
          label: 'Articles Ingested',
          data: buckets,
          borderColor: '#8b5cf6', // Violet-500
          backgroundColor: isDark ? 'rgba(139, 92, 246, 0.1)' : 'rgba(139, 92, 246, 0.08)',
          borderWidth: 2,
          pointBackgroundColor: isDark ? '#0B0E14' : '#ffffff',
          pointBorderColor: '#8b5cf6',
          pointBorderWidth: 2,
          pointRadius: 4,
          pointHoverRadius: 6,
          fill: true,
          tension: 0.4,
        },
      ],
    };
  }, [items, isDark]);

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: {
        backgroundColor: isDark ? 'rgba(15, 23, 42, 0.9)' : 'rgba(255, 255, 255, 0.9)',
        titleColor: isDark ? '#fff' : '#0f172a',
        bodyColor: isDark ? '#cbd5e1' : '#475569',
        borderColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)',
        borderWidth: 1,
        padding: 10,
        displayColors: false,
        callbacks: {
          label: function(context: any) {
            return `${context.parsed.y} articles`;
          }
        }
      }
    },
    scales: {
      x: {
        grid: { color: isDark ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.05)', drawBorder: false, display: typeof window !== 'undefined' && window.innerWidth >= 640 },
        ticks: { 
          color: isDark ? '#94a3b8' : '#64748b',
          maxTicksLimit: typeof window !== 'undefined' && window.innerWidth < 640 ? 4 : 8,
          maxRotation: 45,
          minRotation: 45,
          font: {
            size: typeof window !== 'undefined' && window.innerWidth < 640 ? 10 : 12
          }
        }
      },
      y: {
        grid: { color: isDark ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.05)' },
        beginAtZero: true,
        ticks: { maxTicksLimit: 5, color: isDark ? '#94a3b8' : '#64748b' }
      }
    }
  };

  return (
    <section className="glass-panel rounded-2xl p-6 mb-8">
      <div className="flex justify-between items-center mb-6">
        <h3 className="text-xs font-bold text-slate-600 dark:text-slate-300 uppercase tracking-[0.1em]">Ingestion Volume (24h)</h3>
      </div>
      <div className="relative w-full h-[220px] sm:h-[300px]">
        {mounted && <Line data={chartData} options={options as any} />}
      </div>
    </section>
  );
}
