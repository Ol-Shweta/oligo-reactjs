import React, { useState } from 'react';
import * as tf from '@tensorflow/tfjs';
import * as XLSX from 'xlsx';
import { Chart as ChartJS, CategoryScale, LinearScale, BarElement, ArcElement, Tooltip, Legend } from 'chart.js';
import { Pie } from 'react-chartjs-2';
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

    const MAX_TEXT_LEN = 60;

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
            const locations = jsonData.map(row => row['Location'] || ''); // Add location data

            const uniqueCategories = [...new Set(categories)];
            const uniqueLocations = [...new Set(locations)]; // Unique locations for chart

            const processedData = preprocessData(observations, categories, labels, uniqueCategories);
            if (!forTraining) {
                setPredictionData(observations); // Store the original observations
            }
            callback(processedData, uniqueLocations);
        };
        reader.readAsArrayBuffer(file);
    };

    const preprocessData = (observations, categories, labels = [], uniqueCategories) => {
        const encodedObservations = observations.map(obs => encodeText(obs));
        const encodedCategories = categories.map(cat => encodeCategory(cat, uniqueCategories));
        const encodedLabels = labels.length ? labels.map(label => (label === 'Unsafe Act' ? 1 : 0)) : [];

        // Combine observations and categories
        const combinedData = encodedObservations.map((obs, index) => {
            const combined = [...obs, ...encodedCategories[index]];
            if (combined.length > 60) {
                return combined.slice(0, 60); // Ensure the combined length is 60
            } else {
                return combined.concat(Array(60 - combined.length).fill(0)); // Pad if necessary
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
                let loadedModel;
                try {
                    loadedModel = await tf.loadLayersModel('indexeddb://safety-observations-model');
                } catch (indexedDbError) {
                    try {
                        loadedModel = await tf.loadLayersModel('localstorage://safety-observations-model');
                    } catch (localStorageError) {
                        alert('Model not found. Please train the model first.');
                        return;
                    }
                }

                setModel(loadedModel);
                loadAndPreprocessData(predictFile, (data, uniqueLocations) => {
                    const xs = tf.tensor2d(data.observations, [data.observations.length, 60]); // Ensure shape matches [null, 60]
                    const predictionData = loadedModel.predict(xs).dataSync();
                    const predictionWithConfidence = Array.from(predictionData).map(pred => ({
                        prediction: pred > 0.5 ? 'Yes' : 'No',
                        confidence: pred
                    }));
                    setPredictions(predictionWithConfidence);
                    updateCharts(predictionWithConfidence, data.observations, data.uniqueCategories, uniqueLocations);
                }, false);
            } catch (error) {
                alert('An error occurred during the prediction process.');
            }
        } else {
            alert('Please choose a prediction file!');
        }
    };

    const updateCharts = (predictions, observations, uniqueCategories, uniqueLocations) => {
        const numCategories = uniqueCategories.length;
        const numLocations = uniqueLocations.length;

        // Initialize counts
        const predictionCount = uniqueCategories.reduce((acc, category) => {
            acc[category] = { UnsafeAct: 0, UnsafeCondition: 0 };
            return acc;
        }, {});

        const locationCount = uniqueLocations.reduce((acc, location) => {
            acc[location] = 0;
            return acc;
        }, {});

        // Process observations
        observations.forEach((obs, index) => {
            const categoryStartIndex = MAX_TEXT_LEN;
            const categoryEndIndex = categoryStartIndex + numCategories;
            const locationStartIndex = categoryEndIndex;
            const locationEndIndex = locationStartIndex + numLocations;

            // Extract category and location
            const categoryIndex = obs.slice(categoryStartIndex, categoryEndIndex).indexOf(1);
            const category = uniqueCategories[categoryIndex !== -1 ? categoryIndex : 0];

            const locationIndex = obs.slice(locationStartIndex, locationEndIndex).indexOf(1);
            const location = uniqueLocations[locationIndex !== -1 ? locationIndex : uniqueLocations.length - 1] || 'Unknown';

            // Determine if it's an Unsafe Act or Unsafe Condition
            if (predictions[index].prediction === 'Yes') {
                if (obs[MAX_TEXT_LEN] === 1) {  // Check if the observation is marked as Unsafe Act
                    predictionCount[category].UnsafeAct++;
                } else {
                    predictionCount[category].UnsafeCondition++;
                }

                // Update location count
                locationCount[location]++;
            }
        });

        // Log location counts to the console
        console.log("Location Counts:", locationCount);

        // Prepare data for pie charts
        const unsafeActData = uniqueCategories.map(cat => ({
            category: cat,
            count: predictionCount[cat]?.UnsafeAct || 0
        }));

        const unsafeConditionData = uniqueCategories.map(cat => ({
            category: cat,
            count: predictionCount[cat]?.UnsafeCondition || 0
        }));

        // Set the chart data
        setChartData({
            UnsafeAct: {
                labels: unsafeActData.map(data => data.category),
                datasets: [{
                    label: 'Unsafe Acts',
                    data: unsafeActData.map(data => data.count),
                    backgroundColor: unsafeActData.map(() => `#${Math.floor(Math.random() * 16777215).toString(16)}`),
                    hoverBackgroundColor: unsafeActData.map(() => `#${Math.floor(Math.random() * 16777215).toString(16)}`)
                }]
            },
            UnsafeCondition: {
                labels: unsafeConditionData.map(data => data.category),
                datasets: [{
                    label: 'Unsafe Conditions',
                    data: unsafeConditionData.map(data => data.count),
                    backgroundColor: unsafeConditionData.map(() => `#${Math.floor(Math.random() * 16777215).toString(16)}`),
                    hoverBackgroundColor: unsafeConditionData.map(() => `#${Math.floor(Math.random() * 16777215).toString(16)}`)
                }]
            },
            Locations: {
                labels: Object.keys(locationCount),
                datasets: [{
                    label: 'Locations',
                    data: Object.values(locationCount),
                    backgroundColor: Object.keys(locationCount).map(() => `#${Math.floor(Math.random() * 16777215).toString(16)}`),
                    hoverBackgroundColor: Object.keys(locationCount).map(() => `#${Math.floor(Math.random() * 16777215).toString(16)}`)
                }]
            }
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

    const toggleFeedbackSection = () => {
        setShowFeedbackOptions(!showFeedbackOptions);
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
                        <div>
                            <h3>Unsafe Acts</h3>
                            {chartData.UnsafeAct && <Pie data={chartData.UnsafeAct} />}
                        </div>
                        <div>
                            <h3>Unsafe Conditions</h3>
                            {chartData.UnsafeCondition && <Pie data={chartData.UnsafeCondition} />}
                        </div>
                        <div>
                            <h3>Locations</h3>
                            {chartData.Locations && <Pie data={chartData.Locations} />}
                        </div>
                    </div>
                    <div className="export-buttons">
                        <button onClick={() => exportData('csv')}>Export as CSV</button>
                        <button onClick={() => exportData('pdf')}>Export as PDF</button>
                    </div>
                    <div className="feedback-section">
                        <h3>Provide Feedback</h3>
                        <button onClick={toggleFeedbackSection}>
                            {showFeedbackOptions ? 'Hide Feedback' : 'Show Feedback'}
                        </button>
                        {showFeedbackOptions && (
                            <>
                                {predictions.map((pred, index) => (
                                    <div key={index}>
                                        <p>Observation: {predictionData[index] || 'N/A'}</p>
                                        <p>Prediction: {pred.prediction} | Confidence: {(pred.confidence * 100).toFixed(2)}%</p>
                                        <button onClick={() => handleFeedback(index, true)}>Correct</button>
                                        <button onClick={() => handleFeedback(index, false)}>Incorrect</button>
                                    </div>
                                ))}
                                <button onClick={handleRetrainModel}>Retrain Model</button>
                            </>
                        )}
                    </div>
                </>
            )}
        </div>
    );
};

export default PredictiveAnalytics;
