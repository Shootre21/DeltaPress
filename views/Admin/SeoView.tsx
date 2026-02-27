import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../services/supabase';
import AdminSidebar from '../../components/AdminSidebar';
import { Post } from '../../types';

type SeoHealth = {
  totalPublished: number;
  missingExcerpts: number;
  shortTitles: number;
  longTitles: number;
  missingFeaturedImages: number;
};

const idealTitleMin = 30;
const idealTitleMax = 60;

const SeoView: React.FC = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [role, setRole] = useState<string>('user');
  const [siteTitle, setSiteTitle] = useState('');
  const [siteTagline, setSiteTagline] = useState('');
  const [keyword, setKeyword] = useState('');
  const [posts, setPosts] = useState<Post[]>([]);

  useEffect(() => {
    const init = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        navigate('/login');
        return;
      }

      const { data: profile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', session.user.id)
        .maybeSingle();

      const userRole = profile?.role || 'user';
      setRole(userRole);

      if (!['admin', 'editor'].includes(userRole)) {
        navigate('/admin');
        return;
      }

      const [{ data: publishedPosts }, { data: settings }] = await Promise.all([
        supabase
          .from('posts')
          .select('*')
          .eq('type', 'post')
          .eq('status', 'publish')
          .order('updated_at', { ascending: false }),
        supabase
          .from('site_settings')
          .select('title, slogan')
          .eq('id', 1)
          .maybeSingle()
      ]);

      setPosts((publishedPosts || []) as Post[]);
      setSiteTitle(settings?.title || '');
      setSiteTagline(settings?.slogan || '');
      setLoading(false);
    };

    init();
  }, [navigate]);

  const seoHealth: SeoHealth = useMemo(() => {
    const totalPublished = posts.length;
    const missingExcerpts = posts.filter(post => !post.excerpt || post.excerpt.trim().length < 80).length;
    const shortTitles = posts.filter(post => post.title.trim().length < idealTitleMin).length;
    const longTitles = posts.filter(post => post.title.trim().length > idealTitleMax).length;
    const missingFeaturedImages = posts.filter(post => !post.featured_image).length;

    return {
      totalPublished,
      missingExcerpts,
      shortTitles,
      longTitles,
      missingFeaturedImages,
    };
  }, [posts]);

  const completionScore = useMemo(() => {
    if (!seoHealth.totalPublished) return 100;
    const issues = seoHealth.missingExcerpts + seoHealth.shortTitles + seoHealth.longTitles + seoHealth.missingFeaturedImages;
    const maxIssues = seoHealth.totalPublished * 4;
    return Math.max(0, Math.round(((maxIssues - issues) / maxIssues) * 100));
  }, [seoHealth]);

  if (loading) {
    return <div className="p-10 text-center text-gray-400 font-bold animate-pulse font-serif italic">Loading SEO workspace...</div>;
  }

  return (
    <div className="flex min-h-screen bg-[#f1f1f1]">
      <AdminSidebar onLogout={() => supabase.auth.signOut().then(() => navigate('/login'))} />

      <main className="flex-1 p-6 lg:p-10 max-w-6xl">
        <header className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 font-serif">SEO Optimizer</h1>
          <p className="text-gray-500 text-sm">Improve search visibility and content findability from one admin tab.</p>
        </header>

        <section className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
          <div className="bg-white rounded border border-gray-200 p-5">
            <p className="text-[10px] uppercase font-black tracking-widest text-gray-400">SEO Health Score</p>
            <p className="text-4xl font-black mt-2 text-blue-600">{completionScore}%</p>
          </div>
          <div className="bg-white rounded border border-gray-200 p-5">
            <p className="text-[10px] uppercase font-black tracking-widest text-gray-400">Published Posts</p>
            <p className="text-4xl font-black mt-2 text-gray-900">{seoHealth.totalPublished}</p>
          </div>
          <div className="bg-white rounded border border-gray-200 p-5">
            <p className="text-[10px] uppercase font-black tracking-widest text-gray-400">Missing Meta Summaries</p>
            <p className="text-4xl font-black mt-2 text-amber-600">{seoHealth.missingExcerpts}</p>
          </div>
          <div className="bg-white rounded border border-gray-200 p-5">
            <p className="text-[10px] uppercase font-black tracking-widest text-gray-400">Posts Without Images</p>
            <p className="text-4xl font-black mt-2 text-rose-600">{seoHealth.missingFeaturedImages}</p>
          </div>
        </section>

        <section className="bg-white rounded border border-gray-200 p-6 mb-8">
          <h2 className="text-lg font-bold text-gray-900 mb-1">Site Search Snippet</h2>
          <p className="text-xs text-gray-500 mb-4">Preview how your homepage identity may look in search results.</p>
          <div className="border border-gray-200 rounded p-4 bg-gray-50">
            <p className="text-blue-700 text-xl leading-tight">{siteTitle || 'Your Site Title'}</p>
            <p className="text-green-700 text-xs mt-1">https://your-domain.com/</p>
            <p className="text-sm text-gray-700 mt-2">{siteTagline || 'Set a concise homepage tagline in Settings to improve click-through and keyword relevance.'}</p>
          </div>
        </section>

        <section className="bg-white rounded border border-gray-200 p-6 mb-8">
          <h2 className="text-lg font-bold text-gray-900 mb-4">Keyword Finder</h2>
          <label className="block text-xs font-black uppercase tracking-widest text-gray-500 mb-2">Target keyword or phrase</label>
          <input
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            placeholder="e.g. renewable energy policy"
            className="w-full border border-gray-300 rounded px-4 py-3 text-sm mb-4 focus:ring-2 focus:ring-[#0073aa] outline-none"
          />
          <div className="text-sm text-gray-700 bg-blue-50 border border-blue-100 rounded p-4">
            {keyword.trim()
              ? `Tip: Include "${keyword.trim()}" in title, first paragraph, image alt text, and meta summary for stronger findability.`
              : 'Add a keyword above to get quick optimization guidance for future posts.'}
          </div>
        </section>

        <section className="bg-white rounded border border-gray-200 p-6">
          <h2 className="text-lg font-bold text-gray-900 mb-4">Priority Fixes</h2>
          <ul className="space-y-3 text-sm text-gray-700 list-disc pl-6">
            <li>{seoHealth.shortTitles} post titles are shorter than {idealTitleMin} characters.</li>
            <li>{seoHealth.longTitles} post titles are longer than {idealTitleMax} characters.</li>
            <li>{seoHealth.missingExcerpts} posts need stronger meta summaries (excerpt field).</li>
            <li>{seoHealth.missingFeaturedImages} posts are missing featured images that help social/search previews.</li>
          </ul>
          {role === 'admin' && (
            <p className="text-[11px] uppercase font-black tracking-widest text-gray-400 mt-5">Admin tip: pair this tab with Analytics to verify improved organic engagement.</p>
          )}
        </section>
      </main>
    </div>
  );
};

export default SeoView;
