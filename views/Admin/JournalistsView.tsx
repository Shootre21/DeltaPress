
import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../services/supabase';
import { checkAndRunDueAgents } from '../../services/agentEngine';
import { GoogleGenAI, Type } from "@google/genai";
import AdminSidebar from '../../components/AdminSidebar';

interface Bot {
  id: string;
  name: string;
  title: string;
  niche: string;
  category: string; 
  category_id?: string; 
  schedule: string;
  status: 'active' | 'paused';
  last_run: string | null;
  perspective: number; 
  gender: 'male' | 'female';
  ethnicity: string;
  hair_color: string;
  avatar_url?: string;
  age: number;
  use_current_events: boolean;
}

const ETHNICITIES = ['Arab', 'Asian', 'Latino', 'White', 'Black', 'Middle Eastern', 'South Asian'];
const HAIR_COLORS = ['Blonde', 'Red', 'Black', 'Brunette', 'Silver', 'Bleached'];

const FREQUENCIES = [
  { id: '6h', label: 'Every 6 Hours', hours: 6 },
  { id: '24h', label: 'Once Daily', hours: 24 },
  { id: '2w', label: 'Twice Weekly', hours: 84 },
  { id: '1w', label: 'Once a Week', hours: 168 },
  { id: '1m', label: 'Once a Month', hours: 720 }
];

const SPECTRUM_LABELS: Record<number, string> = {
  [-3]: 'Far Left (Anarchism)',
  [-2]: 'Left (Communist)',
  [-1]: 'Center Left (Socialist)',
  [0]: 'Center (Moderate)',
  [1]: 'Center Right (Liberal)',
  [2]: 'Right (Conservative)',
  [3]: 'Far Right (Nationalist)'
};

const DEFAULT_AVATAR_URLS = {
  male: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150&h=150&fit=crop',
  female: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=150&h=150&fit=crop'
};

type ProviderTestState = {
  status: 'idle' | 'testing' | 'online' | 'offline';
  detail: string;
  checkedAt?: string;
};

type ProviderConfig = {
  id: string;
  label: string;
  provider: string;
};

const RESEARCH_PROVIDERS: ProviderConfig[] = [
  { id: 'moonshot', label: 'Moonshot Kimi', provider: 'MOONSHOT' },
  { id: 'zhipu', label: 'Zhipu AI', provider: 'ZAI' },
  { id: 'gemini', label: 'Google Gemini', provider: 'GEMINI' },
  { id: 'aiml', label: 'AI/ML API', provider: 'AIMLAPI' }
];

const RESEARCH_PROXY_URL = 'https://www.sh00tre.xyz/api/proxy-research';

