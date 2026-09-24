import React from 'react';
import { Outlet } from 'react-router-dom';
import { Sidebar } from '@/components/layout/Sidebar';
import { TopNav } from '@/components/layout/TopNav';

export const MainLayout: React.FC = () => {
  return (
    <div className="flex h-screen w-screen overflow-hidden bg-[#0B0F19]">
      {/* Sidebar */}
      <Sidebar />

      {/* Main Content Area */}
      <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
        {/* Top Header */}
        <TopNav />

        {/* Dynamic Page Outlet */}
        <main className="flex-1 overflow-y-auto p-6 bg-[#0B0F19]">
          <Outlet />
        </main>
      </div>
    </div>
  );
};
