import React from 'react';
import { BrowserRouter, Routes, Route, NavLink } from 'react-router-dom';
import Dashboard from './pages/Dashboard';
import Jobs from './pages/Jobs';
import Schedule from './pages/Schedule';
import Admin from './pages/Admin';
import Header from './components/Header';
import './App.css';

function App() {
  return (
    <BrowserRouter>
      <div className="app">
        <Header />

        <nav className="tabs">
          <NavLink to="/" className={({ isActive }) => isActive ? 'tab active' : 'tab'}>
            Dashboard
          </NavLink>
          <NavLink to="/jobs" className={({ isActive }) => isActive ? 'tab active' : 'tab'}>
            Jobs
          </NavLink>
          <NavLink to="/schedule" className={({ isActive }) => isActive ? 'tab active' : 'tab'}>
            Schedule
          </NavLink>
          <NavLink to="/admin" className={({ isActive }) => isActive ? 'tab active' : 'tab'}>
            Admin
          </NavLink>
        </nav>

        <main className="main-content">
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/jobs" element={<Jobs />} />
            <Route path="/schedule" element={<Schedule />} />
            <Route path="/admin" element={<Admin />} />
          </Routes>
        </main>
      </div>
    </BrowserRouter>
  );
}

export default App;
