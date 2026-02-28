
import React, { useState, useEffect } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { supabase } from '../services/supabase';

type MenuItem = {
  label?: string;
  path?: string;
  icon?: string;
  roles?: string[];
  type?: 'separator';
  activeOn?: (pathname: string, search: string) => boolean;
};

const AdminSidebar: React.FC<{ onLogout: () => void }> = ({ onLogout }) => {
  const location = useLocation();
  const navigate = useNavigate();
  const [collapsed, setCollapsed] = useState(false);
  const [role, setRole] = useState<string>('user');
  const [userProfile, setUserProfile] = useState<{ display_name?: string, avatar_url?: string } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchUserAndRole = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (session) {
        const { data: profile } = await supabase
          .from('profiles')
          .select('role, display_name, avatar_url')
          .eq('id', session.user.id)
          .maybeSingle();
        
        if (profile) {
          setRole(profile.role);
          setUserProfile(profile);
        }
      }
      setLoading(false);
    };
    fetchUserAndRole();
  }, []);

  const menuItems: MenuItem[] = [
    { label: 'Dashboard', path: '/admin', icon: '📊', roles: ['admin', 'editor', 'reviewer', 'user'] },
    { label: 'Analytics', path: '/admin/analytics', icon: '📈', roles: ['admin', 'editor'], activeOn: (pathname, search) => pathname === '/admin/analytics' && !new URLSearchParams(search).get('tab') },
    { label: 'SEO Optimization', path: '/admin/analytics?tab=seo', icon: '🔍', roles: ['admin', 'editor'], activeOn: (pathname, search) => pathname === '/admin/analytics' && new URLSearchParams(search).get('tab') === 'seo' },
    { type: 'separator' },
    { label: 'All Posts', path: '/admin/posts', icon: '✍️', roles: ['admin', 'editor', 'reviewer'] },
    { label: 'Add New', path: '/admin/new-post', icon: '➕', roles: ['admin', 'editor'] },
    { label: 'Categories', path: '/admin/categories', icon: '🏷️', roles: ['admin', 'editor'] },
    { type: 'separator' },
    { label: 'RSS Feeds', path: '/admin/rss', icon: '📡', roles: ['admin'] },
    { label: 'Journalists', path: '/admin/journalists', icon: '🤖', roles: ['admin'] },
    { label: 'Services', path: '/admin/services', icon: '🛠️', roles: ['admin'] },
    { label: 'Members', path: '/admin/users', icon: '👤', roles: ['admin'] }, // Changed from /members to /users
    { label: 'Messages', path: '/admin/messages', icon: '📬', roles: ['admin'] },
    { label: 'Media', path: '/admin/media', icon: '📷', roles: ['admin', 'editor'] },
    { label: 'Pages', path: '/admin/pages', icon: '📄', roles: ['admin', 'editor'] },
    { label: 'Comments', path: '/admin/comments', icon: '💬', roles: ['admin', 'editor', 'reviewer', 'user'] },
    { type: 'separator' },
    { label: 'Appearance', path: '/admin/appearance', icon: '🖌️', roles: ['admin', 'editor', 'reviewer', 'user'] },
    { label: 'Diagnostics', path: '/admin/diagnostics', icon: '🩺', roles: ['admin'] },
    { label: 'Settings', path: '/admin/settings', icon: '⚙️', roles: ['admin'] },
  ];

  const isActive = (item: MenuItem) => {
    if (item.activeOn) return item.activeOn(location.pathname, location.search);
    return location.pathname === item.path;
  };

  const filteredItems = menuItems.filter(item => {
    if (item.type === 'separator') return true;
    return (item as any).roles.includes(role);
  });

  return (
    <div className={`${collapsed ? 'w-12' : 'w-64'} bg-[#23282d] text-[#eee] flex flex-col h-screen transition-all duration-200 sticky top-0 overflow-y-auto overflow-x-hidden select-none z-50 shrink-0`}>
      
      <div className="p-4 bg-[#1d2327] flex items-center gap-3 border-b border-white/5">
        <div 
          onClick={() => navigate('/admin/appearance')}
          className="w-10 h-10 rounded-full overflow-hidden bg-gray-700 shrink-0 cursor-pointer hover:ring-2 hover:ring-blue-500 transition-all border border-white/10"
        >
          {userProfile?.avatar_url ? (
            <img src={userProfile.avatar_url} alt="Profile" className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full flex items-center justify-center bg-gray-600">
              <span className="text-gray-400 font-bold">{userProfile?.display_name?.[0] || 'U'}</span>
            </div>
          )}
        </div>
        {!collapsed && (
          <div className="min-w-0">
            <span className="block text-[12px] font-black text-white uppercase tracking-tighter truncate leading-none mb-1">
              {userProfile?.display_name || 'Staff Member'}
            </span>
            <span className="block text-[9px] font-bold text-blue-400 uppercase tracking-widest leading-none">
              {role}
            </span>
          </div>
        )}
      </div>

      <nav className="flex-1 py-2">
        {loading ? (
          <div className="px-4 py-10 opacity-20 animate-pulse space-y-4">
            <div className="h-4 bg-gray-500 rounded w-full"></div>
            <div className="h-4 bg-gray-500 rounded w-full"></div>
          </div>
        ) : (
          filteredItems.map((item, idx) => {
            if (item.type === 'separator') {
              return <div key={idx} className="h-4 border-b border-[#3c434a] my-2 mx-4 opacity-10" />;
            }

            const className = `flex items-center gap-3 px-4 py-2.5 hover:bg-[#191e23] hover:text-[#72aee6] transition-colors text-[14px] ${isActive(item) ? 'bg-[#0073aa] text-white font-bold' : 'text-[#a7aaad]'}`;

            return (
              <Link key={idx} to={item.path!} className={className}>
                <span className="text-lg w-6 flex justify-center opacity-80">{item.icon}</span>
                {!collapsed && <span className="truncate">{item.label}</span>}
              </Link>
            );
          })
        )}
      </nav>

      <div className="mt-auto border-t border-[#3c434a] bg-[#1d2327]">
        <button
          onClick={onLogout}
          className="w-full flex items-center gap-3 px-4 py-4 hover:bg-red-900 text-red-200 text-[11px] uppercase font-bold transition-colors"
        >
          <span className="text-lg w-6 flex justify-center">🚪</span>
          {!collapsed && <span className="truncate">Log out</span>}
        </button>
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="w-full flex items-center gap-3 px-4 py-3 hover:bg-[#191e23] text-[#a7aaad] text-[11px] uppercase font-bold transition-colors border-t border-[#3c434a]"
        >
          <span className="text-lg w-6 flex justify-center">{collapsed ? '▶' : '◀'}</span>
          {!collapsed && <span className="truncate">Collapse Sidebar</span>}
        </button>
      </div>
    </div>
  );
};

export default AdminSidebar;
