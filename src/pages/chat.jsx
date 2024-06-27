import React, { useState } from 'react';
import axios from 'axios';

export default function Chat() {
  const [query, setQuery] = useState('');
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(false);

  const handleInputChange = (event) => {
    setQuery(event.target.value);
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    const newMessage = { user: 'You', text: query };

    // Update the state with the new user message first
    setMessages(prevMessages => [...prevMessages, newMessage]);
    setQuery('');
    setLoading(true);

    try {
      const res = await axios.post('http://localhost:5000/api/askQHSEExpert', { query });
      const botMessage = { user: 'QHSE Expert', text: res.data.embeddingsData };

      // Update the state with the bot response
      setMessages(prevMessages => [...prevMessages, botMessage]);
    } catch (error) {
      console.error('Error fetching response:', error);
      const errorMessage = { user: 'QHSE Expert', text: 'Failed to get response from QHSE Expert' };

      // Update the state with the error message
      setMessages(prevMessages => [...prevMessages, errorMessage]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="chat-container">
      <div className="chat-messages">
        {messages.map((message, index) => (
          <div
            key={index}
            className={`chat-message ${message.user === 'You' ? 'user' : 'bot'}`}
          >
            <strong>{message.user}:</strong> {message.text}
          </div>
        ))}
      </div>
      <form className="chat-input-container" onSubmit={handleSubmit}>
        <input
          type="text"
          value={query}
          onChange={handleInputChange}
          className="chat-input"
          placeholder="Type your question..."
          required
        />
        <button type="submit" className="chat-submit" disabled={loading}>
          {loading ? 'Asking...' : 'Ask'}
        </button>
      </form>
    </div>
  );
}
