import { BrowserRouter, Routes, Route, Link, useLocation, Navigate, Outlet, useParams } from 'react-router-dom';
import { Wrench, PlusCircle, LayoutDashboard, LogOut } from 'lucide-react';
import { AuthProvider, useAuth } from './context/AuthContext';

import Dashboard from './pages/Dashboard';
import NuevoIngreso from './pages/NuevoIngreso';
import Diagnostico from './pages/Diagnostico';
import Checkout from './pages/Checkout';
import Login from './pages/Login';

const Navbar = () => {
  const location = useLocation();
  const { slug } = useParams<{ slug: string }>();
  const { empresaNombre, logout } = useAuth();
  
  return (
    <nav className="bg-slate-900 border-b border-slate-800 text-white shadow-xl sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between h-16 items-center">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-indigo-500 rounded-lg shadow-lg shadow-indigo-500/30">
              <Wrench className="h-6 w-6 text-white" />
            </div>
            <span className="font-bold text-xl tracking-tight">{empresaNombre || 'TallerPro'}</span>
          </div>
          <div className="flex gap-2 sm:gap-4 items-center">
            <Link 
              to={`/${slug}`}
              className={`flex items-center gap-2 px-3 py-2 rounded-md transition-all duration-300 ease-in-out ${location.pathname === `/${slug}` ? 'bg-indigo-600 text-white shadow-md' : 'text-slate-300 hover:bg-slate-800 hover:text-white'}`}
            >
              <LayoutDashboard size={18} />
              <span className="hidden sm:inline">Dashboard</span>
            </Link>
            <Link 
              to={`/${slug}/nuevo-ingreso`} 
              className={`flex items-center gap-2 px-3 py-2 rounded-md transition-all duration-300 ease-in-out ${location.pathname === `/${slug}/nuevo-ingreso` ? 'bg-indigo-600 text-white shadow-md' : 'text-slate-300 hover:bg-slate-800 hover:text-white'}`}
            >
              <PlusCircle size={18} />
              <span className="hidden sm:inline">Nuevo Ingreso</span>
            </Link>
            
            {/* Logout Button */}
            <button 
              onClick={logout}
              className="ml-2 flex items-center gap-2 px-3 py-2 border border-slate-700 rounded-md text-slate-300 hover:bg-red-500/10 hover:text-red-400 hover:border-red-500/50 transition-colors"
              title="Cerrar sesión o Cambiar sucursal"
            >
              <LogOut size={18} />
              <span className="hidden md:inline font-medium text-sm">Cambiar Sucursal</span>
            </button>
          </div>
        </div>
      </div>
    </nav>
  );
};

const ProtectedLayout = () => {
  const { slug } = useParams<{ slug: string }>();
  const { token, empresaSlug, logout } = useAuth();
  
  if (!token) {
    return <Navigate to={`/login`} replace />;
  }

  // Si intentan acceder a otro taller con una sesión distinta
  if (empresaSlug && slug !== empresaSlug) {
    logout();
    return <Navigate to={`/login`} replace />;
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans selection:bg-indigo-200">
      <Navbar />
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <Outlet />
      </main>
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
          
          <Route path="/:slug" element={<ProtectedLayout />}>
            <Route index element={<Dashboard />} />
            <Route path="nuevo-ingreso" element={<NuevoIngreso />} />
            <Route path="diagnostico/:id" element={<Diagnostico />} />
            <Route path="checkout/:id" element={<Checkout />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}

export default App;
