import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClientProvider } from '@tanstack/react-query';
import { queryClient } from '@/lib/queryClient';
import { MainLayout } from '@/layouts/MainLayout';

import { DashboardPage } from '@/pages/DashboardPage';
import { MaintenancePage } from '@/pages/MaintenancePage';
import { BlockRequestsPage } from '@/pages/BlockRequestsPage';
import { IntegratedBlocksPage } from '@/pages/IntegratedBlocksPage';
import { PlannerPage } from '@/pages/PlannerPage';
import { ConflictsPage } from '@/pages/ConflictsPage';
import { CorridorsPage } from '@/pages/CorridorsPage';
import { TimetablePage } from '@/pages/TimetablePage';
import { AIRecommendationsPage } from '@/pages/AIRecommendationsPage';
import { AnalyticsPage } from '@/pages/AnalyticsPage';
import { AuditLogPage } from '@/pages/AuditLogPage';
import { SettingsPage } from '@/pages/SettingsPage';

export const App: React.FC = () => {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<MainLayout />}>
            <Route index element={<Navigate to="/dashboard" replace />} />
            <Route path="dashboard" element={<DashboardPage />} />
            <Route path="maintenance" element={<MaintenancePage />} />
            <Route path="block-requests" element={<BlockRequestsPage />} />
            <Route path="integrated-blocks" element={<IntegratedBlocksPage />} />
            <Route path="planner" element={<PlannerPage />} />
            <Route path="conflicts" element={<ConflictsPage />} />
            <Route path="corridors" element={<CorridorsPage />} />
            <Route path="timetable" element={<TimetablePage />} />
            <Route path="ai-recommendations" element={<AIRecommendationsPage />} />
            <Route path="analytics" element={<AnalyticsPage />} />
            <Route path="audit-log" element={<AuditLogPage />} />
            <Route path="settings" element={<SettingsPage />} />
            <Route path="*" element={<Navigate to="/dashboard" replace />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  );
};

export default App;
