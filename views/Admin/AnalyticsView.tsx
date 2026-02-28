
import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { supabase } from '../../services/supabase';
import AdminSidebar from '../../components/AdminSidebar';

type AnalyticsTab = 'bots' | 'users' | 'site' | 'posts' | 'seo';

type AnalyticsEngine = 'google' | 'yahoo' | 'bing';

interface SeoRecommendation {
  id: string;
  source: AnalyticsEngine;
  title: string;
  detail: string;
}

interface SessionData {
  sessionId: string;
  userId?: string;
  userName?: string;
  duration: number;
  eventCount: number;
  lastActive: string;
  browser: string;
  platform: string;
  ip: string;
  location: string;
}

interface UserSummary {
  id: string;
  display_name: string;
  username: string;
  created_at: string;
  last_password_change?: string;
  session_count: number;
  most_viewed_page: string;
}

const parseUA = (ua: string) => {
  let browser = "Unknown";
  let platform = "Other";
  if (ua.includes("Firefox")) browser = "Firefox";
  else if (ua.includes("Chrome")) browser = "Chrome";
  else if (ua.includes("Safari") && !ua.includes("Chrome")) browser = "Safari";
  else if (ua.includes("Edge")) browser = "Edge";
  if (ua.includes("iPhone")) platform = "iPhone";
  else if (ua.includes("Android")) platform = "Android";
  else if (ua.includes("Windows")) platform = "Windows";
  else if (ua.includes("Macintosh")) platform = "Mac";
  return { browser, platform };
};

