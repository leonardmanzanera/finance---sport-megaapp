import React from 'react';
import DcaBacktester from './features/dca/DcaBacktester';
import { Toaster } from './components/ui/toaster';

const App: React.FC = () => {
  return (
    <div className="min-h-screen bg-[#0F0F23] text-gray-200 font-sans selection:bg-blue-500 selection:text-white">
      {/* Header */}
      <header className="border-b border-gray-800 bg-[#1E1E2E]/80 backdrop-blur-sm sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-xl flex items-center justify-center font-bold text-white">
              D
            </div>
            <div>
              <h1 className="text-xl font-bold text-white">DCA Analyzer</h1>
              <p className="text-xs text-gray-500">Dollar Cost Averaging Backtester</p>
            </div>
          </div>
          <div className="flex items-center space-x-4 text-sm text-gray-400">
            <span className="flex items-center space-x-1">
              <span className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse"></span>
              <span>Backend Connected</span>
            </span>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-8">
        <DcaBacktester />
      </main>

      <footer className="border-t border-gray-800 mt-12 py-6 text-center text-gray-600 text-sm">
        <p>© 2024 DCA Analyzer. Données via CoinGecko & Yahoo Finance.</p>
        <p className="mt-1 text-xs">Calculs: CAGR, XIRR, Sharpe Ratio, Max Drawdown, Volatilité</p>
      </footer>
      <Toaster />
    </div>
  );
};

export default App;