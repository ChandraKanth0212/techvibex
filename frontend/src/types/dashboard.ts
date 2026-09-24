/**
 * RailOpt Domain Entity: DashboardMetrics
 * Prototype planning & operational overview metrics for the Command Center dashboard.
 * (Note: Planning prototype metrics, not official railway KPIs).
 */

export interface DashboardMetrics {
  activeBlocks: number;
  pendingRequests: number;
  conflictAlerts: number;
  integratedBlocks: number;
  criticalTasks: number;
  overdueTasks: number;
  corridorUtilization: number;        // Percentage 0 - 100
  estimatedDowntimeReduction: number; // Percentage 0 - 100
}
