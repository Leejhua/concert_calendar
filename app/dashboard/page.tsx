import { Metadata } from 'next';
import { DashboardClient } from './dashboard-client';

export const metadata: Metadata = {
  title: '演唱会看板',
  description: 'Concert Calendar Dashboard',
};

export default function DashboardPage() {
  return <DashboardClient />;
}
