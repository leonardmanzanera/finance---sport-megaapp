import React from 'react';
import { Document, Page, Text, View, StyleSheet } from '@react-pdf/renderer';
import { DcaExtendedSummary, DcaTransaction } from '../../../types';

const styles = StyleSheet.create({
    page: {
        padding: 30,
        fontFamily: 'Helvetica',
        backgroundColor: '#FFFFFF'
    },
    header: {
        marginBottom: 20
    },
    title: {
        fontSize: 24,
        fontWeight: 'bold',
        color: '#1E1E2E',
        marginBottom: 5
    },
    subtitle: {
        fontSize: 10,
        color: '#6B7280'
    },
    section: {
        marginBottom: 20
    },
    sectionTitle: {
        fontSize: 14,
        fontWeight: 'bold',
        marginBottom: 10,
        color: '#3B82F6',
        borderBottomWidth: 1,
        borderBottomColor: '#E5E7EB',
        paddingBottom: 5
    },
    row: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        marginBottom: 6,
        paddingHorizontal: 5
    },
    label: {
        fontSize: 10,
        color: '#6B7280'
    },
    value: {
        fontSize: 10,
        fontWeight: 'bold',
        color: '#1F2937'
    },
    valuePositive: {
        fontSize: 10,
        fontWeight: 'bold',
        color: '#10B981'
    },
    valueNegative: {
        fontSize: 10,
        fontWeight: 'bold',
        color: '#EF4444'
    },
    table: {
        marginTop: 10
    },
    tableHeader: {
        flexDirection: 'row',
        backgroundColor: '#1E1E2E',
        padding: 8,
        borderTopLeftRadius: 4,
        borderTopRightRadius: 4
    },
    tableRow: {
        flexDirection: 'row',
        borderBottomWidth: 1,
        borderBottomColor: '#E5E7EB',
        padding: 6,
        backgroundColor: '#FAFAFA'
    },
    tableRowAlt: {
        flexDirection: 'row',
        borderBottomWidth: 1,
        borderBottomColor: '#E5E7EB',
        padding: 6,
        backgroundColor: '#FFFFFF'
    },
    tableCell: {
        fontSize: 8,
        flex: 1,
        color: '#374151'
    },
    tableCellHeader: {
        fontSize: 8,
        flex: 1,
        color: '#FFFFFF',
        fontWeight: 'bold'
    },
    footer: {
        fontSize: 8,
        color: '#9CA3AF',
        marginTop: 10,
        textAlign: 'center'
    },
    kpiGrid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        marginBottom: 10
    },
    kpiItem: {
        width: '50%',
        padding: 5
    }
});

interface PdfReportProps {
    ticker: string;
    summary: DcaExtendedSummary;
    transactions: DcaTransaction[];
}

