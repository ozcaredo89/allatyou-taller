import { BrowserRouter, Routes, Route, Link, useLocation, Navigate, Outlet, useParams } from 'react-router-dom';
import { Wrench, PlusCircle, LayoutDashboard, LogOut, History, Globe, BarChart3, Users, Coins, Target, Sparkles, ChevronDown, ShieldCheck, UserCircle2 } from 'lucide-react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { useTranslation } from 'react-i18next';
import { useState, useRef, useEffect } from 'react';

import Dashboard from './pages/Dashboard';
import NuevoIngreso from './pages/NuevoIngreso';
import Diagnostico from './pages/Diagnostico';
import Checkout from './pages/Checkout';
import Login from './pages/Login';
import Registro from './pages/Registro';
import Historial from './pages/Historial';
import HistorialDetalle from './pages/HistorialDetalle';
import Reportes from './pages/Reportes';
import Equipo from './pages/Equipo';
import Kiosco from './pages/Kiosco';
import ReporteLiquidaciones from './pages/ReporteLiquidaciones';
import CRM from './pages/CRM';
import Configuracion from './pages/Configuracion';
import { AIChatDrawer } from './components/AIChatDrawer';

// ─── Profile Dropdown ──────────────────────────────────────────────────────────
const ProfileMenu = () => {
  const { slug } = useParams<{ slug: string }>();
  const { empresaNombre, email, logout } = useAuth();
  const { t, i18n } = useTranslation();
  const location = useLocation();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // Close on route change
  useEffect(() => { setOpen(false); }, [location.pathname]);

  const initials = empresaNombre
    ? empresaNombre.slice(0, 2).toUpperCase()
    : 'T';

  const isConfigActive = location.pathname.includes('/configuracion');

  return (
    <div ref={ref} className="relative ml-2">
      {/* Trigger button */}
      <button
        onClick={() => setOpen(prev => !prev)}
        className={`flex items-center gap-2 px-2.5 py-1.5 rounded-lg border transition-all duration-200 ${
          open || isConfigActive
            ? 'bg-indigo-600 border-indigo-500 text-white shadow-md shadow-indigo-500/20'
            : 'border-slate-700 text-slate-300 hover:bg-slate-800 hover:text-white hover:border-slate-600'
        }`}
        title="Perfil y configuración"
      >
        {/* Avatar circle */}
        <span className={`inline-flex items-center justify-center w-7 h-7 rounded-full text-xs font-black ${
          open || isConfigActive ? 'bg-white/20 text-white' : 'bg-indigo-500/30 text-indigo-300'
        }`}>
          {initials}
        </span>
        <span className="hidden sm:block text-sm font-semibold max-w-[100px] truncate">
          {empresaNombre || 'TallerPro'}
        </span>
        <ChevronDown
          size={14}
          className={`transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
        />
      </button>

      {/* Dropdown panel */}
      {open && (
        <div className="absolute right-0 top-full mt-2 w-64 bg-slate-800 border border-slate-700 rounded-xl shadow-2xl shadow-black/40 overflow-hidden z-50 animate-in fade-in slide-in-from-top-2 duration-150">
          {/* User info header */}
          <div className="px-4 py-3 border-b border-slate-700 bg-slate-900/50">
            <div className="flex items-center gap-3">
              <div className="flex items-center justify-center w-9 h-9 rounded-full bg-indigo-500/30 border border-indigo-500/40 shrink-0">
                <UserCircle2 size={20} className="text-indigo-300" />
              </div>
              <div className="min-w-0">
                <p className="text-white font-semibold text-sm truncate">{empresaNombre}</p>
                {email && <p className="text-slate-400 text-xs truncate">{email}</p>}
              </div>
            </div>
          </div>

          {/* Menu items */}
          <div className="py-1.5">
            {/* Dispositivos Vinculados */}
            <Link
              to={`/${slug}/configuracion`}
              className={`flex items-center gap-3 px-4 py-2.5 text-sm transition-colors ${
                isConfigActive
                  ? 'bg-indigo-600/20 text-indigo-300'
                  : 'text-slate-300 hover:bg-slate-700 hover:text-white'
              }`}
            >
              <ShieldCheck size={16} className="shrink-0" />
              <span>{t('navbar.configuracion', 'Dispositivos Vinculados')}</span>
              {isConfigActive && <span className="ml-auto w-1.5 h-1.5 rounded-full bg-indigo-400" />}
            </Link>

            {/* Separator */}
            <div className="my-1.5 border-t border-slate-700/60" />

            {/* Language toggle */}
            <button
              onClick={() => i18n.changeLanguage(i18n.language === 'es' ? 'en' : 'es')}
              className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-slate-300 hover:bg-slate-700 hover:text-white transition-colors"
            >
              <Globe size={16} className="shrink-0" />
              <span>
                {i18n.language === 'es' ? 'Switch to English' : 'Cambiar a Español'}
              </span>
              <span className="ml-auto text-xs font-bold bg-slate-700 text-slate-300 px-1.5 py-0.5 rounded">
                {i18n.language.toUpperCase()}
              </span>
            </button>

            {/* Separator */}
            <div className="my-1.5 border-t border-slate-700/60" />

            {/* Logout */}
            <button
              onClick={() => { setOpen(false); logout(); }}
              className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-red-400 hover:bg-red-500/10 hover:text-red-300 transition-colors"
            >
              <LogOut size={16} className="shrink-0" />
              <span>{t('navbar.cerrar_sesion')}</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

// ─── Navbar ───────────────────────────────────────────────────────────────────
const Navbar = () => {
  const location = useLocation();
  const { slug } = useParams<{ slug: string }>();
  const { t } = useTranslation();

  return (
    <nav className="bg-slate-900 border-b border-slate-800 text-white shadow-xl sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between h-16 items-center gap-2">
          {/* Logo */}
          <div className="flex items-center gap-3 shrink-0">
            <div className="p-2 bg-indigo-500 rounded-lg shadow-lg shadow-indigo-500/30">
              <Wrench className="h-6 w-6 text-white" />
            </div>
          </div>

          {/* Nav links — overflow-x scrollable on very small screens */}
          <div className="flex gap-1 sm:gap-2 items-center overflow-x-auto scrollbar-none flex-1 justify-start px-1">
            <Link
              to={`/${slug}`}
              className={`flex items-center gap-1.5 px-2.5 py-2 rounded-md transition-all duration-200 whitespace-nowrap text-sm ${location.pathname === `/${slug}` ? 'bg-indigo-600 text-white shadow-md' : 'text-slate-300 hover:bg-slate-800 hover:text-white'}`}
            >
              <LayoutDashboard size={16} />
              <span className="hidden lg:inline">{t('navbar.dashboard')}</span>
            </Link>
            <Link
              to={`/${slug}/nuevo-ingreso`}
              className={`flex items-center gap-1.5 px-2.5 py-2 rounded-md transition-all duration-200 whitespace-nowrap text-sm ${location.pathname === `/${slug}/nuevo-ingreso` ? 'bg-indigo-600 text-white shadow-md' : 'text-slate-300 hover:bg-slate-800 hover:text-white'}`}
            >
              <PlusCircle size={16} />
              <span className="hidden lg:inline">{t('navbar.nuevo_ingreso')}</span>
            </Link>
            <Link
              to={`/${slug}/historial`}
              className={`flex items-center gap-1.5 px-2.5 py-2 rounded-md transition-all duration-200 whitespace-nowrap text-sm ${location.pathname.includes('/historial') ? 'bg-indigo-600 text-white shadow-md' : 'text-slate-300 hover:bg-slate-800 hover:text-white'}`}
            >
              <History size={16} />
              <span className="hidden lg:inline">{t('navbar.historial')}</span>
            </Link>
            <Link
              to={`/${slug}/reportes`}
              className={`flex items-center gap-1.5 px-2.5 py-2 rounded-md transition-all duration-200 whitespace-nowrap text-sm ${location.pathname.includes('/reportes') ? 'bg-indigo-600 text-white shadow-md' : 'text-slate-300 hover:bg-slate-800 hover:text-white'}`}
            >
              <BarChart3 size={16} />
              <span className="hidden lg:inline">{t('navbar.reportes')}</span>
            </Link>
            <Link
              to={`/${slug}/crm`}
              className={`flex items-center gap-1.5 px-2.5 py-2 rounded-md transition-all duration-200 whitespace-nowrap text-sm ${location.pathname.includes('/crm') ? 'bg-indigo-600 text-white shadow-md' : 'text-slate-300 hover:bg-slate-800 hover:text-white'}`}
            >
              <Target size={16} />
              <span className="hidden lg:inline">{t('navbar.crm', 'CRM')}</span>
            </Link>
            <Link
              to={`/${slug}/equipo`}
              className={`flex items-center gap-1.5 px-2.5 py-2 rounded-md transition-all duration-200 whitespace-nowrap text-sm ${location.pathname.includes('/equipo') ? 'bg-indigo-600 text-white shadow-md' : 'text-slate-300 hover:bg-slate-800 hover:text-white'}`}
            >
              <Users size={16} />
              <span className="hidden lg:inline">{t('navbar.equipo')}</span>
            </Link>
            <Link
              to={`/${slug}/liquidaciones`}
              className={`flex items-center gap-1.5 px-2.5 py-2 rounded-md transition-all duration-200 whitespace-nowrap text-sm ${location.pathname.includes('/liquidaciones') ? 'bg-indigo-600 text-white shadow-md' : 'text-slate-300 hover:bg-slate-800 hover:text-white'}`}
            >
              <Coins size={16} />
              <span className="hidden lg:inline">{t('navbar.liquidaciones')}</span>
            </Link>
          </div>

          {/* Profile menu — always visible, never overflows */}
          <ProfileMenu />
        </div>
      </div>
    </nav>
  );
};

const ProtectedLayout = () => {
  const { slug } = useParams<{ slug: string }>();
  const { token, empresaSlug, logout } = useAuth();
  // AI Chat State
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [messages, setMessages] = useState<{ role: 'user' | 'model'; parts: { text: string }[] }[]>([]);

  if (!token) {
    return <Navigate to={`/login`} replace />;
  }

  // Si intentan acceder a otro taller con una sesión distinta
  if (empresaSlug && slug !== empresaSlug) {
    logout();
    return <Navigate to={`/login`} replace />;
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans selection:bg-indigo-200 relative">
      <Navbar />
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <Outlet />
      </main>
      {/* FAB - Botón Flotante para el Asistente */}
      <button
        onClick={() => setIsDrawerOpen(true)}
        className="fixed bottom-6 right-6 p-4 bg-indigo-600 text-white rounded-full shadow-lg hover:bg-indigo-700 hover:scale-105 transition-all z-40 group"
        title="Abrir Asistente Virtual"
      >
        <Sparkles size={24} className="group-hover:animate-pulse" />
      </button>

      {/* Drawer del Asistente */}
      <AIChatDrawer
        isOpen={isDrawerOpen}
        onClose={() => setIsDrawerOpen(false)}
        messages={messages}
        setMessages={setMessages}
      />
    </div>
  );
};

function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          {/* Global entry point */}
          <Route path="/" element={<Navigate to="/login" replace />} />
          <Route path="/login" element={<Login />} />
          <Route path="/registro" element={<Registro />} />
          <Route path="/kiosco/:slug" element={<Kiosco />} />

          <Route path="/:slug" element={<ProtectedLayout />}>
            <Route index element={<Dashboard />} />
            <Route path="nuevo-ingreso" element={<NuevoIngreso />} />
            <Route path="diagnostico/:id" element={<Diagnostico />} />
            <Route path="checkout/:id" element={<Checkout />} />
            <Route path="historial" element={<Historial />} />
            <Route path="historial/:id" element={<HistorialDetalle />} />
            <Route path="reportes" element={<Reportes />} />
            <Route path="equipo" element={<Equipo />} />
            <Route path="liquidaciones" element={<ReporteLiquidaciones />} />
            <Route path="crm" element={<CRM />} />
            <Route path="configuracion" element={<Configuracion />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}

export default App;
