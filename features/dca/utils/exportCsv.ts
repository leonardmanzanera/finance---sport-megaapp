import { DcaTransaction } from '../../../types';

/**
 * Export DCA transactions to a CSV file
 * @param transactions Array of DCA transactions to export
 * @param ticker The ticker symbol for the filename
 */
export function exportToCsv(transactions: DcaTransaction[], ticker: string): void {
    const headers = [
        'Date',
        'Prix',
        'Montant Investi',
        'Parts Achetées',
        'Cumul Parts',
        'Valeur Portefeuille',
        'Multiplicateur',
        'Indicateur'
    ];

    const rows = transactions.map(tx => [
        tx.date,
        tx.price.toFixed(2),
        tx.investedAmount.toFixed(2),
        tx.sharesBought.toFixed(4),
        tx.accumulatedShares.toFixed(4),
        tx.portfolioValue.toFixed(2),
        tx.multiplierApplied.toString(),
        tx.reason || ''
    ]);

    // Build CSV content
    const csvContent = [
        headers.join(','),
        ...rows.map(row => row.map(cell =>
            // Escape cells that contain commas or quotes
            cell.includes(',') || cell.includes('"')
                ? `"${cell.replace(/"/g, '""')}"`
                : cell
        ).join(','))
    ].join('\n');

    // Create and trigger download
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `backtest_${ticker}_${new Date().toISOString().split('T')[0]}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
}
