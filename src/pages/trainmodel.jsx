import React, { useState } from 'react';
import * as tf from '@tensorflow/tfjs';
import * as XLSX from 'xlsx';

const TrainModel = () => {
  const [trainFile, setTrainFile] = useState(null);
  const MAX_TEXT_LEN = 30;
  const CATEGORY_LEN = 5;
  const TOTAL_FEATURES = MAX_TEXT_LEN + CATEGORY_LEN;

  const loadAndPreprocessData = (file, callback) => {
    const reader = new FileReader();
    reader.onload = (event) => {
      const data = new Uint8Array(event.target.result);
      const workbook = XLSX.read(data, { type: 'array' });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const jsonData = XLSX.utils.sheet_to_json(sheet);

      const observations = jsonData.map(row => row['Safety Observation / Condition / Activity']);
      const categories = jsonData.map(row => row['Category']);
      const labels = jsonData.map(row => row['Unsafe Act / Unsafe Condition']);

      const processedData = preprocessData(observations, categories, labels);
      callback(processedData);
    };
    reader.readAsArrayBuffer(file);
  };

  const preprocessData = (observations, categories, labels) => {
    const encodedObservations = observations.map(obs => encodeText(obs));
    const encodedCategories = categories.map(cat => encodeCategory(cat));
    const encodedLabels = labels.map(label => (label === 'Unsafe Act' ? 1 : 0));

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
      model.save('indexeddb://safety-observations-model').then(() => {
        alert('Model training complete and saved');
      });
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

  return (
    <div className="container">
      <h1>Train Model</h1>
      <div className="file-upload">
        <input type="file" accept=".xlsx" onChange={handleTrainFileChange} />
        <button onClick={handleTrainModel}>Train Model</button>
      </div>
    </div>
  );
};

export default TrainModel;
