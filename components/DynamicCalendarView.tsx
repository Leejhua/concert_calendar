
import React, { useMemo } from 'react';
import { View } from 'react-big-calendar';
import { CalendarEvent } from '@/lib/types';
import { CalendarEventCard } from './CalendarEventCard';
import { 
  startOfWeek, 
  endOfWeek, 
  eachDayOfInterval, 
  format, 
  isSameDay, 
  getHours
} from 'date-fns';
import { zhCN } from 'date-fns/locale';
import { cn } from '@/lib/utils';

interface DynamicCalendarViewProps {
  date: Date;
  view: View;
  events: CalendarEvent[];
}

export const DynamicCalendarView = ({ date, view, events }: DynamicCalendarViewProps) => {
  // 1. 计算显示的日期列表
  const days = useMemo(() => {
    if (view === 'day') {
      return [date];
    }
    // view === 'week'
    const start = startOfWeek(date, { weekStartsOn: 1 });
    const end = endOfWeek(date, { weekStartsOn: 1 });
    return eachDayOfInterval({ start, end });
  }, [date, view]);

  // 2. 生成 0-23 的小时列表
  const hours = Array.from({ length: 24 }, (_, i) => i);

  // 3. 辅助函数：获取某天某小时的事件
  const getEventsForCell = (day: Date, hour: number) => {
    return events.filter(event => {
      if (!isSameDay(event.start, day)) return false;
      return getHours(event.start) === hour;
    });
  };

  const isToday = (day: Date) => isSameDay(day, new Date());

  // 使用 CSS Grid 布局，确保所有行严格对齐
  // 4rem 是时间轴宽度，剩下的平分
  const gridTemplateColumns = `4rem repeat(${days.length}, minmax(0, 1fr))`;

  return (
    <div 
      className="h-full overflow-auto border rounded-md bg-background grid auto-rows-min"
      style={{ gridTemplateColumns }}
    >
      {/* --- Header Row --- */}
      
      {/* Corner (Time Header) */}
      <div className="border-b border-r bg-muted/30 sticky top-0 z-20 h-14" />
      
      {/* Days Header */}
      {days.map((day, index) => (
        <div 
          key={`header-${index}`} 
          className={cn(
            "text-center py-2 border-b border-r last:border-r-0 font-medium text-sm sticky top-0 z-20 bg-background flex flex-col items-center justify-center h-14",
            isToday(day) && "bg-accent/50 text-accent-foreground"
          )}
        >
          <div>{format(day, 'EEE', { locale: zhCN })}</div>
          <div className={cn(
            "inline-flex items-center justify-center w-8 h-8 rounded-full mt-1",
            isToday(day) && "bg-primary text-primary-foreground"
          )}>
            {format(day, 'd')}
          </div>
        </div>
      ))}

      {/* --- Body Rows --- */}
      {hours.map(hour => (
        <React.Fragment key={`row-${hour}`}>
          {/* Time Label */}
          <div className="border-b border-r p-2 text-xs text-muted-foreground text-right bg-muted/10">
            {`${hour.toString().padStart(2, '0')}:00`}
          </div>

          {/* Cells */}
          {days.map((day, dayIndex) => {
            const cellEvents = getEventsForCell(day, hour);
            return (
              <div 
                key={`cell-${hour}-${dayIndex}`} 
                className={cn(
                  "border-b border-r last:border-r-0 p-1 min-h-[80px] transition-colors",
                  isToday(day) ? "bg-accent/5" : "hover:bg-muted/5"
                )}
              >
                <div className="flex flex-col gap-1 w-full">
                  {cellEvents.map(event => (
                    <CalendarEventCard key={event.id} event={event} />
                  ))}
                </div>
              </div>
            );
          })}
        </React.Fragment>
      ))}
    </div>
  );
};
