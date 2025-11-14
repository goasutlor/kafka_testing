import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import Layout from './components/Layout';
import LoginPage from './pages/LoginPage';
import KafkaConnection from './pages/KafkaConnection';
import ProduceApp from './pages/ProduceApp';
import ConsumeApp from './pages/ConsumeApp';
import Reports from './pages/Reports';
import LoadTestPage from './pages/LoadTestPage';
import './App.css';

// Protected Route Component
const ProtectedRoute = ({ children }) => {
  const { isAuthenticated, loading } = useAuth();

  if (loading) {
    return (
      <div style={{ 
        display: 'flex', 
        justifyContent: 'center', 
        alignItems: 'center', 
        height: '100vh',
        background: 'var(--surface)'
      }}>
        <div className="loading-spinner">Loading...</div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  return children;
};

function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route
        path="/"
        element={
          <ProtectedRoute>
            <Layout>
              <Navigate to="/kafka" replace />
            </Layout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/kafka"
        element={
          <ProtectedRoute>
            <Layout>
              <KafkaConnection />
            </Layout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/produce"
        element={
          <ProtectedRoute>
            <Layout>
              <ProduceApp />
            </Layout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/consume"
        element={
          <ProtectedRoute>
            <Layout>
              <ConsumeApp />
            </Layout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/reports"
        element={
          <ProtectedRoute>
            <Layout>
              <Reports />
            </Layout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/loadtest"
        element={
          <ProtectedRoute>
            <Layout>
              <LoadTestPage />
            </Layout>
          </ProtectedRoute>
        }
      />
    </Routes>
  );
}

function App() {
  return (
    <Router>
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </Router>
  );
}

export default App;

