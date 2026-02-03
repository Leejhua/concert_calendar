'use client';

import React, { useEffect, useState, useMemo } from 'react';
import { Concert } from '@/lib/damai-crawler';
import { ConcertCalendar } from '@/components/ConcertCalendar';
import { CalendarEvent } from '@/lib/types';
import { transformConcertsToEvents } from '@/lib/data-transformer';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";
import { Loader2, Search, PanelLeft, MapPin, User, X } from 'lucide-react';

export function DashboardClient() {
  const [concerts, setConcerts] = useState<Concert[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedCity, setSelectedCity] = useState<string | null>(null);
  const [selectedArtist, setSelectedArtist] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [filterMode, setFilterMode] = useState<'city' | 'artist'>('city');

  // 初始加载所有数据
  useEffect(() => {
    async function fetchData() {
      try {
        // 获取足够多的数据以填充日历 (比如 500 条)
        // 实际生产环境可能需要按月加载，但 demo 阶段一次性拉取更简单
        const res = await fetch('/api/concerts?pageSize=500');
        const json = await res.json();
        if (json.success) {
          setConcerts(json.data);
        }
      } catch (error) {
        console.error('Failed to fetch concerts:', error);
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, []);

  // 提取所有城市并统计数量
  const cityStats = useMemo(() => {
    const stats: Record<string, number> = {};
    concerts.forEach(c => {
      stats[c.city] = (stats[c.city] || 0) + 1;
    });
    return Object.entries(stats)
      .sort((a, b) => b[1] - a[1]) // 按数量降序
      .map(([city, count]) => ({ city, count }));
  }, [concerts]);

  // 提取所有艺人并统计数量
  const artistStats = useMemo(() => {
    const stats: Record<string, number> = {};
    concerts.forEach(c => {
      if (c.artist && c.artist !== 'Unknown') {
        stats[c.artist] = (stats[c.artist] || 0) + 1;
      }
    });
    return Object.entries(stats)
      .sort((a, b) => b[1] - a[1]) // 按数量降序
      .map(([artist, count]) => ({ artist, count }));
  }, [concerts]);

  // 过滤数据
  const filteredConcerts = useMemo(() => {
    return concerts.filter(c => {
      const matchCity = selectedCity ? c.city === selectedCity : true;
      const matchArtist = selectedArtist ? c.artist === selectedArtist : true;
      const matchSearch = searchTerm 
        ? c.title.toLowerCase().includes(searchTerm.toLowerCase()) || 
          c.venue.toLowerCase().includes(searchTerm.toLowerCase()) ||
          (c.artist && c.artist.toLowerCase().includes(searchTerm.toLowerCase()))
        : true;
      return matchCity && matchArtist && matchSearch;
    });
  }, [concerts, selectedCity, selectedArtist, searchTerm]);

  // 转换为日历事件
  const events = useMemo(() => {
    return transformConcertsToEvents(filteredConcerts);
  }, [filteredConcerts]);

  return (
    <div className="flex h-screen flex-col">
      <header className="border-b px-4 py-3 flex items-center justify-between bg-background z-10">
        <div className="flex items-center gap-4">
          <Button 
            variant="ghost" 
            size="icon" 
            onClick={() => setIsSidebarOpen(!isSidebarOpen)}
            title={isSidebarOpen ? "收起侧边栏" : "展开侧边栏"}
          >
            <PanelLeft className="h-5 w-5" />
          </Button>
        </div>
        <div className="flex items-center gap-4">
           <div className="relative w-64">
             <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
             <Input 
               placeholder="搜索艺人、场馆..." 
               className="pl-8"
               value={searchTerm}
               onChange={(e) => setSearchTerm(e.target.value)}
             />
           </div>
           
           <HoverCard>
            <HoverCardTrigger asChild>
              <Button variant="outline" size="sm">开发者微信</Button>
            </HoverCardTrigger>
            <HoverCardContent className="w-auto p-4">
              <div className="flex flex-col items-center space-y-2">
                <img src="/wechat-qr.png" alt="Developer WeChat QR" className="w-48 h-48 object-contain" />
                <p className="text-sm text-muted-foreground">扫码添加开发者微信</p>
              </div>
            </HoverCardContent>
          </HoverCard>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* 左侧侧边栏 */}
        <aside 
            className={`${isSidebarOpen ? 'w-64 border-r' : 'w-0'} bg-muted/10 flex flex-col transition-all duration-300 overflow-hidden`}
        >
          <div className="p-4 border-b space-y-4">
            <div className="flex rounded-lg bg-muted p-1">
                <button
                    onClick={() => setFilterMode('city')}
                    className={`flex-1 flex items-center justify-center py-1 text-xs font-medium rounded-md transition-all ${filterMode === 'city' ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
                >
                    <MapPin className="mr-1 h-3 w-3" /> 城市
                </button>
                <button
                    onClick={() => setFilterMode('artist')}
                    className={`flex-1 flex items-center justify-center py-1 text-xs font-medium rounded-md transition-all ${filterMode === 'artist' ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
                >
                    <User className="mr-1 h-3 w-3" /> 艺人
                </button>
            </div>
            
            {(selectedCity || selectedArtist) && (
                 <Button 
                    variant="outline" 
                    size="sm" 
                    className="w-full h-8 text-xs"
                    onClick={() => { setSelectedCity(null); setSelectedArtist(null); }}
                 >
                    <X className="mr-1 h-3 w-3" /> 清除筛选
                 </Button>
            )}
          </div>
          
          <div className="flex-1 overflow-y-auto">
            <div className="p-4 space-y-1">
              {filterMode === 'city' ? (
                <>
                   <Button 
                      variant={selectedCity === null ? "secondary" : "ghost"} 
                      className="w-full justify-start mb-1 text-sm h-9"
                      onClick={() => setSelectedCity(null)}
                    >
                      全部城市
                      <Badge variant="secondary" className="ml-auto text-[10px]">{concerts.length}</Badge>
                    </Button>
                    {cityStats.map(({ city, count }) => (
                        <Button
                          key={city}
                          variant={selectedCity === city ? "secondary" : "ghost"}
                          className="w-full justify-start text-sm h-9"
                          onClick={() => setSelectedCity(city)}
                        >
                          {city}
                          <Badge variant="outline" className="ml-auto text-[10px]">{count}</Badge>
                        </Button>
                    ))}
                </>
              ) : (
                <>
                   <Button 
                      variant={selectedArtist === null ? "secondary" : "ghost"} 
                      className="w-full justify-start mb-1 text-sm h-9"
                      onClick={() => setSelectedArtist(null)}
                    >
                      全部艺人
                      <Badge variant="secondary" className="ml-auto text-[10px]">{concerts.filter(c => c.artist && c.artist !== 'Unknown').length}</Badge>
                    </Button>
                    {artistStats.map(({ artist, count }) => (
                        <Button
                          key={artist}
                          variant={selectedArtist === artist ? "secondary" : "ghost"}
                          className="w-full justify-start text-sm h-9"
                          onClick={() => setSelectedArtist(artist)}
                        >
                          <span className="truncate mr-2">{artist}</span>
                          <Badge variant="outline" className="ml-auto text-[10px] shrink-0">{count}</Badge>
                        </Button>
                    ))}
                </>
              )}
            </div>
          </div>
        </aside>

        {/* 主内容区 */}
        <main className="flex-1 p-6 overflow-auto bg-muted/5">
          {loading ? (
            <div className="flex items-center justify-center h-full">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
              <span className="ml-2 text-muted-foreground">正在同步最新数据...</span>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                   <h2 className="text-2xl font-bold tracking-tight">演出日历</h2>
                   <div className="flex items-center gap-2 text-muted-foreground mt-1">
                     <span className="text-sm">
                       {selectedCity || '全国'} 
                       {selectedArtist ? ` · ${selectedArtist}` : ''}
                       {' · '}
                       共找到 {filteredConcerts.length} 场演出
                     </span>
                     {(selectedCity || selectedArtist) && (
                       <Button 
                          variant="link" 
                          size="sm" 
                          className="h-auto p-0 text-xs" 
                          onClick={() => { setSelectedCity(null); setSelectedArtist(null); }}
                        >
                          清除筛选
                        </Button>
                     )}
                   </div>
                </div>
              </div>
              
              <ConcertCalendar events={events} />
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
