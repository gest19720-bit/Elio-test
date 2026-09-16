import { supabase } from '../js/supabase.js';

const day = value => new Date(`${value}T00:00:00`);
const isoDay = value => value.toISOString().slice(0, 10);

export function getMetricsRange(key = '30d', customStart = '', customEnd = '') {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  let start = new Date(today);
  let end = new Date(today); end.setDate(end.getDate() + 1);
  if (key === 'today') start = new Date(today);
  if (key === '7d') start.setDate(start.getDate() - 6);
  if (key === '30d') start.setDate(start.getDate() - 29);
  if (key === 'thisMonth') start = new Date(today.getFullYear(), today.getMonth(), 1);
  if (key === 'lastMonth') { start = new Date(today.getFullYear(), today.getMonth() - 1, 1); end = new Date(today.getFullYear(), today.getMonth(), 1); }
  if (key === 'custom' && customStart && customEnd) { start = day(customStart); end = day(customEnd); end.setDate(end.getDate() + 1); }
  const length = Math.max(1, Math.round((end - start) / 86400000));
  const previousEnd = new Date(start); const previousStart = new Date(start); previousStart.setDate(previousStart.getDate() - length);
  return { key, start: isoDay(start), end: isoDay(end), previousStart: isoDay(previousStart), previousEnd: isoDay(previousEnd), label: key === 'today' ? 'Today' : key === '7d' ? 'Last 7 days' : key === '30d' ? 'Last 30 days' : key === 'thisMonth' ? 'This month' : key === 'lastMonth' ? 'Last month' : 'Custom range' };
}

export async function loadMetricsData(businessId, range) {
  const [products, customers, tasks, activities] = await Promise.all([
    supabase.from('products').select('id,name,category,cost,selling_price,stock,sales,description,created_at,updated_at').eq('business_id', businessId).order('updated_at', { ascending: false }).limit(500),
    supabase.from('customers').select('id,name,company,status,last_contact_at,created_at,updated_at').eq('business_id', businessId).gte('created_at', range.previousStart).lt('created_at', range.end).order('created_at', { ascending: false }).limit(1000),
    supabase.from('tasks').select('id,title,status,priority,due_date,created_at,updated_at').eq('business_id', businessId).gte('created_at', range.previousStart).lt('created_at', range.end).order('created_at', { ascending: false }).limit(1000),
    supabase.from('activities').select('actor,action,entity_type,created_at').eq('business_id', businessId).gte('created_at', range.previousStart).lt('created_at', range.end).order('created_at', { ascending: false }).limit(1000)
  ]);
  const result = [products, customers, tasks, activities];
  const failed = result.find(item => item.error);
  if (failed) throw failed.error;
  return { products: products.data || [], customers: customers.data || [], tasks: tasks.data || [], activities: activities.data || [], range };
}

export function inRange(value, start, end) { return Boolean(value && value >= start && value < end); }
export function sum(values) { return values.reduce((total, value) => total + (Number(value) || 0), 0); }
export function percentageChange(current, previous) { if (!Number.isFinite(previous) || previous === 0) return current > 0 ? { label: 'New', value: null, direction: 'up' } : { label: 'Not enough history', value: null, direction: 'flat' }; const value = ((current - previous) / Math.abs(previous)) * 100; return { label: `${value >= 0 ? '+' : ''}${value.toFixed(1)}%`, value, direction: value > 0 ? 'up' : value < 0 ? 'down' : 'flat' }; }
export function calculateMetrics(data) {
  const { products, customers, tasks, activities, range } = data;
  const currentCustomers = customers.filter(item => inRange(item.created_at, range.start, range.end));
  const previousCustomers = customers.filter(item => inRange(item.created_at, range.previousStart, range.previousEnd));
  const currentTasks = tasks.filter(item => inRange(item.created_at, range.start, range.end));
  const previousTasks = tasks.filter(item => inRange(item.created_at, range.previousStart, range.previousEnd));
  const currentActivities = activities.filter(item => inRange(item.created_at, range.start, range.end));
  const previousActivities = activities.filter(item => inRange(item.created_at, range.previousStart, range.previousEnd));
  const activeTasks = tasks.filter(item => item.status !== 'Completed');
  const recordedSales = sum(products.map(item => item.sales));
  const recordedSalesValue = sum(products.map(item => Number(item.sales || 0) * Number(item.selling_price || 0)));
  return { products, customers, tasks, activities, activeTasks, lowStock: products.filter(item => Number(item.stock) <= 5), topProducts: [...products].sort((a, b) => Number(b.sales || 0) - Number(a.sales || 0)), recordedSales, recordedSalesValue, stockUnits: sum(products.map(item => item.stock)), currentCustomers, previousCustomers, currentTasks, previousTasks, currentActivities, previousActivities, comparisons: { customers: percentageChange(currentCustomers.length, previousCustomers.length), tasks: percentageChange(currentTasks.length, previousTasks.length), activity: percentageChange(currentActivities.length, previousActivities.length) } };
}
