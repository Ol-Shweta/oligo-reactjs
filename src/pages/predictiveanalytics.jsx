import React, { useState, useEffect } from 'react';
import * as tf from '@tensorflow/tfjs';
import * as XLSX from 'xlsx';
import { Chart as ChartJS, CategoryScale, LinearScale, BarElement, ArcElement, Tooltip, Legend } from 'chart.js';
import { Bar, Pie } from 'react-chartjs-2';

// Register necessary components
ChartJS.register(CategoryScale, LinearScale, BarElement, ArcElement, Tooltip, Legend);

const PredictiveAnalytics = () => {
  const [predictFile, setPredictFile] = useState(null);
  const [model, setModel] = useState(null);
  const [predictions, setPredictions] = useState([]);
  const [predictionData, setPredictionData] = useState([]);
  const [chartData, setChartData] = useState({});

  const MAX_TEXT_LEN = 30;
  const CATEGORY_LEN = 5;
  const TOTAL_FEATURES = MAX_TEXT_LEN + CATEGORY_LEN;

  const loadAndPreprocessData = (file, callback, forTraining = true) => {
    const reader = new FileReader();
    reader.onload = (event) => {
      const data = new Uint8Array(event.target.result);
      const workbook = XLSX.read(data, { type: 'array' });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const jsonData = XLSX.utils.sheet_to_json(sheet);

      const observations = jsonData.map(row => row['Safety Observation / Condition / Activity']);
      const categories = jsonData.map(row => row['Category']);
      const labels = forTraining ? jsonData.map(row => row['Unsafe Act / Unsafe Condition']) : [];

      const processedData = preprocessData(observations, categories, labels);
      if (!forTraining) {
        setPredictionData(jsonData);
      }
      callback(processedData);
    };
    reader.readAsArrayBuffer(file);
  };

  const preprocessData = (observations, categories, labels = []) => {
    const encodedObservations = observations.map(obs => encodeText(obs));
    const encodedCategories = categories.map(cat => encodeCategory(cat));
    const encodedLabels = labels.length ? labels.map(label => (label === 'Unsafe Act' ? 1 : 0)) : [];

    const combinedData = encodedObservations.map((obs, index) => {
      return [...obs, ...encodedCategories[index]];
    });

    combinedData.forEach(entry => {
      if (entry.length !== TOTAL_FEATURES) {
        throw new Error(`Feature vector length mismatch: expected ${TOTAL_FEATURES}, but got ${entry.length}`);
      }
    });

    return {
      observations: combinedData,
      labels: encodedLabels
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

  const encodeCategory = (category) => {
    const categories = ['PPE', 'ACCESS', 'ELECTRICAL', 'EXCAVATION', 'GENERAL'];
    const encoded = categories.map(cat => (cat === category ? 1 : 0));
    if (encoded.length !== CATEGORY_LEN) {
      throw new Error(`Category encoding length mismatch: expected ${CATEGORY_LEN}, but got ${encoded.length}`);
    }
    return encoded;
  };

  const handlePredictFileChange = (event) => {
    setPredictFile(event.target.files[0]);
  };

  const handlePredict = () => {
    if (predictFile) {
      tf.loadLayersModel('indexeddb://safety-observations-model').then((loadedModel) => {
        setModel(loadedModel);
        loadAndPreprocessData(predictFile, (data) => {
          const xs = tf.tensor2d(data.observations);
          const predictionData = loadedModel.predict(xs).dataSync();
          const predictionWithConfidence = Array.from(predictionData).map(pred => ({
            prediction: pred > 0.5 ? 'Yes' : 'No',
            confidence: pred
          }));
          setPredictions(predictionWithConfidence);
          updateChart(predictionWithConfidence, data.observations);
        }, false);
      }).catch(() => {
        alert('Model not found. Please train the model first.');
      });
    } else {
      alert('Please choose a prediction file!');
    }
  };

  const updateChart = (predictions, observations) => {
    const categories = ['PPE', 'ACCESS', 'ELECTRICAL', 'EXCAVATION', 'GENERAL'];
    const predictionCount = { 'PPE': 0, 'ACCESS': 0, 'ELECTRICAL': 0, 'EXCAVATION': 0, 'GENERAL': 0 };

    observations.forEach((obs, index) => {
      const category = categories[obs.slice(MAX_TEXT_LEN).indexOf(1)];
      if (predictions[index].prediction === 'Yes') {
        predictionCount[category]++;
      }
    });

    setChartData({
      labels: categories,
      datasets: [{
        label: 'Unsafe Predictions',
        data: Object.values(predictionCount),
        backgroundColor: ['#FF6384', '#36A2EB', '#FFCE56', '#FF6384', '#36A2EB'],
        hoverBackgroundColor: ['#FF6384', '#36A2EB', '#FFCE56', '#FF6384', '#36A2EB']
      }]
    });
  };

  return (
    <div className="container">
      <h1>Predictive Analytics</h1>
      <div className="file-upload">
        <input type="file" accept=".xlsx" onChange={handlePredictFileChange} />
        <button onClick={handlePredict}>Predict</button>
      </div>
      <div className="chart-container">
        {predictions.length > 0 && (
          <div>
            <h2>Predictions</h2>
            <Bar data={chartData} options={{ responsive: true }} />
            <Pie data={chartData} options={{ responsive: true }} />
          </div>
        )}
      </div>
    </div>
  );
};

export default PredictiveAnalytics;
