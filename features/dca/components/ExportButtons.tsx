import { PDFDownloadLink } from '@react-pdf/renderer';
import { exportToCsv } from '../utils/exportCsv';
import PdfReport from './PdfReport';
import { Button } from '@/components/ui/button';
import { DcaExtendedSummary, DcaTransaction } from '../../../types';

interface ExportButtonsProps {
    ticker: string;
    summary: DcaExtendedSummary;
    transactions: DcaTransaction[];
}

const ExportButtons: React.FC<ExportButtonsProps> = ({ ticker, summary, transactions }) => {
    return (
        <div className="flex flex-wrap gap-3">
            {/* CSV Export Button */}
            <Button
                onClick={() => exportToCsv(transactions, ticker)}
                variant="outline"
                className="glass-button border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/10 hover:text-emerald-300"
            >
                <span className="mr-2">📥</span> Exporter CSV
            </Button>

            {/* PDF Download Button */}
            <PDFDownloadLink
                document={<PdfReport ticker={ticker} summary={summary} transactions={transactions} />}
                fileName={`rapport_dca_${ticker}_${new Date().toISOString().split('T')[0]}.pdf`}
            >
                {({ loading }) => (
                    <Button
                        variant="outline"
                        disabled={loading}
                        className="glass-button border-blue-500/30 text-blue-400 hover:bg-blue-500/10 hover:text-blue-300"
                    >
                        <span className="mr-2">{loading ? '⏳' : '📄'}</span>
                        {loading ? 'Génération...' : 'Rapport PDF'}
                    </Button>
                )}
            </PDFDownloadLink>
        </div>
    );
};

export default ExportButtons;