const AnalyticsView: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const initialTab = (searchParams.get('tab') as AnalyticsTab) || 'users';
  const [activeTab, setActiveTab] = useState<AnalyticsTab>(initialTab);
  const [enabledEngines, setEnabledEngines] = useState<Record<AnalyticsEngine, boolean>>({
    google: true,
    yahoo: true,
    bing: true
  });
  const [loading, setLoading] = useState(true);
  
  const [stats, setStats] = useState({
    totalViews: 0,
    sitePerformance: {
      totalViews: 0,
      totalClicks: 0,
      avgSessionTime: 0,
      longestSession: 0
    },
    userMetrics: {
      totalUsers: 0,
      newMembers: [] as UserSummary[],
      activeMembers: [] as UserSummary[],
      recentPwdChanges: [] as UserSummary[],
      userPageInterests: [] as { userName: string, page: string, views: number }[]
    },
    botStats: {
      totalBotPosts: 0,
      perBotCount: [] as { name: string, count: number }[]
    },
    postStats: {
      topPosts: [] as { slug: string, views: number }[]
    }
  });

  const fetchData = async () => {
    setLoading(true);
    try {
      const { data: events } = await supabase.from('site_analytics').select('*').order('created_at', { ascending: false });
      const { data: profiles } = await supabase.from('profiles').select('*').order('created_at', { ascending: false });
      const { data: journalists } = await supabase.from('journalists').select('*');
      const { data: botPosts } = await supabase.from('posts').select('id, journalist_id').not('journalist_id', 'is', null);
      
      const rawEvents = events || [];
      const profilesList = profiles || [];

      // Maps and Counters
      const userActivityMap: Record<string, Set<string>> = {}; 
      const userPageInterestMap: Record<string, Record<string, number>> = {}; 
      const postViewsMap: Record<string, number> = {};
      const sessionMap: Record<string, { start: number, end: number, events: number }> = {};

      rawEvents.forEach(e => {
        const time = new Date(e.created_at).getTime();
        
        // Session tracking for performance
        if (!sessionMap[e.session_id]) {
          sessionMap[e.session_id] = { start: time, end: time, events: 0 };
        }
        sessionMap[e.session_id].start = Math.min(sessionMap[e.session_id].start, time);
        sessionMap[e.session_id].end = Math.max(sessionMap[e.session_id].end, time);
        sessionMap[e.session_id].events++;

        // Global post views
        if (e.event_type === 'view' && e.target_id) {
          postViewsMap[e.target_id] = (postViewsMap[e.target_id] || 0) + 1;
        }

        // User specific metrics
        if (e.user_id) {
          if (!userActivityMap[e.user_id]) userActivityMap[e.user_id] = new Set();
          userActivityMap[e.user_id].add(e.session_id);

          if (e.event_type === 'view' && e.target_id) {
            if (!userPageInterestMap[e.user_id]) userPageInterestMap[e.user_id] = {};
            userPageInterestMap[e.user_id][e.target_id] = (userPageInterestMap[e.user_id][e.target_id] || 0) + 1;
          }
        }
      });

      // Process Session Performance
      const sessionList = Object.values(sessionMap);
      const sessionDurations = sessionList.map(s => (s.end - s.start) / 60000); // minutes
      const totalSessionTime = sessionDurations.reduce((a, b) => a + b, 0);
      const avgSessionTime = sessionList.length > 0 ? Math.round(totalSessionTime / sessionList.length) : 0;
      const longestSession = sessionList.length > 0 ? Math.round(Math.max(...sessionDurations)) : 0;

      // Process Bot Stats
      const botPostCounts: Record<string, number> = {};
      botPosts?.forEach(bp => {
        const botName = journalists?.find(j => j.id === bp.journalist_id)?.name || 'Unknown Bot';
        botPostCounts[botName] = (botPostCounts[botName] || 0) + 1;
      });

      // Process User Aggregates
      const activeMembers = profilesList.map(p => ({
        id: p.id, display_name: p.display_name, username: p.username, created_at: p.created_at,
        session_count: userActivityMap[p.id]?.size || 0,
        most_viewed_page: Object.entries(userPageInterestMap[p.id] || {}).sort((a,b) => b[1] - a[1])[0]?.[0] || 'None'
      })).sort((a, b) => b.session_count - a.session_count).slice(0, 5);

      const recentPwdChanges = profilesList
        .filter(p => p.last_password_change)
        .sort((a,b) => new Date(b.last_password_change!).getTime() - new Date(a.last_password_change!).getTime())
        .slice(0, 5);

      const userPageInterests = Object.entries(userPageInterestMap).flatMap(([uid, pages]) => {
         const profile = profilesList.find(p => p.id === uid);
         return Object.entries(pages).map(([page, views]) => ({ 
           userName: profile?.display_name || 'Unknown', 
           page, 
           views 
         }));
      }).sort((a,b) => b.views - a.views).slice(0, 10);

      setStats({
        totalViews: rawEvents.filter(e => e.event_type === 'view').length,
        sitePerformance: {
          totalViews: rawEvents.filter(e => e.event_type === 'view').length,
          totalClicks: rawEvents.filter(e => e.event_type === 'click').length,
          avgSessionTime,
          longestSession
        },
        userMetrics: {
          totalUsers: profilesList.length,
          newMembers: profilesList.slice(0, 5).map(p => ({
             id: p.id, display_name: p.display_name, username: p.username, created_at: p.created_at,
             session_count: userActivityMap[p.id]?.size || 0,
             most_viewed_page: ''
          })),
          activeMembers,
          recentPwdChanges: recentPwdChanges as any,
          userPageInterests
        },
        botStats: {
          totalBotPosts: botPosts?.length || 0,
          perBotCount: Object.entries(botPostCounts).map(([name, count]) => ({ name, count }))
        },
        postStats: {
          topPosts: Object.entries(postViewsMap).map(([slug, views]) => ({ slug, views })).sort((a,b) => b.views - a.views).slice(0, 10)
        }
      });
    } catch (err) {
      console.error("Fetch stats error:", err);
    } finally { setLoading(false); }
  };

  useEffect(() => { fetchData(); }, []);

  const seoRecommendations: SeoRecommendation[] = [
    {
      id: 'google-1',
      source: 'google',
      title: 'Strengthen metadata and schema markup',
      detail: `Google Analytics trendline shows ${stats.sitePerformance.totalViews} tracked views. Add article schema and tighter meta descriptions to improve search snippets for high-traffic posts.`
    },
    {
      id: 'google-2',
      source: 'google',
      title: 'Improve internal linking on top content',
      detail: 'Use internal links from your top-performing posts to related evergreen pages so crawlers discover more pages per session.'
    },
    {
      id: 'yahoo-1',
      source: 'yahoo',
      title: 'Expand keyword variants in headlines',
      detail: 'Yahoo audience indexing tends to reward exact phrase matching. Test headline variants with natural long-tail keyword phrases.'
    },
    {
      id: 'yahoo-2',
      source: 'yahoo',
      title: 'Refresh older posts with updated publish notes',
      detail: 'Add updated context and fresh paragraph summaries to older content so Yahoo syndication feeds can surface recently maintained pages.'
    },
    {
      id: 'bing-1',
      source: 'bing',
      title: 'Optimize media alt text for Bing image discovery',
      detail: 'Bing analytics signals often correlate with image search. Ensure featured images and inline assets have descriptive alt text and captions.'
    },
    {
      id: 'bing-2',
      source: 'bing',
      title: 'Audit Core Web Vitals and crawl depth',
      detail: `Average tracked session time is ${stats.sitePerformance.avgSessionTime} minute(s). Improve first paint and reduce navigation depth to improve Bing crawl quality.`
    }
  ];

  const activeRecommendations = seoRecommendations.filter((rec) => enabledEngines[rec.source]);

  const toggleEngine = (engine: AnalyticsEngine) => {
    setEnabledEngines((prev) => ({ ...prev, [engine]: !prev[engine] }));
  };

  useEffect(() => {
    const tabParam = searchParams.get('tab') as AnalyticsTab | null;
    if (tabParam && ['users', 'site', 'posts', 'bots', 'seo'].includes(tabParam) && tabParam !== activeTab) {
      setActiveTab(tabParam);
    }
  }, [searchParams, activeTab]);

  useEffect(() => {
    if (searchParams.get('tab') !== activeTab) {
      setSearchParams({ tab: activeTab });
    }
  }, [activeTab, searchParams, setSearchParams]);

  const TabButton = ({ id, label }: { id: AnalyticsTab, label: string }) => (
    <button
      onClick={() => setActiveTab(id)}
      className={`px-8 py-4 text-[11px] font-black uppercase tracking-widest transition-all border-b-4 ${
        activeTab === id ? 'border-blue-600 text-blue-600 bg-white' : 'border-transparent text-gray-400'
      }`}
    >
      {label}
    </button>
  );

  return (
    <div className="flex min-h-screen bg-[#f1f1f1]">
      <AdminSidebar onLogout={() => navigate('/login')} />
      <main className="flex-1 p-6 lg:p-10 max-w-7xl mx-auto">
        <header className="mb-10 flex justify-between items-end">
          <div>
            <h1 className="text-4xl font-black text-gray-900 font-serif leading-none">Intelligence Hub</h1>
            <p className="text-gray-400 text-xs font-bold uppercase tracking-widest mt-2">Centralized Site Data Engine</p>
          </div>
          <button 
            onClick={fetchData} 
            className="bg-white border border-gray-200 px-6 py-2 rounded shadow-sm text-xs font-black uppercase tracking-widest"
          >
            {loading ? 'Refreshing...' : 'Refresh Hub'}
          </button>
        </header>

        <nav className="flex bg-white border border-gray-200 rounded-t-lg mb-10 overflow-x-auto shadow-sm">
          <TabButton id="users" label="User Insights" />
          <TabButton id="site" label="Site Performance" />
          <TabButton id="posts" label="Post Engagement" />
          <TabButton id="bots" label="Bot Registry" />
          <TabButton id="seo" label="SEO Optimization" />
        </nav>

        {loading ? (
          <div className="py-40 text-center animate-pulse italic text-gray-400 font-serif">Compiling neural dataset...</div>
        ) : (
          <div className="space-y-12 animate-in fade-in duration-500">
            {activeTab === 'users' && (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                <section className="bg-white p-8 rounded-xl shadow-sm border border-gray-100">
                  <h3 className="text-[10px] font-black uppercase text-gray-400 tracking-widest mb-6">Session Leaders (Most Active)</h3>
                  <div className="space-y-4">
                    {stats.userMetrics.activeMembers.map((u, i) => (
                      <div key={i} className="flex justify-between items-center pb-2 border-b last:border-0">
                         <div>
                            <p className="text-sm font-bold text-gray-800">{u.display_name}</p>
                            <p className="text-[9px] text-gray-400 font-black">TOP CONTENT: /{u.most_viewed_page}</p>
                         </div>
                         <span className="text-xs font-black bg-blue-50 text-blue-600 px-3 py-1 rounded-full">{u.session_count} Sessions</span>
                      </div>
                    ))}
                    {stats.userMetrics.activeMembers.length === 0 && <p className="text-xs text-gray-400 italic">No user session data recorded.</p>}
                  </div>
                </section>

                <section className="bg-white p-8 rounded-xl shadow-sm border border-gray-100">
                  <h3 className="text-[10px] font-black uppercase text-gray-400 tracking-widest mb-6">Newest Member Registry</h3>
                  <div className="space-y-4">
                    {stats.userMetrics.newMembers.map((u, i) => (
                      <div key={i} className="flex justify-between items-center pb-2 border-b last:border-0">
                         <span className="text-sm font-bold text-gray-800">{u.display_name}</span>
                         <span className="text-[10px] font-mono text-gray-400">{new Date(u.created_at).toLocaleDateString()}</span>
                      </div>
                    ))}
                  </div>
                </section>

                <section className="bg-white p-8 rounded-xl shadow-sm border border-gray-100">
                  <h3 className="text-[10px] font-black uppercase text-gray-400 tracking-widest mb-6">Recent Password Changes</h3>
                  <div className="space-y-4">
                    {stats.userMetrics.recentPwdChanges.map((u, i) => (
                      <div key={i} className="flex justify-between items-center pb-2 border-b last:border-0">
                         <span className="text-sm font-bold text-gray-800">{u.display_name}</span>
                         <span className="text-[9px] font-black text-amber-600 uppercase">PWD MODIFIED: {new Date(u.last_password_change!).toLocaleDateString()}</span>
                      </div>
                    ))}
                    {stats.userMetrics.recentPwdChanges.length === 0 && <p className="text-xs text-gray-400 italic">No recent password activities recorded.</p>}
                  </div>
                </section>

                <section className="bg-[#111] p-8 rounded-xl shadow-2xl text-white">
                  <h3 className="text-[10px] font-black uppercase text-gray-500 tracking-widest mb-6">Top Page Views by Member</h3>
                  <div className="space-y-4">
                    {stats.userMetrics.userPageInterests.map((u, i) => (
                      <div key={i} className="flex justify-between items-center text-xs pb-1 border-b border-white/5">
                         <span className="font-bold text-gray-300 truncate max-w-[200px]">{u.userName} &rarr; /{u.page}</span>
                         <span className="text-blue-400 font-black">{u.views} Views</span>
                      </div>
                    ))}
                  </div>
                </section>
              </div>
            )}

            {activeTab === 'site' && (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                 {[
                   { label: 'Total Page Views', val: stats.sitePerformance.totalViews, icon: '📈' },
                   { label: 'Site Interactions', val: stats.sitePerformance.totalClicks, icon: '🖱️' },
                   { label: 'Avg Session Stay', val: `${stats.sitePerformance.avgSessionTime}m`, icon: '⏳' },
                   { label: 'Longest Session', val: `${stats.sitePerformance.longestSession}m`, icon: '🏆' }
                 ].map((c, i) => (
                    <div key={i} className="bg-white p-8 rounded-xl border border-gray-100 shadow-sm">
                       <div className="text-2xl mb-2">{c.icon}</div>
                       <div className="text-[10px] font-black uppercase text-gray-400 tracking-widest mb-1">{c.label}</div>
                       <div className="text-3xl font-black text-gray-900">{c.val}</div>
                    </div>
                 ))}
              </div>
            )}

            {activeTab === 'posts' && (
              <div className="bg-white p-8 rounded-xl shadow-sm border border-gray-100">
                 <h3 className="text-[10px] font-black uppercase text-gray-400 tracking-widest mb-8">Highest Impact Publications</h3>
                 <div className="space-y-6">
                    {stats.postStats.topPosts.map((post, i) => (
                      <div key={i} className="flex items-center gap-6 group">
                         <div className="w-10 h-10 rounded bg-gray-900 text-white flex items-center justify-center font-black text-sm shrink-0">#{i+1}</div>
                         <div className="flex-1 border-b border-gray-50 pb-2 group-last:border-0">
                            <div className="flex justify-between items-center">
                               <span className="text-sm font-bold text-gray-800">/{post.slug}</span>
                               <span className="text-xs font-black text-blue-600">{post.views} Views</span>
                            </div>
                            <div className="w-full bg-gray-100 h-1.5 rounded-full mt-2">
                               <div className="bg-blue-600 h-full rounded-full" style={{ width: `${(post.views / (stats.postStats.topPosts[0]?.views || 1)) * 100}%` }}></div>
                            </div>
                         </div>
                      </div>
                    ))}
                    {stats.postStats.topPosts.length === 0 && <p className="text-center py-20 text-gray-300 italic">No publication engagement recorded.</p>}
                 </div>
              </div>
            )}

            {activeTab === 'seo' && (
              <section className="bg-white p-8 rounded-xl shadow-sm border border-gray-100 space-y-8">
                <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
                  <div>
                    <h3 className="text-[10px] font-black uppercase text-gray-400 tracking-widest mb-2">SEO Recommendation Engines</h3>
                    <p className="text-sm text-gray-600">Enable analytics sources to generate optimization recommendations for your editorial team.</p>
                  </div>
                  <div className="flex flex-wrap gap-3">
                    {([
                      { key: 'google', label: 'Google Analytics' },
                      { key: 'yahoo', label: 'Yahoo Analytics' },
                      { key: 'bing', label: 'Bing Analytics' }
                    ] as { key: AnalyticsEngine; label: string }[]).map((engine) => (
                      <button
                        key={engine.key}
                        onClick={() => toggleEngine(engine.key)}
                        className={`px-4 py-2 rounded-full text-[11px] font-black uppercase tracking-wider border transition-all ${enabledEngines[engine.key] ? 'bg-blue-600 border-blue-600 text-white' : 'bg-white border-gray-300 text-gray-500'}`}
                      >
                        {enabledEngines[engine.key] ? '✓ ' : ''}{engine.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  {activeRecommendations.length === 0 ? (
                    <p className="text-sm text-gray-500 italic">Enable at least one analytics source to receive SEO recommendations.</p>
                  ) : (
                    activeRecommendations.map((rec) => (
                      <article key={rec.id} className="border border-gray-200 rounded-lg p-5 bg-gray-50">
                        <p className="text-[10px] font-black uppercase tracking-widest text-blue-600 mb-2">{rec.source} analytics</p>
                        <h4 className="text-sm font-black text-gray-900 mb-2">{rec.title}</h4>
                        <p className="text-sm text-gray-600 leading-relaxed">{rec.detail}</p>
                      </article>
                    ))
                  )}
                </div>
              </section>
            )}


            {activeTab === 'bots' && (
              <div className="bg-white p-8 rounded-xl shadow-sm border border-gray-100">
                <div className="text-center mb-10">
                   <div className="text-5xl font-black text-blue-600 mb-2">{stats.botStats.totalBotPosts}</div>
                   <div className="text-[10px] font-black uppercase text-gray-400 tracking-widest">Total Autonomous Broadcasts</div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                   {stats.botStats.perBotCount.map((bot, i) => (
                      <div key={i} className="flex justify-between items-center p-4 bg-gray-50 rounded border">
                         <span className="text-sm font-bold text-gray-800">{bot.name}</span>
                         <span className="text-xs font-black bg-white px-3 py-1 rounded shadow-sm text-blue-600">{bot.count} Posts</span>
                      </div>
                   ))}
                </div>
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
};

export default AnalyticsView;
