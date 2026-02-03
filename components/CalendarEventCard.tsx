
import React from 'react';
import { HoverCard, HoverCardContent, HoverCardTrigger } from '@/components/ui/hover-card';
import { Badge } from '@/components/ui/badge';
import { CalendarEvent } from '@/lib/types';

interface CalendarEventCardProps {
  event: CalendarEvent;
}

export const CalendarEventCard = ({ event }: CalendarEventCardProps) => {
  const artist = event.resource.artist;
  let displayTitle = event.title;
  let showArtistTag = false;

  // Check if we have a valid artist to display as a tag
  if (artist && artist !== 'Unknown' && artist !== '群星') {
    showArtistTag = true;
    // Try to remove the redundant prefix from title for cleaner display
    // Matches 【Artist】 at the start
    const prefix = `【${artist}】`;
    if (displayTitle.startsWith(prefix)) {
      displayTitle = displayTitle.substring(prefix.length);
    }
  }

  return (
    <HoverCard openDelay={100} closeDelay={100}>
      <HoverCardTrigger asChild>
        <div className="cursor-pointer text-xs px-2 py-1 mb-1 rounded-sm bg-background hover:bg-accent transition-colors border border-border/40 shadow-sm border-l-4 border-l-primary text-foreground font-medium w-full max-w-full block overflow-hidden">
          <div className="flex items-center w-full">
            {showArtistTag && (
              <span className="bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-100 px-1.5 rounded-[3px] mr-1.5 whitespace-nowrap flex-shrink-0 leading-tight font-bold" style={{ fontSize: '11px', paddingBottom: '1px' }}>
                {artist}
              </span>
            )}
            <span className="truncate">{displayTitle}</span>
          </div>
        </div>
      </HoverCardTrigger>
      <HoverCardContent className="w-80 p-0" align="start">
        <div className="flex flex-col">
          <div className="p-4 space-y-2">
            <h4 className="font-semibold text-sm leading-tight">{event.title}</h4>
            <div className="flex flex-wrap items-start gap-2 text-xs text-muted-foreground">
              <Badge variant="secondary" className="shrink-0 mt-0.5">{event.resource.city}</Badge>
              {showArtistTag && (
                <Badge variant="outline" className="whitespace-normal h-auto text-left leading-tight mt-0.5">
                  {artist}
                </Badge>
              )}
              <span className="mt-1">{event.resource.venue}</span>
            </div>
            <div className="text-xs text-muted-foreground">
              {event.resource.date}
            </div>
            <div className="text-xs text-muted-foreground mt-2 pt-2 border-t">
               <span className="opacity-75">来源: {event.id.startsWith('mt_') || event.id.startsWith('mtglobal_') ? '摩天轮' : '大麦'}</span>
            </div>
          </div>
        </div>
      </HoverCardContent>
    </HoverCard>
  );
};
