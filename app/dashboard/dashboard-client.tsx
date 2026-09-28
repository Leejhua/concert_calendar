'use client';

import Image from 'next/image';
import React, { useEffect, useMemo, useState } from 'react';
import { format } from 'date-fns';
import { Concert } from '@/lib/damai-crawler';
import { OpportunityBoard } from '@/components/OpportunityBoard';
import { ProjectList } from '@/components/ProjectList';
import { ProjectDetailPanel } from '@/components/ProjectDetailPanel';
import { ConcertCalendar } from '@/components/ConcertCalendar';
import { transformConcertsToEvents } from '@/lib/data-transformer';
import { getConcertSearchArtists, isGenericArtistName } from '@/lib/concert-identity';
import { normalizeCityName, normalizeVenueName } from '@/lib/location-normalization';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { HoverCard, HoverCardContent, HoverCardTrigger } from '@/components/ui/hover-card';
import { Loader2, Search, PanelLeft, MapPin, User, X } from 'lucide-react';
import { OpportunityStatus, Project, ProjectTaskStatus, Contact } from '@/lib/types';
import { toast } from 'sonner';

const VIEW_LABELS = {
  opportunities: '商机看板',
  projects: '项目排期',
  calendar: '演出日历',
} as const;

type DashboardView = keyof typeof VIEW_LABELS;

