import React, { useState } from 'react';

const DataUpload = () => {
    const [file, setFile] = useState(null);
    const [message, setMessage] = useState('');

    const handleFileChange = (event) => {
        setFile(event.target.files[0]);
        setMessage('');
    };

    const handleUpload = () => {
        if (!file) {
            setMessage('Please select a file to upload.');
            return;
        }

        // Logic for handling file upload (e.g., sending to server)
        const formData = new FormData();
        formData.append('file', file);

        // Example of an API call (replace with your API endpoint)
        fetch('/api/upload', {
            method: 'POST',
            body: formData,
        })
            .then(response => response.json())
            .then(data => {
                setMessage(data.message || 'File uploaded successfully!');
                setFile(null);
            })
            .catch(error => {
                setMessage('Error uploading file: ' + error.message);
            });
    };

    return (
        <div className="container">
        
                <h1>Data Upload</h1>
                <input
                    type="file"
                    accept=".csv, .xlsx, .xls" // Specify accepted file types
                    onChange={handleFileChange}
                />
                <button onClick={handleUpload}>Upload</button>
                {message && <p>{message}</p>}
           
        </div>
    );
};

export default DataUpload;
