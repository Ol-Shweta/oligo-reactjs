import React, { useState, useEffect } from 'react';
import axios from 'axios';
import * as XLSX from 'xlsx';
import { Pie, Bar } from 'react-chartjs-2';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { Chart as ChartJS, ArcElement, Tooltip, Legend, CategoryScale, LinearScale, Title, BarElement } from 'chart.js';

// Register required components from chart.js
ChartJS.register(ArcElement, Tooltip, Legend, CategoryScale, LinearScale, Title, BarElement);

const PredictiveAnalytics = () => {
    const [predictFile, setPredictFile] = useState(null);
    const [predictions, setPredictions] = useState([]);
    const [chartData, setChartData] = useState({});
    const [loading, setLoading] = useState(false);
    const [modelLoaded, setModelLoaded] = useState(false);
    const [error, setError] = useState(null);

    // Load model on component mount
    useEffect(() => {
        const loadModel = async () => {
            setLoading(true);
            try {
                await axios.get('http://localhost:5000/models/predictive/model.json');
                setModelLoaded(true);
            } catch (err) {
                console.error('Error loading model:', err.message);
                setError('Failed to load the prediction model.');
            } finally {
                setLoading(false);
            }
        };
        loadModel();
    }, []);

    const handleFileChange = (event) => setPredictFile(event.target.files[0]);

    const handlePredict = async () => {
        if (!predictFile || !modelLoaded) {
            setError('Please select a file and ensure the model is loaded.');
            return;
        }

        const formData = new FormData();
        formData.append('file', predictFile);

        setLoading(true);
        try {
            const response = await axios.post('http://localhost:5000/api/predict', formData, {
                headers: { 'Content-Type': 'multipart/form-data' },
            });

            const { predictions, chartData } = response.data;
            setPredictions(predictions);
            setChartData(chartData);
            setError(null);
        } catch (err) {
            console.error('Error during prediction:', err.message);
            setError('Prediction failed. Please try again.');
        } finally {
            setLoading(false);
        }
    };

    const exportToCSV = () => {
        const csvContent =
            'data:text/csv;charset=utf-8,' +
            predictions
                .map(({ observation, prediction, confidence }, index) =>
                    [index + 1, observation, prediction, (confidence * 100).toFixed(2) + '%'].join(',')
                )
                .join('\n');
        const link = document.createElement('a');
        link.href = encodeURI(csvContent);
        link.download = 'predictions.csv';
        document.body.appendChild(link);
        link.click();
    };

    const exportToPDF = () => {
        const doc = new jsPDF();
        autoTable(doc, {
            head: [['No', 'Observation', 'Prediction', 'Confidence']],
            body: predictions.map(({ observation, prediction, confidence }, index) => [
                index + 1,
                observation,
                prediction,
                (confidence * 100).toFixed(2) + '%',
            ]),
        });
        doc.save('predictions.pdf');
    };

    const getConfidenceDistribution = () => {
        const bins = Array(10).fill(0);
        predictions.forEach(({ confidence }) => {
            const binIndex = Math.min(Math.floor(confidence * 10), 9);
            bins[binIndex]++;
        });
        return {
            labels: bins.map((_, i) => `${i * 10}-${(i + 1) * 10}%`),
            datasets: [
                {
                    label: 'Confidence Distribution',
                    data: bins,
                    backgroundColor: 'rgba(75, 192, 192, 0.6)',
                    borderColor: 'rgba(75, 192, 192, 1)',
                    borderWidth: 1,
                },
            ],
        };
    };

    return (
        <div className="container">
            <h1>Predictive Analytics</h1>
            {error && <div className="alert alert-danger">{error}</div>}
            <div className="file-upload">
                <input type="file" accept=".xlsx" onChange={handleFileChange} />
                <button onClick={handlePredict} disabled={loading}>
                    {loading ? 'Processing...' : 'Predict'}
                </button>
            </div>
            {loading && <div className="loading-spinner">Loading...</div>}
            {predictions.length > 0 && (
                <div className="results">
                    <h2>Prediction Results</h2>
                    <div className="charts">
                        {['UnsafeAct', 'UnsafeCondition', 'Location'].map((key) =>
                            chartData[key] ? (
                                <div key={key} className="chart">
                                    <h3>{key.replace(/([A-Z])/g, ' $1')}</h3>
                                    <Pie data={chartData[key]} />
                                </div>
                            ) : null
                        )}
                        <div className="chart">
                            <h3>Confidence Distribution</h3>
                            <Bar data={getConfidenceDistribution()} options={{ responsive: true }} />
                        </div>
                    </div>
                    <div className="export-buttons">
                        <button onClick={exportToCSV}>Export to CSV</button>
                        <button onClick={exportToPDF}>Export to PDF</button>
                    </div>
                </div>
            )}
        </div>
    );
};

export default PredictiveAnalytics;
