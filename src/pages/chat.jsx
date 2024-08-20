import React, { useState, useEffect, useRef } from 'react';
import * as tf from '@tensorflow/tfjs';
import { FaThumbsDown, FaThumbsUp, FaRedo } from 'react-icons/fa'; // Import icons for Flag and Regenerate

const Chat = () => {
    const [query, setQuery] = useState('');
    const [messages, setMessages] = useState([]);
    const [loading, setLoading] = useState(false);
    const socketRef = useRef(null);
    const hasSentWelcomeMessageRef = useRef(false);
    const modelRef = useRef(null);

    useEffect(() => {
        loadModel();
        if (!socketRef.current) {
            connectWebSocket();
        }
        return () => {
            if (socketRef.current) {
                socketRef.current.close();
                socketRef.current = null;
            }
        };
    }, []);

    const loadModel = async () => {
        try {
            modelRef.current = await tf.loadLayersModel('http://localhost:5000/model.json');
        } catch (error) {
            console.error('Error loading model:', error);
        }
    };

    const reconnectWebSocket = (retryCount = 0) => {
        setTimeout(() => {
            if (!socketRef.current || socketRef.current.readyState === WebSocket.CLOSED) {
                connectWebSocket(retryCount);
            }
        }, Math.min(10000, 1000 * 2 ** retryCount)); // Exponential backoff with a max delay of 10 seconds
    };

    const connectWebSocket = (retryCount = 0) => {
        if (socketRef.current && socketRef.current.readyState !== WebSocket.CLOSED) {
            console.log('WebSocket is already open or in the process of opening.');
            return;
        }

        socketRef.current = new WebSocket('ws://localhost:5000/'); // Correct WebSocket URL
        console.log('WebSocket connecting...');

        socketRef.current.onopen = () => {
            console.log('WebSocket connected');
            if (!hasSentWelcomeMessageRef.current) {
                const initialMessage = { user: 'QHSE Expert', text: 'Hello! How can I help you?' };
                setMessages((prevMessages) => [...prevMessages, initialMessage]);
                hasSentWelcomeMessageRef.current = true;
            }
        };

        socketRef.current.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data);
                console.log('Received data:', data);
                if (data.error) {
                    throw new Error(data.error);
                }
                processMessage(data);
            } catch (error) {
                console.error('Error handling WebSocket message:', error);
                const errorMessage = { user: 'QHSE Expert', text: 'Error processing response' };
                setMessages((prevMessages) => [...prevMessages, errorMessage]);
            }
        };

        socketRef.current.onclose = () => {
            console.log('WebSocket disconnected');
            setMessages((prevMessages) => prevMessages.filter(msg => !(msg.user === 'QHSE Expert' && msg.text === 'Hello! How can I help you?')));
            hasSentWelcomeMessageRef.current = false;
            reconnectWebSocket(retryCount + 1);
        };

        socketRef.current.onerror = (error) => {
            console.error('WebSocket error:', error);
        };
    };

    const processMessage = (data) => {
        try {
            console.log('Processing message data:', data);
            if (data.response) {
                const botMessage = { user: 'QHSE Expert', text: data.response, id: data.id };
                setMessages(prevMessages => [...prevMessages, botMessage]);
            } else {
                throw new Error('Invalid message format received');
            }
        } catch (error) {
            console.error('Error processing message:', error);
            const errorMessage = { user: 'QHSE Expert', text: 'Failed to process message' };
            setMessages(prevMessages => [...prevMessages, errorMessage]);
        }
    };

    const handleInputChange = (event) => {
        setQuery(event.target.value);
    };

    const handleSubmit = async (event) => {
        event.preventDefault();

        const newMessage = { user: 'You', text: query };
        setMessages((prevMessages) => [...prevMessages, newMessage]);
        setQuery('');
        setLoading(true);

        try {
            if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
                socketRef.current.send(JSON.stringify({ message: query }));
            } else {
                console.error('WebSocket is not open');
                const errorMessage = { user: 'QHSE Expert', text: 'Failed to send message via WebSocket' };
                setMessages((prevMessages) => [...prevMessages, errorMessage]);
            }
        } catch (error) {
            console.error('Error sending message:', error);
            const errorMessage = { user: 'QHSE Expert', text: 'Failed to send message' };
            setMessages((prevMessages) => [...prevMessages, errorMessage]);
        } finally {
            setLoading(false);
        }
    };

    const handleRegenerate = async (id) => {
        try {
            if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
                socketRef.current.send(JSON.stringify({ action: 'regenerate', id }));
            } else {
                console.error('WebSocket is not open');
            }
        } catch (error) {
            console.error('Error sending regenerate request:', error);
        }
    };

    const handleFlag = async (id, flagType) => {
        try {
            if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
                socketRef.current.send(JSON.stringify({ action: 'flag', id, flagType }));
                console.log('Flag action = ', action, ' -- type =', flagType, ' -- id', id);
                // Trigger model retraining on user feedback
                if (flagType === 'up' || flagType === 'down') {
                    await fetch('/train-and-save-model', { method: 'POST' });
                    console.log('Model retrained with new data');
                }
            } else {
                console.error('WebSocket is not open');
            }
        } catch (error) {
            console.error('Error sending flag request:', error);
        }
    };


    return (
        <section id="fh5co-services">
            <div className="container">
                <div className="chat-container">
                    <div className="chat-messages">
                        {messages.map((message, index) => (
                            <div key={index} className={`chat-message ${message.user === 'You' ? 'user' : 'bot'}`}>
                                <strong>{message.user}:</strong> {message.text}
                                {message.user === 'QHSE Expert' && (
                                    <div className="actions">
                                        <button onClick={() => handleRegenerate(message.id)} aria-label="Regenerate">
                                            <FaRedo size={15} /> {/* Regenerate icon */}
                                        </button>
                                        <button onClick={() => handleFlag(message.id, 'up')} aria-label="Flag Up">
                                            <FaThumbsUp size={15} /> {/* Flag icon */}
                                        </button>
                                        <button onClick={() => handleFlag(message.id, 'down')} aria-label="Flag Down">
                                            <FaThumbsDown size={15} /> {/* Flag icon */}
                                        </button>
                                    </div>
                                )}
                            </div>
                        ))}
                        {loading && <div className="chat-message bot"><div className="loader"></div></div>}
                    </div>
                    <form onSubmit={handleSubmit} className="chat-form">
                        <input type="text" value={query} onChange={handleInputChange} placeholder="Type your message" required />
                        <button type="submit" disabled={loading}>Send</button>
                    </form>
                </div>
            </div>
        </section>
    );
};

export default Chat;
