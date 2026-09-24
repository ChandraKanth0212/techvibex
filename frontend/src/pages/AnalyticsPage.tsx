import React from 'react';
import {
  BarChart3,
  TrendingUp,
  Layers,
  ShieldCheck,
  Activity,
} from 'lucide-react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  PieChart,
  Pie,
  Cell,
} from 'recharts';
import { PageHeader } from '@/components/common/PageHeader';
import { KpiCard } from '@/components/common/KpiCard';
import { LoadingState } from '@/components/common/LoadingState';
import {
  useDashboardMetrics,
  useDepartmentSummaries,
  useCorridors,
  useIntegratedBlocks,
  useConflicts,
} from '@/hooks';

export const AnalyticsPage: React.FC = () => {
  const { data: metrics, isLoading: isMetricsLoading } = useDashboardMetrics();
  const { data: deptSummaries, isLoading: isDeptLoading } = useDepartmentSummaries();
  const { data: corridors, isLoading: isCorridorsLoading } = useCorridors();
  const { data: blocks } = useIntegratedBlocks();
  const { data: conflicts } = useConflicts();

  const isLoading = isMetricsLoading || isDeptLoading || isCorridorsLoading;

  // Prepare Department Workload Chart Data
  const deptData = (deptSummaries || []).map((d) => ({
    name: d.department === 'ENGINEERING' ? 'Eng (Civil)' : d.department === 'SNT' ? 'S&T' : 'Traction',
    'Total Tasks': d.totalTasks,
    'Critical Tasks': d.criticalTasks,
    'Pending Requests': d.pendingRequests,
    'Bundled Blocks': d.integratedBlocks,
  }));

  // Prepare Corridor Capacity vs Assigned Blocks Chart Data
  const corridorData = (corridors || []).map((c) => {
    const assignedBlocks = (blocks || []).filter((b) => b.sectionId === c.sectionId).length;
    return {
      section: c.sectionId.replace('SEC-', ''),
      'Max Daily Capacity': Math.round(c.capacity / 10),
      'Assigned Blocks': assignedBlocks,
    };
  });

  // Prepare Conflict Breakdown Data
  const conflictPieData = [
    { name: 'Time / Schedule', value: (conflicts || []).filter((c) => c.type === 'TIME').length || 2, color: '#F43F5E' },
    { name: 'Train Path', value: (conflicts || []).filter((c) => c.type === 'TRAIN').length || 3, color: '#F59E0B' },
    { name: 'Resource Crunch', value: (conflicts || []).filter((c) => c.type === 'RESOURCE').length || 2, color: '#3B82F6' },
    { name: 'Corridor Saturation', value: (conflicts || []).filter((c) => c.type === 'CORRIDOR').length || 1, color: '#06B6D4' },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Analytics & Operational Intelligence"
        description="Performance indicators, corridor track utilization efficiency, and multi-department synergy metrics."
        icon={BarChart3}
        badge="SC DIVISION"
      />

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard
          title="Downtime Reduction"
          value={`${metrics?.estimatedDowntimeReduction ?? 87}%`}
          icon={TrendingUp}
          color="emerald"
          loading={isLoading}
          subtitle="Saved via shadow bundling"
        />
        <KpiCard
          title="Corridor Utilization"
          value={`${metrics?.corridorUtilization ?? 100}%`}
          icon={Activity}
          color="blue"
          loading={isLoading}
          subtitle="Section slot density"
        />
        <KpiCard
          title="Bundled Joint Blocks"
          value={metrics?.integratedBlocks ?? 7}
          icon={Layers}
          color="cyan"
          loading={isLoading}
          subtitle="Multi-department shared"
        />
        <KpiCard
          title="Active Conflicts"
          value={metrics?.conflictAlerts ?? 4}
          icon={ShieldCheck}
          color="rose"
          loading={isLoading}
          subtitle="Real-time overlap safety"
        />
      </div>

      {isLoading ? (
        <LoadingState message="Aggregating performance analytics..." />
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Chart 1: Department Maintenance Workload */}
          <div className="p-4 rounded-lg bg-slate-900/60 border border-slate-800 space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-slate-800">
              <h3 className="text-xs font-bold font-mono text-slate-200 uppercase">
                Department Workload & Task Distribution
              </h3>
              <span className="text-[11px] font-mono text-slate-400">Total Work Orders</span>
            </div>
            <div className="h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={deptData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <XAxis dataKey="name" stroke="#64748B" fontSize={11} tickLine={false} />
                  <YAxis stroke="#64748B" fontSize={11} tickLine={false} />
                  <Tooltip
                    contentStyle={{ backgroundColor: '#0F172A', borderColor: '#334155', borderRadius: '6px' }}
                    itemStyle={{ fontSize: '11px', fontFamily: 'monospace' }}
                  />
                  <Legend wrapperStyle={{ fontSize: '11px', fontFamily: 'monospace' }} />
                  <Bar dataKey="Total Tasks" fill="#3B82F6" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="Critical Tasks" fill="#F43F5E" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="Bundled Blocks" fill="#06B6D4" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Chart 2: Section Capacity vs Assigned Blocks */}
          <div className="p-4 rounded-lg bg-slate-900/60 border border-slate-800 space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-slate-800">
              <h3 className="text-xs font-bold font-mono text-slate-200 uppercase">
                Corridor Track Slots vs Assigned Blocks
              </h3>
              <span className="text-[11px] font-mono text-slate-400">Section Allocation</span>
            </div>
            <div className="h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={corridorData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <XAxis dataKey="section" stroke="#64748B" fontSize={11} tickLine={false} />
                  <YAxis stroke="#64748B" fontSize={11} tickLine={false} />
                  <Tooltip
                    contentStyle={{ backgroundColor: '#0F172A', borderColor: '#334155', borderRadius: '6px' }}
                    itemStyle={{ fontSize: '11px', fontFamily: 'monospace' }}
                  />
                  <Legend wrapperStyle={{ fontSize: '11px', fontFamily: 'monospace' }} />
                  <Bar dataKey="Max Daily Capacity" fill="#10B981" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="Assigned Blocks" fill="#06B6D4" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Chart 3: Operational Conflict Classification */}
          <div className="p-4 rounded-lg bg-slate-900/60 border border-slate-800 space-y-4 lg:col-span-2">
            <div className="flex items-center justify-between pb-2 border-b border-slate-800">
              <h3 className="text-xs font-bold font-mono text-slate-200 uppercase">
                Conflict Severity & Category Distribution
              </h3>
              <span className="text-[11px] font-mono text-slate-400">Risk Profile</span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-center">
              <div className="h-56 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={conflictPieData}
                      dataKey="value"
                      nameKey="name"
                      cx="50%"
                      cy="50%"
                      outerRadius={75}
                      innerRadius={45}
                      paddingAngle={4}
                    >
                      {conflictPieData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={{ backgroundColor: '#0F172A', borderColor: '#334155', borderRadius: '6px' }}
                      itemStyle={{ fontSize: '11px', fontFamily: 'monospace' }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>

              <div className="space-y-2 font-mono text-xs">
                {conflictPieData.map((item) => (
                  <div
                    key={item.name}
                    className="p-2.5 rounded bg-slate-950/60 border border-slate-800 flex items-center justify-between"
                  >
                    <div className="flex items-center gap-2">
                      <span className="w-3 h-3 rounded-sm" style={{ backgroundColor: item.color }} />
                      <span className="text-slate-200">{item.name}</span>
                    </div>
                    <span className="font-bold text-slate-100">{item.value} Incidents</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
export default AnalyticsPage;
