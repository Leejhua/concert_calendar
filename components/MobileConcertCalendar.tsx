
"use client"

import React, { useState, useMemo } from 'react';
import { Calendar } from '@/components/ui/calendar';
import { CalendarEvent } from '@/lib/types';
import { format, isSameDay } from 'date-fns';
import { zhCN } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerDescription,
  DrawerFooter,
  DrawerClose,
} from '@/components/ui/drawer';
import { Button } from '@/components/ui/button';
import { MapPin, Calendar as CalendarIcon, User, Globe } from 'lucide-react';

interface MobileConcertCalendarProps {
  events: CalendarEvent[];
}

export function MobileConcertCalendar({ events }: MobileConcertCalendarProps) {
  const [date, setDate] = useState<Date | undefined>(new Date());
  const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(null);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);

  // Filter events for the selected date
  const selectedDateEvents = useMemo(() => {
    if (!date) return [];
    return events.filter(event => isSameDay(event.start, date));
  }, [date, events]);

  // Identify days with events for calendar modifiers
  const eventDatesSet = useMemo(() => {
    const set = new Set<string>();
    events.forEach(event => {
      set.add(format(event.start, 'yyyy-MM-dd'));
    });
    return set;
  }, [events]);

  const handleEventClick = (event: CalendarEvent) => {
    setSelectedEvent(event);
    setIsDrawerOpen(true);
  };

  return (
    <div className="flex flex-col h-full bg-background">
      <div className="border-b">
        <Calendar
          mode="single"
          selected={date}
          onSelect={setDate}
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

      <div className="flex-1 overflow-hidden flex flex-col">
        <div className="px-4 py-3 bg-muted/20 border-b flex justify-between items-center">
          <h3 className="font-medium text-sm text-muted-foreground">
            {date ? format(date, 'yyyy年M月d日 EEEE', { locale: zhCN }) : '请选择日期'}
          </h3>
          <Badge variant="outline" className="text-xs font-normal">
            {selectedDateEvents.length} 场演出
          </Badge>
        </div>

        <ScrollArea className="flex-1">
          <div className="p-4 space-y-3">
            {selectedDateEvents.length > 0 ? (
              selectedDateEvents.map((event) => (
                <div
                  key={event.id}
                  onClick={() => handleEventClick(event)}
                  className="group bg-card hover:bg-accent/50 border rounded-lg p-3 transition-all cursor-pointer shadow-sm active:scale-[0.98]"
                >
                  <div className="flex justify-between items-start gap-3">
                    <div className="flex-1 space-y-1.5">
                      <div className="flex items-center gap-2">
                        {event.resource.artist && event.resource.artist !== 'Unknown' && (
                          <Badge variant="secondary" className="px-1.5 py-0 text-[10px] h-5">
                            {event.resource.artist}
                          </Badge>
                        )}
                        <h4 className="font-semibold text-sm leading-tight line-clamp-2">
                          {event.title.replace(/^【.*?】/, '')}
                        </h4>
                      </div>
                      
                      <div className="flex items-center gap-3 text-xs text-muted-foreground">
                        <div className="flex items-center gap-1">
                          <MapPin className="w-3 h-3" />
                          <span>{event.resource.city}</span>
                        </div>
                        {event.resource.venue && (
                          <span className="truncate max-w-[120px]">{event.resource.venue}</span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              ))
            ) : (
              <div className="flex flex-col items-center justify-center py-12 text-center text-muted-foreground">
                <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center mb-3">
                  <CalendarIcon className="w-6 h-6 opacity-50" />
                </div>
                <p className="text-sm">该日暂无演出安排</p>
              </div>
            )}
          </div>
        </ScrollArea>
      </div>

      <Drawer open={isDrawerOpen} onOpenChange={setIsDrawerOpen}>
        <DrawerContent>
          {selectedEvent && (
            <div className="mx-auto w-full max-w-md">
              <DrawerHeader className="text-left">
                <div className="flex items-center gap-2 mb-2">
                  <Badge>{selectedEvent.resource.city}</Badge>
                  {selectedEvent.resource.artist && (
                    <Badge variant="outline">{selectedEvent.resource.artist}</Badge>
                  )}
                </div>
                <DrawerTitle className="leading-snug text-xl">
                  {selectedEvent.title}
                </DrawerTitle>
                <DrawerDescription className="mt-1">
                  {selectedEvent.resource.venue}
                </DrawerDescription>
              </DrawerHeader>
              
              <div className="p-4 space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-muted-foreground flex items-center gap-1">
                      <CalendarIcon className="w-3 h-3" /> 演出时间
                    </label>
                    <p className="text-sm font-medium">
                      {format(selectedEvent.start, 'yyyy年MM月dd日 HH:mm')}
                    </p>
                  </div>
                  
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-muted-foreground flex items-center gap-1">
                      <MapPin className="w-3 h-3" /> 演出场馆
                    </label>
                    <p className="text-sm font-medium truncate">
                      {selectedEvent.resource.venue || '待定'}
                    </p>
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-medium text-muted-foreground flex items-center gap-1">
                      <User className="w-3 h-3" /> 艺人/团体
                    </label>
                    <p className="text-sm font-medium">
                      {selectedEvent.resource.artist || '群星'}
                    </p>
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-medium text-muted-foreground flex items-center gap-1">
                      <Globe className="w-3 h-3" /> 来源
                    </label>
                    <p className="text-sm font-medium">
                      {selectedEvent.id.startsWith('mt_') || selectedEvent.id.startsWith('mtglobal_') ? '摩天轮' : '大麦'}
                    </p>
                  </div>
                </div>

                {!selectedEvent.id.startsWith('mt_') && !selectedEvent.id.startsWith('mtglobal_') && (
                   <Button className="w-full mt-4" onClick={() => window.open(`https://detail.damai.cn/item.htm?id=${selectedEvent.id}`, '_blank')}>
                     前往购票
                   </Button>
                )}
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
