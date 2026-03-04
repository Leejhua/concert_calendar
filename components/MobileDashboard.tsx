
import React, { useState, useMemo } from 'react';
import { CalendarEvent } from '@/lib/types';
import { Concert } from '@/lib/damai-crawler';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Calendar } from '@/components/ui/calendar';
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerDescription,
  DrawerFooter,
  DrawerClose,
} from '@/components/ui/drawer';
import { 
  Search, 
  MapPin, 
  Calendar as CalendarIcon, 
  MessageCircle, 
  X, 
  User,
  Globe,
  ChevronDown,
  ChevronUp
} from 'lucide-react';
import { format, isSameDay, addDays, subDays } from 'date-fns';
import { zhCN } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import { useSwipeable } from 'react-swipeable';
import { Virtuoso } from 'react-virtuoso';

interface MobileDashboardProps {
  events: CalendarEvent[];
  cityStats: { city: string; count: number }[];
  artistStats: { artist: string; count: number }[];
  selectedCity: string | null;
  selectedArtist: string | null;
  searchTerm: string;
  onCityChange: (city: string | null) => void;
  onArtistChange: (artist: string | null) => void;
  onSearchChange: (term: string) => void;
}

export function MobileDashboard({
  events,
  cityStats,
  artistStats,
  selectedCity,
  selectedArtist,
  searchTerm,
  onCityChange,
  onArtistChange,
  onSearchChange,
}: MobileDashboardProps) {
  const [displayTab, setDisplayTab] = useState<'filter' | 'search' | 'calendar' | 'contact' | null>(null);
  const [isExpanded, setIsExpanded] = useState(false);
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(new Date());
  const [filterType, setFilterType] = useState<'city' | 'artist'>('city');
  
  // 详情抽屉状态
  const [detailEvent, setDetailEvent] = useState<CalendarEvent | null>(null);
  const [isDetailOpen, setIsDetailOpen] = useState(false);

  // 切换顶部 Tab
  const toggleTab = (tab: 'filter' | 'search' | 'calendar' | 'contact') => {
    if (isExpanded && displayTab === tab) {
      setIsExpanded(false);
    } else {
      setDisplayTab(tab);
      setIsExpanded(true);
    }
  };

  // 根据日期过滤事件
  const dateFilteredEvents = useMemo(() => {
    if (!selectedDate) return events; // 如果没选日期，显示所有？或者显示空？通常显示所有或者今天的。这里假设显示今天的逻辑在外部，或者如果selectedDate为空则显示所有未来演出
    return events.filter(event => isSameDay(event.start, selectedDate));
  }, [events, selectedDate]);

  // 计算有演出的日期（用于日历小点）
  const eventDatesSet = useMemo(() => {
    const set = new Set<string>();
    events.forEach(event => {
      set.add(format(event.start, 'yyyy-MM-dd'));
    });
    return set;
  }, [events]);

  const handleEventClick = (event: CalendarEvent) => {
    setDetailEvent(event);
    setIsDetailOpen(true);
  };

  const handlers = useSwipeable({
    onSwipedLeft: () => {
      if (selectedDate) {
        setSelectedDate(addDays(selectedDate, 1));
      }
    },
    onSwipedRight: () => {
      if (selectedDate) {
        setSelectedDate(subDays(selectedDate, 1));
      }
    },
    preventScrollOnSwipe: false,
    trackMouse: false,
    delta: 30 // Require 30px movement to trigger swipe, reducing accidental triggers
  });

  return (
    <div className="flex flex-col h-screen bg-background overflow-hidden">
      {/* 顶部导航栏 */}
      <div className="flex items-center justify-between px-4 py-2 border-b bg-background z-20 shadow-sm shrink-0">
        <Button
          variant={isExpanded && displayTab === 'filter' ? "secondary" : "ghost"}
          size="sm"
          className={cn("flex flex-col items-center gap-1 h-auto py-1 px-2 text-xs", (selectedCity || selectedArtist) && "text-primary")}
          onClick={() => toggleTab('filter')}
        >
          <MapPin className="h-5 w-5" />
          <span>筛选</span>
        </Button>
        
        <Button
          variant={isExpanded && displayTab === 'search' ? "secondary" : "ghost"}
          size="sm"
          className={cn("flex flex-col items-center gap-1 h-auto py-1 px-2 text-xs", searchTerm && "text-primary")}
          onClick={() => toggleTab('search')}
        >
          <Search className="h-5 w-5" />
          <span>检索</span>
        </Button>

        <Button
          variant={isExpanded && displayTab === 'calendar' ? "secondary" : "ghost"}
          size="sm"
          className="flex flex-col items-center gap-1 h-auto py-1 px-2 text-xs"
          onClick={() => toggleTab('calendar')}
        >
          <CalendarIcon className="h-5 w-5" />
          <span>日历</span>
        </Button>

        <Button
          variant={isExpanded && displayTab === 'contact' ? "secondary" : "ghost"}
          size="sm"
          className="flex flex-col items-center gap-1 h-auto py-1 px-2 text-xs"
          onClick={() => toggleTab('contact')}
        >
          <MessageCircle className="h-5 w-5" />
          <span>联系</span>
        </Button>
      </div>

      {/* 顶部抽屉内容区 */}
      <div 
        className={cn(
          "bg-background border-b shadow-md z-10 transition-all duration-300 ease-in-out grid",
          isExpanded ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0 border-b-0"
        )}
      >
        <div className="overflow-hidden">
          <div className="h-full">
            {/* Filter Content */}
            <div className={cn(
              "transition-all duration-300",
              displayTab === 'filter' ? "opacity-100 block" : "opacity-0 hidden absolute"
            )}>
              <div className="flex flex-col h-full max-h-[60vh] animate-in fade-in slide-in-from-top-1 duration-200">
                <div className="flex border-b p-2 bg-muted/30">
                  <div className="flex flex-1 bg-muted rounded-md p-1">
                    <button
                      onClick={() => setFilterType('city')}
                      className={cn(
                        "flex-1 py-1.5 text-xs font-medium rounded-sm transition-all",
                        filterType === 'city' ? "bg-background shadow-sm" : "text-muted-foreground"
                      )}
                    >
                      按城市
                    </button>
                    <button
                      onClick={() => setFilterType('artist')}
                      className={cn(
                        "flex-1 py-1.5 text-xs font-medium rounded-sm transition-all",
                        filterType === 'artist' ? "bg-background shadow-sm" : "text-muted-foreground"
                      )}
                    >
                      按艺人
                    </button>
                  </div>
                  {(selectedCity || selectedArtist) && (
                    <Button 
                      variant="ghost" 
                      size="sm" 
                      className="ml-2 h-auto text-xs text-muted-foreground"
                      onClick={() => { onCityChange(null); onArtistChange(null); }}
                    >
                      清除
                    </Button>
                  )}
                </div>
                <ScrollArea className="flex-1">
                  <div className="p-2 grid grid-cols-3 gap-2">
                    {filterType === 'city' ? (
                      <>
                        <Button
                          variant={selectedCity === null ? "secondary" : "outline"}
                          className="text-xs h-8 justify-start px-2"
                          onClick={() => onCityChange(null)}
                        >
                          全部城市
                        </Button>
                        {cityStats.map(({ city, count }) => (
                          <Button
                            key={city}
                            variant={selectedCity === city ? "secondary" : "outline"}
                            className="text-xs h-8 justify-between px-2"
                            onClick={() => onCityChange(city)}
                          >
                            <span className="truncate">{city}</span>
                            <span className="text-[10px] text-muted-foreground ml-1">{count}</span>
                          </Button>
                        ))}
                      </>
                    ) : (
                      <>
                        <Button
                          variant={selectedArtist === null ? "secondary" : "outline"}
                          className="text-xs h-8 justify-start px-2"
                          onClick={() => onArtistChange(null)}
                        >
                          全部艺人
                        </Button>
                        {artistStats.map(({ artist, count }) => (
                          <Button
                            key={artist}
                            variant={selectedArtist === artist ? "secondary" : "outline"}
                            className="text-xs h-8 justify-between px-2"
                            onClick={() => onArtistChange(artist)}
                          >
                            <span className="truncate max-w-[80px]">{artist}</span>
                            <span className="text-[10px] text-muted-foreground ml-1">{count}</span>
                          </Button>
                        ))}
                      </>
                    )}
                  </div>
                </ScrollArea>
              </div>
            </div>

            {/* Search Content */}
            <div className={cn(
              "transition-all duration-300",
              displayTab === 'search' ? "opacity-100 block" : "opacity-0 hidden absolute"
            )}>
              <div className="p-4 animate-in fade-in slide-in-from-top-1 duration-200">
                <div className="relative">
                  <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="搜索艺人、场馆..."
                    className="pl-9"
                    value={searchTerm}
                    onChange={(e) => onSearchChange(e.target.value)}
                    autoFocus={displayTab === 'search' && isExpanded}
                  />
                  {searchTerm && (
                    <button 
                      className="absolute right-2.5 top-2.5 text-muted-foreground"
                      onClick={() => onSearchChange('')}
                    >
                      <X className="h-4 w-4" />
                    </button>
                  )}
                </div>
                <div className="mt-2 text-xs text-muted-foreground text-center">
                  输入关键词即刻搜索
                </div>
              </div>
            </div>

            {/* Calendar Content */}
            <div className={cn(
              "transition-all duration-300",
              displayTab === 'calendar' ? "opacity-100 block" : "opacity-0 hidden absolute"
            )}>
              <div className="p-2 flex justify-center animate-in fade-in slide-in-from-top-1 duration-200">
                <Calendar
                  mode="single"
                  selected={selectedDate}
                  onSelect={(date) => {
                    setSelectedDate(date);
                    // 选中日期后不自动收起，允许用户连续操作
                  }}
                  className="rounded-md border-0 w-full flex justify-center pb-2"
                  classNames={{
                    month: "space-y-4 w-full",
                    table: "w-full border-collapse space-y-1",
                    head_row: "flex",
                    row: "flex w-full mt-2",
                    cell: "text-center text-sm p-0 relative [&:has([aria-selected])]:bg-accent first:[&:has([aria-selected])]:rounded-l-md last:[&:has([aria-selected])]:rounded-r-md focus-within:relative focus-within:z-20",
                    day: cn(
                      "h-9 w-9 p-0 font-normal aria-selected:opacity-100 relative"
                    ),
                    day_selected:
                      "bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground focus:bg-primary focus:text-primary-foreground",
                    day_today: "bg-accent text-accent-foreground",
                    day_outside: "text-muted-foreground opacity-50",
                    day_disabled: "text-muted-foreground opacity-50",
                    day_range_middle:
                      "aria-selected:bg-accent aria-selected:text-accent-foreground",
                    day_hidden: "invisible",
                  }}
                  modifiers={{
                    hasEvent: (date) => eventDatesSet.has(format(date, 'yyyy-MM-dd')),
                  }}
                  locale={zhCN}
                />
              </div>
            </div>

            {/* Contact Content */}
            <div className={cn(
              "transition-all duration-300",
              displayTab === 'contact' ? "opacity-100 block" : "opacity-0 hidden absolute"
            )}>
              <div className="p-6 flex flex-col items-center justify-center space-y-4 animate-in fade-in slide-in-from-top-1 duration-200">
                <div className="bg-white p-2 rounded-lg border shadow-sm">
                  <img src="/wechat-qr.png" alt="Developer QR" className="w-40 h-40 object-contain" />
                </div>
                <p className="text-sm text-muted-foreground">扫码添加开发者微信</p>
              </div>
            </div>

            {/* 收起按钮条 */}
            <div 
              className="bg-muted/30 border-t py-1 flex justify-center cursor-pointer hover:bg-muted/50 active:bg-muted transition-colors sticky bottom-0"
              onClick={() => setIsExpanded(false)}
            >
              <ChevronUp className="h-4 w-4 text-muted-foreground" />
            </div>
          </div>
        </div>
      </div>

      {/* 列表内容区 */}
      <div className="flex-1 overflow-hidden flex flex-col touch-pan-y" {...handlers}>
        {/* 状态栏 */}
        <div className="px-4 py-2 bg-muted/10 border-b flex justify-between items-center shrink-0">
          <div className="flex items-center gap-2">
            <span className="font-medium text-sm text-foreground">
              {selectedDate ? format(selectedDate, 'yyyy年M月d日 EEEE', { locale: zhCN }) : '全部日期'}
            </span>
            {(selectedCity || selectedArtist || searchTerm) && (
               <Badge variant="secondary" className="text-[10px] px-1 h-5 font-normal">
                 筛选中
               </Badge>
            )}
          </div>
          <Badge variant="outline" className="text-xs font-normal">
            {dateFilteredEvents.length} 场演出
          </Badge>
        </div>

        {/* 列表内容区 - 使用 Virtuoso 虚拟化列表 */}
        <div className="flex-1 bg-muted/5 p-3 pb-20">
          {dateFilteredEvents.length > 0 ? (
            <Virtuoso
              style={{ height: '100%' }}
              data={dateFilteredEvents}
              itemContent={(index, event) => (
                <div
                  key={`${event.id}-${index}`}
                  onClick={() => handleEventClick(event)}
                  className="group bg-card hover:bg-accent/50 border rounded-lg p-3 mb-3 transition-all cursor-pointer shadow-sm active:scale-[0.98]"
                >
                  <div className="flex justify-between items-start gap-3">
                    <div className="flex-1 space-y-1.5">
                      <div className="flex items-center gap-2 flex-wrap">
                        {event.resource.artist && event.resource.artist !== 'Unknown' && (
                          <Badge variant="secondary" className="px-1.5 py-0 text-[10px] h-5 shrink-0">
                            {event.resource.artist}
                          </Badge>
                        )}
                        <h4 className="font-semibold text-sm leading-tight line-clamp-2">
                          {event.title.replace(/^【.*?】/, '')}
                        </h4>
                      </div>
                      
                      <div className="flex items-center gap-3 text-xs text-muted-foreground">
                        <div className="flex items-center gap-1 shrink-0">
                          <MapPin className="w-3 h-3" />
                          <span>{event.resource.city}</span>
                        </div>
                        {event.resource.venue && (
                          <span className="truncate">{event.resource.venue}</span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              )}
            />
          ) : (
            <div className="flex flex-col items-center justify-center py-16 text-center text-muted-foreground">
              <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center mb-3">
                <CalendarIcon className="w-6 h-6 opacity-50" />
              </div>
              <p className="text-sm">该日暂无演出安排</p>
              <Button 
                variant="link" 
                onClick={() => setSelectedDate(undefined)}
                className="mt-2 text-xs"
              >
                查看全部
              </Button>
            </div>
          )}
        </div>
      </div>

      {/* 详情抽屉 */}
      <Drawer open={isDetailOpen} onOpenChange={setIsDetailOpen}>
        <DrawerContent>
          {detailEvent && (
            <div className="mx-auto w-full max-w-md">
              <DrawerHeader className="text-left">
                <div className="flex items-center gap-2 mb-2">
                  <Badge>{detailEvent.resource.city}</Badge>
                  {detailEvent.resource.artist && (
                    <Badge variant="outline">{detailEvent.resource.artist}</Badge>
                  )}
                </div>
                <DrawerTitle className="leading-snug text-xl">
                  {detailEvent.title}
                </DrawerTitle>
                <DrawerDescription className="mt-1">
                  {detailEvent.resource.venue}
                </DrawerDescription>
              </DrawerHeader>
              
              <div className="p-4 space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-muted-foreground flex items-center gap-1">
                      <CalendarIcon className="w-3 h-3" /> 演出时间
                    </label>
                    <p className="text-sm font-medium">
                      {format(detailEvent.start, 'yyyy年MM月dd日 HH:mm')}
                    </p>
                  </div>
                  
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-muted-foreground flex items-center gap-1">
                      <MapPin className="w-3 h-3" /> 演出场馆
                    </label>
                    <p className="text-sm font-medium truncate">
                      {detailEvent.resource.venue || '待定'}
                    </p>
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-medium text-muted-foreground flex items-center gap-1">
                      <User className="w-3 h-3" /> 艺人/团体
                    </label>
                    <p className="text-sm font-medium">
                      {detailEvent.resource.artist || '群星'}
                    </p>
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-medium text-muted-foreground flex items-center gap-1">
                      <Globe className="w-3 h-3" /> 来源
                    </label>
                    <p className="text-sm font-medium">
                      {detailEvent.id.startsWith('mt_') || detailEvent.id.startsWith('mtglobal_') ? '摩天轮' : '大麦'}
                    </p>
                  </div>
                </div>
              </div>
              
              <DrawerFooter className="pt-2">
                <DrawerClose asChild>
                  <Button variant="outline">关闭</Button>
                </DrawerClose>
              </DrawerFooter>
            </div>
          )}
        </DrawerContent>
      </Drawer>
    </div>
  );
}
