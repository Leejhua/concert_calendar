
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

  // 2. 动态计算有事件的小时列表 (过滤掉空闲时段)
  const hours = useMemo(() => {
    // 找出当前视图日期范围内的所有事件
    const activeEvents = events.filter(event => 
      days.some(day => isSameDay(event.start, day))
    );
    
    // 提取所有事件的小时
    const activeHours = new Set(activeEvents.map(event => getHours(event.start)));
    
    // 如果没有事件，默认不显示任何时间段，或者显示一个提示 (这里选择返回空数组，后续处理空状态)
    // 或者为了避免完全空白，如果没有事件，就不渲染行
    if (activeHours.size === 0) return [];

    return Array.from(activeHours).sort((a, b) => a - b);
  }, [events, days]);

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
      {hours.length === 0 ? (
        <div 
          className="col-span-full py-12 text-center text-muted-foreground"
          style={{ gridColumn: `1 / -1` }}
        >
          该时段暂无演出安排
        </div>
      ) : (
        hours.map(hour => (
          <React.Fragment key={`row-${hour}`}>
            {/* Time Label - 样式增强 */}
            <div className="border-b border-r p-2 flex items-center justify-center bg-accent/20">
              <span className="text-lg font-bold text-primary">
                {`${hour.toString().padStart(2, '0')}:00`}
              </span>
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
                    <CalendarEventCard 
                      key={event.id} 
                      event={event} 
                      showCity={view === 'day'} 
                    />
                  ))}
                </div>
              </div>
            );
          })}
        </React.Fragment>
      ))
    )}
    </div>
  );
};
