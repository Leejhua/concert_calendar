'use client';

import React, { useState, useMemo } from 'react';
import { Calendar, Views, View, EventProps } from 'react-big-calendar';
import { localizer } from '@/lib/calendar-utils';
import { Concert } from '@/scripts/sync_data';
import { CalendarToolbar } from './CalendarToolbar';
import { DynamicCalendarView } from './DynamicCalendarView';
import { CalendarEventCard } from './CalendarEventCard';

import { CalendarEvent } from '@/lib/types';

interface ConcertCalendarProps {
  events: CalendarEvent[];
}

// 自定义事件渲染 (月视图 - 适配 RBC 接口)
const MonthEvent = ({ event }: EventProps<CalendarEvent>) => {
  return <CalendarEventCard event={event} />;
};

export function ConcertCalendar({ events }: ConcertCalendarProps) {
  const [view, setView] = useState<View>(Views.MONTH);
  const [date, setDate] = useState(new Date());

  const { components } = useMemo(() => ({
    components: {
      month: {
        event: MonthEvent,
      },
    },
  }), []);

  return (
    <div className="h-[calc(100vh-200px)] min-h-[600px] w-full bg-background rounded-lg border shadow-sm p-4 flex flex-col">
      <CalendarToolbar 
        date={date} 
        view={view} 
        onViewChange={setView} 
        onDateChange={setDate} 
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
            date={date}
            onNavigate={setDate}
            culture="zh-CN"
            components={components}
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
            date={date} 
            view={view} 
            events={events} 
          />
        )}
      </div>
    </div>
  );
}
