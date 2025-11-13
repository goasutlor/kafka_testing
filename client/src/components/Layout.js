import React, { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { 
  Settings, 
  Send, 
  Download, 
  BarChart3, 
  Database,
  Menu,
  X,
  LogOut,
  User
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import './Layout.css';

const Layout = ({ children }) => {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const location = useLocation();
  const navigate = useNavigate();
  const { user, logout } = useAuth();

  const menuItems = [
    { path: '/kafka', label: 'KAFKA CONNECTION', icon: Database },
    { path: '/produce', label: 'PRODUCE APP', icon: Send },
    { path: '/consume', label: 'CONSUME APP', icon: Download },
    { path: '/reports', label: 'REPORTS', icon: BarChart3 },
  ];

  return (
    <div className="layout">
      <div className={`sidebar ${sidebarOpen ? 'sidebar-open' : 'sidebar-closed'}`}>
        <div className="sidebar-header">
          <div className="logo">
            <div className="logo-icon"></div>
            <div className="logo-text">
              <h3>Kafka Test</h3>
              <p>Testing & Monitoring</p>
            </div>
          </div>
          <button 
            className="sidebar-toggle"
            onClick={() => setSidebarOpen(!sidebarOpen)}
          >
            {sidebarOpen ? <X size={20} /> : <Menu size={20} />}
          </button>
        </div>
        
        <nav className="sidebar-nav">
          {menuItems.map((item) => {
            const Icon = item.icon;
            const isActive = location.pathname === item.path;
            return (
              <Link
                key={item.path}
                to={item.path}
                className={`nav-item ${isActive ? 'active' : ''}`}
              >
                <Icon size={18} />
                {sidebarOpen && <span>{item.label}</span>}
              </Link>
            );
          })}
        </nav>

        {sidebarOpen && user && (
          <div className="sidebar-footer">
            <div className="user-info">
              <div className="user-avatar">
                <User size={20} />
              </div>
              <div className="user-details">
                <div className="user-name">{user.username}</div>
                <div className="user-role">{user.role}</div>
              </div>
            </div>
            <button
              onClick={() => {
                logout();
                navigate('/login');
              }}
              className="logout-btn"
            >
              <LogOut size={16} />
              Logout
            </button>
          </div>
        )}
      </div>

      <div className="main-content">
        {children}
      </div>
    </div>
  );
};

export default Layout;

