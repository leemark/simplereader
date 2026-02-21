import './App.css'

function App() {
  const openDashboard = () => {
    chrome.tabs.create({ url: 'dashboard.html' });
  };

  return (
    <div className="app-container">
      <div className="popup-masthead">
        <span className="popup-masthead-name">SimpleReader</span>
        <span className="popup-masthead-sub">rss · atom · rdf</span>
      </div>
      <button className="popup-open-btn" onClick={openDashboard}>
        Open Reader →
      </button>
    </div>
  )
}

export default App
