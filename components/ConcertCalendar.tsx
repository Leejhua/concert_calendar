'use client';

import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { Calendar, Views, View, EventProps, DateHeaderProps } from 'react-big-calendar';
import { localizer } from '@/lib/calendar-utils';
import { Concert } from '@/lib/damai-crawler';
import { CalendarToolbar } from './CalendarToolbar';
import { DynamicCalendarView } from './DynamicCalendarView';
import { CalendarEventCard } from './CalendarEventCard';
import { getHolidayInfo, getDateStatus } from '@/lib/holidays';
import { cn } from '@/lib/utils';

import { CalendarEvent } from '@/lib/types';

interface ConcertCalendarProps {
  events: CalendarEvent[];
}

// 自定义日期头部 (月视图)
const DateHeader = ({ label, date, onDrillDown, isOffRange }: DateHeaderProps & { isOffRange: boolean }) => {
  const status = getDateStatus(date);
  
  return (
    <div className={cn(
      "rbc-date-cell-header flex justify-between items-start px-1 pt-1",
      isOffRange && "bg-slate-50/50" // 给非本月日期添加轻微背景区分 (RBC 默认会有 rbc-off-range 类，但这里加强一下头部区域)
    )}>
      <div className="flex items-center gap-1">
        <button 
          type="button" 
          onClick={onDrillDown} 
          className={cn(
            "rbc-button-link text-sm font-medium",
            isOffRange ? "text-muted-foreground/50" : "text-foreground"
          )}
        >
          {label}
        </button>
        {status.name && (
          <span className={cn(
            "text-[10px] px-1 py-0.5 rounded leading-none select-none scale-90 origin-left hidden sm:inline-block",
             status.type === 'holiday' 
              ? "bg-red-100 text-red-600 font-medium" 
              : "bg-slate-100 text-slate-600"
          )}>
            {status.name}
          </span>
        )}
      </div>
      
      <span
        className={cn(
          "text-[10px] px-1 py-0.5 rounded leading-none select-none",
          status.type === 'holiday' 
            ? "bg-red-50 text-red-600 border border-red-100" 
            : "bg-slate-50 text-slate-400 border border-slate-100",
           isOffRange && "opacity-50"
        )}
      >
        {status.type === 'holiday' ? '休' : '班'}
      </span>
    </div>
  );
};

// 自定义事件渲染 (月视图 - 适配 RBC 接口)
const MonthEvent = ({ event }: EventProps<CalendarEvent>) => {
  return <CalendarEventCard event={event} />;
};

export function ConcertCalendar({ events }: ConcertCalendarProps) {
  const [view, setView] = useState<View>(Views.MONTH);
  const [viewDate, setViewDate] = useState(new Date());
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  const { components } = useMemo(() => ({
    components: {
      month: {
        event: MonthEvent,
        dateHeader: DateHeader,
      },
    },
  }), []);

  // 自定义日期样式
  const dayPropGetter = useCallback(
    (date: Date) => {
      // 检查是否为非当前展示月份的日期 (off-range)
      // 注意：这里需要依赖当前的 view date 来判断
      // RBC 的 Navigate action 会更新 date state
      if (
        viewDate.getMonth() !== date.getMonth() || 
        viewDate.getFullYear() !== date.getFullYear()
      ) {
        return {
          className: 'bg-slate-100/80 dark:bg-slate-800/50', // 使用 Tailwind 类名 (Slate 200 via style)
          style: {
            backgroundColor: '#e2e8f0', // Slate-200 fallback
          }
        };
      }
      return {};
    },
    [viewDate] // 依赖当前的 viewDate
  );

  if (!isMounted) {
    return <div className="h-[calc(100vh-200px)] min-h-[600px] w-full bg-background rounded-lg border shadow-sm p-4 flex items-center justify-center text-muted-foreground">加载日历中...</div>;
  }

  return (
    <div className="h-[calc(100vh-200px)] min-h-[600px] w-full bg-background rounded-lg border shadow-sm p-4 flex flex-col">
      <CalendarToolbar 
        date={viewDate} 
        view={view} 
        onViewChange={setView} 
        onDateChange={setViewDate} 
        events={events}
      />
      
      <div className="flex-1 min-h-0 overflow-hidden">
        {view === 'month' ? (
          <Calendar
            localizer={localizer}
            events={events}
            startAccessor="start"
            endAccessor="end"
            style={{ height: '100%' }}
            view={view}
            onView={setView}
            date={viewDate}
            onNavigate={setViewDate}
            culture="zh-CN"
            components={components}
            dayPropGetter={dayPropGetter}
            toolbar={false} // 禁用默认工具栏，使用外部统一工具栏
            messages={{
              month: '月',
              week: '周',
              day: '日',
              today: '今天',
              previous: '上一个',
              next: '下一个',
              noEventsInRange: '这段时间内没有演唱会',
            }}
            popup // 启用 +x more 弹出层
          />
        ) : (
          <DynamicCalendarView 
            date={viewDate} 
            view={view} 
            events={events} 
          />
        )}
      </div>
    </div>
  );
}
