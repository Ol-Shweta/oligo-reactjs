import React, { useState } from 'react';
import * as tf from '@tensorflow/tfjs';
import * as XLSX from 'xlsx';
import { Bar, Pie } from 'react-chartjs-2';

const PredictiveAnalytics = () => {
  const [trainFile, setTrainFile] = useState(null);
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

  const trainModel = (data) => {
    const model = tf.sequential();
    model.add(tf.layers.dense({ units: 128, activation: 'relu', inputShape: [TOTAL_FEATURES] }));
    model.add(tf.layers.dense({ units: 64, activation: 'relu' }));
    model.add(tf.layers.dense({ units: 1, activation: 'sigmoid' }));

    model.compile({ optimizer: 'adam', loss: 'binaryCrossentropy', metrics: ['accuracy'] });

    const xs = tf.tensor2d(data.observations);
    const ys = tf.tensor2d(data.labels, [data.labels.length, 1]);

    model.fit(xs, ys, { epochs: 10 }).then(() => {
      setModel(model);
      alert('Model training complete');
    });
  };

  const handleTrainFileChange = (event) => {
    setTrainFile(event.target.files[0]);
  };

  const handleTrainModel = () => {
    if (trainFile) {
      loadAndPreprocessData(trainFile, trainModel);
    } else {
      alert('Please choose a training file first!');
    }
  };

  const handlePredictFileChange = (event) => {
    setPredictFile(event.target.files[0]);
  };

  const handlePredict = () => {
    if (predictFile && model) {
      loadAndPreprocessData(predictFile, (data) => {
        const xs = tf.tensor2d(data.observations);
        const predictionData = model.predict(xs).dataSync();
        const predictionWithConfidence = Array.from(predictionData).map(pred => ({
          prediction: pred > 0.5 ? 'Yes' : 'No',
          confidence: pred
        }));
        setPredictions(predictionWithConfidence);
        updateChart(predictionWithConfidence, data.observations);
      }, false);
    } else {
      alert('Please choose a prediction file and ensure the model is trained!');
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
    <div>
      <h2>Predictive Analytics</h2>

      <div>
        <h3>Train Model</h3>
        <input type="file" accept=".xlsx" onChange={handleTrainFileChange} />
        <button onClick={handleTrainModel}>Train Model</button>
      </div>

      <div>
        <h3>Predict Future Accidents</h3>
        <input type="file" accept=".xlsx" onChange={handlePredictFileChange} />
        <button onClick={handlePredict}>Predict</button>
        {predictions.length > 0 && (
          <div>
            <h4>Predictions:</h4>
            <table className="prediction-table">
              <thead>
                <tr>
                  <th>S. No</th>
                  <th>Date</th>
                  <th>Location</th>
                  <th>Observation</th>
                  <th>Category</th>
                  <th>Prediction</th>
                  <th>Confidence</th>
                </tr>
              </thead>
              <tbody>
                {predictions.map((pred, index) => (
                  <tr key={index} className={pred.prediction === 'Yes' ? 'danger' : 'safe'}>
                    <td>{predictionData[index]['S. No']}</td>
                    <td>{predictionData[index]['Date']}</td>
                    <td>{predictionData[index]['Location']}</td>
                    <td>{predictionData[index]['Safety Observation / Condition / Activity']}</td>
                    <td>{predictionData[index]['Category']}</td>
                    <td>{pred.prediction}</td>
                    <td>{(pred.confidence * 100).toFixed(2)}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div>
              <Bar data={chartData} />
              <Pie data={chartData} />
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default PredictiveAnalytics;
