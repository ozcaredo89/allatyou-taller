import { BrowserRouter, Routes, Route, Link, useLocation } from 'react-router-dom';
import { Wrench, PlusCircle, LayoutDashboard } from 'lucide-react';
import Dashboard from './pages/Dashboard';
import NuevoIngreso from './pages/NuevoIngreso';
import Diagnostico from './pages/Diagnostico';
import Checkout from './pages/Checkout';

const Navbar = () => {
  const location = useLocation();
  
  return (
    <nav className="bg-slate-900 border-b border-slate-800 text-white shadow-xl sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between h-16 items-center">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-indigo-500 rounded-lg shadow-lg shadow-indigo-500/30">
              <Wrench className="h-6 w-6 text-white" />
            </div>
            <span className="font-bold text-xl tracking-tight">TallerPro</span>
          </div>
          <div className="flex gap-4">
            <Link 
              to="/" 
              className={`flex items-center gap-2 px-4 py-2 rounded-md transition-all duration-300 ease-in-out ${location.pathname === '/' ? 'bg-indigo-600 text-white shadow-md' : 'text-slate-300 hover:bg-slate-800 hover:text-white'}`}
            >
              <LayoutDashboard size={18} />
              <span className="hidden sm:inline">Dashboard</span>
            </Link>
            <Link 
              to="/nuevo-ingreso" 
              className={`flex items-center gap-2 px-4 py-2 rounded-md transition-all duration-300 ease-in-out ${location.pathname === '/nuevo-ingreso' ? 'bg-indigo-600 text-white shadow-md' : 'text-slate-300 hover:bg-slate-800 hover:text-white'}`}
            >
              <PlusCircle size={18} />
              <span className="hidden sm:inline">Nuevo Ingreso</span>
            </Link>
          </div>
        </div>
      </div>
    </nav>
  );
};

function App() {
  return (
    <BrowserRouter>
      <div className="min-h-screen bg-slate-50 text-slate-900 font-sans selection:bg-indigo-200">
        <Navbar />
        <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/nuevo-ingreso" element={<NuevoIngreso />} />
            <Route path="/diagnostico/:id" element={<Diagnostico />} />
            <Route path="/checkout/:id" element={<Checkout />} />
          </Routes>
        </main>
      </div>
    </BrowserRouter>
  );
}

export default App;
