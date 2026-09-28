import { Concert } from '@/lib/damai-crawler';
import { getConcertDisplayArtist, getConcertDisplayTitle } from '@/lib/concert-identity';
import { OpportunityStatus } from '@/lib/types';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { CalendarDays, MapPin, Rocket, Star, User } from 'lucide-react';

interface OpportunityBoardProps {
  concerts: Concert[];
  updatingOpportunityId: string | null;
  creatingProjectConcertId: string | null;
  onStatusChange: (concertId: string, nextStatus: OpportunityStatus) => void;
  onCreateProject: (concertId: string) => void;
}

const STATUS_ORDER: OpportunityStatus[] = ['new', 'watching', 'qualified', 'ignored', 'converted'];

const STATUS_META: Record<OpportunityStatus, { label: string; description: string }> = {
  new: { label: '待判断', description: '新同步进来的商机' },
  watching: { label: '关注中', description: '持续跟踪，等待更好时机' },
  qualified: { label: '高潜', description: '值得尽快推进的重点演出' },
  ignored: { label: '忽略', description: '当前不值得投入精力' },
  converted: { label: '已转项目', description: '已进入项目流程' },
};

const SOURCE_LABEL: Record<NonNullable<Concert['source']>, string> = {
  damai: '大麦',
  moretickets: '摩天轮',
  'moretickets-global': '摩天轮全球',
};

export function OpportunityBoard({
  concerts,
  updatingOpportunityId,
  creatingProjectConcertId,
  onStatusChange,
  onCreateProject,
}: OpportunityBoardProps) {
  const groupedConcerts = STATUS_ORDER.map((status) => ({
    status,
    concerts: concerts.filter((concert) => (concert.opportunityStatus || 'new') === status),
  }));

  return (
    <div className="grid gap-4 xl:grid-cols-5 md:grid-cols-2">
      {groupedConcerts.map(({ status, concerts: items }) => (
        <Card key={status} className="flex min-h-[240px] flex-col">
          <CardHeader className="space-y-2 pb-3">
            <div className="flex items-center justify-between gap-2">
              <CardTitle className="text-base">{STATUS_META[status].label}</CardTitle>
              <Badge variant="secondary">{items.length}</Badge>
            </div>
            <p className="text-xs text-muted-foreground">{STATUS_META[status].description}</p>
          </CardHeader>
          <CardContent className="flex-1 space-y-3">
            {items.length === 0 ? (
              <div className="rounded-lg border border-dashed p-4 text-xs text-muted-foreground">
                当前没有{STATUS_META[status].label}的演出。
              </div>
            ) : (
              items.map((concert) => {
                const source = concert.source || 'damai';
                const isUpdating = updatingOpportunityId === concert.id;
                const isCreatingProject = creatingProjectConcertId === concert.id;
                const isBusy = isUpdating || isCreatingProject;
                const displayDate = concert.eventDate || concert.date;
                const displayArtist = getConcertDisplayArtist(concert);
                const matchedSignals = (concert.opportunityScoreBreakdown || [])
                  .filter((rule) => rule.matched)
                  .map((rule) => `${rule.label} ${rule.delta > 0 ? `+${rule.delta}` : rule.delta}`)
                  .join(' / ');

                return (
                  <div key={concert.id} className="rounded-lg border bg-background p-3 shadow-sm">
                    <div className="mb-2 flex items-start justify-between gap-2">
                      <div className="space-y-1">
                        <div className="flex flex-wrap items-center gap-1.5">
                          {displayArtist && (
                            <Badge variant="secondary" className="text-[10px]">
                              <User className="mr-1 h-3 w-3" />
                              {displayArtist}
                            </Badge>
                          )}
                          <Badge variant="outline" className="text-[10px]">
                            {SOURCE_LABEL[source]}
                          </Badge>
                        </div>
                        <h4 className="line-clamp-2 text-sm font-semibold leading-tight">{getConcertDisplayTitle(concert)}</h4>
                      </div>
                      <div className="flex items-center gap-1 rounded-md bg-amber-50 px-2 py-1 text-[11px] font-medium text-amber-700" title={matchedSignals || '暂无评分信号'}>
                        <Star className="h-3 w-3" />
                        {concert.opportunityScore || 0}
                      </div>
                    </div>

                    <div className="space-y-1.5 text-xs text-muted-foreground">
                      <div className="flex items-center gap-1">
                        <CalendarDays className="h-3.5 w-3.5" />
                        <span>{displayDate}</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <MapPin className="h-3.5 w-3.5" />
                        <span className="truncate">{concert.city}{concert.venue ? ` · ${concert.venue}` : ''}</span>
                      </div>
                    </div>

                    <div className="mt-3 flex flex-wrap gap-2">
                      {status !== 'converted' && status !== 'ignored' && (
                        <Button size="sm" disabled={isBusy} onClick={() => onCreateProject(concert.id)}>
                          <Rocket className="mr-1 h-3.5 w-3.5" />
                          {isCreatingProject ? '生成中' : '转项目'}
                        </Button>
                      )}
                      {status !== 'watching' && status !== 'converted' && (
                        <Button size="sm" variant="outline" disabled={isBusy} onClick={() => onStatusChange(concert.id, 'watching')}>
                          关注
                        </Button>
                      )}
                      {status !== 'qualified' && status !== 'converted' && (
                        <Button size="sm" variant="secondary" disabled={isBusy} onClick={() => onStatusChange(concert.id, 'qualified')}>
                          标为高潜
                        </Button>
                      )}
                      {status !== 'ignored' && status !== 'converted' && (
                        <Button size="sm" variant="secondary" disabled={isBusy} onClick={() => onStatusChange(concert.id, 'ignored')}>
                          忽略
                        </Button>
                      )}
                      {status !== 'new' && status !== 'converted' && (
                        <Button size="sm" variant="ghost" disabled={isBusy} onClick={() => onStatusChange(concert.id, 'new')}>
                          重置
                        </Button>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
