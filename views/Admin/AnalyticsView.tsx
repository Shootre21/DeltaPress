
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../services/supabase';
import AdminSidebar from '../../components/AdminSidebar';

type AnalyticsTab = 'bots' | 'users' | 'site' | 'posts' | 'seo';

interface SeoRecommendation {
  label: string;
  value: number;
  impact: 'High' | 'Medium' | 'Low';
  action: string;
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
  const [activeTab, setActiveTab] = useState<AnalyticsTab>('users');
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
    },
    seoStats: {
      totalPublished: 0,
      missingExcerpt: 0,
      missingFeaturedImage: 0,
      shortTitles: 0,
      longTitles: 0,
      longSlugs: 0,
      missingH1StyleHeadings: 0,
      recommendations: [] as SeoRecommendation[]
    }
  });

  const fetchData = async () => {
    setLoading(true);
    try {
      const { data: events } = await supabase.from('site_analytics').select('*').order('created_at', { ascending: false });
      const { data: profiles } = await supabase.from('profiles').select('*').order('created_at', { ascending: false });
      const { data: journalists } = await supabase.from('journalists').select('*');
      const { data: botPosts } = await supabase.from('posts').select('id, journalist_id').not('journalist_id', 'is', null);
      const { data: allPosts } = await supabase.from('posts').select('id, title, slug, content, excerpt, featured_image, status, type');
      
      const rawEvents = events || [];
      const profilesList = profiles || [];
      const publishedPosts = (allPosts || []).filter(p => p.status === 'publish');

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

      // SEO health processing
      const missingExcerpt = publishedPosts.filter(p => !p.excerpt || !p.excerpt.trim()).length;
      const missingFeaturedImage = publishedPosts.filter(p => !p.featured_image || !p.featured_image.trim()).length;
      const shortTitles = publishedPosts.filter(p => (p.title || '').trim().length > 0 && p.title.trim().length < 35).length;
      const longTitles = publishedPosts.filter(p => (p.title || '').trim().length > 65).length;
      const longSlugs = publishedPosts.filter(p => (p.slug || '').length > 75).length;
      const missingH1StyleHeadings = publishedPosts.filter(p => !(p.content || '').match(/<h1[\s>]/i)).length;

      const recommendations: SeoRecommendation[] = [
        {
          label: 'Missing meta descriptions (excerpt)',
          value: missingExcerpt,
          impact: 'High',
          action: 'Write a unique 130–155 character excerpt for every published page.'
        },
        {
          label: 'Missing social/OG image',
          value: missingFeaturedImage,
          impact: 'High',
          action: 'Add a compelling featured image to improve CTR on social + search.'
        },
        {
          label: 'Titles too short (<35 chars)',
          value: shortTitles,
          impact: 'Medium',
          action: 'Expand headline keywords while keeping readability and intent alignment.'
        },
        {
          label: 'Titles too long (>65 chars)',
          value: longTitles,
          impact: 'Medium',
          action: 'Trim titles to avoid SERP truncation and lead with primary keyword.'
        },
        {
          label: 'Long slugs (>75 chars)',
          value: longSlugs,
          impact: 'Low',
          action: 'Use concise, descriptive slugs with primary keyword near the start.'
        },
        {
          label: 'Missing <h1> in content body',
          value: missingH1StyleHeadings,
          impact: 'Medium',
          action: 'Ensure each post has one clear H1 aligned to search intent.'
        }
      ].sort((a, b) => b.value - a.value);

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
        },
        seoStats: {
          totalPublished: publishedPosts.length,
          missingExcerpt,
          missingFeaturedImage,
          shortTitles,
          longTitles,
          longSlugs,
          missingH1StyleHeadings,
          recommendations
        }
      });
    } catch (err) {
      console.error("Fetch stats error:", err);
    } finally { setLoading(false); }
  };

  useEffect(() => { fetchData(); }, []);

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
          <TabButton id="seo" label="SEO Optimization" />
          <TabButton id="bots" label="Bot Registry" />
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

            {activeTab === 'seo' && (
              <div className="space-y-8">
                <section className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                  {[
                    { label: 'Published URLs', val: stats.seoStats.totalPublished, tone: 'text-blue-600' },
                    { label: 'Missing Descriptions', val: stats.seoStats.missingExcerpt, tone: 'text-red-600' },
                    { label: 'Missing OG Images', val: stats.seoStats.missingFeaturedImage, tone: 'text-amber-600' },
                    { label: 'Missing H1 Tags', val: stats.seoStats.missingH1StyleHeadings, tone: 'text-purple-600' }
                  ].map((metric, i) => (
                    <div key={i} className="bg-white p-8 rounded-xl border border-gray-100 shadow-sm">
                      <div className="text-[10px] font-black uppercase text-gray-400 tracking-widest mb-2">{metric.label}</div>
                      <div className={`text-4xl font-black ${metric.tone}`}>{metric.val}</div>
                    </div>
                  ))}
                </section>

                <section className="bg-white p-8 rounded-xl shadow-sm border border-gray-100">
                  <h3 className="text-[10px] font-black uppercase text-gray-400 tracking-widest mb-6">Full SEO Optimization Queue</h3>
                  <div className="overflow-x-auto">
                    <table className="min-w-full text-sm">
                      <thead>
                        <tr className="text-left text-[10px] uppercase tracking-widest text-gray-400 border-b">
                          <th className="py-3 pr-6">Issue</th>
                          <th className="py-3 pr-6">Affected</th>
                          <th className="py-3 pr-6">Impact</th>
                          <th className="py-3">Optimization Action</th>
                        </tr>
                      </thead>
                      <tbody>
                        {stats.seoStats.recommendations.map((rec, i) => (
                          <tr key={i} className="border-b last:border-0 align-top">
                            <td className="py-4 pr-6 font-bold text-gray-800">{rec.label}</td>
                            <td className="py-4 pr-6 font-black text-blue-600">{rec.value}</td>
                            <td className="py-4 pr-6">
                              <span className={`inline-flex px-2 py-1 rounded text-[10px] font-black uppercase tracking-wider ${
                                rec.impact === 'High'
                                  ? 'bg-red-50 text-red-600'
                                  : rec.impact === 'Medium'
                                    ? 'bg-amber-50 text-amber-600'
                                    : 'bg-slate-100 text-slate-600'
                              }`}>{rec.impact}</span>
                            </td>
                            <td className="py-4 text-gray-600 text-xs">{rec.action}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </section>

                <section className="bg-[#111] p-8 rounded-xl shadow-2xl text-white">
                  <h3 className="text-[10px] font-black uppercase text-gray-500 tracking-widest mb-5">Technical SEO Checklist</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                    {[
                      'Set canonical URL for each post/page to prevent duplicate indexing.',
                      'Add Organization + Article JSON-LD schema where possible.',
                      'Generate and submit XML sitemap in Google Search Console and Bing Webmaster Tools.',
                      'Validate robots.txt allows crawl on target content paths.',
                      'Use internal links from high-authority posts to newer strategic content.',
                      'Optimize Core Web Vitals: LCP image sizing, JS bundle splitting, and cache headers.',
                      'Implement social meta tags (Open Graph + Twitter Card) per post.',
                      'Add alt text policy for all featured and inline images.'
                    ].map((item, i) => (
                      <div key={i} className="border border-white/10 rounded px-4 py-3 text-gray-300">• {item}</div>
                    ))}
                  </div>
                </section>
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
};

export default AnalyticsView;
