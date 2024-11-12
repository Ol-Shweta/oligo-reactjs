import React, { useState, useEffect } from 'react';
import axios from 'axios';
import * as XLSX from 'xlsx';
import { Pie } from 'react-chartjs-2';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { Chart as ChartJS, ArcElement, Tooltip, Legend, CategoryScale, LinearScale, Title } from 'chart.js';

// Register required components from chart.js
ChartJS.register(ArcElement, Tooltip, Legend, CategoryScale, LinearScale, Title);

const PredictiveAnalytics = () => {
    const [predictFile, setPredictFile] = useState(null);
    const [predictions, setPredictions] = useState([]);
    const [chartData, setChartData] = useState({});
    const [loading, setLoading] = useState(true);
    const [model, setModel] = useState(null);

    const loadModel = async () => {
        try {
            const response = await axios.get('http://localhost:5000/models/predictive/model.json');
            setModel(response.data);
            setLoading(false);
        } catch (error) {
            console.error('Error loading model:', error.message);
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

            try {
                const response = await axios.post('http://localhost:5000/api/predict', formData, {
                    headers: { 'Content-Type': 'multipart/form-data' },
                });

                const { predictions, chartData } = response.data;
                console.log('API response:', response.data); // Check if `Locations` is present here
                setPredictions(predictions);
                setChartData(chartData);
            } catch (error) {
                console.error('Error during prediction:', error);
                alert('Error during prediction: ' + error.message);
            }
        } else {
            alert('Please choose a prediction file and wait for the model to load!');
        }
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

    if (loading) {
        return <div>Loading model...</div>;
    }

    return (
        <div className="container">
            <h1>Predictive Analytics</h1>
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
                                {chartData.Location && <Pie data={chartData.Location} />} {/* Corrected the key here */}
                            </div>
                        </div>
                    </div>
                    <div className="export-buttons">
                        <button onClick={() => exportData('csv')}>Export as CSV</button>
                        <button onClick={() => exportData('pdf')}>Export as PDF</button>
                    </div>
                </>
            )}
        </div>
    );
};

export default PredictiveAnalytics;
