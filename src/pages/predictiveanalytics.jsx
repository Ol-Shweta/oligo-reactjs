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
    const [model, setModel] = useState(null);
    const [error, setError] = useState(null);

    const loadModel = async () => {
        setLoading(true);
        try {
            const response = await axios.get('http://localhost:5000/models/predictive/model.json');
            setModel(response.data);
        } catch (error) {
            console.error('Error loading model:', error.message);
            setError('Failed to load the prediction model.');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadModel();
    }, []);

    const handlePredictFileChange = (event) => {
        setPredictFile(event.target.files[0]);
    };

    const handlePredict = async () => {
        if (predictFile && model) {
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

           
            } catch (error) {
                alert('Error during prediction: ' + error.message);
            } finally {
                setLoading(false);
            }
        } else {
            alert('Please choose a prediction file and wait for the model to load!');
        }
    };



    const normalizeData = (data) => {
        // Find the minimum and maximum values for each feature across all data points
        const numFeatures = data[0].length;
        const minValues = Array(numFeatures).fill(Infinity);
        const maxValues = Array(numFeatures).fill(-Infinity);

        // Compute the min and max for each feature
        data.forEach(item => {
            item.forEach((value, index) => {
                if (value < minValues[index]) minValues[index] = value;
                if (value > maxValues[index]) maxValues[index] = value;
            });
        });

        // Apply Min-Max normalization
        const normalizedData = data.map(item =>
            item.map((value, index) => {
                const min = minValues[index];
                const max = maxValues[index];
                // Avoid division by zero if min and max are the same
                return max - min === 0 ? 0 : (value - min) / (max - min);
            })
        );

        return normalizedData;
    };

    const exportData = (format) => {
        if (format === 'csv') {
            const csvContent = "data:text/csv;charset=utf-8," + predictions.map((pred, index) => [
                index + 1,
                pred.observation,
                pred.prediction,
                pred.confidence,
            ].join(',')).join('\n');

            const encodedUri = encodeURI(csvContent);
            const link = document.createElement('a');
            link.setAttribute('href', encodedUri);
            link.setAttribute('download', 'prediction_data.csv');
            document.body.appendChild(link);
            link.click();
        } else if (format === 'pdf') {
            generateReport();
        }
    };

    const generateReport = () => {
        const doc = new jsPDF();
        const rows = predictions.map((pred, index) => [
            index + 1,
            pred.observation,
            pred.prediction,
            (pred.confidence * 100).toFixed(2) + '%',
        ]);

        autoTable(doc, {
            head: [['No', 'Observation', 'Prediction', 'Confidence']],
            body: rows,
        });

        doc.save('prediction_report.pdf');
    };

    const getConfidenceDistribution = () => {
        const confidenceValues = predictions.map(pred => pred.confidence);

        // Create histogram data
        const bins = [0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1];
        const binCounts = Array(bins.length - 1).fill(0);

        confidenceValues.forEach(confidence => {
            for (let i = 0; i < bins.length - 1; i++) {
                if (confidence >= bins[i] && confidence < bins[i + 1]) {
                    binCounts[i]++;
                    break;
                }
            }
        });

        return {
            labels: bins.slice(0, bins.length - 1).map(val => `${(val * 100).toFixed(0)}%`),
            datasets: [
                {
                    label: 'Confidence Distribution',
                    data: binCounts,
                    backgroundColor: 'rgba(75, 192, 192, 0.2)',
                    borderColor: 'rgba(75, 192, 192, 1)',
                    borderWidth: 1,
                },
            ],
        };
    };

    return (
        <div className="container">
            <h1>Predictive Analytics</h1>
            {error && <div className="error">{error}</div>}
            <div className="file-upload">
                <input type="file" accept=".xlsx" onChange={handlePredictFileChange} />
                <button onClick={handlePredict}>Predict</button>
            </div>
            {predictions.length > 0 && (
                <>
                    <div className="chart-container">
                        <h2>Prediction Results</h2>
                        <div className="charts">
                            <div className="chart">
                                <h3>Unsafe Acts</h3>
                                {chartData.UnsafeAct && <Pie data={chartData.UnsafeAct} />}
                            </div>
                            <div className="chart">
                                <h3>Unsafe Conditions</h3>
                                {chartData.UnsafeCondition && <Pie data={chartData.UnsafeCondition} />}
                            </div>
                            <div className="chart">
                                <h3>Locations</h3>
                                {chartData.Location && <Pie data={chartData.Location} />}
                            </div>
                            <div className="chart">
                                <h3>Prediction Confidence Distribution</h3>
                                <Bar data={getConfidenceDistribution()} options={{ responsive: true }} />
                            </div>
                        </div>
                    </div>
                    <div className="export">
                        <button onClick={() => exportData('csv')}>Export to CSV</button>
                        <button onClick={() => exportData('pdf')}>Export to PDF</button>
                    </div>
                </>
            )}
        </div>
    );
};

export default PredictiveAnalytics;
