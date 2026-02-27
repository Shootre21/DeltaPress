
import React, { useEffect } from 'react';
import { HashRouter, Routes, Route, Navigate } from 'react-router-dom';
import { startHeartbeat } from './services/analytics';
import BlogHome from './views/BlogHome';
import SinglePost from './views/SinglePost';
import Newsroom from './views/Newsroom';
import NewsDetail from './views/NewsDetail';
import ContactView from './views/ContactView';
import MeetTeam from './views/MeetTeam';
import Login from './views/Auth/Login';
import Register from './views/Auth/Register';
import AdminDashboard from './views/Admin/AdminDashboard';
import PostEditor from './views/Admin/PostEditor';
import PostsList from './views/Admin/PostsList';
import UsersList from './views/Admin/UsersList';
import SettingsView from './views/Admin/SettingsView';
import AppearanceView from './views/Admin/AppearanceView';
import GenericListView from './views/Admin/GenericListView';
import AnalyticsView from './views/Admin/AnalyticsView';
import DiagnosticsView from './views/Admin/DiagnosticsView';
import JournalistsView from './views/Admin/JournalistsView';
import RssFeedsView from './views/Admin/RssFeedsView';
import PagesListView from './views/Admin/PagesListView';
import SeoView from './views/Admin/SeoView';

const App: React.FC = () => {
  useEffect(() => {
    const stopHeartbeat = startHeartbeat();
    return () => stopHeartbeat();
  }, []);

  return (
    <HashRouter>
      <Routes>
        {/* Public Routes */}
        <Route path="/" element={<BlogHome />} />
        <Route path="/post/:slug" element={<SinglePost />} />
        <Route path="/news" element={<Newsroom />} />
        <Route path="/news/:url" element={<NewsDetail />} />
        <Route path="/contact" element={<ContactView />} />
        <Route path="/meet-our-team" element={<MeetTeam />} />
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
        
        {/* Admin Routes */}
        <Route path="/admin" element={<AdminDashboard />} />
        <Route path="/admin/analytics" element={<AnalyticsView />} />
        <Route path="/admin/posts" element={<PostsList />} />
        <Route path="/admin/new-post" element={<PostEditor />} />
        <Route path="/admin/edit-post/:id" element={<PostEditor />} />
        <Route path="/admin/users" element={<UsersList />} />
        <Route path="/admin/settings" element={<SettingsView />} />
        <Route path="/admin/appearance" element={<AppearanceView />} />
        <Route path="/admin/diagnostics" element={<DiagnosticsView />} />
        <Route path="/admin/journalists" element={<JournalistsView />} />
        <Route path="/admin/rss" element={<RssFeedsView />} />
        <Route path="/admin/seo" element={<SeoView />} />
        
        <Route path="/admin/pages" element={<PagesListView />} />
        <Route path="/admin/categories" element={<GenericListView title="Categories" table="categories" />} />
        <Route path="/admin/members" element={<GenericListView title="Members" table="profiles" />} />
        <Route path="/admin/projects" element={<GenericListView title="Projects" table="projects" />} />
        <Route path="/admin/media" element={<GenericListView title="Media Library" table="media" />} />
        <Route path="/admin/comments" element={<GenericListView title="Comments" table="comments" />} />
        <Route path="/admin/messages" element={<GenericListView title="Messages" table="contacts" />} />
        <Route path="/admin/services" element={<GenericListView title="Services" table="services" />} />
        <Route path="/admin/partners" element={<GenericListView title="Partners" table="partners" />} />
        <Route path="/admin/plugins" element={<GenericListView title="Plugins" table="plugins" />} />
        <Route path="/admin/tools" element={<GenericListView title="Tools" table="tools" />} />

        <Route path="*" element={<Navigate to="/" />} />
      </Routes>
    </HashRouter>
  );
};

export default App;
