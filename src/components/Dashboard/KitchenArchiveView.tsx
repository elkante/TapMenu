import React, { useState, useMemo, useEffect } from 'react';
import { 
  Calendar, 
  Filter, 
  DollarSign, 
  Printer, 
  ChevronRight, 
  TrendingUp, 
  TrendingDown, 
  ShoppingBag, 
  CreditCard, 
  Banknote, 
  Building2, 
  Clock, 
  CheckCircle2, 
  RefreshCw, 
  Download, 
  FileSpreadsheet,
  FileText
} from 'lucide-react';
import { Order, RestaurantTenant } from '../../types';
import { ExpenseItem } from '../../types';
import { getStoredExpenses, fetchExpensesFromSupabase } from '../../utils/expenseStorage';
import { fetchShiftsFromSupabase } from '../../utils/supabase';
import { formatNetworkDate, getNetworkDateString } from '../../utils/networkTime';

interface KitchenArchiveViewProps {
  orders: Order[];
  restaurant: RestaurantTenant;
  onPrintOrderReceipt: (order: Order) => void;
}

export const KitchenArchiveView: React.FC<KitchenArchiveViewProps> = ({
  orders,
  restaurant,
  onPrintOrderReceipt
}) => {
  const [filterMode, setFilterMode] = useState<'day' | 'month' | 'year'>('day');
  const todayStr = getNetworkDateString();
  const [selectedDate, setSelectedDate] = useState<string>(todayStr); // YYYY-MM-DD
  const [selectedMonth, setSelectedMonth] = useState<string>(todayStr.slice(0, 7)); // YYYY-MM
  const [selectedYear, setSelectedYear] = useState<string>(todayStr.slice(0, 4)); // YYYY
  const [expenses, setExpenses] = useState<ExpenseItem[]>(() => getStoredExpenses(restaurant.id));
  const [shifts, setShifts] = useState<any[]>([]);
  const [activeSubTab, setActiveSubTab] = useState<'orders' | 'shifts'>('orders');
  const [isLoading, setIsLoading] = useState(false);

  const loadData = async () => {
    setIsLoading(true);
    try {
      const [remoteExp, remoteShifts] = await Promise.all([
        fetchExpensesFromSupabase(restaurant.id),
        fetchShiftsFromSupabase(restaurant.id)
      ]);
      setExpenses(remoteExp);
      setShifts(remoteShifts);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [restaurant.id]);

  // Filter orders by selected day, month, or year
  const filteredOrders = useMemo(() => {
    return orders.filter(o => {
      const orderDate = o.createdAtTimestamp ? new Date(o.createdAtTimestamp) : new Date();
      const y = orderDate.getFullYear().toString();
      const m = String(orderDate.getMonth() + 1).padStart(2, '0');
      const d = String(orderDate.getDate()).padStart(2, '0');
      const dateKey = `${y}-${m}-${d}`;

      if (filterMode === 'day') {
        return dateKey === selectedDate;
      } else if (filterMode === 'month') {
        return `${y}-${m}` === selectedMonth;
      } else {
        return y === selectedYear;
      }
    });
  }, [orders, filterMode, selectedDate, selectedMonth, selectedYear]);

  // Filter expenses matching the same timeframe
  const filteredExpenses = useMemo(() => {
    return expenses.filter(e => {
      if (filterMode === 'day') {
        return e.date === selectedDate;
      } else if (filterMode === 'month') {
        return e.date.startsWith(selectedMonth);
      } else {
        return e.date.startsWith(selectedYear);
      }
    });
  }, [expenses, filterMode, selectedDate, selectedMonth, selectedYear]);

  // Financial aggregates
  const grossRevenue = filteredOrders.reduce((sum, o) => sum + o.total, 0);
  const totalExpenses = filteredExpenses.reduce((sum, e) => sum + e.amount, 0);
  const netProfit = grossRevenue - totalExpenses;
  const totalVat = filteredOrders.reduce((sum, o) => sum + (o.vat || 0), 0);

  const timeframeLabel = filterMode === 'day' ? selectedDate : filterMode === 'month' ? selectedMonth : selectedYear;

  // 1. COMPREHENSIVE CSV EXPORT (Includes Summary, Orders, and Expenses)
  const handleExportCsv = () => {
    const currency = restaurant.design?.currencySymbol || 'NGN';
    const lines: string[] = [];

    // Header & Summary Section
    lines.push(`"TAPMENU FINANCIAL & SALES AUDIT LEDGER"`);
    lines.push(`"Venue","${(restaurant.name || '').replace(/"/g, '""')}"`);
    lines.push(`"Slug","${restaurant.slug || ''}"`);
    lines.push(`"Audit Timeframe","${timeframeLabel}"`);
    lines.push(`"Generated At","${new Date().toISOString()}"`);
    lines.push(`"Currency","${currency}"`);
    lines.push(``);
    lines.push(`"EXECUTIVE FINANCIAL SUMMARY"`);
    lines.push(`"Metric","Amount"`);
    lines.push(`"Gross Sales Revenue",${grossRevenue}`);
    lines.push(`"Total Operating Expenses",${totalExpenses}`);
    lines.push(`"Net Operating Profit (Take-Home)",${netProfit}`);
    lines.push(`"Total Completed Orders",${filteredOrders.length}`);
    lines.push(`"Total VAT (7.5%) Collected",${totalVat}`);
    lines.push(``);

    // Section A: Completed Orders
    lines.push(`"SECTION A: COMPLETED ORDERS TRANSACTION LEDGER"`);
    lines.push([
      'Order ID',
      'Date',
      'Time',
      'Table / Destination',
      'Customer Name',
      'Customer Phone',
      'Items Purchased',
      'Order Type',
      'Payment Method',
      'Subtotal',
      'VAT',
      'Packaging Fee',
      'Delivery Fee',
      'Total Amount',
      'Status'
    ].map(h => `"${h}"`).join(','));

    if (filteredOrders.length > 0) {
      filteredOrders.forEach(o => {
        const itemsStr = (o.items || [])
          .map(ci => `${ci.quantity || 1}x ${ci.foodItem?.name || (ci as any).name || 'Dish'}`)
          .join('; ');
        lines.push([
          `"${o.id}"`,
          `"${o.createdAtTimestamp ? new Date(o.createdAtTimestamp).toLocaleDateString() : 'Today'}"`,
          `"${o.createdAt || ''}"`,
          `"${(o.tableNumber || '').replace(/"/g, '""')}"`,
          `"${(o.customerName || 'Walk-in').replace(/"/g, '""')}"`,
          `"${(o.customerPhone || '').replace(/"/g, '""')}"`,
          `"${itemsStr.replace(/"/g, '""')}"`,
          `"${o.orderType || 'dine_in'}"`,
          `"${o.paymentMethod || 'pos'}"`,
          o.subtotal || o.total || 0,
          o.vat || 0,
          o.packagingFee || 0,
          o.deliveryFee || 0,
          o.total || 0,
          `"${o.status || 'served'}"`
        ].join(','));
      });
    } else {
      lines.push(`"No customer orders recorded for ${timeframeLabel}"`);
    }

    lines.push(``);

    // Section B: Operating Expenses
    lines.push(`"SECTION B: OPERATING EXPENSES DISBURSEMENT LEDGER"`);
    lines.push(['Expense ID', 'Date', 'Category', 'Description', 'Payment Method', 'Recorded By', 'Amount'].map(h => `"${h}"`).join(','));
    if (filteredExpenses.length > 0) {
      filteredExpenses.forEach(e => {
        lines.push([
          `"${e.id}"`,
          `"${e.date}"`,
          `"${e.category}"`,
          `"${(e.description || '').replace(/"/g, '""')}"`,
          `"${e.paymentMethod || 'transfer'}"`,
          `"${(e.recordedBy || 'Manager').replace(/"/g, '""')}"`,
          e.amount || 0
        ].join(','));
      });
    } else {
      lines.push(`"No operating expenses recorded for ${timeframeLabel}"`);
    }

    const csvContent = '\uFEFF' + lines.join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `tapmenu_financial_ledger_${restaurant.slug}_${timeframeLabel}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    if (typeof showNotification === 'function') {
      showNotification('📥 CSV Spreadsheet downloaded successfully!');
    }
  };

  // 2. ACTUAL PRINTABLE / DOWNLOADABLE PDF FINANCIAL LEDGER (NOT an app screenshot)
  const handleExportPdfLedger = () => {
    const currency = restaurant.design?.currencySymbol || '₦';
    const restaurantName = restaurant.name || 'Venue';
    const slug = restaurant.slug || 'venue';

    // Format readable timeframe label
    let formattedTimeframe = '';
    if (filterMode === 'day') {
      try {
        const [y, m, d] = selectedDate.split('-');
        const dateObj = new Date(Number(y), Number(m) - 1, Number(d));
        formattedTimeframe = dateObj.toLocaleDateString('en-GB', {
          weekday: 'long',
          day: 'numeric',
          month: 'long',
          year: 'numeric'
        });
      } catch {
        formattedTimeframe = selectedDate;
      }
    } else if (filterMode === 'month') {
      try {
        const [y, m] = selectedMonth.split('-');
        const dateObj = new Date(Number(y), Number(m) - 1, 1);
        formattedTimeframe = dateObj.toLocaleDateString('en-GB', {
          month: 'long',
          year: 'numeric'
        });
      } catch {
        formattedTimeframe = selectedMonth;
      }
    } else {
      formattedTimeframe = `Fiscal Year ${selectedYear}`;
    }

    const generationTimestamp = new Date().toLocaleString('en-GB', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });

    const reportRef = `AUDIT-${slug.toUpperCase()}-${selectedDate.replace(/-/g, '')}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;

    // Payment breakdowns
    const posSales = filteredOrders.filter(o => (o.paymentMethod || 'pos').toLowerCase() === 'pos').reduce((s, o) => s + o.total, 0);
    const transferSales = filteredOrders.filter(o => (o.paymentMethod || '').toLowerCase() === 'transfer').reduce((s, o) => s + o.total, 0);
    const cashSales = filteredOrders.filter(o => (o.paymentMethod || '').toLowerCase() === 'cash').reduce((s, o) => s + o.total, 0);

    // Order type counts
    const dineInCount = filteredOrders.filter(o => !o.orderType || o.orderType === 'dine_in').length;
    const takeawayCount = filteredOrders.filter(o => o.orderType === 'takeaway' || o.orderType === 'both').length;
    const deliveryCount = filteredOrders.filter(o => o.orderType === 'delivery').length;

    // Order rows HTML
    const orderRowsHtml = filteredOrders.length > 0 ? filteredOrders.map((o, idx) => {
      const itemsText = (o.items || [])
        .map(ci => `${ci.quantity || 1}x ${ci.foodItem?.name || (ci as any).name || 'Dish'}`)
        .join(', ');
      const timeStr = o.createdAt || (o.createdAtTimestamp ? new Date(o.createdAtTimestamp).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) : '-');
      const orderTypeBadge = o.orderType === 'takeaway' ? 'Takeout' : o.orderType === 'delivery' ? 'Delivery' : o.orderType === 'both' ? 'Dine+Pack' : 'Dine-in';

      return `
        <tr>
          <td style="padding: 6px 7px; border-bottom: 1px solid #e2e8f0; font-size: 10px; text-align: center; color: #64748b;">${idx + 1}</td>
          <td style="padding: 6px 7px; border-bottom: 1px solid #e2e8f0; font-size: 10px; font-family: monospace; font-weight: 700; color: #0f172a; white-space: nowrap;">${timeStr}</td>
          <td style="padding: 6px 7px; border-bottom: 1px solid #e2e8f0; font-size: 10px; font-family: monospace; font-weight: 700; color: #0284c7;">#${o.id}</td>
          <td style="padding: 6px 7px; border-bottom: 1px solid #e2e8f0; font-size: 10px; font-weight: 600;">${o.tableNumber || 'Takeaway'}</td>
          <td style="padding: 6px 7px; border-bottom: 1px solid #e2e8f0; font-size: 10px;">
            <div style="font-weight: 600; color: #0f172a;">${o.customerName || 'Walk-in Guest'}</div>
            ${o.customerPhone ? `<div style="font-size: 9px; color: #64748b;">${o.customerPhone}</div>` : ''}
          </td>
          <td style="padding: 6px 7px; border-bottom: 1px solid #e2e8f0; font-size: 9px; font-weight: 600; text-transform: uppercase; color: #475569;">${orderTypeBadge}</td>
          <td style="padding: 6px 7px; border-bottom: 1px solid #e2e8f0; font-size: 10px; color: #334155; max-width: 220px;">${itemsText}</td>
          <td style="padding: 6px 7px; border-bottom: 1px solid #e2e8f0; font-size: 9px; font-weight: 700; text-transform: uppercase; color: #475569;">${o.paymentMethod || 'POS'}</td>
          <td style="padding: 6px 7px; border-bottom: 1px solid #e2e8f0; font-size: 10px; text-align: right; font-family: monospace;">${currency}${(o.subtotal || o.total).toLocaleString()}</td>
          <td style="padding: 6px 7px; border-bottom: 1px solid #e2e8f0; font-size: 10px; text-align: right; font-family: monospace; color: #64748b;">${currency}${(o.vat || 0).toLocaleString()}</td>
          <td style="padding: 6px 7px; border-bottom: 1px solid #e2e8f0; font-size: 10px; text-align: right; font-family: monospace; font-weight: 800; color: #0f172a;">${currency}${o.total.toLocaleString()}</td>
        </tr>
      `;
    }).join('') : `
      <tr>
        <td colspan="11" style="padding: 24px; text-align: center; color: #94a3b8; font-size: 11px; font-style: italic;">
          Zero customer order transactions recorded for this audit period (${formattedTimeframe}).
        </td>
      </tr>
    `;

    // Expense rows HTML
    const expenseRowsHtml = filteredExpenses.length > 0 ? filteredExpenses.map((e, idx) => `
      <tr>
        <td style="padding: 6px 8px; border-bottom: 1px solid #e2e8f0; font-size: 10px; text-align: center; color: #64748b;">${idx + 1}</td>
        <td style="padding: 6px 8px; border-bottom: 1px solid #e2e8f0; font-size: 10px; font-family: monospace;">${e.date}</td>
        <td style="padding: 6px 8px; border-bottom: 1px solid #e2e8f0; font-size: 10px; font-weight: 700; text-transform: uppercase; color: #0f172a;">${e.category.replace('_', ' ')}</td>
        <td style="padding: 6px 8px; border-bottom: 1px solid #e2e8f0; font-size: 10px; color: #334155;">${e.description}</td>
        <td style="padding: 6px 8px; border-bottom: 1px solid #e2e8f0; font-size: 10px; text-transform: capitalize; color: #475569;">${e.paymentMethod || 'transfer'}</td>
        <td style="padding: 6px 8px; border-bottom: 1px solid #e2e8f0; font-size: 10px; color: #64748b;">${e.recordedBy || 'Manager'}</td>
        <td style="padding: 6px 8px; border-bottom: 1px solid #e2e8f0; font-size: 10px; text-align: right; font-family: monospace; font-weight: 800; color: #b91c1c;">-${currency}${e.amount.toLocaleString()}</td>
      </tr>
    `).join('') : `
      <tr>
        <td colspan="7" style="padding: 20px; text-align: center; color: #94a3b8; font-size: 11px; font-style: italic;">
          Zero operating expenses recorded for this audit period (${formattedTimeframe}).
        </td>
      </tr>
    `;

    // Closed shifts HTML
    const shiftSectionHtml = shifts.length > 0 ? `
      <div style="margin-top: 22px;">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px; border-bottom: 1px solid #0f172a; padding-bottom: 4px;">
          <h3 style="font-size: 11px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.05em; color: #0f172a; margin: 0;">
            Section C: Closed Shift Reconciliations (Z-Reports)
          </h3>
          <span style="font-size: 10px; color: #64748b;">${shifts.length} shifts recorded</span>
        </div>
        <table style="width: 100%; border-collapse: collapse; text-align: left;">
          <thead>
            <tr style="background: #334155; color: #ffffff; font-size: 9px; text-transform: uppercase; letter-spacing: 0.05em;">
              <th style="padding: 6px 8px;">Date</th>
              <th style="padding: 6px 8px;">Shift Interval</th>
              <th style="padding: 6px 8px; text-align: center;">Orders (Served)</th>
              <th style="padding: 6px 8px; text-align: right;">POS Sales</th>
              <th style="padding: 6px 8px; text-align: right;">Cash Sales</th>
              <th style="padding: 6px 8px; text-align: right;">Total Shift Revenue</th>
            </tr>
          </thead>
          <tbody>
            ${shifts.map(s => `
              <tr>
                <td style="padding: 6px 8px; border-bottom: 1px solid #e2e8f0; font-size: 10px; font-weight: 600;">${s.date}</td>
                <td style="padding: 6px 8px; border-bottom: 1px solid #e2e8f0; font-size: 10px; font-family: monospace;">${s.startedAt} → ${s.endedAt}</td>
                <td style="padding: 6px 8px; border-bottom: 1px solid #e2e8f0; font-size: 10px; text-align: center;">${s.totalOrders || 0} (${s.servedOrders || 0} served)</td>
                <td style="padding: 6px 8px; border-bottom: 1px solid #e2e8f0; font-size: 10px; text-align: right; font-family: monospace;">${currency}${Number(s.payments?.pos || 0).toLocaleString()}</td>
                <td style="padding: 6px 8px; border-bottom: 1px solid #e2e8f0; font-size: 10px; text-align: right; font-family: monospace;">${currency}${Number(s.payments?.cash || 0).toLocaleString()}</td>
                <td style="padding: 6px 8px; border-bottom: 1px solid #e2e8f0; font-size: 10px; text-align: right; font-family: monospace; font-weight: 800; color: #0f172a;">${currency}${Number(s.totalRevenue || 0).toLocaleString()}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    ` : '';

    const htmlContent = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Financial & Sales Audit Ledger - ${restaurantName} (${timeframeLabel})</title>
  <style>
    @page {
      size: A4 portrait;
      margin: 12mm 10mm;
    }
    * {
      box-sizing: border-box;
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
    }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
      color: #0f172a;
      background: #ffffff;
      margin: 0;
      padding: 16px;
      line-height: 1.35;
    }
    table {
      page-break-inside: auto;
    }
    tr {
      page-break-inside: avoid;
      page-break-after: auto;
    }
    thead {
      display: table-header-group;
    }
    tfoot {
      display: table-footer-group;
    }
    .metric-card {
      border: 1px solid #cbd5e1;
      border-radius: 8px;
      padding: 10px 14px;
      background: #f8fafc;
    }
    @media print {
      .no-print { display: none !important; }
      body { padding: 0 !important; }
    }
  </style>
</head>
<body>
  <!-- Print Control Banner (Hidden in PDF Print) -->
  <div class="no-print" style="position: sticky; top: 0; z-index: 100; background: #0f172a; color: #fff; padding: 12px 18px; display: flex; justify-content: space-between; align-items: center; border-radius: 10px; margin-bottom: 20px; box-shadow: 0 4px 12px rgba(0,0,0,0.15);">
    <div style="font-size: 13px; font-weight: bold;">
      📄 ${restaurantName} — Financial & Sales Audit Ledger (${timeframeLabel})
    </div>
    <div style="display: flex; gap: 8px;">
      <button onclick="window.print()" style="background: #f59e0b; color: #000; font-weight: bold; border: none; padding: 8px 16px; border-radius: 8px; cursor: pointer; font-size: 12px;">
        🖨️ Save as PDF / Print
      </button>
      <button onclick="window.close()" style="background: #334155; color: #fff; font-weight: 600; border: none; padding: 8px 14px; border-radius: 8px; cursor: pointer; font-size: 12px;">
        Close
      </button>
    </div>
  </div>

  <!-- Header -->
  <div style="display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #0f172a; padding-bottom: 12px; margin-bottom: 16px;">
    <div>
      <div style="font-size: 20px; font-weight: 900; letter-spacing: -0.02em; color: #0f172a; text-transform: uppercase;">
        ${restaurantName}
      </div>
      <div style="font-size: 13px; font-weight: 800; color: #b45309; letter-spacing: 0.05em; text-transform: uppercase; margin-top: 2px;">
        Official Financial & Sales Audit Ledger
      </div>
      <div style="font-size: 11px; color: #64748b; margin-top: 3px;">
        TapMenu Hospitality Platform &middot; Slug: ${slug} &middot; Certified Supabase Cloud Ledger
      </div>
    </div>
    <div style="text-align: right; font-size: 11px; color: #475569;">
      <div><strong>Audit Period:</strong> <span style="font-size: 12px; font-weight: 800; color: #0f172a;">${formattedTimeframe}</span></div>
      <div><strong>Generated:</strong> ${generationTimestamp}</div>
      <div style="font-family: monospace; font-size: 10px; color: #64748b; margin-top: 2px;">Ref: ${reportRef}</div>
    </div>
  </div>

  <!-- Executive Financial KPI Summary -->
  <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; margin-bottom: 18px;">
    <div class="metric-card">
      <div style="font-size: 10px; font-weight: 700; text-transform: uppercase; color: #64748b;">Gross Sales Revenue</div>
      <div style="font-size: 18px; font-weight: 900; font-family: monospace; color: #0f172a; margin-top: 4px;">
        ${currency}${grossRevenue.toLocaleString()}
      </div>
      <div style="font-size: 10px; color: #64748b; margin-top: 2px;">${filteredOrders.length} completed orders</div>
    </div>
    <div class="metric-card">
      <div style="font-size: 10px; font-weight: 700; text-transform: uppercase; color: #b91c1c;">Total Expenses</div>
      <div style="font-size: 18px; font-weight: 900; font-family: monospace; color: #b91c1c; margin-top: 4px;">
        -${currency}${totalExpenses.toLocaleString()}
      </div>
      <div style="font-size: 10px; color: #64748b; margin-top: 2px;">${filteredExpenses.length} expense vouchers</div>
    </div>
    <div class="metric-card" style="background: ${netProfit >= 0 ? '#f0fdf4' : '#fef2f2'}; border-color: ${netProfit >= 0 ? '#86efac' : '#fca5a5'};">
      <div style="font-size: 10px; font-weight: 700; text-transform: uppercase; color: ${netProfit >= 0 ? '#15803d' : '#b91c1c'};">Net Profit (Take-Home)</div>
      <div style="font-size: 18px; font-weight: 900; font-family: monospace; color: ${netProfit >= 0 ? '#15803d' : '#b91c1c'}; margin-top: 4px;">
        ${currency}${netProfit.toLocaleString()}
      </div>
      <div style="font-size: 10px; color: ${netProfit >= 0 ? '#15803d' : '#b91c1c'}; margin-top: 2px;">Revenue minus expenses</div>
    </div>
    <div class="metric-card">
      <div style="font-size: 10px; font-weight: 700; text-transform: uppercase; color: #64748b;">Tax & Order Split</div>
      <div style="font-size: 13px; font-weight: 800; font-family: monospace; color: #0f172a; margin-top: 4px;">
        VAT (7.5%): ${currency}${totalVat.toLocaleString()}
      </div>
      <div style="font-size: 10px; color: #64748b; margin-top: 2px;">Dine-in: ${dineInCount} | Takeout: ${takeawayCount} | Del: ${deliveryCount}</div>
    </div>
  </div>

  <!-- Payment Channels Sub-bar -->
  <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; padding: 6px 12px; margin-bottom: 18px; font-size: 11px; display: flex; justify-content: space-between; align-items: center;">
    <div><strong>Settlement Breakdown:</strong></div>
    <div>POS Terminal / Card: <span style="font-family: monospace; font-weight: 700;">${currency}${posSales.toLocaleString()}</span></div>
    <div>Bank Transfer: <span style="font-family: monospace; font-weight: 700;">${currency}${transferSales.toLocaleString()}</span></div>
    <div>Cash Received: <span style="font-family: monospace; font-weight: 700;">${currency}${cashSales.toLocaleString()}</span></div>
  </div>

  <!-- Section A: Orders Ledger -->
  <div style="margin-bottom: 22px;">
    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px; border-bottom: 1px solid #0f172a; padding-bottom: 4px;">
      <h3 style="font-size: 11px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.05em; color: #0f172a; margin: 0;">
        Section A: Itemized Customer Order Transactions (${filteredOrders.length})
      </h3>
      <span style="font-size: 10px; color: #64748b;">Chronological Transaction Order</span>
    </div>
    <table style="width: 100%; border-collapse: collapse; text-align: left;">
      <thead>
        <tr style="background: #0f172a; color: #ffffff; font-size: 9px; text-transform: uppercase; letter-spacing: 0.05em;">
          <th style="padding: 6px 7px; text-align: center; width: 28px;">#</th>
          <th style="padding: 6px 7px; width: 55px;">Time</th>
          <th style="padding: 6px 7px; width: 75px;">Order ID</th>
          <th style="padding: 6px 7px; width: 65px;">Table</th>
          <th style="padding: 6px 7px; width: 120px;">Customer</th>
          <th style="padding: 6px 7px; width: 65px;">Type</th>
          <th style="padding: 6px 7px;">Items Purchased</th>
          <th style="padding: 6px 7px; width: 50px;">Method</th>
          <th style="padding: 6px 7px; text-align: right; width: 65px;">Subtotal</th>
          <th style="padding: 6px 7px; text-align: right; width: 50px;">VAT</th>
          <th style="padding: 6px 7px; text-align: right; width: 80px;">Total</th>
        </tr>
      </thead>
      <tbody>
        ${orderRowsHtml}
      </tbody>
      ${filteredOrders.length > 0 ? `
        <tfoot>
          <tr style="background: #f1f5f9; font-weight: 800; border-top: 2px solid #0f172a;">
            <td colspan="8" style="padding: 7px; font-size: 10px; text-align: right; text-transform: uppercase;">Total Sales:</td>
            <td style="padding: 7px; font-size: 10px; text-align: right; font-family: monospace;">${currency}${filteredOrders.reduce((s, o) => s + (o.subtotal || o.total), 0).toLocaleString()}</td>
            <td style="padding: 7px; font-size: 10px; text-align: right; font-family: monospace;">${currency}${totalVat.toLocaleString()}</td>
            <td style="padding: 7px; font-size: 11px; text-align: right; font-family: monospace; font-weight: 900; color: #0f172a;">${currency}${grossRevenue.toLocaleString()}</td>
          </tr>
        </tfoot>
      ` : ''}
    </table>
  </div>

  <!-- Section B: Operating Expenses -->
  <div style="margin-bottom: 22px;">
    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px; border-bottom: 1px solid #0f172a; padding-bottom: 4px;">
      <h3 style="font-size: 11px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.05em; color: #0f172a; margin: 0;">
        Section B: Operational Expenses Ledger (${filteredExpenses.length})
      </h3>
      <span style="font-size: 10px; color: #64748b;">Recorded vouchers & disbursements</span>
    </div>
    <table style="width: 100%; border-collapse: collapse; text-align: left;">
      <thead>
        <tr style="background: #334155; color: #ffffff; font-size: 9px; text-transform: uppercase; letter-spacing: 0.05em;">
          <th style="padding: 6px 8px; text-align: center; width: 28px;">#</th>
          <th style="padding: 6px 8px; width: 85px;">Date</th>
          <th style="padding: 6px 8px; width: 110px;">Category</th>
          <th style="padding: 6px 8px;">Description / Purpose</th>
          <th style="padding: 6px 8px; width: 85px;">Payment</th>
          <th style="padding: 6px 8px; width: 120px;">Recorded By</th>
          <th style="padding: 6px 8px; text-align: right; width: 100px;">Amount</th>
        </tr>
      </thead>
      <tbody>
        ${expenseRowsHtml}
      </tbody>
      ${filteredExpenses.length > 0 ? `
        <tfoot>
          <tr style="background: #f1f5f9; font-weight: 800; border-top: 2px solid #0f172a;">
            <td colspan="6" style="padding: 7px; font-size: 10px; text-align: right; text-transform: uppercase;">Total Expenses:</td>
            <td style="padding: 7px; font-size: 11px; text-align: right; font-family: monospace; font-weight: 900; color: #b91c1c;">-${currency}${totalExpenses.toLocaleString()}</td>
          </tr>
        </tfoot>
      ` : ''}
    </table>
  </div>

  ${shiftSectionHtml}

  <!-- Audit Certification & Signatures Footer -->
  <div style="margin-top: 32px; padding-top: 14px; border-top: 1px dashed #94a3b8; page-break-inside: avoid;">
    <div style="font-size: 10px; color: #64748b; line-height: 1.4; margin-bottom: 24px; text-align: justify;">
      <strong>Audit Verification Notice:</strong> This document represents an authentic, immutable accounting ledger compiled from cloud-synchronized transaction records for <strong>${restaurantName}</strong>. All entries correspond to verified customer orders and operational disbursements recorded in the TapMenu POS database.
    </div>

    <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 24px; margin-top: 12px; font-size: 11px;">
      <div>
        <div style="border-bottom: 1px solid #0f172a; height: 32px;"></div>
        <div style="font-weight: 700; color: #0f172a; margin-top: 4px;">Prepared By: Store / Kitchen Manager</div>
        <div style="font-size: 10px; color: #64748b;">Date: ________________________</div>
      </div>
      <div>
        <div style="border-bottom: 1px solid #0f172a; height: 32px;"></div>
        <div style="font-weight: 700; color: #0f172a; margin-top: 4px;">Audited & Approved: General Manager / Owner</div>
        <div style="font-size: 10px; color: #64748b;">Date: ________________________</div>
      </div>
      <div style="text-align: right; display: flex; flex-direction: column; justify-content: flex-end;">
        <div style="font-size: 10px; font-family: monospace; color: #0f172a; font-weight: bold;">
          [ TAPMENU CLOUD CERTIFIED ]
        </div>
        <div style="font-size: 9px; color: #94a3b8; margin-top: 2px;">
          Generated: ${generationTimestamp}
        </div>
      </div>
    </div>
  </div>
</body>
</html>
    `;

    // Open dedicated printable PDF audit window with instant print trigger
    const printWindow = window.open('', '_blank');
    if (printWindow) {
      printWindow.document.open();
      printWindow.document.write(htmlContent);
      printWindow.document.close();
      printWindow.onload = () => {
        setTimeout(() => {
          printWindow.focus();
          printWindow.print();
        }, 300);
      };
      if (typeof showNotification === 'function') {
        showNotification('📄 Print / Save as PDF window opened!');
      }
    } else {
      // Fallback if popup blocker intercepted
      const blob = new Blob([htmlContent], { type: 'text/html;charset=utf-8' });
      const blobUrl = URL.createObjectURL(blob);
      window.open(blobUrl, '_blank');
    }
  };

  return (
    <div className="space-y-5 animate-in fade-in duration-200">
      
      {/* Timeframe Filter Bar */}
      <div className="bg-white p-4 rounded-2xl border border-neutral-200 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-3 no-print">
        <div className="flex items-center gap-2">
          <div className="p-2 rounded-xl bg-amber-500/10 text-amber-600">
            <Calendar className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-sm sm:text-base font-extrabold text-neutral-900">Historical Kitchen Archive & Profit Reports</h2>
            <p className="text-xs text-neutral-500">
              Live consolidated shifts, dine-in sales, and expenses from Supabase Cloud.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Sub Tab Switcher */}
          <div className="flex bg-neutral-100 p-0.5 rounded-xl text-xs font-bold mr-1">
            <button
              onClick={() => setActiveSubTab('orders')}
              className={`px-3 py-1.5 rounded-lg transition-all ${
                activeSubTab === 'orders' ? 'bg-white text-neutral-900 shadow-xs' : 'text-neutral-500 hover:text-neutral-900'
              }`}
            >
              Order Tickets
            </button>
            <button
              onClick={() => setActiveSubTab('shifts')}
              className={`px-3 py-1.5 rounded-lg transition-all ${
                activeSubTab === 'shifts' ? 'bg-white text-neutral-900 shadow-xs' : 'text-neutral-500 hover:text-neutral-900'
              }`}
            >
              Closed Shifts ({shifts.length})
            </button>
          </div>

          {/* Mode Selector */}
          <div className="flex bg-neutral-100 p-0.5 rounded-xl text-xs font-bold">
            <button
              onClick={() => setFilterMode('day')}
              className={`px-2.5 py-1.5 rounded-lg transition-all ${
                filterMode === 'day' ? 'bg-neutral-900 text-white shadow-xs' : 'text-neutral-600 hover:text-neutral-900'
              }`}
            >
              Day
            </button>
            <button
              onClick={() => setFilterMode('month')}
              className={`px-2.5 py-1.5 rounded-lg transition-all ${
                filterMode === 'month' ? 'bg-neutral-900 text-white shadow-xs' : 'text-neutral-600 hover:text-neutral-900'
              }`}
            >
              Month
            </button>
            <button
              onClick={() => setFilterMode('year')}
              className={`px-2.5 py-1.5 rounded-lg transition-all ${
                filterMode === 'year' ? 'bg-neutral-900 text-white shadow-xs' : 'text-neutral-600 hover:text-neutral-900'
              }`}
            >
              Year
            </button>
          </div>

          {/* Date Picker Input */}
          {filterMode === 'day' && (
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="px-3 py-1.5 bg-neutral-50 border border-neutral-200 rounded-xl text-xs font-bold text-neutral-900 focus:outline-hidden focus:border-amber-500"
            />
          )}

          {filterMode === 'month' && (
            <input
              type="month"
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(e.target.value)}
              className="px-3 py-1.5 bg-neutral-50 border border-neutral-200 rounded-xl text-xs font-bold text-neutral-900 focus:outline-hidden focus:border-amber-500"
            />
          )}

          {filterMode === 'year' && (
            <select
              value={selectedYear}
              onChange={(e) => setSelectedYear(e.target.value)}
              className="px-3 py-1.5 bg-neutral-50 border border-neutral-200 rounded-xl text-xs font-bold text-neutral-900 focus:outline-hidden focus:border-amber-500"
            >
              {[2026, 2025, 2024].map(y => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
          )}

          <button
            onClick={loadData}
            disabled={isLoading}
            className="p-2 bg-neutral-100 hover:bg-neutral-200 text-neutral-700 rounded-xl text-xs transition-colors cursor-pointer"
            title="Refresh Cloud Archive"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin text-amber-500' : ''}`} />
          </button>

          {/* SEPARATE BUTTON 1: EXPORT CSV */}
          <button
            onClick={handleExportCsv}
            className="px-3.5 py-2 bg-neutral-900 hover:bg-neutral-800 text-white rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 shadow-xs cursor-pointer active:scale-95"
            title="Export full financial ledger as CSV spreadsheet"
          >
            <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-400" />
            <span>Export CSV</span>
          </button>

          {/* SEPARATE BUTTON 2: DOWNLOAD PDF LEDGER */}
          <button
            onClick={handleExportPdfLedger}
            className="px-3.5 py-2 bg-amber-500 hover:bg-amber-400 text-neutral-950 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 shadow-xs cursor-pointer active:scale-95"
            title="Open official financial audit ledger to Save as PDF or print"
          >
            <Printer className="w-3.5 h-3.5" />
            <span>Save / Print PDF Ledger</span>
          </button>
        </div>
      </div>

      {/* 4 Clean Metric Overview Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        
        {/* Gross Sales */}
        <div className="bg-white p-4 sm:p-5 rounded-3xl border border-neutral-200 shadow-xs space-y-1">
          <div className="flex items-center justify-between text-neutral-500 text-xs">
            <span className="font-medium">Gross Revenue</span>
            <div className="w-7 h-7 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center font-bold">
              ₦
            </div>
          </div>
          <div className="text-xl sm:text-2xl font-extrabold text-neutral-900 tracking-tight font-mono">
            {restaurant.design.currencySymbol}{grossRevenue.toLocaleString()}
          </div>
          <p className="text-[11px] text-neutral-400 truncate">{filteredOrders.length} completed orders in {timeframeLabel}</p>
        </div>

        {/* Expenses */}
        <div className="bg-white p-4 sm:p-5 rounded-3xl border border-neutral-200 shadow-xs space-y-1">
          <div className="flex items-center justify-between text-neutral-500 text-xs">
            <span className="font-medium">Total Expenses</span>
            <div className="w-7 h-7 rounded-xl bg-rose-50 text-rose-600 flex items-center justify-center">
              <TrendingDown className="w-4 h-4" />
            </div>
          </div>
          <div className="text-xl sm:text-2xl font-extrabold text-rose-700 tracking-tight font-mono">
            -{restaurant.design.currencySymbol}{totalExpenses.toLocaleString()}
          </div>
          <p className="text-[11px] text-neutral-400 truncate">{filteredExpenses.length} recorded expense vouchers</p>
        </div>

        {/* Net Profit */}
        <div className="bg-white p-4 sm:p-5 rounded-3xl border border-neutral-200 shadow-xs space-y-1">
          <div className="flex items-center justify-between text-neutral-500 text-xs">
            <span className="font-medium">Net Profit (Take-Home)</span>
            <div className={`w-7 h-7 rounded-xl flex items-center justify-center ${netProfit >= 0 ? 'bg-emerald-50 text-emerald-600' : 'bg-red-50 text-red-600'}`}>
              <TrendingUp className="w-4 h-4" />
            </div>
          </div>
          <div className={`text-xl sm:text-2xl font-extrabold tracking-tight font-mono ${netProfit >= 0 ? 'text-emerald-700' : 'text-red-600'}`}>
            {restaurant.design.currencySymbol}{netProfit.toLocaleString()}
          </div>
          <p className="text-[11px] text-neutral-400 truncate">Revenue minus all operational costs</p>
        </div>

        {/* VAT & Tax Collected */}
        <div className="bg-white p-4 sm:p-5 rounded-3xl border border-neutral-200 shadow-xs space-y-1">
          <div className="flex items-center justify-between text-neutral-500 text-xs">
            <span className="font-medium">Total Orders</span>
            <div className="w-7 h-7 rounded-xl bg-neutral-100 text-neutral-700 flex items-center justify-center font-bold">
              <CheckCircle2 className="w-4 h-4" />
            </div>
          </div>
          <div className="text-xl sm:text-2xl font-extrabold text-neutral-900 tracking-tight font-mono">
            {filteredOrders.length} Diners
          </div>
          <p className="text-[11px] text-neutral-400 truncate">VAT (7.5%): ₦{totalVat.toLocaleString()}</p>
        </div>

      </div>

      {/* Main Content: Orders List OR Shift Reconciliations */}
      {activeSubTab === 'shifts' ? (
        <div className="bg-white rounded-3xl border border-neutral-200 shadow-xs overflow-hidden">
          <div className="p-4 border-b border-neutral-200 bg-neutral-50 flex items-center justify-between">
            <h3 className="font-extrabold text-xs text-neutral-800 uppercase tracking-wider">
              Closed Shift Reconciliation Reports (Z-Reports)
            </h3>
            <span className="text-xs text-neutral-500 font-mono">{shifts.length} Archived Shifts</span>
          </div>

          {shifts.length === 0 ? (
            <div className="p-10 text-center space-y-2">
              <Clock className="w-8 h-8 text-neutral-300 mx-auto" />
              <p className="text-xs font-bold text-neutral-600">No shift reconciliations archived yet</p>
              <p className="text-[11px] text-neutral-400">When you click "End Day Shift (Z-Report)" on the kitchen display, closed shifts save here permanently.</p>
            </div>
          ) : (
            <div className="divide-y divide-neutral-100">
              {shifts.map((shift: any) => (
                <div key={shift.shiftId} className="p-4 hover:bg-neutral-50/80 transition-colors flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-extrabold text-sm text-neutral-900">{shift.date}</span>
                      <span className="px-2 py-0.5 rounded font-mono font-bold text-[10px] bg-emerald-100 text-emerald-900">
                        {shift.startedAt} → {shift.endedAt}
                      </span>
                    </div>
                    <div className="text-neutral-500 text-[11px]">
                      {shift.totalOrders} total orders placed · {shift.servedOrders || 0} served to tables
                    </div>
                  </div>

                  <div className="text-right">
                    <span className="font-mono font-extrabold text-base text-neutral-900 block">
                      {restaurant.design.currencySymbol}{Number(shift.totalRevenue || 0).toLocaleString()}
                    </span>
                    <span className="text-[10px] font-mono text-neutral-500 block">
                      POS: {restaurant.design.currencySymbol}{Number(shift.payments?.pos || 0).toLocaleString()} | Cash: {restaurant.design.currencySymbol}{Number(shift.payments?.cash || 0).toLocaleString()}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : (
        <div className="bg-white rounded-3xl border border-neutral-200 shadow-xs overflow-hidden">
          <div className="p-4 border-b border-neutral-200 bg-neutral-50 flex items-center justify-between">
            <h3 className="font-extrabold text-xs text-neutral-800 uppercase tracking-wider">
              Completed Orders History ({timeframeLabel})
            </h3>
            <span className="text-xs text-neutral-500 font-mono">{filteredOrders.length} Orders</span>
          </div>

          {filteredOrders.length === 0 ? (
            <div className="p-10 text-center space-y-2">
              <ShoppingBag className="w-8 h-8 text-neutral-300 mx-auto" />
              <p className="text-xs font-bold text-neutral-600">No orders recorded for {timeframeLabel}</p>
              <p className="text-[11px] text-neutral-400">Select another date or month from the filter above.</p>
            </div>
          ) : (
            <div className="divide-y divide-neutral-100">
              {filteredOrders.map(order => (
                <div key={order.id} className="p-3.5 sm:p-4 hover:bg-neutral-50/80 transition-colors flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
                  
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-bold text-neutral-900">#{order.id}</span>
                      <span className="px-2 py-0.5 rounded font-mono font-bold text-[10px] bg-amber-100 text-amber-900">
                        {order.tableNumber}
                      </span>
                      {(order.orderType === 'takeaway' || order.orderType === 'both') && (
                        <span className="px-2 py-0.5 rounded font-bold text-[10px] bg-rose-100 text-rose-900">
                          {order.orderType === 'both' ? '🍽️🥡 BOTH' : '🥡 TAKEOUT'}
                        </span>
                      )}
                      <span className="text-neutral-400 text-[11px]">{order.createdAt}</span>
                    </div>

                    <div className="text-neutral-600 font-medium">
                      {order.customerName} {order.customerPhone ? `(${order.customerPhone})` : ''} · {(Array.isArray(order.items) ? order.items : []).map((i: any) => `${i.quantity || 1}x ${i.foodItem?.name || i.name || 'Item'}`).join(', ')}
                    </div>
                  </div>

                  <div className="flex items-center justify-between sm:justify-end gap-3 shrink-0">
                    <div className="text-right">
                      <span className="font-mono font-extrabold text-sm text-neutral-900 block">
                        {restaurant.design.currencySymbol}{order.total.toLocaleString()}
                      </span>
                      <span className="text-[10px] uppercase font-bold text-neutral-400 block">
                        Paid via {order.paymentMethod || 'POS'}
                      </span>
                    </div>

                    <button
                      onClick={() => onPrintOrderReceipt(order)}
                      className="p-2 rounded-xl bg-neutral-100 hover:bg-neutral-200 text-neutral-700 transition-colors cursor-pointer"
                      title="Reprint Thermal Receipt"
                    >
                      <Printer className="w-4 h-4" />
                    </button>
                  </div>

                </div>
              ))}
            </div>
          )}
        </div>
      )}

    </div>
  );
};