export function DashboardClient() {
  const [concerts, setConcerts] = useState<Concert[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedCity, setSelectedCity] = useState<string | null>(null);
  const [selectedArtist, setSelectedArtist] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [filterMode, setFilterMode] = useState<'city' | 'artist'>('city');
  const [isMobile, setIsMobile] = useState(false);
  const [currentView, setCurrentView] = useState<DashboardView>('opportunities');
  const [updatingOpportunityId, setUpdatingOpportunityId] = useState<string | null>(null);
  const [creatingProjectConcertId, setCreatingProjectConcertId] = useState<string | null>(null);
  const [updatingTaskId, setUpdatingTaskId] = useState<string | null>(null);
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);
  const [projectPanelOpen, setProjectPanelOpen] = useState(false);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [updatingProject, setUpdatingProject] = useState(false);

  useEffect(() => {
    const checkMobile = () => {
      const mobile = window.innerWidth < 768;
      setIsMobile(mobile);
      setIsSidebarOpen(!mobile);
    };

    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  useEffect(() => {
    let isMounted = true;

    async function fetchDashboardData() {
      try {
        const [concertsRes, projectsRes] = await Promise.all([
          fetch('/api/concerts?pageSize=2000&upcomingOnly=true&sort=score'),
          fetch('/api/projects'),
        ]);
        const [concertsJson, projectsJson] = await Promise.all([concertsRes.json(), projectsRes.json()]);

        if (isMounted && concertsJson.success) {
          setConcerts(concertsJson.data);
        }

        if (isMounted && projectsJson.success) {
          setProjects(projectsJson.data);
        }
      } catch (error) {
        console.error('Failed to fetch dashboard data:', error);
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    }

    fetchDashboardData();

    return () => {
      isMounted = false;
    };
  }, []);

  const cityStats = useMemo(() => {
    const stats: Record<string, number> = {};
    concerts.forEach((concert) => {
      const city = normalizeCityName(concert.city) || concert.city;
      stats[city] = (stats[city] || 0) + 1;
    });
    return Object.entries(stats)
      .sort((a, b) => b[1] - a[1])
      .map(([city, count]) => ({ city, count }));
  }, [concerts]);

  const artistStats = useMemo(() => {
    const stats: Record<string, number> = {};
    concerts.forEach((concert) => {
      for (const artist of getFilterableArtists(concert)) {
        stats[artist] = (stats[artist] || 0) + 1;
      }
    });
    return Object.entries(stats)
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'zh-CN'))
      .map(([artist, count]) => ({ artist, count }));
  }, [concerts]);

  const filteredConcerts = useMemo(() => {
    return concerts.filter((concert) => {
      const matchCity = selectedCity ? normalizeCityName(concert.city) === normalizeCityName(selectedCity) : true;
      const matchArtist = selectedArtist ? getFilterableArtists(concert).includes(selectedArtist) : true;
      const normalizedVenueSearch = normalizeVenueName(searchTerm);
      const normalizedCitySearch = normalizeCityName(searchTerm).toLowerCase();
      const matchSearch = searchTerm
        ? concert.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
          normalizeVenueName(concert.venue).includes(normalizedVenueSearch) ||
          normalizeCityName(concert.city).toLowerCase().includes(normalizedCitySearch) ||
          getConcertSearchArtists(concert).some((name) => name.toLowerCase().includes(searchTerm.toLowerCase()))
        : true;
      return matchCity && matchArtist && matchSearch;
    });
  }, [concerts, selectedCity, selectedArtist, searchTerm]);

  const filteredProjects = useMemo(() => {
    return projects.filter((project) => {
      const matchCity = selectedCity ? normalizeCityName(project.city) === normalizeCityName(selectedCity) : true;
      const matchArtist = selectedArtist ? project.artist === selectedArtist : true;
      const keyword = searchTerm.toLowerCase();
      const normalizedVenueKeyword = normalizeVenueName(searchTerm);
      const normalizedCityKeyword = normalizeCityName(searchTerm).toLowerCase();
      const matchSearch = searchTerm
        ? project.title.toLowerCase().includes(keyword) ||
          normalizeVenueName(project.venue).includes(normalizedVenueKeyword) ||
          normalizeCityName(project.city).toLowerCase().includes(normalizedCityKeyword) ||
          project.artist.toLowerCase().includes(keyword)
        : true;
      return matchCity && matchArtist && matchSearch;
    });
  }, [projects, selectedCity, selectedArtist, searchTerm]);

  const events = useMemo(() => transformConcertsToEvents(filteredConcerts), [filteredConcerts]);

  const opportunityCounts = useMemo(() => {
    const counts: Record<OpportunityStatus, number> = {
      new: 0,
      watching: 0,
      qualified: 0,
      ignored: 0,
      converted: 0,
    };

    filteredConcerts.forEach((concert) => {
      const status = concert.opportunityStatus || 'new';
      counts[status] += 1;
    });

    return counts;
  }, [filteredConcerts]);

  const projectStats = useMemo(() => {
    const tasks = filteredProjects.flatMap((project) => project.tasks);
    const overdueTasks = tasks.filter((task) => task.status !== 'done' && task.dueDate && new Date(task.dueDate) < startOfToday()).length;
    const openTasks = tasks.filter((task) => task.status !== 'done' && task.status !== 'skipped').length;
    return { tasks: tasks.length, openTasks, overdueTasks };
  }, [filteredProjects]);

  async function handleOpportunityStatusChange(concertId: string, nextStatus: OpportunityStatus) {
    const previousConcerts = concerts;
    setUpdatingOpportunityId(concertId);
    setConcerts((current) => current.map((concert) => concert.id === concertId ? { ...concert, opportunityStatus: nextStatus } : concert));

    try {
      const response = await fetch(`/api/opportunities/${concertId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ opportunityStatus: nextStatus }),
      });
      const json = await response.json();

      if (!response.ok || !json.success) {
        throw new Error(json.message || '更新商机状态失败');
      }

      setConcerts((current) => current.map((concert) => concert.id === concertId ? json.data : concert));
      toast.success(`已更新为${getStatusLabel(nextStatus)}`);
    } catch (error) {
      setConcerts(previousConcerts);
      const message = error instanceof Error ? error.message : '更新失败';
      toast.error(message);
    } finally {
      setUpdatingOpportunityId(null);
    }
  }

  async function handleCreateProject(concertId: string) {
    setCreatingProjectConcertId(concertId);

    try {
      const response = await fetch('/api/projects/from-concert', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ concertId }),
      });
      const json = await response.json();

      if (!response.ok || !json.success) {
        throw new Error(json.message || '生成项目失败');
      }

      const { project, concert } = json.data as { project: Project; concert: Concert };
      setConcerts((current) => current.map((item) => item.id === concert.id ? concert : item));
      setProjects((current) => [project, ...current.filter((item) => item.id !== project.id)]);
      setCurrentView('projects');
      toast.success('已生成项目排期');
    } catch (error) {
      const message = error instanceof Error ? error.message : '生成项目失败';
      toast.error(message);
    } finally {
      setCreatingProjectConcertId(null);
    }
  }

  async function handleTaskStatusChange(projectId: string, taskId: string, nextStatus: ProjectTaskStatus) {
    setUpdatingTaskId(taskId);

    try {
      const response = await fetch(`/api/projects/${projectId}/tasks`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ taskId, status: nextStatus }),
      });
      const json = await response.json();

      if (!response.ok || !json.success) {
        throw new Error(json.message || '更新任务失败');
      }

      setProjects((current) => current.map((project) => {
        if (project.id !== projectId) return project;
        return {
          ...project,
          tasks: project.tasks.map((task) => task.id === taskId ? json.data : task),
        };
      }));
    } catch (error) {
      const message = error instanceof Error ? error.message : '更新任务失败';
      toast.error(message);
    } finally {
      setUpdatingTaskId(null);
    }
  }

  function clearFilters() {
    setSelectedCity(null);
    setSelectedArtist(null);
    setSearchTerm('');
  }

  async function handleProjectClick(project: Project) {
    setSelectedProject(project);
    setProjectPanelOpen(true);

    try {
      const res = await fetch('/api/contacts');
      const json = await res.json();
      if (json.success) setContacts(json.data);
    } catch {
      // ignore
    }
  }

  function handleProjectPanelClose() {
    setProjectPanelOpen(false);
    setSelectedProject(null);
  }

  async function handleProjectUpdate(projectId: string, updates: Record<string, string | number | null>) {
    setUpdatingProject(true);
    try {
      const res = await fetch(`/api/projects/${projectId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      });
      const json = await res.json();

      if (!res.ok || !json.success) {
        throw new Error(json.message || '更新项目失败');
      }

      setProjects((current) => current.map((p) => (p.id === projectId ? json.data : p)));
      setSelectedProject(json.data);
      toast.success('项目已更新');
    } catch (error) {
      const message = error instanceof Error ? error.message : '更新失败';
      toast.error(message);
    } finally {
      setUpdatingProject(false);
    }
  }

  async function handleAddFollowUp(projectId: string, content: string, followUpDate: string | null) {
    try {
      const res = await fetch('/api/follow-ups', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId, content, followUpDate: followUpDate || null }),
      });
      const json = await res.json();

      if (!res.ok || !json.success) {
        throw new Error(json.message || '添加跟进失败');
      }

      const projectsRes = await fetch('/api/projects');
      const projectsJson = await projectsRes.json();
      if (projectsJson.success) {
        setProjects(projectsJson.data);
        const updated = projectsJson.data.find((p: Project) => p.id === projectId);
        if (updated) setSelectedProject(updated);
      }
      toast.success('已添加跟进记录');
    } catch (error) {
      const message = error instanceof Error ? error.message : '添加跟进失败';
      toast.error(message);
    }
  }

  async function handleAddContact(data: { name: string; role?: string; phone?: string; email?: string; wechat?: string; company?: string }): Promise<Contact | null> {
    try {
      const res = await fetch('/api/contacts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      const json = await res.json();

      if (!res.ok || !json.success) {
        throw new Error(json.message || '添加联系人失败');
      }

      setContacts((current) => [...current, json.data]);
      toast.success('已添加联系人');
      return json.data;
    } catch (error) {
      const message = error instanceof Error ? error.message : '添加联系人失败';
      toast.error(message);
      return null;
    }
  }

  async function handleDeleteContact(id: string) {
    try {
      const res = await fetch(`/api/contacts/${id}`, { method: 'DELETE' });
      const json = await res.json();

      if (!res.ok || !json.success) {
        throw new Error(json.message || '删除联系人失败');
      }

      setContacts((current) => current.filter((c) => c.id !== id));
      toast.success('联系人已删除');
    } catch (error) {
      const message = error instanceof Error ? error.message : '删除联系人失败';
      toast.error(message);
    }
  }

  const activeCount = currentView === 'projects' ? filteredProjects.length : filteredConcerts.length;

  return (
    <div className="flex h-screen flex-col">
      <header className="border-b bg-background px-4 py-3 z-10">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-3">
            {!isMobile && (
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setIsSidebarOpen(!isSidebarOpen)}
                title={isSidebarOpen ? '收起侧边栏' : '展开侧边栏'}
              >
                <PanelLeft className="h-5 w-5" />
              </Button>
            )}
            <div>
              <h1 className="text-lg font-semibold">演唱会商机中枢</h1>
              <p className="text-xs text-muted-foreground">
                更新于 {concerts[0]?.lastSeenAt ? format(new Date(concerts[0].lastSeenAt), 'yyyy-MM-dd HH:mm') : '刚刚'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 overflow-x-auto">
            <Button variant={currentView === 'opportunities' ? 'default' : 'outline'} size="sm" onClick={() => setCurrentView('opportunities')}>
              商机看板
            </Button>
            <Button variant={currentView === 'projects' ? 'default' : 'outline'} size="sm" onClick={() => setCurrentView('projects')}>
              项目排期
            </Button>
            <Button variant={currentView === 'calendar' ? 'default' : 'outline'} size="sm" onClick={() => setCurrentView('calendar')}>
              演出日历
            </Button>
            <HoverCard>
              <HoverCardTrigger asChild>
                <Button variant="outline" size="sm">联系开发者</Button>
              </HoverCardTrigger>
              <HoverCardContent className="w-auto p-4">
                <div className="flex flex-col items-center space-y-2">
                  <Image src="/wechat-qr.png" alt="Developer WeChat QR" width={192} height={192} className="h-48 w-48 object-contain" />
                  <p className="text-sm text-muted-foreground">扫码添加开发者微信</p>
                </div>
              </HoverCardContent>
            </HoverCard>
          </div>
        </div>
      </header>

      <div className="relative flex flex-1 overflow-hidden">
        {!isMobile && (
          <aside
            className={`
              ${isSidebarOpen ? 'translate-x-0 w-64' : '-translate-x-full md:translate-x-0 md:w-0'}
              bg-background border-r flex flex-col transition-all duration-300 overflow-hidden
              fixed md:relative z-30 h-full
            `}
          >
            <SidebarFilters
              concerts={concerts}
              cityStats={cityStats}
              artistStats={artistStats}
              filterMode={filterMode}
              selectedCity={selectedCity}
              selectedArtist={selectedArtist}
              setFilterMode={setFilterMode}
              onCityChange={setSelectedCity}
              onArtistChange={setSelectedArtist}
              onClearFilters={clearFilters}
            />
          </aside>
        )}

        <main className="flex-1 overflow-auto bg-muted/5 p-4 md:p-6">
          {loading ? (
            <div className="flex h-full items-center justify-center">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
              <span className="ml-2 text-muted-foreground">正在加载未来演出商机...</span>
            </div>
          ) : (
            <div className="space-y-4">
              {isMobile && (
                <div className="space-y-3 rounded-lg border bg-background p-3 shadow-sm">
                  <div className="relative">
                    <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder="搜索艺人、场馆..."
                      className="pl-8"
                      value={searchTerm}
                      onChange={(event) => setSearchTerm(event.target.value)}
                    />
                  </div>
                  <div className="flex rounded-lg bg-muted p-1">
                    <button
                      onClick={() => setFilterMode('city')}
                      className={`flex-1 rounded-md py-1 text-xs font-medium transition-all ${filterMode === 'city' ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
                    >
                      城市
                    </button>
                    <button
                      onClick={() => setFilterMode('artist')}
                      className={`flex-1 rounded-md py-1 text-xs font-medium transition-all ${filterMode === 'artist' ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
                    >
                      艺人
                    </button>
                  </div>
                  <div className="flex gap-2 overflow-x-auto pb-1">
                    <Button size="sm" variant={!selectedCity && !selectedArtist ? 'secondary' : 'outline'} onClick={clearFilters}>
                      全部
                    </Button>
                    {filterMode === 'city'
                      ? cityStats.slice(0, 12).map(({ city }) => (
                          <Button
                            key={city}
                            size="sm"
                            variant={selectedCity === city ? 'secondary' : 'outline'}
                            onClick={() => setSelectedCity(city)}
                          >
                            {city}
                          </Button>
                        ))
                      : artistStats.slice(0, 12).map(({ artist }) => (
                          <Button
                            key={artist}
                            size="sm"
                            variant={selectedArtist === artist ? 'secondary' : 'outline'}
                            onClick={() => setSelectedArtist(artist)}
                          >
                            {artist}
                          </Button>
                        ))}
                  </div>
                </div>
              )}

              {!isMobile && (
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div>
                    <h2 className="text-2xl font-bold tracking-tight">{VIEW_LABELS[currentView]}</h2>
                    <div className="mt-1 flex items-center gap-2 text-muted-foreground">
                      <span className="text-sm">
                        {selectedCity || '全国'}
                        {selectedArtist ? ` · ${selectedArtist}` : ''}
                        {' · '}
                        共 {activeCount} 条{currentView === 'projects' ? '项目' : '商机'}
                      </span>
                      {(selectedCity || selectedArtist || searchTerm) && (
                        <Button variant="link" size="sm" className="h-auto p-0 text-xs" onClick={clearFilters}>
                          清除筛选
                        </Button>
                      )}
                    </div>
                  </div>
                  <div className="relative w-full lg:w-72">
                    <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder="搜索艺人、场馆..."
                      className="pl-8"
                      value={searchTerm}
                      onChange={(event) => setSearchTerm(event.target.value)}
                    />
                  </div>
                </div>
              )}

              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
                <StatCard label="待判断" value={opportunityCounts.new} />
                <StatCard label="关注中" value={opportunityCounts.watching} />
                <StatCard label="高潜项目" value={opportunityCounts.qualified} />
                <StatCard label="项目数" value={filteredProjects.length} />
                <StatCard label="逾期节点" value={projectStats.overdueTasks} />
              </div>

              {currentView === 'opportunities' && (
                <OpportunityBoard
                  concerts={filteredConcerts}
                  updatingOpportunityId={updatingOpportunityId}
                  creatingProjectConcertId={creatingProjectConcertId}
                  onStatusChange={handleOpportunityStatusChange}
                  onCreateProject={handleCreateProject}
                />
              )}

              {currentView === 'projects' && (
                <ProjectList
                  projects={filteredProjects}
                  updatingTaskId={updatingTaskId}
                  onTaskStatusChange={handleTaskStatusChange}
                  onProjectClick={handleProjectClick}
                />
              )}

              <ProjectDetailPanel
                project={selectedProject}
                open={projectPanelOpen}
                onClose={handleProjectPanelClose}
                onUpdate={handleProjectUpdate}
                onAddFollowUp={handleAddFollowUp}
                onAddContact={handleAddContact}
                onDeleteContact={handleDeleteContact}
                contacts={contacts}
                updating={updatingProject}
              />

              {currentView === 'calendar' && <ConcertCalendar events={events} />}
            </div>
          )}
        </main>
      </div>
    </div>
  );
}

function SidebarFilters({
  concerts,
  cityStats,
  artistStats,
  filterMode,
  selectedCity,
  selectedArtist,
  setFilterMode,
  onCityChange,
  onArtistChange,
  onClearFilters,
}: {
  concerts: Concert[];
  cityStats: { city: string; count: number }[];
  artistStats: { artist: string; count: number }[];
  filterMode: 'city' | 'artist';
  selectedCity: string | null;
  selectedArtist: string | null;
  setFilterMode: (mode: 'city' | 'artist') => void;
  onCityChange: (city: string | null) => void;
  onArtistChange: (artist: string | null) => void;
  onClearFilters: () => void;
}) {
  return (
    <>
      <div className="border-b p-4 space-y-4">
        <div className="flex rounded-lg bg-muted p-1">
          <button
            onClick={() => setFilterMode('city')}
            className={`flex-1 flex items-center justify-center py-1 text-xs font-medium rounded-md transition-all ${filterMode === 'city' ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
          >
            <MapPin className="mr-1 h-3 w-3" /> 城市
          </button>
          <button
            onClick={() => setFilterMode('artist')}
            className={`flex-1 flex items-center justify-center py-1 text-xs font-medium rounded-md transition-all ${filterMode === 'artist' ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
          >
            <User className="mr-1 h-3 w-3" /> 艺人
          </button>
        </div>

        {(selectedCity || selectedArtist) && (
          <Button variant="outline" size="sm" className="w-full h-8 text-xs" onClick={onClearFilters}>
            <X className="mr-1 h-3 w-3" /> 清除筛选
          </Button>
        )}
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="p-4 space-y-1">
          {filterMode === 'city' ? (
            <>
              <Button variant={selectedCity === null ? 'secondary' : 'ghost'} className="w-full justify-start mb-1 text-sm h-9" onClick={() => onCityChange(null)}>
                全部城市
                <Badge variant="secondary" className="ml-auto text-[10px]">{concerts.length}</Badge>
              </Button>
              {cityStats.map(({ city, count }) => (
                <Button
                  key={city}
                  variant={selectedCity === city ? 'secondary' : 'ghost'}
                  className="w-full justify-start text-sm h-9"
                  onClick={() => onCityChange(city)}
                >
                  {city}
                  <Badge variant="outline" className="ml-auto text-[10px]">{count}</Badge>
                </Button>
              ))}
            </>
          ) : (
            <>
              <Button variant={selectedArtist === null ? 'secondary' : 'ghost'} className="w-full justify-start mb-1 text-sm h-9" onClick={() => onArtistChange(null)}>
                全部艺人
                <Badge variant="secondary" className="ml-auto text-[10px]">{artistStats.length}</Badge>
              </Button>
              {artistStats.map(({ artist, count }) => (
                <Button
                  key={artist}
                  variant={selectedArtist === artist ? 'secondary' : 'ghost'}
                  className="w-full justify-start text-sm h-9"
                  onClick={() => onArtistChange(artist)}
                >
                  <span className="truncate mr-2">{artist}</span>
                  <Badge variant="outline" className="ml-auto text-[10px] shrink-0">{count}</Badge>
                </Button>
              ))}
            </>
          )}
        </div>
      </div>
    </>
  );
}

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border bg-background px-4 py-3 shadow-sm">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-1 text-2xl font-semibold">{value}</div>
    </div>
  );
}

function getFilterableArtists(concert: Concert) {
  return getConcertSearchArtists(concert).filter((artist) => !isGenericArtistName(artist));
}

function getStatusLabel(status: OpportunityStatus) {
  switch (status) {
    case 'new':
      return '待判断';
    case 'watching':
      return '关注中';
    case 'qualified':
      return '高潜';
    case 'ignored':
      return '忽略';
    case 'converted':
      return '已转项目';
  }
}

function startOfToday() {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  return date;
}