const JournalistsView: React.FC = () => {
  const navigate = useNavigate();
  const [bots, setBots] = useState<Bot[]>([]);
  const [categories, setCategories] = useState<{id: string, name: string}[]>([]);
  const [loading, setLoading] = useState(true);
  const [isDeploying, setIsDeploying] = useState<string | null>(null);
  const [deploymentStep, setDeploymentStep] = useState<string>('');
  const [deploymentProgress, setDeploymentProgress] = useState<number>(0);
  const [showConfigModal, setShowConfigModal] = useState(false);
  const [editingBot, setEditingBot] = useState<Bot | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isGeneratingAvatar, setIsGeneratingAvatar] = useState(false);
  const [now, setNow] = useState(new Date());

  // Topic Research State
  const [newsQuery, setNewsQuery] = useState('');
  const [isSearchingNews, setIsSearchingNews] = useState(false);
  const [newsResults, setNewsResults] = useState<{title: string, summary: string}[]>([]);
  const [apiTestQuery, setApiTestQuery] = useState('Debate Over Socialist Economics in the United States');
  const [providerTests, setProviderTests] = useState<Record<string, ProviderTestState>>(() =>
    Object.fromEntries(RESEARCH_PROVIDERS.map((p) => [p.id, { status: 'idle', detail: 'Not tested yet.' }]))
  );
  
  const [formData, setFormData] = useState({
    name: '',
    title: '',
    niche: '',
    category_id: '',
    schedule: '24h',
    perspective: 0,
    gender: 'female' as 'male' | 'female',
    ethnicity: 'White',
    hair_color: 'Brunette',
    avatar_url: '',
    age: 35,
    use_current_events: false
  });

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [{ data: botsData }, { data: catsData }] = await Promise.all([
        supabase.from('journalists').select('*'),
        supabase.from('categories').select('id, name').order('name')
      ]);
      if (botsData) setBots(botsData);
      if (catsData) {
        setCategories(catsData);
        if (!formData.category_id && catsData.length > 0) {
          setFormData(prev => ({ ...prev, category_id: catsData[0].id }));
        }
      }
    } catch (err) {} finally { setLoading(false); }
  }, [formData.category_id]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const searchNewsTopics = async () => {
    if (!newsQuery.trim()) return;
    setIsSearchingNews(true);
    setNewsResults([]);
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY || '' });
      const response = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: `Fetch and summarize 5 major news topics or articles regarding: "${newsQuery}".`,
        config: {
          tools: [{ googleSearch: {} }],
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                title: { type: Type.STRING },
                summary: { type: Type.STRING }
              },
              required: ["title", "summary"]
            }
          }
        }
      });
      const results = JSON.parse(response.text || '[]');
      setNewsResults(results);
    } catch (err) {
      console.error(err);
    } finally {
      setIsSearchingNews(false);
    }
  };

  const testProvider = async (provider: ProviderConfig) => {
    setProviderTests((prev) => ({
      ...prev,
      [provider.id]: { status: 'testing', detail: 'Testing connection...' }
    }));

    try {
      const res = await fetch(RESEARCH_PROXY_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider: provider.provider,
          query: apiTestQuery,
          test: true,
          mode: 'healthcheck'
        })
      });

      const bodyText = await res.text();
      const checkedAt = new Date().toLocaleTimeString();

      if (!res.ok) {
        setProviderTests((prev) => ({
          ...prev,
          [provider.id]: {
            status: 'offline',
            detail: `HTTP ${res.status}: ${bodyText.slice(0, 180) || 'No response body'}`,
            checkedAt
          }
        }));
        return;
      }

      setProviderTests((prev) => ({
        ...prev,
        [provider.id]: {
          status: 'online',
          detail: 'Provider responded successfully via proxy.',
          checkedAt
        }
      }));
    } catch (err: any) {
      setProviderTests((prev) => ({
        ...prev,
        [provider.id]: {
          status: 'offline',
          detail: err?.message || 'Network request failed.',
          checkedAt: new Date().toLocaleTimeString()
        }
      }));
    }
  };

  const testAllProviders = async () => {
    for (const provider of RESEARCH_PROVIDERS) {
      // Sequential requests make API diagnostics easier to read and throttle-friendly.
      // eslint-disable-next-line no-await-in-loop
      await testProvider(provider);
    }
  };


  const calculateNextRun = (bot: Bot) => {
    if (!bot.last_run) return new Date(0);
    const freq = FREQUENCIES.find(f => f.id === bot.schedule) || FREQUENCIES[1];
    return new Date(new Date(bot.last_run).getTime() + freq.hours * 60 * 60 * 1000);
  };

  const calculateCountdown = (nextRun: Date) => {
    const diff = nextRun.getTime() - now.getTime();
    if (diff <= 0) return "DUE";
    const h = Math.floor(diff / 3600000);
    const m = Math.floor((diff % 3600000) / 60000);
    const s = Math.floor((diff % 60000) / 1000);
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  const handleManualDeploy = async (bot: Bot) => {
    if (isDeploying) return;
    setIsDeploying(bot.id);
    setDeploymentStep('Booting agent...');
    setDeploymentProgress(0);

    try {
      await checkAndRunDueAgents((step, progress) => {
        setDeploymentStep(step);
        setDeploymentProgress(progress);
      }, bot.id);
      
      await fetchData();
    } catch (err) {
      console.error("Manual deploy failed:", err);
    } finally {
      setTimeout(() => {
        setIsDeploying(null);
        setDeploymentStep('');
        setDeploymentProgress(0);
      }, 1500);
    }
  };

  const generateAIAvatar = async () => {
    if (!formData.name) return;
    setIsGeneratingAvatar(true);
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY || '' });
      const prompt = `Realistic editorial headshot of a ${formData.age}-year-old ${formData.ethnicity} ${formData.gender} news journalist, ${formData.hair_color} hair, professional neutral background, high-end photography.`;
      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash-image',
        contents: { parts: [{ text: prompt }] },
        config: { imageConfig: { aspectRatio: "1:1" } }
      });
      const imagePart = response.candidates?.[0]?.content?.parts?.find(p => p.inlineData);
      if (imagePart?.inlineData) {
        setFormData(prev => ({ ...prev, avatar_url: `data:image/png;base64,${imagePart.inlineData.data}` }));
      }
    } catch (err) {} finally { setIsGeneratingAvatar(false); }
  };

  const handleOpenModal = (bot: Bot | null = null) => {
    setNewsResults([]);
    setNewsQuery('');
    if (bot) {
      setEditingBot(bot);
      setFormData({
        name: bot.name, title: bot.title || '', niche: bot.niche, category_id: bot.category_id || '',
        schedule: bot.schedule || '24h', perspective: bot.perspective, gender: bot.gender,
        ethnicity: bot.ethnicity || 'White', hair_color: bot.hair_color || 'Brunette', avatar_url: bot.avatar_url || '',
        age: bot.age || 35, use_current_events: bot.use_current_events || false
      });
    } else {
      setEditingBot(null);
      setFormData({ 
        name: '', title: '', niche: '', category_id: categories[0]?.id || '', schedule: '24h', 
        perspective: 0, gender: 'female', ethnicity: 'White', hair_color: 'Brunette', avatar_url: '',
        age: 35, use_current_events: false
      });
    }
    setShowConfigModal(true);
  };

  const handleSaveBot = async () => {
    if (!formData.name) return;
    setIsSaving(true);
    try {
      const catName = categories.find(c => c.id === formData.category_id)?.name || 'General';
      const payload: any = {
        name: formData.name, title: formData.title, niche: formData.niche, category: catName, 
        category_id: formData.category_id || null, // Convert "" to null
        schedule: formData.schedule, perspective: formData.perspective, 
        gender: formData.gender, ethnicity: formData.ethnicity, hair_color: formData.hair_color,
        avatar_url: formData.avatar_url, status: editingBot?.status || 'active',
        age: formData.age, use_current_events: formData.use_current_events
      };
      
      let res;
      if (editingBot) {
        res = await supabase.from('journalists').update(payload).eq('id', editingBot.id);
      } else {
        res = await supabase.from('journalists').insert([payload]);
      }
      
      if (res.error) throw res.error;
      await fetchData();
      setShowConfigModal(false);
    } catch (err: any) { 
        alert("Deployment Error: " + err.message); 
    } finally { setIsSaving(false); }
  };

  return (
    <div className="flex min-h-screen bg-[#f1f1f1]">
      <AdminSidebar onLogout={() => navigate('/login')} />
      <main className="flex-1 p-6 lg:p-10 max-w-7xl mx-auto w-full">
        <header className="flex justify-between items-center mb-12">
          <div>
            <h1 className="text-4xl font-black text-gray-900 font-serif">Newsroom AI</h1>
            <p className="text-gray-400 text-xs font-black uppercase tracking-[0.3em] mt-2">Autonomous Narrative Grid</p>
          </div>
          <button onClick={() => handleOpenModal()} className="bg-[#0073aa] text-white px-8 py-3 rounded text-[10px] font-black uppercase tracking-widest shadow-xl active:scale-95 transition-all">New Agent</button>
        </header>

        {loading ? (
           <div className="py-20 text-center italic font-serif text-gray-400">Syncing agent network...</div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {bots.map(bot => (
              <div key={bot.id} className="bg-white border rounded shadow-sm flex flex-col group overflow-hidden relative">
                 <div className="p-8 pb-4 flex items-center gap-5">
                    <img src={bot.avatar_url || (bot.gender === 'male' ? DEFAULT_AVATAR_URLS.male : DEFAULT_AVATAR_URLS.female)} className="w-16 h-16 rounded-full object-cover border shadow-sm" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <h3 className="text-xl font-black text-gray-900 font-serif leading-none truncate">{bot.name}</h3>
                        <span className="text-[10px] bg-gray-100 px-1.5 py-0.5 rounded font-black text-gray-500">{bot.age}y</span>
                      </div>
                      <p className="text-[9px] text-blue-500 font-black uppercase tracking-widest mt-1 truncate">{bot.title || bot.category}</p>
                    </div>
                 </div>
                 <div className="p-8 pt-0 flex-1 space-y-4">
                    <div className="bg-gray-50 p-4 rounded border">
                      <p className="text-[10px] font-black uppercase text-gray-400">Assignment Focus</p>
                      <p className="text-sm font-bold text-gray-800 line-clamp-2 min-h-[40px] leading-tight mt-1">{bot.niche}</p>
                    </div>
                    
                    <div className={`p-5 rounded border-l-4 transition-all duration-500 ${isDeploying === bot.id ? 'bg-blue-600 text-white border-white' : (calculateCountdown(calculateNextRun(bot)) === 'DUE' ? 'bg-red-900 text-white border-red-500' : 'bg-[#1d2327] text-white border-blue-500')}`}>
                        <div className="flex justify-between items-center mb-1">
                            <div className="text-[10px] font-black uppercase opacity-60">
                                {isDeploying === bot.id ? 'Operation in Progress' : 'Deployment Cycle'}
                            </div>
                            {bot.use_current_events && !isDeploying && <span className="text-[8px] bg-green-500 text-white px-1 py-0.5 rounded">GROUNDED</span>}
                        </div>
                        
                        {isDeploying === bot.id ? (
                           <div className="space-y-3 py-1">
                              <div className="flex justify-between items-end">
                                 <span className="text-[11px] font-black uppercase tracking-widest animate-pulse">{deploymentStep}</span>
                                 <span className="text-xl font-mono font-black">{deploymentProgress}%</span>
                              </div>
                              <div className="w-full bg-white/20 h-2 rounded-full overflow-hidden">
                                 <div 
                                    className="h-full bg-white transition-all duration-700 ease-out" 
                                    style={{ width: `${deploymentProgress}%` }}
                                 />
                              </div>
                           </div>
                        ) : (
                           <div className="text-3xl font-mono font-black">{calculateCountdown(calculateNextRun(bot))}</div>
                        )}
                    </div>
                 </div>
                 <div className="p-8 pt-0 flex gap-2">
                    <button 
                       onClick={() => handleManualDeploy(bot)} 
                       disabled={!!isDeploying} 
                       className="flex-1 bg-gray-900 text-white py-4 rounded text-[10px] font-black uppercase hover:bg-black disabled:opacity-50 transition-all shadow-md active:scale-95"
                    >
                       {isDeploying === bot.id ? 'Deploying...' : 'Manual Deploy'}
                    </button>
                    <button onClick={() => handleOpenModal(bot)} className="px-6 bg-gray-100 rounded text-[10px] font-black uppercase border hover:bg-gray-200 transition-all">Edit</button>
                 </div>
              </div>
            ))}
          </div>
        )}

        {showConfigModal && (
          <div className="fixed inset-0 bg-black/70 flex items-center justify-center p-4 z-[100] backdrop-blur-sm overflow-y-auto">
            <div className="bg-white p-10 rounded shadow-2xl max-w-5xl w-full border-t-8 border-gray-900 my-8">
              <h2 className="text-2xl font-black mb-8 font-serif uppercase tracking-tighter">Calibrate Intelligence</h2>
              
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-12">
                <div className="space-y-6">
                  <div className="grid grid-cols-3 gap-4">
                    <div className="col-span-2 space-y-1">
                        <label className="text-[10px] font-black uppercase text-gray-400">Agent Name</label>
                        <input type="text" className="w-full border-2 p-3 font-bold text-sm bg-gray-50 outline-none focus:border-blue-500" value={formData.name} onChange={e => setFormData({ ...formData, name: e.target.value })} />
                    </div>
                    <div className="space-y-1">
                        <label className="text-[10px] font-black uppercase text-gray-400">Age</label>
                        <input type="number" className="w-full border-2 p-3 font-bold text-sm bg-gray-50 outline-none focus:border-blue-500" value={formData.age} onChange={e => setFormData({ ...formData, age: parseInt(e.target.value) })} />
                    </div>
                  </div>

                  <div className="p-4 bg-gray-50 rounded border border-gray-200 space-y-3">
                    <div className="flex flex-wrap justify-between items-center gap-3">
                      <label className="text-[10px] font-black uppercase text-gray-600 tracking-widest">API Health Checks</label>
                      <button
                        onClick={testAllProviders}
                        className="bg-gray-900 text-white px-3 py-2 text-[9px] font-black uppercase rounded"
                      >
                        Test All APIs
                      </button>
                    </div>

                    <input
                      type="text"
                      value={apiTestQuery}
                      onChange={(e) => setApiTestQuery(e.target.value)}
                      className="w-full text-xs p-2 border focus:border-blue-500 outline-none"
                      placeholder="Test query for provider checks"
                    />

                    <div className="space-y-2">
                      {RESEARCH_PROVIDERS.map((provider) => {
                        const state = providerTests[provider.id];
                        const isTesting = state?.status === 'testing';
                        return (
                          <div key={provider.id} className="p-2 bg-white border rounded">
                            <div className="flex items-center justify-between gap-2">
                              <div>
                                <p className="text-[10px] font-black text-gray-800">{provider.label}</p>
                                <p className="text-[9px] text-gray-500">
                                  {state?.detail || 'Not tested yet.'}
                                  {state?.checkedAt ? ` • ${state.checkedAt}` : ''}
                                </p>
                              </div>
                              <div className="flex items-center gap-2 shrink-0">
                                <span className={`text-[8px] px-2 py-1 rounded font-black uppercase ${
                                  state?.status === 'online'
                                    ? 'bg-green-100 text-green-700'
                                    : state?.status === 'offline'
                                    ? 'bg-red-100 text-red-700'
                                    : state?.status === 'testing'
                                    ? 'bg-blue-100 text-blue-700'
                                    : 'bg-gray-100 text-gray-600'
                                }`}>
                                  {state?.status || 'idle'}
                                </span>
                                <button
                                  onClick={() => testProvider(provider)}
                                  disabled={isTesting}
                                  className="bg-blue-600 text-white px-3 py-1.5 text-[9px] font-black uppercase rounded disabled:opacity-50"
                                >
                                  {isTesting ? 'Testing...' : 'Test API'}
                                </button>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  <div className="space-y-1">
                    <label className="text-[10px] font-black uppercase text-gray-400">Professional Title</label>
                    <input type="text" className="w-full border-2 p-3 font-bold text-sm bg-gray-50 outline-none focus:border-blue-500" value={formData.title} onChange={e => setFormData({ ...formData, title: e.target.value })} />
                  </div>

                  <div className="p-4 bg-blue-50 rounded border border-blue-100 space-y-3">
                    <div className="flex justify-between items-center">
                        <label className="text-[10px] font-black uppercase text-blue-600 tracking-widest">Topic Research Engine</label>
                        {isSearchingNews && <span className="text-[8px] animate-pulse">Searching...</span>}
                    </div>
                    <div className="flex gap-2">
                        <input 
                            type="text" 
                            placeholder="Search live news to focus on..." 
                            className="flex-1 text-xs p-2 border focus:border-blue-500 outline-none"
                            value={newsQuery}
                            onChange={e => setNewsQuery(e.target.value)}
                        />
                        <button onClick={searchNewsTopics} className="bg-blue-600 text-white px-3 text-[9px] font-black uppercase rounded">Research</button>
                    </div>
                    <div className="max-h-32 overflow-y-auto space-y-2 mt-2">
                        {newsResults.map((n, i) => (
                            <div key={i} onClick={() => setFormData({...formData, niche: n.title})} className="p-2 bg-white border rounded cursor-pointer hover:border-blue-500 transition-all">
                                <p className="text-[10px] font-black text-gray-800 leading-tight mb-0.5">{n.title}</p>
                                <p className="text-[8px] text-gray-500 line-clamp-1">{n.summary}</p>
                            </div>
                        ))}
                    </div>
                  </div>

                  <div className="p-4 bg-gray-50 rounded border border-gray-200 space-y-3">
                    <div className="flex flex-wrap justify-between items-center gap-3">
                      <label className="text-[10px] font-black uppercase text-gray-600 tracking-widest">API Health Checks</label>
                      <button
                        onClick={testAllProviders}
                        className="bg-gray-900 text-white px-3 py-2 text-[9px] font-black uppercase rounded"
                      >
                        Test All APIs
                      </button>
                    </div>

                    <input
                      type="text"
                      value={apiTestQuery}
                      onChange={(e) => setApiTestQuery(e.target.value)}
                      className="w-full text-xs p-2 border focus:border-blue-500 outline-none"
                      placeholder="Test query for provider checks"
                    />

                    <div className="space-y-2">
                      {RESEARCH_PROVIDERS.map((provider) => {
                        const state = providerTests[provider.id];
                        const isTesting = state?.status === 'testing';
                        return (
                          <div key={provider.id} className="p-2 bg-white border rounded">
                            <div className="flex items-center justify-between gap-2">
                              <div>
                                <p className="text-[10px] font-black text-gray-800">{provider.label}</p>
                                <p className="text-[9px] text-gray-500">
                                  {state?.detail || 'Not tested yet.'}
                                  {state?.checkedAt ? ` • ${state.checkedAt}` : ''}
                                </p>
                              </div>
                              <div className="flex items-center gap-2 shrink-0">
                                <span className={`text-[8px] px-2 py-1 rounded font-black uppercase ${
                                  state?.status === 'online'
                                    ? 'bg-green-100 text-green-700'
                                    : state?.status === 'offline'
                                    ? 'bg-red-100 text-red-700'
                                    : state?.status === 'testing'
                                    ? 'bg-blue-100 text-blue-700'
                                    : 'bg-gray-100 text-gray-600'
                                }`}>
                                  {state?.status || 'idle'}
                                </span>
                                <button
                                  onClick={() => testProvider(provider)}
                                  disabled={isTesting}
                                  className="bg-blue-600 text-white px-3 py-1.5 text-[9px] font-black uppercase rounded disabled:opacity-50"
                                >
                                  {isTesting ? 'Testing...' : 'Test API'}
                                </button>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  <div className="space-y-1">
                    <label className="text-[10px] font-black uppercase text-gray-400">Editorial Beat / Focus</label>
                    <textarea 
                        className="w-full border-2 p-3 font-bold text-sm bg-gray-50 outline-none focus:border-blue-500 min-h-[80px]" 
                        value={formData.niche} 
                        onChange={e => setFormData({ ...formData, niche: e.target.value })} 
                        placeholder="e.g. US Policy on Cuba's Economic Stability"
                    />
                  </div>

                  <div className="flex items-center gap-3 p-4 bg-gray-50 border rounded">
                    <input 
                        type="checkbox" 
                        id="eventsCheck" 
                        className="w-4 h-4" 
                        checked={formData.use_current_events}
                        onChange={e => setFormData({...formData, use_current_events: e.target.checked})}
                    />
                    <label htmlFor="eventsCheck" className="text-[10px] font-black uppercase text-gray-600 tracking-widest">Enable Current Events Grounding (Google Search)</label>
                  </div>
                </div>

                <div className="space-y-6">
                    <div className="bg-gray-50 p-6 rounded border flex flex-col items-center gap-4">
                        <div className="w-32 h-32 rounded-full border-4 border-white shadow-xl overflow-hidden bg-gray-200">
                            {formData.avatar_url && <img src={formData.avatar_url} className="w-full h-full object-cover" />}
                        </div>
                        <button onClick={generateAIAvatar} disabled={isGeneratingAvatar || !formData.name} className="w-full py-3 bg-white border border-gray-200 rounded text-[10px] font-black uppercase hover:bg-gray-100 disabled:opacity-50 transition-all shadow-sm">
                            {isGeneratingAvatar ? 'Synthesizing...' : '✨ Sync Portrait'}
                        </button>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-1">
                            <label className="text-[10px] font-black uppercase text-gray-400">Section</label>
                            <select className="w-full border-2 p-3 font-bold text-sm bg-gray-50" value={formData.category_id} onChange={e => setFormData({ ...formData, category_id: e.target.value })}>
                                <option value="">Select Category</option>
                                {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                            </select>
                        </div>
                        <div className="space-y-1">
                            <label className="text-[10px] font-black uppercase text-gray-400">Frequency</label>
                            <select className="w-full border-2 p-3 font-bold text-sm bg-gray-50" value={formData.schedule} onChange={e => setFormData({ ...formData, schedule: e.target.value })}>
                                {FREQUENCIES.map(f => <option key={f.id} value={f.id}>{f.label}</option>)}
                            </select>
                        </div>
                    </div>

                    <div className="space-y-2">
                        <div className="flex justify-between items-center">
                            <label className="text-[10px] font-black uppercase text-gray-400">Editorial Perspective</label>
                            <span className="text-[8px] font-black uppercase text-red-500 bg-red-50 px-2 rounded">
                                {SPECTRUM_LABELS[formData.perspective]}
                            </span>
                        </div>
                        <input type="range" min="-3" max="3" step="1" className="w-full h-1.5 bg-gray-200 rounded appearance-none cursor-pointer accent-gray-900" value={formData.perspective} onChange={e => setFormData({ ...formData, perspective: parseInt(e.target.value) })} />
                        <div className="flex justify-between text-[8px] font-black text-gray-400 uppercase tracking-tighter">
                            <span>Left</span>
                            <span>Neutral</span>
                            <span>Right</span>
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-1">
                            <label className="text-[10px] font-black uppercase text-gray-400">Gender</label>
                            <select className="w-full border-2 p-3 font-bold text-sm bg-gray-50" value={formData.gender} onChange={e => setFormData({ ...formData, gender: e.target.value as any })}><option value="female">Female</option><option value="male">Male</option></select>
                        </div>
                        <div className="space-y-1">
                            <label className="text-[10px] font-black uppercase text-gray-400">Ethnicity</label>
                            <select className="w-full border-2 p-3 font-bold text-sm bg-gray-50" value={formData.ethnicity} onChange={e => setFormData({ ...formData, ethnicity: e.target.value })}>{ETHNICITIES.map(et => <option key={et} value={et}>{et}</option>)}</select>
                        </div>
                    </div>
                </div>
              </div>

              <div className="flex justify-end gap-3 mt-10 pt-6 border-t">
                <button onClick={() => setShowConfigModal(false)} className="text-gray-400 font-bold uppercase text-[10px] px-6 transition-colors hover:text-gray-600">Cancel</button>
                <button onClick={handleSaveBot} disabled={isSaving} className="bg-gray-900 text-white px-12 py-4 rounded font-black uppercase text-[10px] shadow-xl hover:bg-black transition-all active:scale-95 disabled:opacity-50">Commit Agent</button>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
};

export default JournalistsView;
