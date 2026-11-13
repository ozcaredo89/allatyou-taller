import { BrowserRouter, Routes, Route, Link, useLocation, Navigate, Outlet, useParams } from 'react-router-dom';
import { Wrench, PlusCircle, LayoutDashboard, LogOut, History, Globe, BarChart3, Users, Coins, Target, Sparkles, ChevronDown, ShieldCheck, UserCircle2, Receipt, Menu, X } from 'lucide-react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { useTranslation } from 'react-i18next';
import { useState, useRef, useEffect } from 'react';
import { trackEvent } from './utils/analytics';

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
import Gastos from './pages/Gastos';
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
  const { empresaNombre } = useAuth();
  const { t } = useTranslation();
  const [mobileOpen, setMobileOpen] = useState(false);

  // Cerrar drawer al cambiar de ruta
  useEffect(() => {
    setMobileOpen(false);
  }, [location.pathname]);

  // Cerrar con Escape y bloquear scroll del body cuando el drawer móvil está abierto
  useEffect(() => {
    if (!mobileOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMobileOpen(false);
    };
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.body.style.overflow = prevOverflow;
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [mobileOpen]);

  const navItems = [
    {
      to: `/${slug}`,
      label: t('navbar.dashboard'),
      icon: LayoutDashboard,
      active: location.pathname === `/${slug}`,
    },
    {
      to: `/${slug}/nuevo-ingreso`,
      label: t('navbar.nuevo_ingreso'),
      icon: PlusCircle,
      active: location.pathname === `/${slug}/nuevo-ingreso`,
    },
    {
      to: `/${slug}/historial`,
      label: t('navbar.historial'),
      icon: History,
      active: location.pathname.includes('/historial'),
      onClick: () => trackEvent('navbar.click_historial', { from_path: location.pathname }),
    },
    {
      to: `/${slug}/reportes`,
      label: t('navbar.reportes'),
      icon: BarChart3,
      active: location.pathname.includes('/reportes'),
    },
    {
      to: `/${slug}/crm`,
      label: t('navbar.crm', 'CRM'),
      icon: Target,
      active: location.pathname.includes('/crm'),
    },
    {
      to: `/${slug}/equipo`,
      label: t('navbar.equipo'),
      icon: Users,
      active: location.pathname.includes('/equipo'),
    },
    {
      to: `/${slug}/liquidaciones`,
      label: t('navbar.liquidaciones'),
      icon: Coins,
      active: location.pathname.includes('/liquidaciones'),
    },
    {
      to: `/${slug}/gastos`,
      label: t('navbar.gastos'),
      icon: Receipt,
      active: location.pathname.includes('/gastos'),
      activeClass: 'bg-red-600 text-white shadow-md',
    },
  ];

  const activeItem = navItems.find(item => item.active);

  return (
    <>
      <nav className="bg-slate-900 border-b border-slate-800 text-white shadow-xl sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16 items-center gap-2">
            {/* Izquierda: botón menú móvil + logo + título de sección actual en móvil */}
            <div className="flex items-center gap-2.5 min-w-0">
              <button
                type="button"
                onClick={() => setMobileOpen(prev => !prev)}
                className="lg:hidden p-2 -ml-2 rounded-lg text-slate-300 hover:bg-slate-800 hover:text-white transition-colors"
                aria-label={mobileOpen ? 'Cerrar menú' : 'Abrir menú'}
                aria-expanded={mobileOpen}
              >
                {mobileOpen ? <X size={22} /> : <Menu size={22} />}
              </button>

              <Link
                to={`/${slug}`}
                className="flex items-center gap-2.5 shrink-0"
                aria-label={t('navbar.dashboard')}
              >
                <div className="p-2 bg-indigo-500 rounded-lg shadow-lg shadow-indigo-500/30">
                  <Wrench className="h-5 w-5 sm:h-6 sm:w-6 text-white" />
                </div>
              </Link>

              <span className="lg:hidden text-sm font-semibold text-white truncate">
                {activeItem?.label || empresaNombre || 'TallerPro'}
              </span>
            </div>

            {/* Links en escritorio (lg+) */}
            <div className="hidden lg:flex gap-1.5 items-center flex-1 justify-start px-2">
              {navItems.map(item => {
                const Icon = item.icon;
                const activeClasses = item.activeClass ?? 'bg-indigo-600 text-white shadow-md';
                return (
                  <Link
                    key={item.to}
                    to={item.to}
                    onClick={item.onClick}
                    className={`flex items-center gap-1.5 px-2.5 py-2 rounded-md transition-all duration-200 whitespace-nowrap text-sm ${
                      item.active
                        ? activeClasses
                        : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                    }`}
                  >
                    <Icon size={16} />
                    <span>{item.label}</span>
                  </Link>
                );
              })}
            </div>

            {/* Profile menu — always visible */}
            <ProfileMenu />
          </div>
        </div>
      </nav>

      {/* Drawer lateral móvil/tablet (< lg) */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden flex" role="dialog" aria-modal="true" aria-label="Menú de navegación">
          {/* Backdrop */}
          <div
            className="fixed inset-0 bg-black/60 backdrop-blur-xs"
            onClick={() => setMobileOpen(false)}
          />

          {/* Panel lateral */}
          <div className="relative w-72 max-w-[82vw] h-full bg-slate-900 border-r border-slate-800 shadow-2xl flex flex-col animate-slide-right">
            <div className="flex items-center justify-between h-16 px-4 border-b border-slate-800 shrink-0">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="p-2 bg-indigo-500 rounded-lg shadow-lg shadow-indigo-500/30 shrink-0">
                  <Wrench className="h-5 w-5 text-white" />
                </div>
                <span className="text-white font-bold text-sm truncate">
                  {empresaNombre || 'TallerPro'}
                </span>
              </div>
              <button
                type="button"
                onClick={() => setMobileOpen(false)}
                className="p-2 rounded-lg text-slate-400 hover:bg-slate-800 hover:text-white transition-colors"
                aria-label="Cerrar menú"
              >
                <X size={20} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-3 py-4 space-y-1">
              {navItems.map(item => {
                const Icon = item.icon;
                const activeClasses = item.activeClass ?? 'bg-indigo-600 text-white shadow-md';
                return (
                  <Link
                    key={item.to}
                    to={item.to}
                    onClick={() => {
                      item.onClick?.();
                      setMobileOpen(false);
                    }}
                    className={`flex items-center gap-3 px-3.5 py-3 rounded-xl text-sm font-medium transition-colors ${
                      item.active
                        ? activeClasses
                        : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                    }`}
                  >
                    <Icon size={18} className="shrink-0" />
                    <span>{item.label}</span>
                  </Link>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </>
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
            <Route path="gastos" element={<Gastos />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}

export default App;
