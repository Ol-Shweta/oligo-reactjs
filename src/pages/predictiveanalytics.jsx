import React, { useState } from 'react';
import axios from 'axios';
import { Pie, Bar, Line, Doughnut } from 'react-chartjs-2';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import {
    Chart as ChartJS,
    ArcElement,
    Tooltip,
    Legend,
    CategoryScale,
    LinearScale,
    BarElement,
    LineElement,
    PointElement,
} from 'chart.js';

ChartJS.register(ArcElement, Tooltip, Legend, CategoryScale, LinearScale, BarElement, LineElement, PointElement);

const PredictiveAnalytics = () => {
    const [predictFile, setPredictFile] = useState(null);
    const [predictions, setPredictions] = useState([]);
    const [chartData, setChartData] = useState({});
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);

    const handleFileChange = (event) => setPredictFile(event.target.files[0]);

    const handlePredict = async () => {
        if (!predictFile) {
            setError('Please select a file to upload.');
            return;
        }

        const formData = new FormData();
        formData.append('file', predictFile);

        setLoading(true);
        setError(null);
        try {
            const response = await axios.post('http://localhost:5000/api/predict', formData, {
                headers: { 'Content-Type': 'multipart/form-data' },
            });

            const { predictions, chartData } = response.data;
            setPredictions(predictions || []);
            setChartData(chartData || {});
        } catch (err) {
            setError('Failed to process the file. Please try again.');
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    const exportToCSV = () => {
        const csvData = [
            ['No', 'Observation', 'Prediction', 'Confidence'],
            ...predictions.map(({ observation, prediction, confidence }, index) => [
                index + 1,
                observation,
                prediction,
                `${(confidence * 100).toFixed(2)}%`,
            ]),
        ];

        const csvContent = `data:text/csv;charset=utf-8,${csvData.map((row) => row.join(',')).join('\n')}`;
        const link = document.createElement('a');
        link.href = encodeURI(csvContent);
        link.download = 'predictions.csv';
        document.body.appendChild(link);
        link.click();
    };

    const exportToPDF = () => {
        const doc = new jsPDF();

        // Add title to PDF
        doc.setFontSize(18);
        doc.text('Prediction Results', 14, 20);

        // Add table with prediction data
        const predictionData = predictions.map(({ observation, prediction, confidence }, index) => [
            index + 1,
            observation,
            prediction,
            `${(confidence * 100).toFixed(2)}%`,
        ]);

        autoTable(doc, {
            startY: 30,
            head: [['No', 'Observation', 'Prediction', 'Confidence']],
            body: predictionData,
        });

        // Add charts after predictions
        let currentY = doc.lastAutoTable.finalY + 10; // Space after table

        // Create an array of promises for each chart
        const chartPromises = Object.keys(chartData).map((key) => {
            const data = chartData[key];
            const transformedData = transformData(key, data);

            return new Promise((resolve, reject) => {
                if (transformedData) {
                    // Add chart title
                    doc.setFontSize(14);
                    doc.text(key.replace(/([A-Z])/g, ' $1'), 14, currentY);
                    currentY += 10;

                    // Render chart into PDF using html2canvas to capture the chart
                    const chartElement = document.querySelector(`#chart-${key}`);
                    if (chartElement) {
                        console.log(`Found chart element: #chart-${key}`);  // Debugging
                        // Give more time for the chart to render before capturing
                        setTimeout(() => {
                            html2canvas(chartElement, { scale: 2 }).then((canvas) => {
                                const imgData = canvas.toDataURL('image/png');
                                console.log(`Captured chart for ${key}`);  // Debugging
                                doc.addImage(imgData, 'PNG', 14, currentY, 180, 80);
                                currentY += 90; // Adjust space for next chart
                                resolve(); // Resolve the promise once the chart is added
                            }).catch((error) => {
                                console.error(`Error capturing chart ${key}:`, error);
                                reject(error);
                            });
                        }, 1000); // Increased timeout (adjust as necessary)
                    } else {
                        console.log(`Chart element not found for ${key}`);  // Debugging
                        resolve(); // Resolve the promise if the chart element is not found
                    }
                } else {
                    resolve(); // Resolve if no transformed data is found
                }
            });
        });

        // Wait for all charts to be rendered before saving the PDF
        Promise.all(chartPromises)
            .then(() => {
                // Save the PDF file after all charts are added
                doc.save('predictions.pdf');
            })
            .catch((error) => {
                console.error('Error generating PDF with charts:', error);
            });
    };

    const generateConfidenceDistribution = () => {
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
                    backgroundColor: 'rgba(54, 162, 235, 0.2)', // Add color for the bars
                    borderColor: 'rgba(54, 162, 235, 1)',
                    borderWidth: 1,
                },
            ],
        };
    };

    const transformData = (key, data) => {
        switch (key) {
            case 'categories':
            case 'locations':
                return {
                    labels: Object.keys(data),
                    datasets: Object.keys(data[Object.keys(data)[0]]).map((subKey) => ({
                        label: subKey,
                        data: Object.values(data).map((item) => item[subKey]),
                        backgroundColor: 'rgba(75, 192, 192, 0.2)', // Background color for segments
                        borderColor: 'rgba(75, 192, 192, 1)',
                        borderWidth: 1,
                    })),
                };

            case 'severityDistribution':
                return {
                    labels: Object.keys(data),
                    datasets: [
                        {
                            label: 'Count',
                            data: Object.values(data),
                            backgroundColor: 'rgba(153, 102, 255, 0.2)',
                            borderColor: 'rgba(153, 102, 255, 1)',
                            borderWidth: 1,
                        },
                    ],
                };

            case 'categoryData':
            case 'severityData':
            case 'locationData':
                return {
                    labels: data.map((item) => item.category || item.severity || item.location),
                    datasets: [
                        {
                            label: 'High',
                            data: data.map((item) => item.High || item.count || item.safe),
                            backgroundColor: 'rgba(255, 99, 132, 0.2)', // High category color
                            borderColor: 'rgba(255, 99, 132, 1)',
                            borderWidth: 1,
                        },
                        {
                            label: 'Medium',
                            data: data.map((item) => item.Medium || item.unsafe),
                            backgroundColor: 'rgba(255, 159, 64, 0.2)', // Medium category color
                            borderColor: 'rgba(255, 159, 64, 1)',
                            borderWidth: 1,
                        },
                        {
                            label: 'Low',
                            data: data.map((item) => item.Low || 0),
                            backgroundColor: 'rgba(75, 192, 192, 0.2)', // Low category color
                            borderColor: 'rgba(75, 192, 192, 1)',
                            borderWidth: 1,
                        },
                    ],
                };

            default:
                return null;
        }
    };

    const renderChart = (key, index) => {
        const data = chartData[key];
        const transformedData = transformData(key, data);

        if (!transformedData) {
            return (
                <p key={index} className="no-data">
                    No data available for {key.replace(/([A-Z])/g, ' $1')}.
                </p>
            );
        }

        const ChartComponent = key === 'categories' || key === 'locations' ? Doughnut : Bar;

        return (
            <div className="chart-container" key={index}>
                <h3>{key.replace(/([A-Z])/g, ' $1')}</h3>
                <div className="chart">
                    <ChartComponent data={transformedData} options={{ responsive: true }} />
                </div>
            </div>
        );
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

            {loading && <p>Loading...</p>}

            {predictions.length > 0 && (
                <div className="results">
                    <h2>Prediction Results</h2>

                    <div className="charts">
                        {Object.keys(chartData).map((key, index) => {
                            return renderChart(key, index);
                        })}

                        <div className="chart">
                            <h3>Confidence Distribution</h3>
                            <Bar data={generateConfidenceDistribution()} options={{ responsive: true }} />
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
