export interface NavItem {
  title: string;
  href: string;
  icon: string;
  badge?: string;
}

export interface Division {
  id: string;
  name: string;
  code: string;
}

export interface UserProfile {
  name: string;
  role: string;
  division: string;
  avatarUrl?: string;
}

// Domain Model Contracts
export * from './asset';
export * from './defect';
export * from './maintenance';
export * from './block';
export * from './corridor';
export * from './train';
export * from './resource';
export * from './schedule';
export * from './conflict';
export * from './ai';
export * from './audit';
export * from './dashboard';
