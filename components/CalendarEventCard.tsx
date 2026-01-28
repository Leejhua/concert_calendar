
import React from 'react';
import { HoverCard, HoverCardContent, HoverCardTrigger } from '@/components/ui/hover-card';
import { Badge } from '@/components/ui/badge';
import { CalendarEvent } from '@/lib/types';

interface CalendarEventCardProps {
  event: CalendarEvent;
}

export const CalendarEventCard = ({ event }: CalendarEventCardProps) => {
  return (
    <HoverCard openDelay={100} closeDelay={100}>
      <HoverCardTrigger asChild>
        <div className="cursor-pointer truncate text-xs px-2 py-1 mb-1 rounded-sm bg-background hover:bg-accent transition-colors border border-border/40 shadow-sm border-l-4 border-l-primary text-foreground font-medium w-full max-w-full block">
          {event.title}
        </div>
      </HoverCardTrigger>
      <HoverCardContent className="w-80 p-0" align="start">
        <div className="flex flex-col">
          <div className="p-4 space-y-2">
            <h4 className="font-semibold text-sm leading-tight">{event.title}</h4>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Badge variant="secondary">{event.resource.city}</Badge>
              <span>{event.resource.venue}</span>
            </div>
            <div className="text-xs text-muted-foreground">
              {event.resource.date}
            </div>
          </div>
        </div>
      </HoverCardContent>
    </HoverCard>
  );
};
