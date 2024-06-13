import React, { useState } from 'react';
import * as tf from '@tensorflow/tfjs';
import * as XLSX from 'xlsx';

const PredictiveAnalytics = () => {
  const [file, setFile] = useState(null);
  const [model, setModel] = useState(null);

  const loadAndPreprocessData = (file) => {
    const reader = new FileReader();
    reader.onload = (event) => {
      const data = new Uint8Array(event.target.result);
      const workbook = XLSX.read(data, { type: 'array' });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const jsonData = XLSX.utils.sheet_to_json(sheet);

      const observations = jsonData.map(row => row['Safety Observation / Condition / Activity']);
      const categories = jsonData.map(row => row['Category']);
      const labels = jsonData.map(row => row['Unsafe Act / Unsafe Condition']);

      // Preprocess data
      const processedData = preprocessData(observations, categories, labels);
      trainModel(processedData);
    };
    reader.readAsArrayBuffer(file);
  };

  const preprocessData = (observations, categories, labels) => {
    // Convert observations and categories to numerical data
    const encodedObservations = observations.map(obs => encodeText(obs));
    const encodedCategories = categories.map(cat => encodeCategory(cat));
    const encodedLabels = labels.map(label => (label === 'Yes' ? 1 : 0));

    // Combine features into a single array per observation
    const combinedData = encodedObservations.map((obs, index) => [...obs, ...encodedCategories[index]]);

    return {
      observations: combinedData,
      labels: encodedLabels
    };
  };

  const encodeText = (text) => {
    // Dummy text encoding (replace this with proper encoding logic)
    return Array.from(text).map(char => char.charCodeAt(0));
  };

  const encodeCategory = (category) => {
    // Dummy category encoding (replace this with proper encoding logic)
    const categories = ['Category1', 'Category2', 'Category3'];
    return categories.map(cat => (cat === category ? 1 : 0));
  };

  const trainModel = (data) => {
    // Define your model architecture
    const model = tf.sequential();
    model.add(tf.layers.dense({ units: 128, activation: 'relu', inputShape: [data.observations[0].length] }));
    model.add(tf.layers.dense({ units: 64, activation: 'relu' }));
    model.add(tf.layers.dense({ units: 1, activation: 'sigmoid' }));

    model.compile({ optimizer: 'adam', loss: 'binaryCrossentropy', metrics: ['accuracy'] });

    // Convert data to tensors
    const xs = tf.tensor2d(data.observations);
    const ys = tf.tensor2d(data.labels, [data.labels.length, 1]);

    // Train the model
    model.fit(xs, ys, { epochs: 10 }).then(() => {
      setModel(model);
    });
  };

  const handleFileChange = (event) => {
    setFile(event.target.files[0]);
  };

  const handleTrainModel = () => {
    if (file) {
      loadAndPreprocessData(file);
    } else {
      alert('Please choose a file first!');
    }
  };

  return (
    <div>
      <h2>Predictive Analytics</h2>
      <input type="file" accept=".xlsx" onChange={handleFileChange} />
      <button onClick={handleTrainModel}>Train Model</button>
    </div>
  );
};

export default PredictiveAnalytics;
