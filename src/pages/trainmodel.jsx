import React, { useState } from 'react';
import * as tf from '@tensorflow/tfjs';
import * as XLSX from 'xlsx';

const TrainModel = () => {
    const [trainFile, setTrainFile] = useState(null);
    const [isLoading, setIsLoading] = useState(false);
    const [trainingProgress, setTrainingProgress] = useState({ epoch: 0, accuracy: 0 });
    const [errorMessage, setErrorMessage] = useState('');

    // Utility: Read and preprocess data from an Excel file
    const loadAndPreprocessData = async (file) => {
        try {
            const data = await file.arrayBuffer();
            const workbook = XLSX.read(new Uint8Array(data), { type: 'array' });
            const sheet = workbook.Sheets[workbook.SheetNames[0]];
            const jsonData = XLSX.utils.sheet_to_json(sheet);

            if (!jsonData.length) throw new Error('Excel file is empty or improperly formatted.');

            const headers = Object.keys(jsonData[0]);
            const requiredFields = [
                'Date',
                'Location',
                'Safety Observation / Condition / Activity',
                'Category',
                'Unsafe Act / Unsafe Condition',
            ];
            const missingFields = requiredFields.filter(field => !headers.includes(field));
            if (missingFields.length > 0) {
                throw new Error(`Missing required fields: ${missingFields.join(', ')}`);
            }

            return preprocessData(jsonData);
        } catch (error) {
            setErrorMessage(`Data Load Error: ${error.message}`);
            setIsLoading(false);
            throw error;
        }
    };

    const preprocessData = (data) => {
        const uniqueCategories = Array.from(new Set(data.map(row => row['Category'])));
        const uniqueLocations = Array.from(new Set(data.map(row => row['Location'])));

        const encodeCategory = category => uniqueCategories.map(cat => (cat === category ? 1 : 0));
        const encodeLocation = location => uniqueLocations.map(loc => (loc === location ? 1 : 0));

        const observations = data.map(row => encodeText(row['Safety Observation / Condition / Activity']));
        const features = data.map((row, index) => [
            ...encodeDate(row['Date']),
            ...encodeLocation(row['Location']),
            ...observations[index],
            ...encodeCategory(row['Category']),
        ]);
        const labels = data.map(row => (row['Unsafe Act / Unsafe Condition'] === 'Unsafe Condition' ? 1 : 0));

        return { features: tf.tensor2d(features), labels: tf.tensor1d(labels, 'int32') };
    };

    const encodeDate = (date) => {
        try {
            if (typeof date === 'number') {
                const excelBaseDate = new Date(1899, 11, 30);
                const jsDate = new Date(excelBaseDate.getTime() + (date - 1) * 86400000);
                date = jsDate.toISOString().split('T')[0];
            }
            const [year, month, day] = date.split(/[-/]/).map(Number);
            return [year, Math.floor((month - 1) / 3) + 1, month, day];
        } catch {
            return [0, 0, 0, 0]; // Default encoding for invalid dates
        }
    };

    const encodeText = (text, maxLen = 50) => {
        const encoded = Array.from((text || '').toString(), char => char.charCodeAt(0)).slice(0, maxLen);
        return encoded.concat(Array(maxLen - encoded.length).fill(0));
    };

    const createModel = (inputShape) => {
        const model = tf.sequential();
        model.add(tf.layers.dense({ units: 128, activation: 'relu', inputShape }));
        model.add(tf.layers.dropout({ rate: 0.3 }));
        model.add(tf.layers.dense({ units: 64, activation: 'relu' }));
        model.add(tf.layers.dropout({ rate: 0.3 }));
        model.add(tf.layers.dense({ units: 1, activation: 'sigmoid' }));
        model.compile({ optimizer: 'adam', loss: 'binaryCrossentropy', metrics: ['accuracy'] });
        return model;
    };

    const trainModel = async (data) => {
        try {
            setErrorMessage('');
            const { features, labels } = data;

            const model = createModel([features.shape[1]]);
            await model.fit(features, labels, {
                epochs: 50,
                batchSize: 32,
                validationSplit: 0.2,
                callbacks: {
                    onEpochEnd: (epoch, logs) => {
                        setTrainingProgress({ epoch: epoch + 1, accuracy: logs.acc });
                    },
                },
            });

            // Get the model weights
            const weightData = await tf.io.encodeWeights(model.getWeights());

            // Model artifacts for saving
            const modelArtifacts = {
                modelTopology: model.toJSON(),
                weightSpecs: model.getWeights().map(weight => ({
                    name: weight.name,
                    shape: weight.shape,
                    dtype: weight.dtype
                })),
                weightData: weightData[0]
            };

            console.log('Model artifacts:', modelArtifacts);

            const modelJson = modelArtifacts.modelTopology;
            const weightsManifest = modelArtifacts.weightSpecs;
            const weightsData = modelArtifacts.weightData;

            if (!modelJson || !weightsManifest || !weightsData) {
                throw new Error('Model saving failed: Missing model artifacts');
            }

            // Combine modelJson and weightsManifest
            const fullModelJson = {
                modelTopology: modelJson,
                weightsManifest: [{ paths: ['weights.bin'], weights: weightsManifest }]
            };

            console.log('Full Model JSON:', fullModelJson);
            console.log('Weights Data:', weightsData);

            await saveModelToServer({ modelJson: fullModelJson, weights: weightsData });

            alert('Model training completed and saved.');
        } catch (error) {
            setErrorMessage(`Training Error: ${error.message}`);
            console.error('Training error:', error);
        } finally {
            setIsLoading(false);
            tf.dispose([data.features, data.labels]);
        }
    };

    const saveModelToServer = async ({ modelJson, weights }) => {
        try {
            console.log('Sending to server:', { modelJson, weights });

            const base64Weights = btoa(String.fromCharCode(...new Uint8Array(weights)));
            const response = await fetch('http://localhost:5000/save-model', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ modelJson, weights: base64Weights }),
            });

            const responseData = await response.json();
            if (!response.ok) {
                throw new Error(responseData.error || `Server Error: ${response.status}`);
            }
            console.log(responseData.message || 'Model saved successfully.');
        } catch (error) {
            console.error('Error saving model to server:', error.message);
            throw error;
        }
    };

    const handleTrain = async () => {
        if (!trainFile) {
            alert('Please upload a file first.');
            return;
        }
        setIsLoading(true);
        try {
            const data = await loadAndPreprocessData(trainFile);
            await trainModel(data);
        } catch (error) {
            setErrorMessage(`Training Error: ${error.message}`);
        }
    };

    return (
        <div className="container">
            <h1>Train Model</h1>
            <div>
                <input
                    type="file"
                    accept=".xlsx"
                    onChange={(e) => setTrainFile(e.target.files[0])}
                    disabled={isLoading}
                />
                <button onClick={handleTrain} disabled={isLoading}>
                    {isLoading ? 'Training in Progress...' : 'Train Model'}
                </button>
            </div>
            {isLoading && (
                <div>
                    <p>Epoch: {trainingProgress.epoch}</p>
                    <p>Accuracy: {(trainingProgress.accuracy * 100).toFixed(2)}%</p>
                </div>
            )}
            {errorMessage && <p style={{ color: 'red' }}>{errorMessage}</p>}
        </div>
    );
};

export default TrainModel;
