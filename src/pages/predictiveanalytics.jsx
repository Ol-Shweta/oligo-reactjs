import React, { useState } from 'react';
import * as tf from '@tensorflow/tfjs';
import * as XLSX from 'xlsx';
import { Chart as ChartJS, CategoryScale, LinearScale, BarElement, ArcElement, Tooltip, Legend } from 'chart.js';
import { Bar, Pie } from 'react-chartjs-2';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';

// Register necessary components
ChartJS.register(CategoryScale, LinearScale, BarElement, ArcElement, Tooltip, Legend);

const PredictiveAnalytics = () => {
    const [predictFile, setPredictFile] = useState(null);
    const [model, setModel] = useState(null);
    const [predictions, setPredictions] = useState([]);
    const [predictionData, setPredictionData] = useState([]);
    const [chartData, setChartData] = useState({});
    const [feedback, setFeedback] = useState([]);
    const [showFeedbackOptions, setShowFeedbackOptions] = useState(false);

    const MAX_TEXT_LEN = 30;

    const loadAndPreprocessData = (file, callback, forTraining = true) => {
        const reader = new FileReader();
        reader.onload = (event) => {
            const data = new Uint8Array(event.target.result);
            const workbook = XLSX.read(data, { type: 'array' });
            const sheet = workbook.Sheets[workbook.SheetNames[0]];
            const jsonData = XLSX.utils.sheet_to_json(sheet);

            const observations = jsonData.map(row => row['Safety Observation / Condition / Activity'] || '');
            const categories = jsonData.map(row => row['Category'] || '');
            const labels = forTraining ? jsonData.map(row => row['Unsafe Act / Unsafe Condition'] || '') : [];

            const uniqueCategories = [...new Set(categories)];
            const processedData = preprocessData(observations, categories, labels, uniqueCategories);
            if (!forTraining) {
                setPredictionData(observations); // Store the original observations
            }
            callback(processedData);
        };
        reader.readAsArrayBuffer(file);
    };

    const preprocessData = (observations, categories, labels = [], uniqueCategories) => {
        const encodedObservations = observations.map(obs => encodeText(obs));
        const encodedCategories = categories.map(cat => encodeCategory(cat, uniqueCategories));
        const encodedLabels = labels.length ? labels.map(label => (label === 'Unsafe Act' ? 1 : 0)) : [];

        const combinedData = encodedObservations.map((obs, index) => {
            const combined = [...obs, ...encodedCategories[index]];
            if (combined.length > 35) {
                return combined.slice(0, 35); // Ensure the combined length is 35
            } else {
                return combined.concat(Array(35 - combined.length).fill(0)); // Pad if necessary
            }
        });

        return {
            observations: combinedData,
            labels: encodedLabels,
            uniqueCategories
        };
    };

    const encodeText = (text) => {
        const encoded = Array.from(text).map(char => char.charCodeAt(0));
        if (encoded.length > MAX_TEXT_LEN) {
            return encoded.slice(0, MAX_TEXT_LEN);
        } else {
            return encoded.concat(Array(MAX_TEXT_LEN - encoded.length).fill(0));
        }
    };

    const encodeCategory = (category, uniqueCategories) => {
        const encoded = uniqueCategories.map(cat => (cat === category ? 1 : 0));
        return encoded;
    };

    const handlePredictFileChange = (event) => {
        setPredictFile(event.target.files[0]);
    };

    const handlePredict = async () => {
        if (predictFile) {
            try {
                const loadedModel = await tf.loadLayersModel('indexeddb://safety-observations-model');
                setModel(loadedModel);
                loadAndPreprocessData(predictFile, (data) => {
                    const xs = tf.tensor2d(data.observations, [data.observations.length, 35]); // Ensure shape matches [null, 35]
                    const predictionData = loadedModel.predict(xs).dataSync();
                    const predictionWithConfidence = Array.from(predictionData).map(pred => ({
                        prediction: pred > 0.5 ? 'Yes' : 'No',
                        confidence: pred
                    }));
                    setPredictions(predictionWithConfidence);
                    updateChart(predictionWithConfidence, data.observations, data.uniqueCategories);
                }, false);
            } catch (error) {
                console.warn('Model not found in IndexedDB, attempting to load from localStorage.');
                try {
                    const loadedModel = await tf.loadLayersModel('localstorage://safety-observations-model');
                    setModel(loadedModel);
                    loadAndPreprocessData(predictFile, (data) => {
                        const xs = tf.tensor2d(data.observations, [data.observations.length, 35]); // Ensure shape matches [null, 35]
                        const predictionData = loadedModel.predict(xs).dataSync();
                        const predictionWithConfidence = Array.from(predictionData).map(pred => ({
                            prediction: pred > 0.5 ? 'Yes' : 'No',
                            confidence: pred
                        }));
                        setPredictions(predictionWithConfidence);
                        updateChart(predictionWithConfidence, data.observations, data.uniqueCategories);
                    }, false);
                } catch (error) {
                    alert('Model not found. Please train the model first.');
                }
            }
        } else {
            alert('Please choose a prediction file!');
        }
    };

    const updateChart = (predictions, observations, uniqueCategories) => {
        const predictionCount = uniqueCategories.reduce((acc, category) => {
            acc[category] = 0;
            return acc;
        }, {});

        observations.forEach((obs, index) => {
            const categoryIndex = obs.slice(MAX_TEXT_LEN).indexOf(1);
            const category = uniqueCategories[categoryIndex !== -1 ? categoryIndex : 0]; // Fallback to the first category if none matched
            if (predictions[index].prediction === 'Yes') {
                predictionCount[category]++;
            }
        });

        setChartData({
            labels: uniqueCategories,
            datasets: [{
                label: 'Unsafe Predictions',
                data: Object.values(predictionCount),
                backgroundColor: uniqueCategories.map((_, index) => `#${Math.floor(Math.random() * 16777215).toString(16)}`), // Random colors
                hoverBackgroundColor: uniqueCategories.map((_, index) => `#${Math.floor(Math.random() * 16777215).toString(16)}`) // Random colors
            }]
        });
    };

    const generateReport = () => {
        const doc = new jsPDF();
        const rows = predictions.map((pred, index) => [
            index + 1,
            predictionData[index] || 'N/A', // Use original observation text
            pred.prediction,
            (pred.confidence * 100).toFixed(2) + '%'
        ]);

        autoTable(doc, {
            head: [['No', 'Observation', 'Prediction', 'Confidence']],
            body: rows
        });

        doc.save('prediction_report.pdf');
    };

    const exportData = (format) => {
        if (format === 'csv') {
            const csvContent = "data:text/csv;charset=utf-8,"
                + predictions.map((pred, index) => [
                    index + 1,
                    predictionData[index] || 'N/A', // Use original observation text
                    pred.prediction,
                    (pred.confidence * 100).toFixed(2) + '%'
                ].join(",")).join("\n");

            const encodedUri = encodeURI(csvContent);
            const link = document.createElement("a");
            link.setAttribute("href", encodedUri);
            link.setAttribute("download", "prediction_data.csv");
            document.body.appendChild(link);
            link.click();
        } else if (format === 'pdf') {
            generateReport();
        }
    };

    const handleFeedback = (index, correct) => {
        const newFeedback = [...feedback];
        newFeedback[index] = correct ? 1 : 0;
        setFeedback(newFeedback);
    };

    const handleRetrainModel = () => {
        if (model && feedback.length > 0) {
            const correctedLabels = feedback.map(label => (label === 1 ? 1 : 0));
            const xs = tf.tensor2d(predictionData.map(data => encodeText(data)));
            const ys = tf.tensor2d(correctedLabels, [correctedLabels.length, 1]);

            model.fit(xs, ys, {
                epochs: 5,
                callbacks: {
                    onTrainEnd: async () => {
                        await model.save('indexeddb://safety-observations-model');
                        await model.save('localstorage://safety-observations-model');
                        alert('Model retrained with corrected data and saved');
                    }
                }
            });
        } else {
            alert('No feedback available for retraining');
        }
    };

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
                        <Pie data={chartData} />
                    </div>
                    <div className="export-buttons">
                        <button onClick={() => exportData('csv')}>Export as CSV</button>
                        <button onClick={() => exportData('pdf')}>Export as PDF</button>
                    </div>
                    <div className="feedback-section">
                        <h3>Provide Feedback</h3>
                        {predictions.map((pred, index) => (
                            <div key={index}>
                                <p>Prediction: {pred.prediction} | Confidence: {(pred.confidence * 100).toFixed(2)}%</p>
                                <button onClick={() => handleFeedback(index, true)}>Correct</button>
                                <button onClick={() => handleFeedback(index, false)}>Incorrect</button>
                            </div>
                        ))}
                        <button onClick={handleRetrainModel}>Retrain Model</button>
                    </div>
                </>
            )}
        </div>
    );
};

export default PredictiveAnalytics;
