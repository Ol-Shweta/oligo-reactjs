import React, { useState } from 'react';
import * as tf from '@tensorflow/tfjs';
import * as XLSX from 'xlsx';

const TrainModel = () => {
    const [trainFile, setTrainFile] = useState(null);
    const [isLoading, setIsLoading] = useState(false);
    const [trainingProgress, setTrainingProgress] = useState({ epoch: 0, accuracy: 0 });
    const MAX_TEXT_LEN = 30;
    const CATEGORY_LEN = 6;
    const LOCATION_LEN = 20;
    const DATE_FEATURES_LEN = 4;
    const TOTAL_FEATURES = MAX_TEXT_LEN + CATEGORY_LEN + LOCATION_LEN + DATE_FEATURES_LEN;
    const MODEL_PATH = 'localstorage://advanced-safety-observations-model';

    const loadAndPreprocessData = (file, callback) => {
        const reader = new FileReader();
        reader.onload = (event) => {
            const data = new Uint8Array(event.target.result);
            const workbook = XLSX.read(data, { type: 'array' });
            const sheet = workbook.Sheets[workbook.SheetNames[0]];
            const jsonData = XLSX.utils.sheet_to_json(sheet);

            const dates = jsonData.map(row => row['Date']);
            const locations = jsonData.map(row => row['Location']);
            const observations = jsonData.map(row => row['Safety Observation / Condition / Activity']);
            const categories = jsonData.map(row => row['Category']);
            const labels = jsonData.map(row => row['Unsafe Act / Unsafe Condition']);

            const processedData = preprocessData(dates, locations, observations, categories, labels);
            callback(processedData);
        };
        reader.readAsArrayBuffer(file);
    };

    const preprocessData = (dates, locations, observations, categories, labels) => {
        const encodedDates = dates.map(date => encodeDate(date));
        const encodedLocations = locations.map(loc => encodeLocation(loc));
        const encodedObservations = observations.map(obs => encodeText(obs));
        const encodedCategories = categories.map(cat => encodeCategory(cat));
        const encodedLabels = labels.map(label => (label === 'Unsafe Condition' ? 1 : 0));

        const combinedData = encodedObservations.map((obs, index) => {
            return [
                ...encodedDates[index],
                ...encodedLocations[index],
                ...obs,
                ...encodedCategories[index]
            ];
        });

        combinedData.forEach((entry, idx) => {
            if (entry.length !== TOTAL_FEATURES) {
                console.error(`Feature vector ${idx} length mismatch: expected ${TOTAL_FEATURES}, but got ${entry.length}`);
            }
        });

        return {
            observations: combinedData,
            labels: encodedLabels
        };
    };

    const encodeDate = (date) => {
        const dateObj = new Date(date);
        const year = dateObj.getFullYear();
        const quarter = Math.floor((dateObj.getMonth() + 3) / 3);
        const month = dateObj.getMonth() + 1;
        const day = dateObj.getDate();
        return [year, quarter, month, day];
    };

    const encodeText = (text) => {
        if (!text) return Array(MAX_TEXT_LEN).fill(0);
        const encoded = Array.from(text).map(char => char.charCodeAt(0));
        return encoded.length > MAX_TEXT_LEN ? encoded.slice(0, MAX_TEXT_LEN) : encoded.concat(Array(MAX_TEXT_LEN - encoded.length).fill(0));
    };

    const encodeCategory = (category) => {
        const categories = ['PPE', 'ACCESS', 'ELECTRICAL', 'EXCAVATION', 'GENERAL', 'Edge Protection'];
        const encoded = categories.map(cat => (cat === category ? 1 : 0));
        if (encoded.length !== CATEGORY_LEN) {
            console.error(`Category encoding length mismatch: expected ${CATEGORY_LEN}, but got ${encoded.length}`);
        }
        return encoded;
    };

    const encodeLocation = (location) => {
        if (!location) return Array(LOCATION_LEN).fill(0);
        const encoded = Array.from(location).map(char => char.charCodeAt(0));
        return encoded.length > LOCATION_LEN ? encoded.slice(0, LOCATION_LEN) : encoded.concat(Array(LOCATION_LEN - encoded.length).fill(0));
    };

    // Create an advanced model with dropout and batch normalization
    const createAdvancedModel = () => {
        const model = tf.sequential();

        model.add(tf.layers.dense({ units: 256, activation: 'relu', inputShape: [TOTAL_FEATURES] }));
        model.add(tf.layers.batchNormalization());
        model.add(tf.layers.dropout({ rate: 0.3 }));

        model.add(tf.layers.dense({ units: 128, activation: 'relu' }));
        model.add(tf.layers.batchNormalization());
        model.add(tf.layers.dropout({ rate: 0.3 }));

        model.add(tf.layers.dense({ units: 64, activation: 'relu' }));
        model.add(tf.layers.batchNormalization());
        model.add(tf.layers.dropout({ rate: 0.3 }));

        model.add(tf.layers.dense({ units: 32, activation: 'relu' }));
        model.add(tf.layers.batchNormalization());

        model.add(tf.layers.dense({ units: 1, activation: 'sigmoid' }));

        model.compile({ optimizer: 'adam', loss: 'binaryCrossentropy', metrics: ['accuracy'] });

        return model;
    };

    // New function to save the model to the server with weights
    const saveModelToServer = async (model) => {
        await model.save(tf.io.withSaveHandler(async (artifacts) => {
            const modelJson = artifacts.modelTopology;
            const weightsData = artifacts.weightData;

            // Construct the request body to send both model and weights
            const requestData = {
                modelJson: modelJson,
                weights: Array.from(new Uint8Array(weightsData))  // Convert weight data to an array of numbers
            };

            const response = await fetch('http://localhost:5000/save-model', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(requestData)
            });

            const responseText = await response.text(); // Log raw response
            console.log('Raw response from server:', responseText);

            try {
                const responseBody = JSON.parse(responseText); // Attempt to parse the response as JSON
                if (!response.ok) {
                    console.error('Error response from server:', responseBody);
                    throw new Error('Failed to save model to server');
                }
                console.log('Model and weights saved to server');
            } catch (parseError) {
                console.error('Error parsing response:', parseError);
                console.log('Response body:', responseText); // Log the raw response if JSON parsing fails
                throw new Error('Failed to parse server response');
            }
        }));
    };


    const trainModel = async (data) => {
        setIsLoading(true);
        const model = createAdvancedModel();
        console.log('Created advanced model');

        const xs = tf.tensor2d(data.observations);
        const ys = tf.tensor2d(data.labels, [data.labels.length, 1]);

        try {
            await model.fit(xs, ys, {
                epochs: 20,
                batchSize: 32,
                validationSplit: 0.2,
                callbacks: {
                    onEpochEnd: (epoch, logs) => {
                        setTrainingProgress({ epoch: epoch + 1, accuracy: logs.acc });
                    },
                    onTrainEnd: async () => {
                        try {
                            await saveModelToServer(model);
                        } catch (saveError) {
                            console.error('Error saving the model to server:', saveError);
                        }
                        setIsLoading(false);
                        alert('Model training complete and saved to server');
                    }
                }
            });
        } catch (error) {
            console.error('Error during model training:', error);
            setIsLoading(false);
        }
    };

    const handleTrainFileChange = (event) => setTrainFile(event.target.files[0]);

    const handleTrainModel = () => {
        if (trainFile) {
            loadAndPreprocessData(trainFile, trainModel);
        } else {
            alert('Please choose a training file first!');
        }
    }

    return (
        <div className="container">
            <h1>Train Model</h1>
            <div className="file-upload">
                <input type="file" accept=".xlsx" onChange={handleTrainFileChange} />
                <button onClick={handleTrainModel}>Train Model</button>
            </div>
            {isLoading && (
                <div className="loader">
                    <p>Training model... Please wait.</p>
                    <p>Epoch: {trainingProgress.epoch}</p>
                    <p>Accuracy: {(trainingProgress.accuracy * 100).toFixed(2)}%</p>
                </div>
            )}
        </div>
    );
};

export default TrainModel;