const PdfReport: React.FC<PdfReportProps> = ({ ticker, summary, transactions }) => (
    <Document>
        <Page size="A4" style={styles.page}>
            {/* Header */}
            <View style={styles.header}>
                <Text style={styles.title}>📊 Rapport DCA - {ticker}</Text>
                <Text style={styles.subtitle}>
                    Généré le {new Date().toLocaleDateString('fr-FR')} | {transactions.length} transactions
                </Text>
            </View>

            {/* Summary Section */}
            <View style={styles.section}>
                <Text style={styles.sectionTitle}>Résumé des Performances</Text>

                <View style={styles.kpiGrid}>
                    <View style={styles.kpiItem}>
                        <View style={styles.row}>
                            <Text style={styles.label}>Total Investi</Text>
                            <Text style={styles.value}>€{summary.totalInvested.toLocaleString('fr-FR', { maximumFractionDigits: 0 })}</Text>
                        </View>
                    </View>

                    <View style={styles.kpiItem}>
                        <View style={styles.row}>
                            <Text style={styles.label}>Valeur Actuelle</Text>
                            <Text style={summary.profitPercent >= 0 ? styles.valuePositive : styles.valueNegative}>
                                €{summary.currentValue.toLocaleString('fr-FR', { maximumFractionDigits: 0 })}
                            </Text>
                        </View>
                    </View>

                    <View style={styles.kpiItem}>
                        <View style={styles.row}>
                            <Text style={styles.label}>Rendement Total</Text>
                            <Text style={summary.profitPercent >= 0 ? styles.valuePositive : styles.valueNegative}>
                                {summary.profitPercent >= 0 ? '+' : ''}{summary.profitPercent.toFixed(1)}%
                            </Text>
                        </View>
                    </View>

                    <View style={styles.kpiItem}>
                        <View style={styles.row}>
                            <Text style={styles.label}>CAGR</Text>
                            <Text style={styles.value}>{summary.cagr.toFixed(1)}%</Text>
                        </View>
                    </View>

                    <View style={styles.kpiItem}>
                        <View style={styles.row}>
                            <Text style={styles.label}>XIRR</Text>
                            <Text style={styles.value}>{summary.xirr.toFixed(1)}%</Text>
                        </View>
                    </View>

                    <View style={styles.kpiItem}>
                        <View style={styles.row}>
                            <Text style={styles.label}>Sharpe Ratio</Text>
                            <Text style={styles.value}>{summary.sharpeRatio.toFixed(2)}</Text>
                        </View>
                    </View>

                    <View style={styles.kpiItem}>
                        <View style={styles.row}>
                            <Text style={styles.label}>Max Drawdown</Text>
                            <Text style={styles.valueNegative}>-{summary.maxDrawdown.toFixed(1)}%</Text>
                        </View>
                    </View>

                    <View style={styles.kpiItem}>
                        <View style={styles.row}>
                            <Text style={styles.label}>Volatilité</Text>
                            <Text style={styles.value}>{summary.volatility.toFixed(1)}%</Text>
                        </View>
                    </View>
                </View>

                <View style={styles.row}>
                    <Text style={styles.label}>Prix Moyen d'Achat</Text>
                    <Text style={styles.value}>€{summary.avgBuyPrice.toFixed(2)}</Text>
                </View>
                <View style={styles.row}>
                    <Text style={styles.label}>Parts Accumulées</Text>
                    <Text style={styles.value}>{summary.shares.toFixed(4)}</Text>
                </View>
            </View>

            {/* Transactions Table */}
            <View style={styles.section}>
                <Text style={styles.sectionTitle}>Historique des Transactions</Text>

                <View style={styles.table}>
                    {/* Table Header */}
                    <View style={styles.tableHeader}>
                        <Text style={styles.tableCellHeader}>Date</Text>
                        <Text style={styles.tableCellHeader}>Prix</Text>
                        <Text style={styles.tableCellHeader}>Montant</Text>
                        <Text style={styles.tableCellHeader}>Parts</Text>
                        <Text style={styles.tableCellHeader}>Valeur</Text>
                    </View>

                    {/* Table Rows - First 20 transactions */}
                    {transactions.slice(0, 20).map((tx, i) => (
                        <View key={i} style={i % 2 === 0 ? styles.tableRow : styles.tableRowAlt}>
                            <Text style={styles.tableCell}>{tx.date}</Text>
                            <Text style={styles.tableCell}>€{tx.price.toFixed(2)}</Text>
                            <Text style={styles.tableCell}>€{tx.investedAmount.toFixed(0)}</Text>
                            <Text style={styles.tableCell}>{tx.sharesBought.toFixed(2)}</Text>
                            <Text style={styles.tableCell}>€{tx.portfolioValue.toFixed(0)}</Text>
                        </View>
                    ))}
                </View>

                {transactions.length > 20 && (
                    <Text style={styles.footer}>
                        ... et {transactions.length - 20} autres transactions
                    </Text>
                )}
            </View>

            {/* Footer */}
            <Text style={styles.footer}>
                Rapport généré automatiquement par DCA Backtester
            </Text>
        </Page>
    </Document>
);

export default PdfReport;
