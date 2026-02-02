import { useState } from 'react'
import './App.css'

function App() {
  const openDashboard = () => {
    chrome.tabs.create({ url: 'dashboard.html' });
  };

  return (
    <div className="app-container">
      <header>
        <h1>SimpleReader</h1>
      </header>
      <main>
        <button onClick={openDashboard} style={{ width: '100%', padding: '0.5rem', cursor: 'pointer' }}>
          Open Reader
        </button>
      </main>
    </div>
  )
}

export default App
