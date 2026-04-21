import React, { createContext, useState, useEffect, useContext } from 'react';
import api from '../services/api';

interface AuthState {
  token: string | null;
  empresaId: string | null;
  empresaNombre: string;
  empresaSlug: string | null;
  email: string | null;
}

interface AuthContextType extends AuthState {
  login: (token: string, empresaId: string, slug: string, nombre: string, email: string) => void;
  loginWithPassword: (empresaId: string, email: string, password: string) => Promise<{ slug: string }>;
  logout: () => void;
  setEmpresaInfo: (nombre: string, slug: string) => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [auth, setAuth] = useState<AuthState>(() => {
    const saved = localStorage.getItem('taller_auth');
    if (saved) return JSON.parse(saved);
    return { token: null, empresaId: null, empresaNombre: 'TallerPro', empresaSlug: null, email: null };
  });

  useEffect(() => {
    if (auth.token) {
      localStorage.setItem('taller_auth', JSON.stringify(auth));
    } else {
      localStorage.removeItem('taller_auth');
    }
  }, [auth]);

  const login = (token: string, empresaId: string, slug: string, nombre: string, email: string) => {
    setAuth({ token, empresaId, empresaNombre: nombre, empresaSlug: slug, email });
  };

  const logout = () => {
    setAuth({ token: null, empresaId: null, empresaNombre: 'TallerPro', empresaSlug: null, email: null });
  };

  const setEmpresaInfo = (nombre: string, slug: string) => {
    setAuth(prev => ({ ...prev, empresaNombre: nombre, empresaSlug: slug }));
  };

  const loginWithPassword = async (empresaId: string, email: string, password: string): Promise<{ slug: string }> => {
    const { data } = await api.post('/auth/login-password', { empresa_id: empresaId, email, password });
    if (data.token) {
      login(data.token, data.empresa.id, data.empresa.slug, data.empresa.nombre, email);
    }
    return { slug: data.empresa.slug };
  };

  return (
    <AuthContext.Provider value={{ ...auth, login, loginWithPassword, logout, setEmpresaInfo }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within an AuthProvider');
  return context;
};
