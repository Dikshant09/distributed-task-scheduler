import React from 'react';
import { BrowserRouter, Routes, Route, NavLink, useLocation } from 'react-router-dom';
import Dashboard from './pages/Dashboard';
import Jobs from './pages/Jobs';
import Schedule from './pages/Schedule';
import Admin from './pages/Admin';
import JobDetail from './pages/JobDetail';
import Header from './components/Header';
import './App.css';

// Helper component to handle active state for Jobs tab including sub-routes
const NavLinks = () => {
  const location = useLocation();
  const isJobsActive = location.pathname === '/jobs' || location.pathname.startsWith('/jobs/');

  return (
    <nav className="tabs">
      <NavLink to="/" className={({ isActive }) => isActive ? 'tab active' : 'tab'}>
        Dashboard
      </NavLink>
      <NavLink to="/jobs" className={isJobsActive ? 'tab active' : 'tab'}>
        Jobs
      </NavLink>
      <NavLink to="/schedule" className={({ isActive }) => isActive ? 'tab active' : 'tab'}>
        Schedule
      </NavLink>
      <NavLink to="/admin" className={({ isActive }) => isActive ? 'tab active' : 'tab'}>
        Admin
      </NavLink>
    </nav>
  );
};

function App() {
  return (
    <BrowserRouter>
      <div className="app">
        <Header />
        <NavLinks />
        <main className="main-content">
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/jobs" element={<Jobs />} />
            <Route path="/schedule" element={<Schedule />} />
            <Route path="/admin" element={<Admin />} />
            <Route path="/jobs/:id" element={<JobDetail />} />
          </Routes>
        </main>
      </div>
    </BrowserRouter>
  );
}

export default App;
