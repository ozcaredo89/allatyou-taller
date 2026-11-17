import React, { createContext, useState, useEffect, useContext } from 'react';
import api from '../services/api';
import { identifyTaller, resetAnalytics } from '../utils/analytics';

interface AuthState {
  token: string | null;
  empresaId: string | null;
  empresaNombre: string;
  empresaSlug: string | null;
  email: string | null;
}

interface AuthContextType extends AuthState {
  login: (token: string, empresaId: string, slug: string, nombre: string, email: string) => void;
  loginWithPassword: (empresaId: string, email: string, password: string, rememberMe?: boolean) => Promise<{ slug: string }>;
  logout: () => void;
  setEmpresaInfo: (nombre: string, slug: string) => void;
  sessionExpired: boolean;
  clearSessionExpired: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [sessionExpired, setSessionExpired] = useState(false);
  const [auth, setAuth] = useState<AuthState>(() => {
    const saved = localStorage.getItem('taller_auth');
    if (saved) {
      const parsed: AuthState = JSON.parse(saved);
      // Identificar antes del primer render para que el primer pageview ya lleve el taller
      if (parsed.token && parsed.empresaId) identifyTaller(parsed.empresaId, parsed.empresaSlug, parsed.empresaNombre);
      return parsed;
    }
    return { token: null, empresaId: null, empresaNombre: 'TallerPro', empresaSlug: null, email: null };
  });

  useEffect(() => {
    if (auth.token) {
      localStorage.setItem('taller_auth', JSON.stringify(auth));
    } else {
      localStorage.removeItem('taller_auth');
    }
  }, [auth]);

  // Analytics: la sesión se asocia al taller (nunca al email)
  useEffect(() => {
    if (auth.token && auth.empresaId) {
      identifyTaller(auth.empresaId, auth.empresaSlug, auth.empresaNombre);
    } else {
      resetAnalytics();
    }
  }, [auth.token, auth.empresaId, auth.empresaSlug, auth.empresaNombre]);

  useEffect(() => {
    const handleSessionExpired = () => {
      logout();
      setSessionExpired(true);
    };

    window.addEventListener('auth:session-expired', handleSessionExpired);
    return () => window.removeEventListener('auth:session-expired', handleSessionExpired);
  }, []);

  const login = (token: string, empresaId: string, slug: string, nombre: string, email: string) => {
    identifyTaller(empresaId, slug, nombre);
    setAuth({ token, empresaId, empresaNombre: nombre, empresaSlug: slug, email });
  };

  const logout = () => {
    // Fire-and-forget: revoke device session on backend (if any)
    api.post('/auth/logout').catch(() => {});
    setAuth({ token: null, empresaId: null, empresaNombre: 'TallerPro', empresaSlug: null, email: null });
  };

  const setEmpresaInfo = (nombre: string, slug: string) => {
    setAuth(prev => ({ ...prev, empresaNombre: nombre, empresaSlug: slug }));
  };

  const clearSessionExpired = () => setSessionExpired(false);

  const loginWithPassword = async (empresaId: string, email: string, password: string, rememberMe?: boolean): Promise<{ slug: string }> => {
    const { data } = await api.post('/auth/login-password', { empresa_id: empresaId, email, password, rememberMe: !!rememberMe });
    if (data.token) {
      login(data.token, data.empresa.id, data.empresa.slug, data.empresa.nombre, email);
    }
    return { slug: data.empresa.slug };
  };

  return (
    <AuthContext.Provider value={{ ...auth, login, loginWithPassword, logout, setEmpresaInfo, sessionExpired, clearSessionExpired }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within an AuthProvider');
  return context;
};
