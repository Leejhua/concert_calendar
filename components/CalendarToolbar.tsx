
import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { View } from 'react-big-calendar';
import { addMonths, addWeeks, addDays, subMonths, subWeeks, subDays, isSameDay } from 'date-fns';
import { CookieConfigDialog } from './CookieConfigDialog';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { CalendarEvent } from '@/lib/types';

interface CalendarToolbarProps {
  date: Date;
  view: View;
  onViewChange: (view: View) => void;
  onDateChange: (date: Date) => void;
  events?: CalendarEvent[];
}

export const CalendarToolbar = ({ date, view, onViewChange, onDateChange, events = [] }: CalendarToolbarProps) => {
  const [calendarMonth, setCalendarMonth] = useState<Date>(date);
  const [viewMode, setViewMode] = useState<'days' | 'months'>('days');

  // Sync calendar month with date prop when date changes externally
  React.useEffect(() => {
    setCalendarMonth(date);
  }, [date]);

  const goToBack = () => {
    if (view === 'month') onDateChange(subMonths(date, 1));
    else if (view === 'week') onDateChange(subWeeks(date, 1));
    else if (view === 'day') onDateChange(subDays(date, 1));
  };

  const goToNext = () => {
    if (view === 'month') onDateChange(addMonths(date, 1));
    else if (view === 'week') onDateChange(addWeeks(date, 1));
    else if (view === 'day') onDateChange(addDays(date, 1));
  };

  const goToCurrent = () => {
    onDateChange(new Date());
  };

  const MonthView = () => {
    const currentYear = calendarMonth.getFullYear();
    
    const handlePrevYear = () => setCalendarMonth(subMonths(calendarMonth, 12));
    const handleNextYear = () => setCalendarMonth(addMonths(calendarMonth, 12));

    return (
      <div className="p-3 w-[276px]">
        <div className="flex items-center justify-between mb-4 pt-1">
          <Button variant="ghost" className="h-7 w-7 p-0" onClick={handlePrevYear}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <div className="font-medium text-sm">{currentYear}年</div>
          <Button variant="ghost" className="h-7 w-7 p-0" onClick={handleNextYear}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
        <div className="grid grid-cols-4 gap-2">
          {Array.from({ length: 12 }).map((_, index) => {
            const hasEvent = events.some(e => 
              e.start.getFullYear() === currentYear && 
              e.start.getMonth() === index
            );
            const isSelected = index === calendarMonth.getMonth();
            
            return (
               <Button 
                 key={index} 
                 variant={isSelected ? "default" : "ghost"}
                 className={cn(
                   "relative h-9 w-full text-sm font-normal",
                   isSelected && "hover:bg-primary hover:text-primary-foreground"
                 )}
                 onClick={() => {
                   const newDate = new Date(calendarMonth);
                   newDate.setMonth(index);
                   setCalendarMonth(newDate);
                   setViewMode('days');
                 }}
               >
                 {index + 1}月
                 {hasEvent && (
                   <span className={cn(
                     "absolute bottom-1 w-1 h-1 rounded-full",
                     isSelected ? "bg-primary-foreground" : "bg-primary"
                   )} />
                 )}
               </Button>
            )
          })}
        </div>
      </div>
    )
  }

  const label = () => {
    return (
      <Popover onOpenChange={(open) => { if(!open) setViewMode('days'); }}>
        <PopoverTrigger asChild>
          <Button variant="ghost" className="text-lg font-bold hover:bg-muted px-2 h-auto py-1">
            {date.getFullYear()}年 {date.getMonth() + 1}月
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="start">
          {viewMode === 'days' ? (
            <Calendar
              mode="single"
              selected={date}
              month={calendarMonth}
              onMonthChange={setCalendarMonth}
              onSelect={(d) => {
                if (d) {
                  onDateChange(d);
                  onViewChange('day');
                }
              }}
              initialFocus
              className="p-3"
              components={{
                CaptionLabel: () => (
                  <Button 
                    variant="ghost" 
                    type="button"
                    className="text-sm font-medium hover:bg-muted h-auto py-1 px-2 relative z-10" 
                    onClick={(e) => {
                      e.stopPropagation();
                      setViewMode('months');
                    }}
                  >
                    {calendarMonth.getFullYear()}年 {calendarMonth.getMonth() + 1}月
                  </Button>
                )
              }}
              modifiers={{
                  hasEvent: (d) => events.some(e => isSameDay(e.start, d))
              }}
            />
          ) : (
            <MonthView />
          )}
        </PopoverContent>
      </Popover>
    );
  };

  return (
    <div className="flex items-center justify-between mb-4 px-2">
      <div className="flex items-center gap-2">
        <Button variant="outline" size="icon" onClick={goToBack}>
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <Button variant="outline" onClick={goToCurrent}>
          今天
        </Button>
        <Button variant="outline" size="icon" onClick={goToNext}>
          <ChevronRight className="h-4 w-4" />
        </Button>
        <div className="ml-2">{label()}</div>
      </div>
      
      <div className="flex gap-2">
        <Button 
          variant={view === 'month' ? 'default' : 'ghost'} 
          onClick={() => onViewChange('month')}
        >
          月
        </Button>
        <Button 
          variant={view === 'week' ? 'default' : 'ghost'} 
          onClick={() => onViewChange('week')}
        >
          周
        </Button>
        <Button 
          variant={view === 'day' ? 'default' : 'ghost'} 
          onClick={() => onViewChange('day')}
        >
          日
        </Button>
        <div className="w-px h-8 bg-border mx-1" />
        <CookieConfigDialog />
      </div>
    </div>
  );
};
